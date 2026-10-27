// Makes real 3D models for the things on friends' planets (My Tiny Planet, docs/planets.md), all in
// one house style, storybook miniature (Steve chose it, Oct 27, 2026: "lock it in and have it as
// our style"). Each thing whose spec describes it in words (`model`) is first drawn as a picture
// in that style (Meshy text-to-image: alone on white, no base), kept in tools/models/planets/
// pictures/, then made into 3D from the picture (image-to-3D, PBR textures), made small with
// gltf-transform into assets/models/planets/<slug>/<thing id>.glb and listed in
// assets/models/planets/manifest.json under "<slug>/<thing id>" with the words and the style it
// was made from. The planet (assets/js/planets/models.js) shows it in place of the thing's
// shapes. The planets: the kit's example (Sam, in supabase/functions/planets/server.js) and each
// spec in tools/models/planets/. Run by .github/workflows/planet-models.yml, which has
// MESHY_API_KEY:
//
//   MESHY_API_KEY=... node tools/planet-models.mjs [--redo slug/id,slug/id]
//
// Only what's missing is paid for, and a model whose words or style changed is made again.
// Costs: a few credits the picture, 30 the model, so about $0.70 a thing; capped below.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkPlanet } from '../supabase/functions/_shared/planet.js';
import { EXAMPLE } from '../supabase/functions/planets/server.js';
import { get, task, finished, balance, optimize, IMAGE_TO_3D, TEXT_TO_IMAGE } from './meshy.mjs';

// the caps: 8 models a planet (about $5, what Steve set for the first planets), 24 a run
export const PER_PLANET = 8, PER_RUN = 24;
// the house style: change it and every model is made again
export const STYLE_NAME = 'storybook';
const STYLE = 'A storybook miniature: hand-painted textures, soft rounded forms, gentle exaggerated proportions, warm and cosy, like a Tiny Glade or Little Prince illustration come to life';
const FRAME = 'One object alone on a plain white background, with no ground, no base, no plinth and no shadow under it, no text and no logos; seen from the front and a little above, three-quarter view, the whole object in frame';

const root = fileURLToPath(new URL('..', import.meta.url));
const OUT = root + 'assets/models/planets/', TMP = root + '.planet-models-tmp/', SPECS = root + 'tools/models/planets/', PICTURES = SPECS + 'pictures/';

/** every planet whose things are to be modelled */
export function planets() {
  const files = existsSync(SPECS) ? readdirSync(SPECS).filter((f) => f.endsWith('.json')).sort() : [];
  return [EXAMPLE, ...files.map((f) => JSON.parse(readFileSync(SPECS + f, 'utf8')))];
}

/** what's to be made: [{ key, slug, thing }], refusing a planet or a run over its cap */
export function wanted(list, manifest, redo = new Set()) {
  const todo = [];
  for (const spec of list) {
    const errors = checkPlanet(spec);
    if (errors.length) throw new Error(`${spec.slug}: ${errors[0]}`);
    const things = (spec.things || []).filter((t) => t.model);
    if (things.length > PER_PLANET) throw new Error(`${spec.slug}: ${things.length} things to model, more than ${PER_PLANET} a planet`);
    for (const thing of things) {
      const key = `${spec.slug}/${thing.id}`, had = manifest[key];
      if (!redo.has(key) && had?.model === thing.model && had.style === STYLE_NAME && had.file && existsSync(OUT + had.file)) continue;
      todo.push({ key, slug: spec.slug, thing });
    }
  }
  if (todo.length > PER_RUN) throw new Error(`${todo.length} models to make, more than ${PER_RUN} in one run`);
  return todo;
}

async function make({ key, slug, thing }, manifest, save, redo) {
  // a record for these words in this style (started before, maybe by a run that stopped), or a new one
  let rec = manifest[key];
  if (!rec || rec.model !== thing.model || rec.style !== STYLE_NAME || redo.has(key)) rec = manifest[key] = { model: thing.model, style: STYLE_NAME };
  // first the picture, in the house style
  const picture = PICTURES + key.replace('/', '-') + '.png';
  if (!existsSync(picture)) {
    // a picture already asked for is waited for, not paid for twice
    if (!rec.picture) { rec.picture = await task({ ai_model: 'nano-banana-2', prompt: `${thing.model}. ${STYLE}. ${FRAME}.`.slice(0, 1000), aspect_ratio: '1:1' }, TEXT_TO_IMAGE); save(); }
    const done = await finished(rec.picture, `${key} picture`, TEXT_TO_IMAGE).catch((e) => { delete rec.picture; save(); throw e; });
    mkdirSync(PICTURES, { recursive: true });
    writeFileSync(picture, Buffer.from(await (await get(done.image_urls[0])).arrayBuffer()));
    delete rec.model3d;
  }
  // then the model, from the picture
  if (!rec.model3d) {
    const image_url = 'data:image/png;base64,' + readFileSync(picture).toString('base64');
    rec.model3d = await task({ image_url, ai_model: 'latest', topology: 'triangle', target_polycount: 30000, should_remesh: true, should_texture: true, enable_pbr: true }, IMAGE_TO_3D);
    save();
  }
  // a task Meshy failed is forgotten, so the next run asks again rather than waiting on it forever
  const done = await finished(rec.model3d, `${key} model`, IMAGE_TO_3D).catch((e) => { delete rec.model3d; save(); throw e; });
  const raw = TMP + key.replace('/', '-') + '.glb', file = `${key}.glb`;
  mkdirSync(OUT + slug, { recursive: true });
  writeFileSync(raw, Buffer.from(await (await get(done.model_urls.glb)).arrayBuffer()));
  optimize(raw, OUT + file, 1024);
  Object.assign(rec, { file, bytes: statSync(OUT + file).size, made: new Date().toISOString().slice(0, 10) });
  save();
  console.log(`${key}: ${(rec.bytes / 1024).toFixed(0)} KB`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(TMP, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  const manifestFile = OUT + 'manifest.json';
  const manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : {};
  const save = () => writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  const redo = new Set((process.argv[process.argv.indexOf('--redo') + 1] || '').split(',').filter((x) => x.includes('/')));
  const todo = wanted(planets(), manifest, redo);
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
