// Makes real 3D models for the things on friends' planets (My Tiny Planet, docs/planets.md), all in
// one house style, storybook miniature (Steve chose it, Oct 27, 2026: "lock it in and have it as
// our style"). Each thing whose spec describes it in words (`model`) is first drawn as a picture
// in that style (Meshy text-to-image: alone on white, no base), kept in tools/models/planets/
// pictures/, then made into 3D from the picture (image-to-3D, PBR textures), made small with
// gltf-transform into assets/models/planets/<slug>/<thing id>.glb and listed in
// assets/models/planets/manifest.json under "<slug>/<thing id>" with the words and the style it
// was made from. The planet (assets/js/planets/models.js) shows it in place of the thing's
// shapes. The planets: the kit's example (Sam, in supabase/functions/planets/server.js), the stock
// things (STOCK in supabase/functions/_shared/planet.js: small things any planet can use, made
// once, under "stock/<name>"), and each spec in tools/models/planets/. Run by .github/workflows/planet-models.yml, which has
// MESHY_API_KEY:
//
//   MESHY_API_KEY=... node tools/planet-models.mjs [--redo slug/id,slug/id]
//
// Only what's missing is paid for, and a model whose words or style changed is made again.
// Costs: a few credits the picture, 30 the model, so about $0.70 a thing; capped below (about $10
// a planet for the first 10 friends).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkPlanet, partsOf, STOCK } from '../supabase/functions/_shared/planet.js';
import { EXAMPLE } from '../supabase/functions/planets/server.js';
import { get, task, finished, balance, optimize, IMAGE_TO_3D, TEXT_TO_IMAGE } from './meshy.mjs';
import { STYLE_NAME, MODEL_SETTINGS, digest, modelSource, currentModel, pendingModel, pictureName } from './planet-model-cache.mjs';
export { STYLE_NAME } from './planet-model-cache.mjs';

// the caps (Steve, Oct 27, 2026: "10 an onboarding for the first 10 people"): 14 models a planet,
// about $10, for the first 10 friends' planets, then none until he says; 24 a run. The kit's example
// the stock things (Steve approved about $6 for them, Oct 27) and the test planets (test-…) aren't friends
// and don't count toward the 10.
export const PER_PLANET = 14, PER_RUN = 24, FIRST_PLANETS = 10;
const isFriend = (slug) => slug !== EXAMPLE.slug && slug !== 'stock' && !slug.startsWith('test-');
// the stock things as a planet of their own, one of each, so their models are made like any planet's
const STOCK_PLANET = { version: 1, slug: 'stock', who: { name: 'Stock' }, things: Object.entries(STOCK).filter(([,k])=>k.model).map(([id, k], i) => ({ id, name: id, model: k.model, at: { bearing: i * 30 - 120, distance: 6 }, parts: partsOf({ stock: id }) })) };

const root = fileURLToPath(new URL('..', import.meta.url));
const OUT = root + 'assets/models/planets/', TMP = root + '.planet-models-tmp/', SPECS = root + 'tools/models/planets/', PICTURES = SPECS + 'pictures/';

/** every planet whose things are to be modelled */
export function planets() {
  const files = existsSync(SPECS) ? readdirSync(SPECS).filter((f) => f.endsWith('.json')).sort() : [];
  return [EXAMPLE, STOCK_PLANET, ...files.map((f) => JSON.parse(readFileSync(SPECS + f, 'utf8')))];
}

/** what's to be made: [{ key, slug, thing }], refusing a planet or a run over its cap */
export function wanted(list, manifest, redo = new Set()) {
  const todo = [];
  // the friends' planets with a model already: the first ones, in the order they got them
  const friends = new Set(Object.keys(manifest).map((k) => k.split('/')[0]).filter(isFriend));
  for (const spec of list) {
    const errors = checkPlanet(spec);
    if (errors.length) throw new Error(`${spec.slug}: ${errors[0]}`);
    const things = (spec.things || []).filter((t) => t.model);
    if (things.length > PER_PLANET) throw new Error(`${spec.slug}: ${things.length} things to model, more than ${PER_PLANET} a planet`);
    if (things.length && isFriend(spec.slug) && !friends.has(spec.slug)) {
      if (friends.size >= FIRST_PLANETS) throw new Error(`${spec.slug}: models are for the first ${FIRST_PLANETS} friends' planets, and they have them; ask Steve before making more`);
      friends.add(spec.slug);
    }
    for (const thing of things) {
      const key = `${spec.slug}/${thing.id}`, had = manifest[key];
      const resuming = had?.pending?.inputId === modelSource(thing.model).inputId;
      if (!redo.has(key) && !resuming && currentModel(had, thing.model) && had.file && existsSync(OUT + had.file)) continue;
      todo.push({ key, slug: spec.slug, thing });
    }
  }
  if (todo.length > PER_RUN) throw new Error(`${todo.length} models to make, more than ${PER_RUN} in one run`);
  return todo;
}

