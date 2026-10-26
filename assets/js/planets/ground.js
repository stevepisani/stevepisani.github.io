// A friend's planet's ground: the one thing every planet shares with Steve's is its size (RADIUS),
// and everything else is theirs. Until their planet is built (by hand, for the first ten: Steve,
// Oct 2026) it's bare rock under the stars, its hills its own (seeded by the planet's slug, so
// no two are the same shape). A built planet passes its own `ground` (colour, hills).
// Like Steve's (world/planet.js), the height is a function of direction, so the mesh and your feet
// always agree.
import * as THREE from 'three';
import { RADIUS } from '../world/planet.js';

// a number from 0 to 1 for each character of the slug, so the hills are the planet's own
function seeded(slug) {
  let s = 2166136261;
  for (const c of slug) s = Math.imul(s ^ c.charCodeAt(0), 16777619) >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/**
 * { mesh, surface(dir) } for the planet `slug`: `surface` is the ground's distance from the
 * centre in a direction (for Player), `mesh` what's drawn and what a tap lands on.
 * `ground`: { color: '#rrggbb', hills: 0..1 } from a built planet (optional).
 */
export function buildGround(slug, { color = '#6b7082', hills = 0.6, quality = { high: false } } = {}) {
  const rand = seeded(slug);
  const waves = Array.from({ length: 4 }, (_, i) => ({
    k: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize().multiplyScalar(2 + i * 1.7 + rand()),
    phase: rand() * Math.PI * 2,
    a: (0.5 / (i + 1)) * hills * 2,
  }));
  const height = (dir) => waves.reduce((h, w) => h + w.a * Math.sin(dir.dot(w.k) + w.phase), 0);
  const surface = (dir) => RADIUS + height(_d.copy(dir).normalize());

  const geo = new THREE.IcosahedronGeometry(RADIUS, quality.high ? 96 : 64);
  const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3);
  const base = new THREE.Color(color), c = new THREE.Color(), d = new THREE.Vector3();
  // patches of a second, duller tone and of pale dust, at their own scales, so it isn't one flat colour
  const patches = Array.from({ length: 6 }, (_, i) => ({ k: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize().multiplyScalar(5 + i * 3 + rand() * 2), phase: rand() * Math.PI * 2 }));
  const patch = (dir, from) => patches.slice(from, from + 3).reduce((a, w) => a + Math.sin(dir.dot(w.k) + w.phase), 0) / 3;
  const dull = base.clone().offsetHSL(0.03, -0.12, -0.07), dust = base.clone().offsetHSL(-0.01, -0.15, 0.08);
  for (let i = 0; i < pos.count; i++) {
    d.fromBufferAttribute(pos, i).normalize();
    const h = height(d);
    pos.setXYZ(i, d.x * (RADIUS + h), d.y * (RADIUS + h), d.z * (RADIUS + h));
    // a little lighter on the tops, darker in the hollows, and a grain of noise so it reads as ground
    c.copy(base).lerp(dull, THREE.MathUtils.smoothstep(patch(d, 0), -0.1, 0.5) * 0.8).lerp(dust, THREE.MathUtils.smoothstep(patch(d, 3), 0.3, 0.8) * 0.6);
    c.multiplyScalar(0.8 + h * 0.4 + (rand() - 0.5) * 0.06);
    c.toArray(colors, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  // loose stones, so the ground reads as ground and you can see yourself walk: one instanced mesh,
  // sunk a little so none floats on a slope
  const STONES = quality.high ? 3000 : 2000;
  const stones = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: base.clone().multiplyScalar(0.7), roughness: 0.9, flatShading: true }), STONES);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < STONES; i++) {
    d.set(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
    const r = 0.03 + Math.pow(rand(), 4) * 0.35;
    p.copy(d).multiplyScalar(surface(d) - r * 0.35);
    q.setFromEuler(new THREE.Euler(rand() * 6, rand() * 6, rand() * 6));
    m.compose(p, q, sc.set(r, r * (0.5 + rand() * 0.4), r * (0.7 + rand() * 0.5)));
    stones.setMatrixAt(i, m);
  }
  stones.receiveShadow = true;
  mesh.add(stones);
  return { mesh, surface };
}
const _d = new THREE.Vector3();
