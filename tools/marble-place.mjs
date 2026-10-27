// Makes the worlds in tools/models/marble.json with World Labs' Marble
// (https://docs.worldlabs.ai/api): words or photos in, a Gaussian-splat place out, for a door on
// the planet (realplaces.js). Needs WORLDLABS_API_KEY, a repo secret, so the Marble workflow runs it.
// Each world is made once: one whose files are already in assets/splats/ is skipped, so a re-run
// pays only for what's missing.
//
//   node tools/marble-place.mjs [--only name,name] [--redo name,name]
//
// Writes, for a world called name (under drafts/ for a draft):
//   name.spz        the splat at 500k splats (the full one; about 10 MB)
//   name-lite.spz   at 100k (the light copy, shown first)
//   name-pano.jpg   Marble's panorama of it
//   name.json       the world's id, its Marble link, the caption, and the scale and ground offset
//                   that turn its units into metres
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { decode, Image } from 'imagescript';

const API = 'https://api.worldlabs.ai/marble/v1';
const KEY = process.env.WORLDLABS_API_KEY;
// what one world costs, in credits (1,250 to the dollar), by model; text or photos add up to 100
const CREDITS = { 'marble-1.0-draft': 250, 'marble-1.1': 1600, 'marble-1.1-plus': 3100 };
const MAX_CREDITS = 6250; // a run never spends more than $5
const root = new URL('..', import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1] || '']] : a), []));
const list = (s) => (s || '').split(',').map((x) => x.trim()).filter(Boolean);
const only = list(args.only), redo = list(args.redo);

async function call(path, body) {
  for (let i = 0; ; i++) {
    const r = await fetch(`${API}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'WLT-Api-Key': KEY, 'Content-Type': 'application/json' },
      body: body && JSON.stringify(body),
    });
    if (r.ok) return r.json();
    if (i === 3 || r.status < 500) throw new Error(`${path}: ${r.status} ${(await r.text()).slice(0, 400)}`);
    await sleep(2000 * 2 ** i);
  }
}

// a photo as Marble takes it: a JPEG no wider than 2048, inline
async function photo(file) {
  let img = await decode(readFileSync(new URL(`tools/models/marble/${file}`, root)));
  if (!(img instanceof Image)) throw new Error(`${file}: not a still image`);
  if (Math.max(img.width, img.height) > 2048) img = img.width > img.height ? img.resize(2048, Image.RESIZE_AUTO) : img.resize(Image.RESIZE_AUTO, 2048);
  return { source: 'data_base64', data_base64: Buffer.from(await img.encodeJPEG(88)).toString('base64'), extension: 'jpg' };
}

async function prompt(w) {
  const photos = w.photos || [];
  if (!photos.length) return { type: 'text', text_prompt: w.prompt };
  if (photos.length === 1) return { type: 'image', image_prompt: await photo(photos[0].file), text_prompt: w.prompt, is_pano: false };
  return {
    type: 'multi-image',
    multi_image_prompt: await Promise.all(photos.map(async (p) => ({ azimuth: p.azimuth ?? 0, content: await photo(p.file) }))),
    text_prompt: w.prompt,
  };
}

async function download(url, to) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  writeFileSync(to, Buffer.from(await r.arrayBuffer()));
  return to;
}

const manifest = JSON.parse(readFileSync(new URL('tools/models/marble.json', root), 'utf8'));
const todo = Object.entries(manifest).filter(([name, w]) => {
  if (name === '_' || (only.length && !only.includes(name))) return false;
  const dir = w.draft ? 'assets/splats/drafts' : 'assets/splats';
  return redo.includes(name) || !existsSync(new URL(`${dir}/${name}.json`, root));
});
const cost = todo.reduce((s, [, w]) => s + (CREDITS[w.model] ?? CREDITS['marble-1.1-plus']), 0);
console.log(`${todo.length} to make: ${todo.map(([n]) => n).join(', ') || 'nothing'} (about ${cost} credits, $${(cost / 1250).toFixed(2)})`);
if (!todo.length) process.exit(0);
if (!KEY) throw new Error('WORLDLABS_API_KEY is not set');
if (cost > MAX_CREDITS) throw new Error(`that's more than the ${MAX_CREDITS} credits a run may spend: make fewer at a time (--only)`);

const errors = [];
for (const [name, w] of todo) {
  try {
    const dir = new URL(`${w.draft ? 'assets/splats/drafts' : 'assets/splats'}/`, root);
    mkdirSync(dir, { recursive: true });
    const op = await call('/worlds:generate', { display_name: name, model: w.model, world_prompt: await prompt(w) });
    console.log(`${name}: started (${op.operation_id})`);
    let done = op;
    for (let t = 0; !done.done; t++) {
      if (t > 120) throw new Error('took over 20 minutes');
      await sleep(10000);
      done = await call(`/operations/${op.operation_id}`);
      if (t % 3 === 0) console.log(`${name}: ${done.metadata?.progress?.status || ''} ${done.metadata?.progress?.description || ''}`);
    }
    if (done.error) throw new Error(JSON.stringify(done.error));
    const world = await call(`/worlds/${done.metadata?.world_id || done.response?.id}`);
    const { splats, imagery, caption } = world.assets;
    await download(splats.spz_urls['500k'] || splats.spz_urls.full_res, new URL(`${name}.spz`, dir));
    await download(splats.spz_urls['100k'], new URL(`${name}-lite.spz`, dir));
    if (imagery?.pano_url) await download(imagery.pano_url, new URL(`${name}-pano.jpg`, dir));
    writeFileSync(new URL(`${name}.json`, dir), JSON.stringify({
      id: world.id, marble: world.world_marble_url, model: w.model, made: new Date().toISOString(), caption,
      credit: w.credit,
      // metric_scale_factor (its units to metres) and ground_plane_offset (where the ground is)
      semantics: splats.semantics_metadata ?? null,
    }, null, 2) + '\n');
    console.log(`${name}: done, ${world.world_marble_url}`);
  } catch (e) {
    errors.push(`${name}: ${e.message}`);
    console.log(`::error::${name}: ${e.message}`);
  }
}
if (errors.length) process.exit(1);
