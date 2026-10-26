// Makes real 3D models for the things on friends' planets (My Tiny Planet, docs/planets.md): each
// thing whose spec describes it in words (`model`) gets a Meshy text-to-3D model (a preview, then
// a refine with PBR textures), made small with gltf-transform into
// assets/models/planets/<slug>/<thing id>.glb and listed in assets/models/planets/manifest.json
// under "<slug>/<thing id>" with the words it was made from. The planet (assets/js/planets/
// models.js) shows it in place of the thing's shapes. The planets: the kit's example (Sam, in
// supabase/functions/planets/server.js) and each spec in tools/models/planets/.
// Run by .github/workflows/planet-models.yml, which has MESHY_API_KEY:
//
//   MESHY_API_KEY=... node tools/planet-models.mjs [--redo slug/id,slug/id]
//
// Only what's missing is paid for, and a model whose words changed is made again. Costs: about 30
// credits a model (20 the preview, 10 the refine), so about $0.60; capped below.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkPlanet } from '../supabase/functions/_shared/planet.js';
import { EXAMPLE } from '../supabase/functions/planets/server.js';
import { get, task, finished, madeBefore, balance, optimize } from './meshy.mjs';

// the caps: 8 models a planet (about $5, what Steve set for the first planets), 24 a run
export const PER_PLANET = 8, PER_RUN = 24;
const STYLE = 'One object on its own, no ground, no base plate, no background. Realistic, detailed, true to life';

const root = fileURLToPath(new URL('..', import.meta.url));
const OUT = root + 'assets/models/planets/', TMP = root + '.planet-models-tmp/', SPECS = root + 'tools/models/planets/';

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
      if (!redo.has(key) && had?.model === thing.model && had.file && existsSync(OUT + had.file)) continue;
      todo.push({ key, slug: spec.slug, thing });
    }
  }
  if (todo.length > PER_RUN) throw new Error(`${todo.length} models to make, more than ${PER_RUN} in one run`);
  return todo;
}

async function make({ key, slug, thing }, manifest, save, redo) {
  const prompt = `${thing.model}. ${STYLE}`.slice(0, 600);
  // a record for these words (started before, maybe by a run that stopped), or a new one
  let rec = manifest[key];
  if (!rec || rec.model !== thing.model || redo.has(key)) rec = manifest[key] = { model: thing.model };
  if (!rec.refine && !redo.has(key)) {
    const t = await madeBefore(prompt);
    if (t?.mode === 'refine') Object.assign(rec, { preview: t.preview_task_id, refine: t.id });
    else if (t) rec.preview = t.id;
  }
  if (!rec.preview && !rec.refine) {
    rec.preview = await task({ mode: 'preview', prompt, art_style: 'realistic', ai_model: 'latest', topology: 'triangle', target_polycount: 30000, should_remesh: true });
    save();
  }
  if (!rec.refine) {
    await finished(rec.preview, `${key} preview`);
    rec.refine = await task({ mode: 'refine', preview_task_id: rec.preview, enable_pbr: true, texture_prompt: thing.model.slice(0, 600) });
    save();
  }
  const done = await finished(rec.refine, `${key} refine`);
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
