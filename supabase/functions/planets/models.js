// Real models made while the chat waits (My Tiny Planet, docs/planets.md). When someone's AI
// previews a planet, each thing described in words (`model`) that has no model yet is asked of
// Meshy in the house style (_shared/planet-models.js): first a picture, then the model from it,
// about three to five minutes in all. Nothing waits on Meshy: the preview starts the pictures, and
// each card showing the planet asks how its models are coming (GET ?models=…, index.ts), which
// moves them on a step, at most once every few seconds however many ask. A finished model goes in
// the public bucket planet-models, where the planet (assets/js/planets/models.js) swaps it in.
//
// Money is spent here, so it's capped (public.planet_models_claim): MODELS_A_MONTH in all, and
// PER_PLANET for any one planet; the same words make the same model, on any planet, so it's paid
// for once; test planets (slug test-…) never ask. A card can only move on what a preview started.
// Plain JavaScript, so tools/planet-test.mjs runs it in Node on a made-up Meshy. `m` is what
// index.ts gives it: claim, rows, turn, set (public.planet_models), meshy (the API, with the key),
// download, put and url (the bucket), and inManifest (the models the workflow made).
import { modelKey, pictureTask, modelTask, TEXT_TO_IMAGE, IMAGE_TO_3D } from '../_shared/planet-models.js';

// Steve's caps (Nov 1, 2026: 30 a month, about $20), about $0.70 a model
export const MODELS_A_MONTH = 30, PER_PLANET = 14;
// how often Meshy is asked about one model, and how long one may take before it's given up on
export const ASK_EVERY = 8, GIVE_UP = 60 * 60 * 1000;
export const KEY = /^[0-9a-f]{32}$/;

const short = (e) => String(e?.message || e).slice(0, 500);

// asks Meshy for its picture: the first thing paid for
async function begin(key, words, m) {
  try {
    const id = (await m.meshy('POST', TEXT_TO_IMAGE, pictureTask(words))).result;
    if (!id) throw new Error('Meshy gave no task');
    await m.set(key, { status: 'picture', picture_task: id, error: null });
  } catch (e) {
    await m.set(key, { status: 'failed', error: short(e) });
  }
}

/**
 * Starts the models a planet's things need, as far as the caps allow: { making, made, over } (thing
 * ids), or null when none of its things is described in words.
 */
export async function startModels(spec, m) {
  const things = (spec.things || []).filter((t) => t.model && !t.stock);
  if (!things.length || !m) return null;
  const out = { making: [], made: [], over: [], test: spec.slug.startsWith('test-') };
  if (out.test) return out; // a test never spends
  const keys = await Promise.all(things.map((t) => modelKey(t.model)));
  const ask = [];
  for (let i = 0; i < things.length; i++) {
    if (await m.inManifest?.(spec.slug, things[i].id, things[i].model)) out.made.push(things[i].id);
    else ask.push(i);
  }
  const rows = new Map((await m.rows([...new Set(ask.map((i) => keys[i]))])).map((r) => [r.key, r]));
  const live = (i) => rows.has(keys[i]) && rows.get(keys[i]).status !== 'failed';
  // the rest are claimed, each key once, in the order the things come (two things with the same
  // words share a model)
  const need = [...new Map(ask.filter((i) => !live(i)).map((i) => [keys[i], things[i].model])).entries()];
  const claimed = new Set(need.length ? await m.claim(spec.slug, need.map(([k]) => k), need.map(([, w]) => w)) : []);
  await Promise.all(need.filter(([k]) => claimed.has(k)).map(([k, w]) => begin(k, w, m)));
  for (const i of ask) {
    const id = things[i].id;
    if (live(i)) (rows.get(keys[i]).status === 'done' ? out.made : out.making).push(id);
    else (claimed.has(keys[i]) ? out.making : out.over).push(id);
  }
  return out;
}

// one step on, for a model whose turn it is
async function step(row, m) {
  if (Date.now() - Date.parse(row.at) > GIVE_UP) return m.set(row.key, { status: 'failed', error: 'Meshy took over an hour' });
  if (row.status === 'new') return begin(row.key, row.words, m);
  const picture = row.status === 'picture';
  const t = await m.meshy('GET', `${picture ? TEXT_TO_IMAGE : IMAGE_TO_3D}/${picture ? row.picture_task : row.model_task}`);
  if (['FAILED', 'CANCELED', 'EXPIRED'].includes(t.status)) return m.set(row.key, { status: 'failed', error: short(t.task_error?.message || `Meshy ${t.status}`) });
  if (t.status !== 'SUCCEEDED') return;
  if (picture) {
    const id = (await m.meshy('POST', IMAGE_TO_3D, modelTask(t.image_urls[0]))).result;
    if (!id) throw new Error('Meshy gave no task');
    return m.set(row.key, { status: 'model', model_task: id });
  }
  const file = `${row.key}.glb`;
  await m.put(file, await m.download(t.model_urls.glb));
  return m.set(row.key, { status: 'done', file });
}

/**
 * How the models with these keys are coming, each moved on a step if it's due: { <key>: { status:
 * making, done (with its url) or failed } }; a key nobody asked for isn't there.
 */
export async function modelsNow(keys, m) {
  keys = [...new Set(keys)].filter((k) => KEY.test(k)).slice(0, 20);
  await Promise.all(keys.map(async (k) => {
    const row = await m.turn(k, ASK_EVERY);
    // a step that fails (Meshy or the bucket out for a moment) is tried again on the next turn
    if (row) await step(row, m).catch((e) => console.error(`model ${k}: ${short(e)}`));
  }));
  const now = {};
  for (const r of await m.rows(keys)) now[r.key] = r.status === 'done' ? { status: 'done', url: m.url(r.file) } : { status: r.status === 'failed' ? 'failed' : 'making' };
  return now;
}
