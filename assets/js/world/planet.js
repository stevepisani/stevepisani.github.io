// The asteroid: a small planet you can walk all the way around.
// Its surface height is an analytic function of direction, so the mesh and the
// player's feet agree exactly without any physics or raycasting.
import * as THREE from 'three';
import { toon } from './stylize.js';

export const RADIUS = 20;
export const BAR_DIR = new THREE.Vector3(0, 1, 0); // the bar sits on the north pole

const UP = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

/** Gentle rolling hills; flattened around the bar so the deck sits level. */
export function heightAt(dir) {
  const { x, y, z } = dir;
  let h =
    0.28 * Math.sin(x * 3.1 + 1.3) * Math.cos(z * 2.7 - 0.4) +
    0.18 * Math.sin(y * 4.3 + z * 1.7 + 2.1) +
    0.1 * Math.sin(x * 7.3 - y * 5.1 + 0.7) * Math.sin(z * 6.2 + 1.9);
  // the bar sits on a gentle rise, so it reads as the landmark from anywhere nearby
  const lat = dir.dot(BAR_DIR);
  const rise = 0.9 * THREE.MathUtils.smoothstep(lat, 0.9, 0.975);
  const nearBar = THREE.MathUtils.smoothstep(lat, 0.955, 0.98);
  return THREE.MathUtils.lerp(h * (1 - THREE.MathUtils.smoothstep(lat, 0.85, 0.95)), 0.9, nearBar) + (1 - nearBar) * rise;
}

export function surfaceRadius(dir) {
  return RADIUS + heightAt(dir);
}

/** Point on the surface in direction `dir` (lifted by `lift` metres). */
export function surfacePoint(dir, lift = 0, target = new THREE.Vector3()) {
  const d = _v.copy(dir).normalize();
  return target.copy(d).multiplyScalar(surfaceRadius(d) + lift);
}

/** Direction from spherical coords: `polar` radians away from the bar, `around` radians of longitude. */
export function dirFrom(polar, around) {
  return new THREE.Vector3(Math.sin(polar) * Math.cos(around), Math.cos(polar), Math.sin(polar) * Math.sin(around));
}

/**
 * Stand an object upright on the planet: its local +Y becomes the surface normal,
 * then it's spun `heading` radians about that normal.
 */
export function place(obj, dir, { heading = 0, lift = 0, sink = 0 } = {}) {
  const d = dir.clone().normalize();
  surfacePoint(d, lift - sink, obj.position);
  obj.quaternion.setFromUnitVectors(UP, d);
  obj.quaternion.multiply(_q.setFromAxisAngle(UP, heading));
  return obj;
}

/** Heading that makes an object placed at `from` face toward `to` (both directions). */
export function headingToward(from, to) {
  const up = from.clone().normalize();
  const base = new THREE.Quaternion().setFromUnitVectors(UP, up);
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(base);   // local +Z at heading 0
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(base);
  const t = to.clone().normalize().sub(up.clone().multiplyScalar(to.clone().normalize().dot(up)));
  return Math.atan2(t.dot(right), t.dot(fwd));
}

