// Fewer draw calls: the bar and the landmarks are hundreds of small meshes (posts, slats, rocks,
// fronds, lantern caps), and on a phone each draw call costs more than its triangles. Meshes that
// keep still and look alike are merged into one, per patch of the planet about 10 m across (so
// what's out of view is still culled) and per material look (materials made separately but set
// up alike count as one). Something that moves as a whole (a palm's crown swaying) is merged in
// its own frame and moves as one. The originals stay where they are on a layer the camera doesn't
// draw, so picking, glints and code holding on to them still work.
//
// What keeps still is measured, not guessed: `note()` on one frame, `bake()` a few frames later.
// After that, `watch()` each frame: if an original moves within its frame, hides, swaps or alters
// its material, or has its geometry rewritten (the robot sets off, the telescope swings round, the
// hammock sags), its batch is taken apart and the originals are drawn again. Whatever is marked
// `userData.noBatch` (with all it holds) is left alone: things that change as you use them.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const HIDDEN = 31; // the originals' layer; the camera draws layer 0
const CELL = 2;    // patches: the unit sphere cut into cells 1/CELL across (10 m on this planet)
const noop = THREE.Object3D.prototype.onBeforeRender;

const SAME = new Set(['MeshStandardMaterial', 'MeshPhysicalMaterial', 'MeshBasicMaterial', 'MeshLambertMaterial']);
const id = (t) => (t ? t.uuid : '');
const hex = (c) => (c ? c.getHex() : '');
/** Everything that decides how a material draws; anything other than the plain kinds, by identity. */
function look(m) {
  if (!SAME.has(m.type)) return m.uuid;
  return [m.type, hex(m.color), hex(m.emissive), m.emissiveIntensity, m.roughness, m.metalness, id(m.map), id(m.normalMap), m.normalScale && m.normalScale.x,
    id(m.roughnessMap), id(m.metalnessMap), id(m.aoMap), id(m.emissiveMap), id(m.alphaMap), id(m.bumpMap), id(m.envMap), m.envMapIntensity,
    m.visible, m.transparent, m.opacity, m.side, m.alphaTest, m.vertexColors, m.flatShading, m.depthWrite, m.depthTest, m.blending, m.toneMapped, m.fog,
    m.wireframe, m.polygonOffset, m.polygonOffsetFactor, m.polygonOffsetUnits, m.colorWrite, m.customProgramCacheKey(), String(m.onBeforeCompile),
    m.isMeshPhysicalMaterial ? [m.clearcoat, m.transmission, m.ior, m.sheen, m.iridescence, m.thickness, m.specularIntensity, hex(m.specularColor), hex(m.attenuationColor)].join() : '',
    JSON.stringify(m.defines || {}), JSON.stringify(m.userData)].join('|');
}
function shown(o) { for (; o; o = o.parent) if (!o.visible) return false; return true; }
function attrs(g) { return Object.keys(g.attributes).sort().map((k) => { const a = g.attributes[k]; return `${k}${a.itemSize}${a.normalized ? 'n' : ''}${a.array.constructor.name}`; }).join() + (g.index ? '|i' : ''); }
const _inv = new THREE.Matrix4(), _rel = new THREE.Matrix4(), _p = new THREE.Vector3();
/** o's matrix in a's frame */
const rel = (a, o, out) => out.multiplyMatrices(_inv.copy(a.matrixWorld).invert(), o.matrixWorld);
function near(a, b) { const x = a.elements, y = b.elements; for (let i = 0; i < 16; i++) if (Math.abs(x[i] - y[i]) > 1e-5) return false; return true; }