export async function make({ key, slug, thing }, manifest, save, redo = new Set(), deps = {}) {
  const api = { task, finished, get, optimize, ...deps };
  const pictures = deps.pictures || PICTURES, output = deps.output || OUT, temp = deps.temp || TMP;
  const rec = manifest[key] ||= {};
  if (!rec.pending && (rec.picture || rec.model3d) && !rec.file) throw new Error(`${key}: an unfinished legacy task needs review before starting a replacement; its IDs were preserved`);
  // Keep the accepted record/file intact while its replacement is pending or fails.
  const pending = pendingModel(rec, thing.model, redo.has(key));
  save();
  const picture = pictures + pictureName(pending);
  const wait = async (field, label, endpoint) => api.finished(pending[field], label, endpoint).catch((e) => {
    // A timeout or network error is not a failed task: resume its ID next run.
    if (['FAILED', 'CANCELED'].includes(e.status)) { delete pending[field]; save(); }
    throw e;
  });
  if (!existsSync(picture)) {
    // a picture already asked for is waited for, not paid for twice
    if (!pending.picture) { pending.picture = await api.task(pending.pictureRequest, TEXT_TO_IMAGE); save(); }
    const done = await wait('picture', `${key} picture`, TEXT_TO_IMAGE);
    mkdirSync(pictures, { recursive: true });
    writeFileSync(picture, Buffer.from(await (await api.get(done.image_urls[0])).arrayBuffer()));
  }
  const bytes = readFileSync(picture), referenceId = digest(bytes);
  const meshInput = digest(JSON.stringify({ referenceId, settings: MODEL_SETTINGS }));
  if (pending.meshInput !== meshInput) { delete pending.model3d; pending.meshInput = meshInput; save(); }
  // then the model, from the picture
  if (!pending.model3d) {
    pending.model3d = await api.task({ image_url: 'data:image/png;base64,' + bytes.toString('base64'), ...MODEL_SETTINGS }, IMAGE_TO_3D);
    save();
  }
  // a task Meshy failed is forgotten, so the next run asks again rather than waiting on it forever
  const done = await wait('model3d', `${key} model`, IMAGE_TO_3D);
  const raw = temp + key.replace('/', '-') + '.glb', optimized = raw + '.optimized.glb';
  mkdirSync(output + slug, { recursive: true }); mkdirSync(temp, { recursive: true });
  writeFileSync(raw, Buffer.from(await (await api.get(done.model_urls.glb)).arrayBuffer()));
  api.optimize(raw, optimized, 1024);
  const result = readFileSync(optimized), file = `${key}-${digest(result).slice(0, 16)}.glb`;
  if (!existsSync(output + file)) writeFileSync(output + file, result);
  Object.assign(rec, { model: thing.model, style: STYLE_NAME, inputId: modelSource(thing.model).inputId, referenceId, settings: MODEL_SETTINGS, tasks:{picture:pending.picture,model:pending.model3d}, file, bytes: statSync(output + file).size, made: new Date().toISOString().slice(0, 10) });
  delete rec.pending; delete rec.picture; delete rec.model3d;
  save();
  console.log(`${key}: ${(rec.bytes / 1024).toFixed(0)} KB`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(TMP, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  const manifestFile = OUT + 'manifest.json';
  const manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : {};
  const save = () => writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  const redoAt = process.argv.indexOf('--redo');
  const redo = new Set((redoAt < 0 ? '' : process.argv[redoAt + 1] || '').split(',').filter((x) => x.includes('/')));
  const todo = wanted(planets(), manifest, redo);
  if (process.argv.includes('--dry-run')) { console.log(`${todo.length} to make: ${todo.map((t) => t.key).join(', ') || 'nothing'}`); process.exit(0); }
  if (!todo.length) { console.log('Nothing to make. Existing models are preserved.'); process.exit(0); }
  if (!process.env.MESHY_API_KEY) throw new Error('MESHY_API_KEY is not set: add it as a repo secret (Settings, Secrets and variables, Actions)');
  const before = await balance();
  console.log(`${todo.length} to make: ${todo.map((t) => t.key).join(', ') || 'nothing'}. Meshy credits: ${before ?? '?'}`);
  const errors = [];
  // a few at a time: Meshy runs a handful of tasks at once on a paid plan
  for (let i = 0; i < todo.length; i += 4) {
    for (const r of await Promise.allSettled(todo.slice(i, i + 4).map((t) => make(t, manifest, save, redo)))) if (r.status === 'rejected') errors.push(String(r.reason?.message || r.reason));
  }
  save();
  rmSync(TMP, { recursive: true, force: true });
  const after = await balance();
  console.log(`Meshy credits: ${after ?? '?'}${before != null && after != null ? ` (${before - after} spent)` : ''}`);
  if (errors.length) { for (const e of errors) console.log('::error::' + e); process.exit(1); }
}
