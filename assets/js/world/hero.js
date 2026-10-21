// Hero props: optional AI-generated (or hand-made) GLBs that replace procedural stand-ins.
//
// Drop a file in assets/models/hero/ and list it in assets/models/hero/manifest.json:
//   { "tiki-post": { "file": "tiki-post.glb", "height": 2.7 } }
// Each model is normalised on load: centred on its footprint, sitting on y = 0, scaled
// to `height` metres. Slots with no file keep their procedural version.
// Prompts and specs for generating each slot: tools/models/HERO_PROMPTS.md.
import * as THREE from 'three';
import { PALETTE } from './materials.js';

/**
 * Load the hero props. Slots marked `"lazy": true` (models that replace code-built things) are
 * left out, and loaded instead by `{ lazy: true }` once the scene is up; `"lazy": "bar"` (the
 * bottles the robot pours from) by `{ lazy: 'bar' }`, when someone walks up to the bar.
 */
export async function loadHeroes(loader, baseUrl, { lazy = false, first = [], onEach = null } = {}) { // lazy: false | true | 'bar'
  const heroes = new Map();
  let manifest = {};
  try {
    const res = await fetch(baseUrl + 'manifest.json', { cache: 'no-cache' });
    if (res.ok) manifest = await res.json();
  } catch (e) { return heroes; }

  // Before the reveal, all at once. After it, one at a time with a frame drawn between them: each
  // model is parsed on the main thread, and thirty at once would hold up the planet for seconds.
  // `lazy: true` after the reveal; `lazy: "bar"` only when asked for (the bottles a drink is made from)
  const entries = Object.entries(manifest).filter(([, spec]) => (lazy === 'bar' ? spec.lazy === 'bar' : !!spec.lazy === lazy && spec.lazy !== 'bar'));
  // `first`: slots wanted soonest (the bottles of the drink just ordered)
  entries.sort(([a], [b]) => (first.includes(a) ? 0 : 1) - (first.includes(b) ? 0 : 1));
  // After the reveal every file is asked for at once, so the network fetches them together, and
  // each is parsed in turn as it's needed; `onEach(slot, holder)` hands each over as it's ready.
  const files = lazy ? new Map(entries.map(([slot, spec]) => {
    const f = fetch(baseUrl + spec.file).then((r) => { if (!r.ok) throw new Error(`${r.status} ${spec.file}`); return r.arrayBuffer(); });
    f.catch(() => {}); // reported when it's parsed
    return [slot, f];
  })) : null;
  const gap = () => new Promise((ok) => requestAnimationFrame(() => setTimeout(ok, 0)));
  const each = async ([slot, spec]) => {
    try {
      const gltf = files ? await loader.parseAsync(await files.get(slot), baseUrl) : await loader.loadAsync(baseUrl + spec.file);
      const root = gltf.scene;
      // turn first, so centring and grounding use the turned footprint (`rotate`: [x, y, z]
      // radians, for a model lying the wrong way; `rotateY` for one facing the wrong way)
      if (spec.rotate) root.rotation.set(...spec.rotate);
      if (spec.rotateY) root.rotation.y += spec.rotateY;
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const scale = (spec.height || 1) / (size.y || 1);
      const holder = new THREE.Group();
      root.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
      root.scale.setScalar(scale);
      root.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = o.receiveShadow = true;
        // `roughness` / `metalness` set the material factors (over any PBR maps: 0.3 on a
        // map makes a glaze glossier). Without a roughness map, AI textures tend to be
        // flat-lit plastic, so default to fairly rough and let our lights do the work.
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          if (!('roughness' in m)) return;
          if (spec.roughness !== undefined) m.roughness = spec.roughness;
          else if (!m.roughnessMap) m.roughness = Math.max(m.roughness, 0.7);
          if (spec.metalness !== undefined) m.metalness = spec.metalness;
          // `tint` (a PALETTE key) and `brightness` multiply the base colour: rescues textures
          // that go muddy under the bar's amber light
          if (spec.tint && PALETTE[spec.tint] !== undefined) m.color.multiply(new THREE.Color(PALETTE[spec.tint]));
          if (spec.brightness !== undefined) m.color.multiplyScalar(spec.brightness);
          // `glow`: lit from inside (pufferfish lamps). Emits its own texture, so no new colours.
          if (spec.glow && m.map) { m.emissive.set(0xffffff); m.emissiveMap = m.map; m.emissiveIntensity = spec.glow; }
        });
      });
      holder.add(root);
      holder.userData.spec = spec; // for slots that place parts on the model (the launch console)
      heroes.set(slot, holder);
      if (onEach) await onEach(slot, holder);
    } catch (e) {
      console.warn('hero prop failed to load, using the procedural one:', slot, e);
    }
  };
  if (!lazy) await Promise.all(entries.map(each));
  else for (const entry of entries) { await each(entry); await gap(); }
  return heroes;
}

