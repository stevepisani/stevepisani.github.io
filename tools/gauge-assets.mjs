// Makes what's missing for the walk in "Rockets and Horses" (tools/models/gauge.json says what):
//   - each model by Meshy text-to-3D (a preview, then a refine with PBR textures), or image-to-3D
//     from its `image` (a stand-in drawn by tools/model-ref.mjs), then retextured from `texture`, shrunk with
//     gltf-transform (meshopt, WebP textures) into assets/models/gauge/<name>.glb
//   - the skies (day, and dusk for the dark theme: each an HDR to light by and a JPEG to see) and the textures from Poly Haven
//     (CC0) into assets/images/gauge/
// and writes assets/models/gauge/manifest.json (what was made, from which Meshy tasks, how big)
// and report.json (what went wrong, if anything, with the Poly Haven ids that would fit).
// Run by .github/workflows/models.yml, which has MESHY_API_KEY (the sandbox can't reach Meshy):
//
//   MESHY_API_KEY=... node tools/gauge-assets.mjs [--redo name,name]
//
// Tasks already started are picked up again from the manifest, so a re-run never pays twice.
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Image } from 'imagescript';
import { get, task, finished, madeBefore, auth, IMAGE_TO_3D as FROM_IMAGE, RETEXTURE, optimize } from './meshy.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const spec = JSON.parse(readFileSync(root + 'tools/models/gauge.json', 'utf8'));
const MODELS = root + 'assets/models/gauge/', IMAGES = root + 'assets/images/gauge/', TMP = root + '.gauge-tmp/';
for (const d of [MODELS, IMAGES, TMP]) mkdirSync(d, { recursive: true });
const manifestFile = MODELS + 'manifest.json';
const manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : {};
const save = () => writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
const report = { errors: [], polyhaven: {} };
const redo = new Set((process.argv[process.argv.indexOf('--redo') + 1] || '').split(',').filter(Boolean));

// ---- Meshy ------------------------------------------------------------------------------------
async function model(name, m) {
  const out = MODELS + name + '.glb';
  if (existsSync(out) && !redo.has(name)) return;
  const rec = redo.has(name) ? {} : manifest[name] || {};
  manifest[name] = rec;
  if (m.image) return shrink(name, m, rec, await retexture(name, m, rec, await fromImage(name, m, rec)));
  const prompt = `${m.prompt}. ${spec.style}`.slice(0, 600);
  if (!rec.refine && !redo.has(name)) {
    const t = await madeBefore(prompt);
    if (t?.mode === 'refine') Object.assign(rec, { preview: t.preview_task_id, refine: t.id });
    else if (t) rec.preview = t.id;
  }
  if (!rec.preview && !rec.refine) {
    rec.preview = await task({ mode: 'preview', prompt, art_style: 'realistic', ai_model: 'latest', topology: 'triangle', target_polycount: m.polycount, should_remesh: true });
    save();
  }
  if (!rec.refine) {
    await finished(rec.preview, `${name} preview`);
    rec.refine = await task({ mode: 'refine', preview_task_id: rec.preview, enable_pbr: true, texture_prompt: m.texture.slice(0, 600) });
    save();
  }
  return shrink(name, m, rec, await finished(rec.refine, `${name} refine`));
}

// image-to-3D: one task, from the picture as a data URI
async function fromImage(name, m, rec) {
  if (!rec.image) {
    const image_url = 'data:image/png;base64,' + readFileSync(root + m.image).toString('base64');
    const r = await get(FROM_IMAGE, { method: 'POST', headers: auth, body: JSON.stringify({ image_url, ai_model: 'latest', topology: 'triangle', target_polycount: m.polycount, should_remesh: true, should_texture: true, enable_pbr: true, texture_prompt: m.texture.slice(0, 800) }) });
    rec.image = (await r.json()).result;
    save();
  }
  return finished(rec.image, `${name} from its picture`, FROM_IMAGE);
}

// the picture is flat colour, so its model is too: paint it again from the texture words
async function retexture(name, m, rec) {
  if (!rec.retexture) {
    const r = await get(RETEXTURE, { method: 'POST', headers: auth, body: JSON.stringify({ input_task_id: rec.image, text_style_prompt: m.texture.slice(0, 800), enable_pbr: true, ai_model: 'latest' }) });
    rec.retexture = (await r.json()).result;
    save();
  }
  return finished(rec.retexture, `${name} retexture`, RETEXTURE);
}