export function createBatcher() {
  const roots = [], noted = new Map(), batches = [];
  let checked = 0;
  const kept = (o) => { for (; o; o = o.parent) if (o.userData.noBatch) return true; return false; };
  const eligible = (o) => o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && !Array.isArray(o.material) && o.onBeforeRender === noop
    && !Object.keys(o.geometry.morphAttributes || {}).length && o.geometry.attributes.position && !kept(o);

  return {
    /** What to batch: the bar, the landmarks. */
    add(...r) { roots.push(...r.filter(Boolean)); },
    /** Where everything is now. */
    note() {
      noted.clear();
      for (const root of roots) root.traverse((o) => noted.set(o, { m: o.matrixWorld.clone(), mat: o.material, look: o.isMesh && !Array.isArray(o.material) ? look(o.material) : null }));
    },
    /** Merge what's kept still since `note()`. Returns how many draw calls it saved. */
    bake() {
      let saved = 0;
      for (const root of roots) {
        const groups = new Map();
        root.traverse((o) => {
          const n = noted.get(o);
          if (!n || !eligible(o) || !shown(o) || o.material !== n.mat || look(o.material) !== n.look) return;
          if (o.matrixWorld.determinant() <= 0) return; // mirrored: merging would turn it inside out
          // its frame: the outermost of root and its ancestors that it hasn't moved against
          const chain = [];
          for (let p = o.parent; p && p !== root.parent; p = p.parent) chain.unshift(p);
          let anchor = null;
          for (const a of chain) {
            const na = noted.get(a);
            if (!na) continue;
            const before = new THREE.Matrix4().multiplyMatrices(na.m.clone().invert(), n.m);
            if (near(before, rel(a, o, _rel))) { anchor = a; break; }
          }
          if (!anchor) return;
          // still things are bucketed by where they are; things in a moving frame by that frame
          const cell = anchor === root ? o.getWorldPosition(_p).normalize().multiplyScalar(CELL).floor().toArray().join() : anchor.uuid;
          const key = [anchor.uuid, cell, n.look, o.castShadow, o.receiveShadow, o.renderOrder, attrs(o.geometry)].join('|');
          if (!groups.has(key)) groups.set(key, { anchor, list: [] });
          groups.get(key).list.push(o);
        });
        for (const { anchor, list } of groups.values()) {
          if (list.length < 2) continue;
          const geos = list.map((o) => {
            const g = o.geometry.clone();
            g.clearGroups();
            return g.applyMatrix4(rel(anchor, o, new THREE.Matrix4()));
          });
          const merged = mergeGeometries(geos, false);
          for (const g of geos) g.dispose();
          if (!merged) continue;
          const first = list[0];
          const mesh = new THREE.Mesh(merged, first.material);
          mesh.name = 'batch';
          mesh.castShadow = first.castShadow;
          mesh.receiveShadow = first.receiveShadow;
          mesh.renderOrder = first.renderOrder;
          mesh.raycast = () => {}; // the originals are what's picked
          mesh.matrixAutoUpdate = false;
          anchor.add(mesh);
          mesh.updateMatrixWorld(true);
          const lk = noted.get(first).look;
          const originals = list.map((o) => ({ o, r: rel(anchor, o, new THREE.Matrix4()), mat: o.material, v: o.geometry.attributes.position.version, layers: o.layers.mask }));
          for (const { o } of originals) o.layers.set(HIDDEN);
          batches.push({ anchor, mesh, originals, look: lk, mats: [...new Set(list.map((o) => o.material))] });
          saved += list.length - 1;
        }
      }
      noted.clear();
      return saved;
    },
    /** Each frame, after rendering (the matrices are current): take apart any batch that's stale. */
    watch() {
      const looks = ++checked % 30 === 0; // every half second or so: has any of their materials been changed?
      for (let b = batches.length - 1; b >= 0; b--) {
        const { anchor, mesh, originals } = batches[b];
        const inv = _inv.copy(anchor.matrixWorld).invert();
        let stale = !shown(anchor) || (looks && batches[b].mats.some((m) => look(m) !== batches[b].look));
        for (const x of originals) {
          if (stale) break;
          const o = x.o;
          if (o.material !== x.mat || o.geometry.attributes.position.version !== x.v || !o.parent || !shown(o) || !near(_rel.multiplyMatrices(inv, o.matrixWorld), x.r)) stale = true;
        }
        if (!stale) continue;
        for (const x of originals) x.o.layers.mask = x.layers;
        mesh.removeFromParent();
        mesh.geometry.dispose();
        batches.splice(b, 1);
      }
    },
    get batches() { return batches.length; },
    get meshes() { return batches.reduce((n, b) => n + b.originals.length, 0); },
  };
}