/**
 * Slots for lazy heroes (`"lazy": true`): things built in code first, so the planet comes up
 * without waiting for their models, then swapped for the model once it has loaded. `heroSlot()`
 * marks `holder` (a group holding only the code-built part to be replaced) as where `slot`'s
 * model goes; `fillSlots()` (main.js, once the lazy heroes are in)
 * empties each holder and puts a copy of the model in it, then calls `fit(model, holder)` to
 * size or tint it (the model arrives as hero.js leaves it: scaled to the manifest's `height`,
 * centred on its footprint, standing on y = 0) and `onFill(model)`. A slot asked for after its
 * model has loaded is filled at once.
 */
const slots = new Map(), loaded = new Map();
export function heroSlot(slot, holder, { fit = null, onFill = null } = {}) {
  const entry = { holder, fit, onFill };
  if (loaded.has(slot)) fill(loaded.get(slot), entry);
  else (slots.get(slot) || slots.set(slot, []).get(slot)).push(entry);
  return holder;
}
function fill(hero, { holder, fit, onFill }) {
  const model = hero.clone(true);
  holder.clear(); // a batch the stand-in was merged into comes apart (batch.js), and main.js bakes again
  holder.add(model);
  if (fit) fit(model, holder);
  if (onFill) onFill(model);
}
export function fillSlots(heroes, { into = null } = {}) {
  for (const [slot, hero] of heroes) loaded.set(slot, hero); // all of them first: a fit can use another (heroModel)
  for (const [slot, hero] of heroes) {
    const entries = slots.get(slot) || [];
    if (hero.userData.spec.instance && into && entries.length > 1) instanced(hero, entries, into);
    else for (const entry of entries) fill(hero, entry);
    slots.delete(slot);
  }
}
/**
 * `"instance": true` (things there are dozens of, standing still: the trail lanterns, the torches):
 * every copy drawn at once, one InstancedMesh per part of the model in `into` (world space), each
 * where its holder would have put it.
 */
function instanced(hero, entries, into) {
  const parts = [];
  hero.traverse((o) => { if (o.isMesh) parts.push(o); });
  const poses = entries.map((entry) => {
    fill(hero, entry);
    const model = entry.holder.children[0];
    model.updateMatrixWorld(true);
    const list = [];
    model.traverse((o) => { if (o.isMesh) list.push(o.matrixWorld.clone()); });
    entry.holder.remove(model);
    return list;
  });
  into.updateMatrixWorld(true);
  const toInto = into.matrixWorld.clone().invert();
  parts.forEach((part, k) => {
    const im = new THREE.InstancedMesh(part.geometry, part.material, entries.length);
    poses.forEach((list, i) => im.setMatrixAt(i, list[k].premultiply(toInto)));
    im.castShadow = im.receiveShadow = true;
    im.computeBoundingSphere();
    into.add(im);
  });
}
/** A loaded lazy hero, as hero.js left it (not a copy: don't change it), or undefined. */
export function heroModel(slot) { return loaded.get(slot); }

/** Clone a loaded hero for `slot`, or build the fallback. */
export function heroOr(heroes, slot, fallback) {
  const h = (heroes && heroes.get(slot)) || loaded.get(slot); // or a lazy one, once it's in
  return h ? h.clone(true) : fallback();
}