async function shrink(name, m, rec, done) {
  const out = MODELS + name + '.glb', raw = TMP + name + '.glb';
  writeFileSync(raw, Buffer.from(await (await get(done.model_urls.glb)).arrayBuffer()));
  if (m.simplify) await simplify(raw, m.simplify);
  optimize(raw, out, m.textureSize);
  Object.assign(rec, { file: name + '.glb', bytes: statSync(out).size, made: new Date().toISOString().slice(0, 10) });
  save();
  console.log(`${name}: ${(rec.bytes / 1024).toFixed(0)} KB`);
}

// fewer triangles: the normals go first so the faces weld across them, then come back smooth
async function simplify(file, ratio) {
  const { NodeIO } = await import('@gltf-transform/core');
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
  const fns = await import('@gltf-transform/functions');
  const { MeshoptDecoder, MeshoptSimplifier } = await import('meshoptimizer');
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.read(file);
  await doc.transform(fns.dequantize());
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) p.setAttribute('NORMAL', null);
  await doc.transform(fns.weld(), fns.simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.02 }), fns.normals({ overwrite: true }));
  await io.write(file, doc);
}

// ---- Poly Haven (CC0) ---------------------------------------------------------------------------
const files = async (id) => { const r = await fetch(`https://api.polyhaven.com/files/${id}`); return r.ok ? r.json() : null; };
async function first(kind, ids) {
  for (const id of ids) { const f = await files(id); if (f) return [id, f]; }
  // none of them: say which would do, for gauge.json
  const all = await (await get(`https://api.polyhaven.com/assets?t=${kind === 'sky' || kind === 'dusk' ? 'hdris' : 'textures'}`)).json();
  const word = { sky: 'puresky', dusk: 'puresky', masonry: 'block', plaster: 'plaster', thatch: 'thatch', grass: 'grass', stone: 'cobble', dirt: 'mud', ballast: 'gravel', rock: 'rock', wood: 'plank' }[kind] || kind;
  report.polyhaven[kind] = Object.keys(all).filter((k) => k.includes(word)).slice(0, 20);
  throw new Error(`Poly Haven: none of ${ids.join(', ')} exists for ${kind}`);
}
// a JPEG at most `max` pixels wide, re-encoded smaller
async function jpeg(url, path, max) {
  if (existsSync(path)) return;
  let img = await Image.decode(Buffer.from(await (await get(url)).arrayBuffer()));
  if (img.width > max) img = img.resize(max, Image.RESIZE_AUTO);
  writeFileSync(path, await img.encodeJPEG(78));
}
const pick = (map, size, fmt) => map?.[size]?.[fmt]?.url;

// a sky: `sky` the day, `dusk` the dark theme's
async function sky(name) {
  if (existsSync(IMAGES + name + '.hdr') && existsSync(IMAGES + name + '.jpg')) return;
  const [id, f] = await first(name, spec[name]);
  writeFileSync(IMAGES + name + '.hdr', Buffer.from(await (await get(pick(f.hdri, '1k', 'hdr'))).arrayBuffer()));
  await jpeg(f.tonemapped.url, IMAGES + name + '.jpg', 4096);
  manifest['_' + name] = id;
}
async function texture(kind, ids) {
  if (existsSync(IMAGES + `${kind}-diff.jpg`)) return;
  const [id, f] = await first(kind, ids);
  const key = (want) => Object.keys(f).find((k) => k.toLowerCase() === want);
  // the colour sharpest where it's seen up close (the ground under the track), the rest smaller
  await jpeg(pick(f[key('diffuse')], '2k', 'jpg'), IMAGES + `${kind}-diff.jpg`, spec.sharp.includes(kind) ? 2048 : 1024);
  await jpeg(pick(f[key('nor_gl')], '2k', 'jpg'), IMAGES + `${kind}-nor.jpg`, 1024);
  await jpeg(pick(f[key('rough')], '2k', 'jpg'), IMAGES + `${kind}-rough.jpg`, 512);
  (manifest._textures ||= {})[kind] = id;
}

const jobs = [sky('sky'), sky('dusk'), ...Object.entries(spec.textures).map(([k, ids]) => texture(k, ids))];
if (process.env.MESHY_API_KEY) jobs.push(...Object.entries(spec.models).map(([n, m]) => model(n, m)));
else report.errors.push('MESHY_API_KEY is not set: add it as a repo secret (Settings, Secrets and variables, Actions)');
for (const r of await Promise.allSettled(jobs)) if (r.status === 'rejected') report.errors.push(String(r.reason?.message || r.reason));
save();
rmSync(TMP, { recursive: true, force: true });
writeFileSync(MODELS + 'report.json', JSON.stringify({ at: new Date().toISOString(), ...report }, null, 2) + '\n');
if (report.errors.length) { console.error(report.errors.join('\n')); process.exit(1); }
