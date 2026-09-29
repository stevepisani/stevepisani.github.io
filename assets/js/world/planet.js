// The asteroid: a small planet you can walk all the way around.
// Its surface height is an analytic function of direction, so the mesh and the
// player's feet agree exactly without any physics or raycasting.
import * as THREE from 'three';
import { pbr, PALETTE } from './materials.js';
import * as T from './textures.js';
import { lampLit } from './lamps.js';

export const RADIUS = 20;
export const BAR_DIR = new THREE.Vector3(0, 1, 0); // the bar sits on the north pole

const UP = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const PF = { T1: new THREE.Vector3(), T2: new THREE.Vector3() }; // the lagoon's tangent frame (scratch)

/** Gentle rolling hills; flattened around the bar so the deck sits level. */
// A small lagoon out past the telescope, where the canoe is pulled up: a bowl carved into the
// ground (so feet, paths and props all agree with it) holding still water at `level`
// (metres above RADIUS). The shore is where the bowl rises through the water, about `shore`
// metres from the centre.
export const POND = { center: dirFrom(0.55, -0.82), bowl: 3.2, depth: 0.55, shore: 2.4, level: 0 }; // shore: the nominal waterline (see shoreAt)
POND.level = baseHeight(POND.center) - 0.1;
// the canoe is pulled up on the side toward the trails; reeds grow on the far side
POND.boatAzimuth = pondAzimuth(dirFrom(0.5, -0.6));