export function buildPlanet({ quality }) {
  const group = new THREE.Group();

  // Terrain: an icosphere displaced by heightAt, coloured by slope and latitude.
  const geo = new THREE.IcosahedronGeometry(1, quality.high ? 6 : 5); // already non-indexed: flat-shaded facets
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const d = new THREE.Vector3();
  const grass = new THREE.Color(0x6fbf73), grassDeep = new THREE.Color(0x4f9e63), sand = new THREE.Color(0xf0d19a), rock = new THREE.Color(0x9a86b8);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    d.fromBufferAttribute(pos, i).normalize();
    const h = heightAt(d);
    pos.setXYZ(i, d.x * (RADIUS + h), d.y * (RADIUS + h), d.z * (RADIUS + h));
    const lat = d.dot(BAR_DIR);
    // sandy beach ring around the bar, grass elsewhere, purple rock in the low southern basins
    const beach = THREE.MathUtils.smoothstep(lat, 0.9, 0.95);
    const low = THREE.MathUtils.smoothstep(-h, 0.05, 0.3) * THREE.MathUtils.smoothstep(-lat, -0.2, 0.6);
    c.copy(grass).lerp(grassDeep, THREE.MathUtils.clamp(0.5 + h * 1.6, 0, 1)).lerp(sand, beach).lerp(rock, low);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, toon({ vertexColors: true, rim: 0.25 }));
  ground.name = 'ground';
  group.add(ground);

  // Atmosphere: an additive fresnel shell. Bright from orbit, fades out as you land.
  const atmoMat = new THREE.ShaderMaterial({
    uniforms: { camDist: { value: 100 }, color: { value: new THREE.Color(0x7fc8ff) }, warm: { value: new THREE.Color(0xffb27a) } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform float camDist; uniform vec3 color; uniform vec3 warm; varying vec3 vN; varying vec3 vV;
      void main(){
        float f = pow(1.0 - abs(dot(vN, vV)), 2.5);
        float fade = smoothstep(${(RADIUS * 1.6).toFixed(1)}, ${(RADIUS * 3.2).toFixed(1)}, camDist);
        vec3 col = mix(color, warm, pow(f, 3.0));
        gl_FragColor = vec4(col * f * 1.6 * fade, 1.0);
      }`,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(RADIUS * 1.28, 64, 32), atmoMat);
  group.add(atmo);

  // Grass: one instanced mesh of little blade clusters, each stood on the surface, swaying in the wind.
  const blade = new THREE.ConeGeometry(0.05, 0.42, 3, 1);
  blade.translate(0, 0.21, 0);
  const cluster = mergeBlades(blade);
  const count = quality.high ? 9000 : 3000;
  const grassMat = toon({ color: 0x8fd67c, rim: 0.15 });
  const wind = { value: 0 };
  grassMat.onBeforeCompile = ((prev) => (shader) => {
    prev(shader);
    shader.uniforms.windTime = wind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float windTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 ip = vec3(instanceMatrix[3]);
        float sway = sin(windTime * 1.7 + ip.x * 0.8 + ip.z * 0.6) * 0.5 + sin(windTime * 3.1 + ip.y) * 0.2;
        transformed.x += sway * 0.12 * position.y;
        transformed.z += sway * 0.06 * position.y;`);
  })(grassMat.onBeforeCompile);
  grassMat.customProgramCacheKey = () => 'grass';
  const grassMesh = new THREE.InstancedMesh(cluster, grassMat, count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const tint = new THREE.Color();
  let seed = 7;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  let placed = 0;
  for (let tries = 0; placed < count && tries < count * 4; tries++) {
    const dir = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();
    const lat = dir.dot(BAR_DIR);
    if (lat > 0.9) continue;                    // keep the beach around the bar clear
    if (heightAt(dir) < -0.12 && lat < 0.2) continue; // and the rocky basins
    surfacePoint(dir, -0.02, p);
    q.setFromUnitVectors(UP, dir).multiply(new THREE.Quaternion().setFromAxisAngle(UP, rand() * 6.28));
    const k = 0.5 + rand() * 0.45;
    s.set(k, k * (0.75 + rand() * 0.5), k);
    grassMesh.setMatrixAt(placed, m.compose(p, q, s));
    grassMesh.setColorAt(placed, tint.setHSL(0.27 + rand() * 0.07, 0.5, 0.45 + rand() * 0.15));
    placed++;
  }
  grassMesh.count = placed;
  grassMesh.instanceMatrix.needsUpdate = true;
  group.add(grassMesh);

  return {
    group,
    update(t, camera) {
      wind.value = t;
      atmoMat.uniforms.camDist.value = camera.position.length();
    },
  };
}

// Three blades leaning out from a point, merged into one geometry.
function mergeBlades(blade) {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const g = blade.clone();
    g.rotateZ(0.25);
    g.rotateY((i / 3) * Math.PI * 2);
    parts.push(g);
  }
  const merged = new THREE.BufferGeometry();
  const flat = parts.map((g) => g.toNonIndexed());
  for (const name of ['position', 'normal']) {
    const arr = new Float32Array(flat.reduce((n, g) => n + g.attributes[name].array.length, 0));
    let off = 0;
    for (const g of flat) { arr.set(g.attributes[name].array, off); off += g.attributes[name].array.length; }
    merged.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  return merged;
}
