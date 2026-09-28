// Hero props: optional AI-generated (or hand-made) GLBs that replace procedural stand-ins.
//
// Drop a file in assets/models/hero/ and list it in assets/models/hero/manifest.json:
//   { "tiki-statue": { "file": "tiki-statue.glb", "height": 2.8 } }
// Each model is normalised on load: centred on its footprint, sitting on y = 0, scaled
// to `height` metres. Slots with no file keep their procedural version.
// Prompts and specs for generating each slot: tools/models/HERO_PROMPTS.md.
import * as THREE from 'three';

export async function loadHeroes(loader, baseUrl) {
  const heroes = new Map();
  let manifest = {};
  try {
    const res = await fetch(baseUrl + 'manifest.json', { cache: 'no-cache' });
    if (res.ok) manifest = await res.json();
  } catch (e) { return heroes; }

  await Promise.all(Object.entries(manifest).map(async ([slot, spec]) => {
    try {
      const gltf = await loader.loadAsync(baseUrl + spec.file);
      const root = gltf.scene;
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const scale = (spec.height || 1) / (size.y || 1);
      const holder = new THREE.Group();
      root.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
      root.scale.setScalar(scale);
      if (spec.rotateY) root.rotation.y = spec.rotateY;
      root.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = o.receiveShadow = true;
        // AI textures tend to be flat-lit; let our lights do the work
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => { if ('roughness' in m) m.roughness = Math.max(m.roughness, spec.roughness ?? 0.7); if ('metalness' in m && spec.metalness !== undefined) m.metalness = spec.metalness; });
      });
      holder.add(root);
      heroes.set(slot, holder);
    } catch (e) {
      console.warn('hero prop failed to load, using the procedural one:', slot, e);
    }
  }));
  return heroes;
}

/** Clone a loaded hero for `slot`, or build the fallback. */
export function heroOr(heroes, slot, fallback) {
  const h = heroes && heroes.get(slot);
  return h ? h.clone(true) : fallback();
}
