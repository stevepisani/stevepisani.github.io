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
 * Load the hero props. Slots marked `"lazy": true` (things nobody sees until they ask, like the
 * bottles the robot pours from) are left out, and loaded instead by `{ lazy: true }` once the
 * scene is up.
 */
export async function loadHeroes(loader, baseUrl, { lazy = false } = {}) {
  const heroes = new Map();
  let manifest = {};
  try {
    const res = await fetch(baseUrl + 'manifest.json', { cache: 'no-cache' });
    if (res.ok) manifest = await res.json();
  } catch (e) { return heroes; }

  await Promise.all(Object.entries(manifest).filter(([, spec]) => !!spec.lazy === lazy).map(async ([slot, spec]) => {
    try {
      const gltf = await loader.loadAsync(baseUrl + spec.file);
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
    } catch (e) {
      console.warn('hero prop failed to load, using the procedural one:', slot, e);
    }
  }));
  return heroes;
}

/**
 * Slots for lazy heroes (`"lazy": true`): things built in code first, so the planet comes up
 * without waiting for their models, then swapped for the model once it has loaded. `heroSlot()`
 * marks `holder` (a group holding only the code-built part to be replaced; it's left out of
 * batching) as where `slot`'s model goes; `fillSlots()` (main.js, once the lazy heroes are in)
 * empties each holder and puts a copy of the model in it, then calls `fit(model, holder)` to
 * size or tint it (the model arrives as hero.js leaves it: scaled to the manifest's `height`,
 * centred on its footprint, standing on y = 0) and `onFill(model)`. A slot asked for after its
 * model has loaded is filled at once.
 */
const slots = new Map(), loaded = new Map();
export function heroSlot(slot, holder, { fit = null, onFill = null } = {}) {
  holder.userData.noBatch = true;
  const entry = { holder, fit, onFill };
  if (loaded.has(slot)) fill(loaded.get(slot), entry);
  else (slots.get(slot) || slots.set(slot, []).get(slot)).push(entry);
  return holder;
}
function fill(hero, { holder, fit, onFill }) {
  const model = hero.clone(true);
  holder.clear();
  holder.add(model);
  if (fit) fit(model, holder);
  if (onFill) onFill(model);
}
export function fillSlots(heroes) {
  for (const [slot, hero] of heroes) {
    loaded.set(slot, hero);
    for (const entry of slots.get(slot) || []) fill(hero, entry);
    slots.delete(slot);
  }
}

/** Clone a loaded hero for `slot`, or build the fallback. */
export function heroOr(heroes, slot, fallback) {
  const h = heroes && heroes.get(slot);
  return h ? h.clone(true) : fallback();
}