function baseHeight(dir) {
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

/** Direction `r` metres from the lagoon's centre, at azimuth `phi` round it (and the reverse). */
export function pondDir(r, phi) {
  const C = POND.center, a = r / RADIUS;
  PF.T1.set(0, 1, 0).cross(C).normalize(); PF.T2.copy(C).cross(PF.T1);
  return C.clone().multiplyScalar(Math.cos(a)).addScaledVector(PF.T1, Math.sin(a) * Math.cos(phi)).addScaledVector(PF.T2, Math.sin(a) * Math.sin(phi)).normalize();
}
export function pondAzimuth(dir) {
  const C = POND.center;
  PF.T1.set(0, 1, 0).cross(C).normalize(); PF.T2.copy(C).cross(PF.T1);
  const d = dir.clone().normalize().sub(C);
  return Math.atan2(d.dot(PF.T2), d.dot(PF.T1));
}

/** Metres along the surface from the lagoon's centre. */
export function pondDist(dir) {
  return POND.center.angleTo(dir) * RADIUS;
}

// The lagoon's outline isn't a circle: its bowl reaches further out in some directions.
export function pondReach(phi) {
  return 1 + 0.1 * Math.sin(3 * phi + 1.1) + 0.06 * Math.sin(5 * phi + 2.3);
}
/** Where `dir` sits in the bowl: 0 at the centre, 1 at its rim; the waterline is at SHORE_K. */
export function pondK(dir) {
  const r = pondDist(dir);
  if (r > POND.bowl * 1.3) return r / POND.bowl;
  return r / (POND.bowl * pondReach(pondAzimuth(dir)));
}
export const SHORE_K = 0.76;
/** Metres from the centre to the waterline at azimuth `phi` (and `dk` further out in bowl units). */
export function shoreAt(phi, dk = 0) {
  return (SHORE_K + dk) * POND.bowl * pondReach(phi);
}

export function heightAt(dir) {
  const h = baseHeight(dir);
  const k = pondK(dir);
  return k < 1 ? h - POND.depth * (1 - k * k) * (1 - k * k) : h;
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

export function buildPlanet({ quality, trailEdge = () => Infinity, keepClear = () => false }) {
  const group = new THREE.Group();

  // Terrain: a cube-sphere fine enough to follow heightAt closely (about 0.3 m between vertices
  // on desktop, 0.5 m on phones), with analytic normals, so paths and props laid on the analytic
  // surface sit on what you see. Coloured by slope and latitude, and worn to soil beside trails.
  const N = quality.high ? 110 : 64;
  const faces = [[[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [0, 0, 1], [1, 0, 0]],
    [[0, -1, 0], [1, 0, 0], [0, 0, 1]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [0, 1, 0], [1, 0, 0]]];
  const verts = 6 * (N + 1) * (N + 1);
  const positions = new Float32Array(verts * 3), normals = new Float32Array(verts * 3), colors = new Float32Array(verts * 3);
  const index = [];
  const moss = new THREE.Color(PALETTE.moss), mossDeep = new THREE.Color(PALETTE.mossDeep), ash = new THREE.Color(PALETTE.ash), basalt = new THREE.Color(PALETTE.basalt), soil = new THREE.Color(PALETTE.soil);
  const wetSand = new THREE.Color(PALETTE.ash).multiplyScalar(0.55), silt = new THREE.Color(PALETTE.lava);
  const c = new THREE.Color();
  const d = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  const at = (dir, target) => target.copy(dir).normalize().multiplyScalar(surfaceRadius(target.copy(dir).normalize()));
  const EPS = 0.05 / RADIUS;
  let v = 0;
  for (const [n, u, w] of faces) {
    const base = v;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const x0 = n[0] + u[0] * (2 * i / N - 1) + w[0] * (2 * j / N - 1);
      const y0 = n[1] + u[1] * (2 * i / N - 1) + w[1] * (2 * j / N - 1);
      const z0 = n[2] + u[2] * (2 * i / N - 1) + w[2] * (2 * j / N - 1);
      // spherified cube: evenly spread cells, no pinching at the corners
      d.set(x0 * Math.sqrt(1 - y0 * y0 / 2 - z0 * z0 / 2 + y0 * y0 * z0 * z0 / 3),
        y0 * Math.sqrt(1 - z0 * z0 / 2 - x0 * x0 / 2 + z0 * z0 * x0 * x0 / 3),
        z0 * Math.sqrt(1 - x0 * x0 / 2 - y0 * y0 / 2 + x0 * x0 * y0 * y0 / 3)).normalize();
      const h = heightAt(d);
      positions.set([d.x * (RADIUS + h), d.y * (RADIUS + h), d.z * (RADIUS + h)], v * 3);
      // normal from the analytic surface (central differences), identical on both sides of a seam
      t1.set(0, 1, 0).cross(d); if (t1.lengthSq() < 1e-6) t1.set(1, 0, 0); t1.normalize();
      t2.crossVectors(d, t1);
      e1.subVectors(at(a.copy(d).addScaledVector(t1, EPS), a), at(b.copy(d).addScaledVector(t1, -EPS), b));
      e2.subVectors(at(a.copy(d).addScaledVector(t2, EPS), a), at(b.copy(d).addScaledVector(t2, -EPS), b));
      e1.cross(e2).normalize();
      if (e1.dot(d) < 0) e1.negate();
      normals.set([e1.x, e1.y, e1.z], v * 3);
      const lat = d.dot(BAR_DIR);
      // ash-sand ring round the bar, moss elsewhere, bare basalt in the low southern basins
      const beach = THREE.MathUtils.smoothstep(lat, 0.9, 0.95);
      const low = THREE.MathUtils.smoothstep(-h, 0.05, 0.3) * THREE.MathUtils.smoothstep(-lat, -0.2, 0.6);
      c.copy(moss).lerp(mossDeep, THREE.MathUtils.clamp(0.5 + h * 1.6, 0, 1)).lerp(ash, beach).lerp(basalt, low);
      const worn = 1 - THREE.MathUtils.smoothstep(trailEdge(d), -0.2, 1.1);
      if (worn > 0) c.lerp(soil, worn * 0.45);
      // the lagoon: a ring of damp sand at the waterline, dark silt under the water
      const pk = pondK(d);
      if (pk < 1.4) {
        c.lerp(wetSand, (1 - THREE.MathUtils.smoothstep(pk, SHORE_K + 0.05, SHORE_K + 0.33)) * 0.85);
        c.lerp(silt, 1 - THREE.MathUtils.smoothstep(pk, SHORE_K - 0.28, SHORE_K - 0.06));
      }
      const grain = Math.sin(d.x * 91.7 + d.y * 47.3) * Math.sin(d.z * 83.1 - d.y * 29.9);
      c.multiplyScalar(0.88 + grain * 0.12);
      colors.set([c.r, c.g, c.b], v * 3);
      v++;
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const p00 = base + j * (N + 1) + i, p10 = p00 + 1, p01 = p00 + N + 1, p11 = p01 + 1;
      index.push(p00, p10, p11, p00, p11, p01);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  const terrain = new THREE.Mesh(geo, terrainMaterial());
  terrain.receiveShadow = true;
  terrain.name = 'terrain';
  group.add(terrain);

  // Picking: a coarse, invisible copy. Clicks only need a direction (walking and the hover ring
  // snap to the analytic surface), and raycasting the fine mesh on every pointer move is wasteful.
  const pickGeo = new THREE.IcosahedronGeometry(1, 6);
  const pp = pickGeo.attributes.position;
  for (let i = 0; i < pp.count; i++) { d.fromBufferAttribute(pp, i).normalize(); const r = surfaceRadius(d); pp.setXYZ(i, d.x * r, d.y * r, d.z * r); }
  pickGeo.computeBoundingSphere();
  const ground = new THREE.Mesh(pickGeo, new THREE.MeshBasicMaterial());
  ground.visible = false;
  ground.name = 'ground';
  group.add(ground);

  // Atmosphere: an additive fresnel shell. Bright from orbit, fades out as you land.
  const atmoMat = new THREE.ShaderMaterial({
    uniforms: { camDist: { value: 100 }, color: { value: new THREE.Color(0x3a4fa8) }, warm: { value: new THREE.Color(0x8a4a9a) } },
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

  // Grass: tufts of tapered, curving blades (darker at the root), stood on the surface and
  // swaying in the wind. Kept off the beach round the bar, the rocky basins and the trails.
  const cluster = grassTuft();
  const count = quality.high ? 12000 : 4500;
  const grassMat = pbr({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  const wind = { value: 0 };
  grassMat.onBeforeCompile = (shader) => {
    shader.uniforms.windTime = wind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float windTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 ip = vec3(instanceMatrix[3]);
        float sway = sin(windTime * 1.7 + ip.x * 0.8 + ip.z * 0.6) * 0.5 + sin(windTime * 3.1 + ip.y) * 0.2;
        transformed.x += sway * 0.12 * position.y;
        transformed.z += sway * 0.06 * position.y;`);
  };
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
    if (keepClear(dir, 0.25)) continue;         // and the paths and landmarks
    surfacePoint(dir, -0.02, p);
    q.setFromUnitVectors(UP, dir).multiply(new THREE.Quaternion().setFromAxisAngle(UP, rand() * 6.28));
    const k = 0.55 + rand() * 0.5;
    s.set(k, k * (0.7 + rand() * 0.6), k);
    grassMesh.setMatrixAt(placed, m.compose(p, q, s));
    grassMesh.setColorAt(placed, tint.setHSL(0.24 + rand() * 0.08, 0.42, 0.3 + rand() * 0.14));
    placed++;
  }
  grassMesh.count = placed;
  grassMesh.receiveShadow = true;
  grassMesh.instanceMatrix.needsUpdate = true;
  group.add(grassMesh);

  // Pebbles and grit scattered everywhere, half buried, so the ground has a scale.
  {
    const n = quality.high ? 1800 : 700;
    const im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), pbr({ roughness: 0.9 }), n);
    const tones = [PALETTE.stone, PALETTE.basalt, PALETTE.ash, PALETTE.lava].map((x) => new THREE.Color(x));
    let k = 0;
    for (let tries = 0; k < n && tries < n * 3; tries++) {
      const dir = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();
      if (dir.dot(BAR_DIR) > 0.985 || keepClear(dir, 0.1)) continue; // under the plinth, a landmark, or on a path (it has its own)
      const r = 0.03 + rand() * rand() * 0.16;
      surfacePoint(dir, -r * 0.3, p);
      q.setFromUnitVectors(UP, dir).multiply(new THREE.Quaternion().setFromAxisAngle(UP, rand() * 6.28));
      im.setMatrixAt(k, m.compose(p, q, s.set(r, r * (0.45 + rand() * 0.3), r * (0.7 + rand() * 0.3))));
      im.setColorAt(k, tint.copy(tones[k % 4]).multiplyScalar(0.75 + rand() * 0.5));
      k++;
    }
    im.count = k;
    im.castShadow = quality.high;
    im.receiveShadow = true;
    group.add(im);
  }

  const pond = buildPond(quality);
  group.add(pond.group);

  return {
    group,
    pondWater: pond.water,
    update(t, camera) {
      wind.value = t;
      pond.update(t);
      atmoMat.uniforms.camDist.value = camera.position.length();
    },
  };
}

/*
 * The lagoon's water: a disc on the sphere at POND.level, so it follows the planet's curve, and
 * the bowl's rim hides its edge. Dark, glassy water: a few slow ripples bend its normal, the
 * nebula tints it at grazing angles, the moon glints off it, and the lamps' glints show in it
 * (lamps.js). Reeds and cattails at the waterline, a few lily pads.
 */
function buildPond(quality) {
  const group = new THREE.Group();
  const C = POND.center.clone().normalize();
  const T1 = new THREE.Vector3(0, 1, 0).cross(C).normalize(), T2 = C.clone().cross(T1);
  const at = (r, phi, lift = 0) => {
    const a = r / RADIUS;
    const dir = C.clone().multiplyScalar(Math.cos(a)).addScaledVector(T1, Math.sin(a) * Math.cos(phi)).addScaledVector(T2, Math.sin(a) * Math.sin(phi)).normalize();
    return dir.multiplyScalar(RADIUS + POND.level + lift);
  };
  // disc: rings out to just inside the bowl's rim (the terrain covers the rest)
  const RINGS = quality.high ? 22 : 12, SEG = quality.high ? 64 : 36, R = POND.bowl * 1.05; // past the waterline everywhere; the ground hides the rest
  const pos = [at(0, 0)], idx = [];
  for (let i = 1; i <= RINGS; i++) for (let j = 0; j < SEG; j++) pos.push(at((i / RINGS) * R, (j / SEG) * Math.PI * 2));
  for (let j = 0; j < SEG; j++) idx.push(0, 1 + ((j + 1) % SEG), 1 + j);
  for (let i = 1; i < RINGS; i++) for (let j = 0; j < SEG; j++) {
    const a = 1 + (i - 1) * SEG + j, b = 1 + (i - 1) * SEG + ((j + 1) % SEG), c2 = a + SEG, d2 = b + SEG;
    idx.push(a, b, d2, a, d2, c2);
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pos);
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // faces must point out of the planet
  if (new THREE.Vector3().fromBufferAttribute(geo.attributes.normal, 0).dot(C) < 0) { idx.reverse(); geo.setIndex(idx); geo.computeVertexNormals(); }

  const time = { value: 0 };
  const water = new THREE.MeshStandardMaterial({ color: PALETTE.lagoon, roughness: 0.14, metalness: 0 });
  water.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uTime: time, uC: { value: at(0, 0) }, uT: { value: T1 }, uB: { value: T2 }, uN: { value: C }, uSky: { value: new THREE.Color(PALETTE.lagoonSky) } });
    sh.vertexShader = 'varying vec3 vWaterPos;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvWaterPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'varying vec3 vWaterPos;\nuniform float uTime;\nuniform vec3 uC, uT, uB, uN, uSky;\n' + sh.fragmentShader
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec2 wq = vec2(dot(vWaterPos - uC, uT), dot(vWaterPos - uC, uB));
        vec2 wg = vec2(0.0);
        // a few slow wind ripples, each a direction, wavenumber, amplitude and speed
        wg += vec2(0.8, 0.6) * 5.0 * 0.006 * cos(dot(wq, vec2(0.8, 0.6)) * 5.0 + uTime * 1.1);
        wg += vec2(-0.5, 0.87) * 8.5 * 0.0035 * cos(dot(wq, vec2(-0.5, 0.87)) * 8.5 + uTime * 1.6);
        wg += vec2(0.97, -0.26) * 13.0 * 0.002 * cos(dot(wq, vec2(0.97, -0.26)) * 13.0 + uTime * 2.3);
        wg += vec2(-0.2, -0.98) * 21.0 * 0.0011 * cos(dot(wq, vec2(-0.2, -0.98)) * 21.0 + uTime * 3.1);
        vec3 wN = normalize(uN - uT * wg.x - uB * wg.y);
        normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float wFres = pow(1.0 - clamp(dot(wN, normalize(cameraPosition - vWaterPos)), 0.0, 1.0), 4.0);
        totalEmissiveRadiance += uSky * (0.03 + 0.6 * wFres);`);
  };
  water.customProgramCacheKey = () => 'lagoon';
  lampLit(water, { specular: 160 });
  const mesh = new THREE.Mesh(geo, water);
  mesh.receiveShadow = true;
  mesh.name = 'lagoon';
  group.add(mesh);

  // reeds and cattails in clumps round the far shore (the canoe's side stays open)
  let seed = 31;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const reedGeo = new THREE.ConeGeometry(0.012, 1, 4, 1, true).translate(0, 0.5, 0);
  const headGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.13, 6);
  const n = quality.high ? 90 : 50;
  const reeds = new THREE.InstancedMesh(reedGeo, pbr({ color: PALETTE.moss, roughness: 0.8, side: THREE.DoubleSide }), n);
  const heads = new THREE.InstancedMesh(headGeo, pbr({ color: PALETTE.stain, roughness: 0.9 }), n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), tilt = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), tip = new THREE.Vector3();
  const tint = new THREE.Color(), reedTones = [PALETTE.moss, PALETTE.mossDeep, PALETTE.leaf].map((x) => new THREE.Color(x));
  let k = 0, kh = 0;
  const far = POND.boatAzimuth + Math.PI;
  const clumps = [far - 1.2, far - 0.45, far + 0.35, far + 1.15]; // round the far side, away from the canoe
  for (const phi0 of clumps) for (let i = 0; i < n / clumps.length && k < n; i++) {
    const phi = phi0 + (rand() - 0.5) * 0.5, r = shoreAt(phi, -0.05 + rand() * 0.12);
    const a = r / RADIUS;
    const dir = C.clone().multiplyScalar(Math.cos(a)).addScaledVector(T1, Math.sin(a) * Math.cos(phi)).addScaledVector(T2, Math.sin(a) * Math.sin(phi)).normalize();
    surfacePoint(dir, -0.05, p);
    const h = 0.55 + rand() * 0.6;
    q.setFromUnitVectors(UP, dir).multiply(tilt.setFromEuler(new THREE.Euler((rand() - 0.5) * 0.35, rand() * 6.28, (rand() - 0.5) * 0.35)));
    reeds.setMatrixAt(k, m.compose(p, q, s.set(1, h, 1)));
    reeds.setColorAt(k, tint.copy(reedTones[k % 3]).multiplyScalar(0.8 + rand() * 0.4));
    if (rand() < 0.35) { // a cattail near the top
      tip.set(0, h * 0.86, 0).applyQuaternion(q).add(p);
      heads.setMatrixAt(kh++, m.compose(tip, q, s.set(1, 1, 1)));
    }
    k++;
  }
  reeds.count = k; heads.count = kh;
  group.add(reeds, heads);

  // lily pads, flat on the water, each a disc with its notch
  const padGeo = new THREE.CircleGeometry(0.17, 18, 0.3, Math.PI * 2 - 0.6).rotateX(-Math.PI / 2);
  const pads = new THREE.InstancedMesh(padGeo, pbr({ color: PALETTE.leaf, roughness: 0.55, side: THREE.DoubleSide }), 7);
  for (let i = 0; i < 7; i++) {
    const phi = far + (rand() - 0.5) * 2.2, r = shoreAt(phi) * (0.35 + rand() * 0.4), sc = 0.6 + rand() * 0.7;
    const pp = at(r, phi, 0.008);
    q.setFromUnitVectors(UP, pp.clone().normalize()).multiply(tilt.setFromAxisAngle(UP, rand() * 6.28));
    pads.setMatrixAt(i, m.compose(pp, q, s.set(sc, 1, sc)));
  }
  group.add(pads);

  return { group, water: mesh, update(t) { time.value = t; } };
}

// A tuft of four tapered blades, curving outward, darker at the root. One merged geometry.
function grassTuft() {
  const H = 0.46;
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.PlaneGeometry(0.055, H, 1, 3).translate(0, H / 2, 0);
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let k = 0; k < pos.count; k++) {
      const t = pos.getY(k) / H;
      pos.setX(k, pos.getX(k) * (1 - t * 0.9));
      pos.setZ(k, t * t * 0.12);
      const shade = 0.45 + 0.55 * t;
      col.set([shade, shade, shade], k * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    g.rotateY((i / 4) * Math.PI * 2 + i * 0.4);
    g.scale(1, 0.8 + (i % 2) * 0.35, 1);
    parts.push(g.toNonIndexed());
  }
  const merged = new THREE.BufferGeometry();
  for (const [name, size] of [['position', 3], ['normal', 3], ['color', 3]]) {
    const arr = new Float32Array(parts.reduce((n, g) => n + g.attributes[name].array.length, 0));
    let off = 0;
    for (const g of parts) { arr.set(g.attributes[name].array, off); off += g.attributes[name].array.length; }
    merged.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return merged;
}

// The ground's material: vertex colours, plus grain and bump sampled triplanar from a small
// tiling texture at three scales (grit, clods, patches), so it holds up close without UVs.
function terrainMaterial() {
  const mat = pbr({ vertexColors: true, roughness: 0.96 });
  const detail = { value: T.groundDetail() };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.detailMap = detail;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTP;\nvarying vec3 vTN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTP = position;\nvTN = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D detailMap;
        varying vec3 vTP;
        varying vec3 vTN;
        float triSample(vec3 p, vec3 w) {
          return texture2D(detailMap, p.yz).r * w.x + texture2D(detailMap, p.zx).r * w.y + texture2D(detailMap, p.xy).r * w.z;
        }
        vec3 triBump(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDir) {
          vec3 sx = normalize(dFdx(surf_pos)), sy = normalize(dFdy(surf_pos));
          vec3 r1 = cross(sy, surf_norm), r2 = cross(surf_norm, sx);
          float det = dot(sx, r1) * faceDir;
          vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
          return normalize(abs(det) * surf_norm - grad);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 tw = pow(abs(normalize(vTN)), vec3(4.0));
        tw /= (tw.x + tw.y + tw.z);
        float fineH = triSample(vTP * 1.7, tw);
        float midH = triSample(vTP * 0.37, tw);
        float patchH = triSample(vTP * 0.043, tw);
        diffuseColor.rgb *= (0.74 + 0.5 * fineH) * (0.86 + 0.28 * midH) * (0.78 + 0.44 * patchH);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        float bh = fineH * 0.55 + midH * 0.45;
        normal = triBump(-vViewPosition, normal, vec2(dFdx(bh), dFdy(bh)) * 1.4, faceDirection);`);
  };
  mat.customProgramCacheKey = () => 'terrain';
  return mat;
}
