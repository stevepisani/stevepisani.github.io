// Tiki props, built procedurally in the classic mid-century style:
// carved tiki posts (Marquesan / Witco pop), glass floats in rope nets, pufferfish lamps,
// tiki mugs, a volcano bowl, bamboo torches, palms with real fronds, and lava rocks.
// Hero props can be swapped for AI-generated GLBs later (see hero.js).
import * as THREE from 'three';
import { PALETTE, pbr, surface, woodSet, bambooSet, lavaSet, glow } from './materials.js';
import { createFire } from './fire.js';

const TAU = Math.PI * 2;

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/* ---------------- Carved tiki ---------------- */

// A face drawn as a height map (white = raised, black = cut deep), mid-century pop style:
// crown, heavy brow, big lozenge eyes, broad nose, a huge mouth with tongue, hands on the belly.
function faceHeightMap(style) {
  const W = 256, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#808080';
  g.fillRect(0, 0, W, H);
  g.filter = 'blur(2px)';
  const shape = (fill, fn) => { g.fillStyle = fill; g.beginPath(); fn(); g.fill(); };
  const cx = W / 2;
  // crown ridges
  for (let i = 0; i < 3; i++) shape('#b0b0b0', () => g.rect(0, 12 + i * 22, W, 10));
  // brow
  shape('#e0e0e0', () => g.ellipse(cx, 118, 110, 26, 0, 0, TAU));
  // eyes: raised rim, deep socket, raised pupil
  for (const dx of [-52, 52]) {
    shape('#f0f0f0', () => g.ellipse(cx + dx, 160, style === 'ku' ? 38 : 44, style === 'ku' ? 24 : 34, 0, 0, TAU));
    shape('#202020', () => g.ellipse(cx + dx, 160, style === 'ku' ? 30 : 34, style === 'ku' ? 16 : 25, 0, 0, TAU));
    shape('#d0d0d0', () => g.ellipse(cx + dx, 162, 11, 11, 0, 0, TAU));
  }
  // nose
  shape('#f5f5f5', () => { g.moveTo(cx, 150); g.lineTo(cx + 34, 238); g.quadraticCurveTo(cx, 256, cx - 34, 238); g.closePath(); });
  // mouth: raised lips, deep cut, a tongue (Marquesan) or bared teeth (Kū)
  shape('#f0f0f0', () => g.ellipse(cx, 305, 104, 50, 0, 0, TAU));
  shape('#101010', () => g.ellipse(cx, 305, 88, 36, 0, 0, TAU));
  if (style === 'ku') for (let x = -70; x <= 70; x += 20) shape('#e8e8e8', () => g.rect(cx + x - 7, 282, 14, 18));
  else shape('#c8c8c8', () => g.ellipse(cx, 318, 30, 20, 0, 0, TAU));
  // arms and hands on the belly
  shape('#d8d8d8', () => g.ellipse(cx - 70, 420, 34, 16, 0.3, 0, TAU));
  shape('#d8d8d8', () => g.ellipse(cx + 70, 420, 34, 16, -0.3, 0, TAU));
  shape('#b8b8b8', () => g.rect(0, 470, W, 8));
  return g.getImageData(0, 0, W, H);
}

const carvedCache = new Map();

/**
 * A carved tiki: a dense cylinder whose front is displaced by the face height map,
 * stained dark with lighter wire-brushed high points and burnt recesses.
 */
export function carvedTiki({ height = 2.2, radius = 0.32, style = 'marquesan' } = {}) {
  const key = style + height + radius;
  if (!carvedCache.has(key)) {
    const img = faceHeightMap(style);
    const geo = new THREE.CylinderGeometry(radius, radius * 1.08, height, 64, 96, false);
    const pos = geo.attributes.position, uv = geo.attributes.uv, nrm = geo.attributes.normal;
    const colors = new Float32Array(pos.count * 3);
    const dark = new THREE.Color(0x120a05), mid = new THREE.Color(0x5a3620), light = new THREE.Color(0xc08a58);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      // the face wraps half the post (u 0.25..0.75, the -z side); rotated to face +z below
      const fu = (u - 0.25) * 2;
      let h = 0.5;
      if (fu > 0 && fu < 1 && Math.abs(nrm.getY(i)) < 0.5) {
        const px = Math.floor(fu * (img.width - 1)), py = Math.floor((1 - v) * (img.height - 1));
        h = img.data[(py * img.width + px) * 4] / 255;
      }
      const d = (h - 0.5) * radius * 0.95; // carve deep enough to read from across the deck
      if (Math.abs(nrm.getY(i)) < 0.5) pos.setXYZ(i, pos.getX(i) + nrm.getX(i) * d, pos.getY(i), pos.getZ(i) + nrm.getZ(i) * d);
      c.copy(mid).lerp(h < 0.5 ? dark : light, Math.min(1, Math.abs(h - 0.5) * 2.6));
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.rotateY(Math.PI); // face toward +z
    geo.computeVertexNormals();
    geo.translate(0, height / 2, 0);
    carvedCache.set(key, geo);
  }
  const { map, bump } = woodSet(0x7a5238);
  const mesh = new THREE.Mesh(carvedCache.get(key), pbr({ map, bumpMap: bump, bumpScale: 1.2, vertexColors: true, roughness: 0.8 }));
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

/* ---------------- Glass float in a rope net ---------------- */

const floatGeo = new THREE.SphereGeometry(1, 24, 16);
function netGeometry(r) {
  const pts = [];
  const seg = 24;
  for (let k = 0; k < 6; k++) {                      // meridians
    const a = (k / 6) * TAU;
    for (let i = 0; i < seg; i++) {
      const t0 = (i / seg) * Math.PI, t1 = ((i + 1) / seg) * Math.PI;
      pts.push(Math.sin(t0) * Math.cos(a) * r, Math.cos(t0) * r, Math.sin(t0) * Math.sin(a) * r);
      pts.push(Math.sin(t1) * Math.cos(a) * r, Math.cos(t1) * r, Math.sin(t1) * Math.sin(a) * r);
    }
  }
  for (const lat of [-0.5, 0, 0.5]) {                // parallels
    const y = lat * r, rr = Math.sqrt(r * r - y * y);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
      pts.push(Math.cos(a0) * rr, y, Math.sin(a0) * rr, Math.cos(a1) * rr, y, Math.sin(a1) * rr);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return g;
}

/** A glowing glass fishing float in a rope net, optionally hanging from a cord. */
export function glassFloat({ radius = 0.16, color = PALETTE.aqua, hang = 0, lit = 1.2 } = {}) {
  const group = new THREE.Group();
  const glass = new THREE.Mesh(floatGeo, pbr({ color, emissive: color, emissiveIntensity: lit, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.85 }));
  glass.scale.setScalar(radius);
  group.add(glass);
  const net = new THREE.LineSegments(netGeometry(radius * 1.03), new THREE.LineBasicMaterial({ color: 0x3a2a18 }));
  group.add(net);
  if (hang > 0) {
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, hang, 4), pbr({ color: 0x3a2a18 }));
    cord.position.y = radius + hang / 2;
    group.add(cord);
  }
  return group;
}

/* ---------------- Pufferfish lamp ---------------- */

let spikeGeo;
/** A spiky pufferfish lamp with a warm glow inside and a real light. */
export function pufferLamp({ radius = 0.22, hang = 0.6, light = 2.4 } = {}) {
  const group = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 14), pbr({ color: 0xe9c48a, emissive: PALETTE.amber, emissiveIntensity: 2.6, roughness: 0.6 }));
  group.add(shell);
  if (!spikeGeo) spikeGeo = new THREE.ConeGeometry(0.012, 0.07, 4).translate(0, 0.035, 0);
  const n = 70;
  const spikes = new THREE.InstancedMesh(spikeGeo, pbr({ color: 0x8a6a3c, roughness: 0.7 }), n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2, rr = Math.sqrt(1 - y * y), a = i * 2.39996;
    const dir = new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr);
    p.copy(dir).multiplyScalar(radius * 0.96);
    q.setFromUnitVectors(up, dir);
    spikes.setMatrixAt(i, m.compose(p, q, new THREE.Vector3(1, 1, 1)));
  }
  group.add(spikes);
  // fins and tail so it reads as a fish, not a mine
  const fin = pbr({ color: 0xb8864f, roughness: 0.7, side: THREE.DoubleSide });
  const tail = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.45, radius * 0.7, 4), fin);
  tail.rotation.z = Math.PI / 2;
  tail.position.x = -radius * 1.15;
  group.add(tail);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.13, 10, 8), pbr({ color: 0x111111, roughness: 0.2 }));
    eye.position.set(radius * 0.72, radius * 0.25, s * radius * 0.55);
    group.add(eye);
  }
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, hang, 4), pbr({ color: 0x2a1c10 }));
  cord.position.y = radius + hang / 2;
  group.add(cord);
  const pl = new THREE.PointLight(PALETTE.amber, light, 5.5, 1.6);
  group.add(pl);
  return group;
}

/* ---------------- Tiki mug ---------------- */

const mugProfiles = {
  // classic tall tiki mug, slightly waisted
  tall: [[0, 0], [0.07, 0], [0.075, 0.02], [0.068, 0.08], [0.072, 0.15], [0.07, 0.17], [0.064, 0.17]],
  // squat moai / Easter Island mug
  moai: [[0, 0], [0.06, 0], [0.065, 0.03], [0.06, 0.14], [0.05, 0.19], [0.046, 0.19]],
};
/** A glazed tiki mug with a pressed face, plus straw and garnish. */
export function tikiMug({ glaze = PALETTE.teal, shape = 'tall', garnish = true } = {}) {
  const group = new THREE.Group();
  const prof = mugProfiles[shape].map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 24), pbr({ color: glaze, roughness: 0.25, metalness: 0.05 }));
  body.castShadow = true;
  group.add(body);
  // pressed face: brow, eyes and mouth as darker inset shapes
  const face = pbr({ color: new THREE.Color(glaze).multiplyScalar(0.45), roughness: 0.4 });
  const at = (w, h, y) => { const s = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.012), face); s.position.set(0, y, 0.068); group.add(s); return s; };
  at(0.09, 0.012, 0.125);
  for (const x of [-0.025, 0.025]) { const e = at(0.028, 0.02, 0.105); e.position.x = x; }
  at(0.07, 0.022, 0.06);
  if (garnish) {
    const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.16, 5), pbr({ color: PALETTE.hibiscus, roughness: 0.5 }));
    straw.position.set(0.02, 0.2, 0);
    straw.rotation.z = -0.25;
    group.add(straw);
    const mint = new THREE.Mesh(new THREE.IcosahedronGeometry(0.035, 0), pbr({ color: 0x2f7a3e, roughness: 0.8 }));
    mint.position.set(-0.02, 0.18, 0);
    mint.scale.set(1, 0.6, 1);
    group.add(mint);
  }
  return group;
}

/* ---------------- Volcano bowl ---------------- */

/** Wide communal bowl with a centre cone of flaming rum. */
export function volcanoBowl() {
  const group = new THREE.Group();
  const prof = [[0, 0], [0.09, 0], [0.12, 0.02], [0.17, 0.07], [0.175, 0.08], [0.16, 0.08], [0.1, 0.035], [0.05, 0.035], [0.04, 0.09], [0.028, 0.1], [0, 0.1]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const bowl = new THREE.Mesh(new THREE.LatheGeometry(prof, 32), pbr({ color: 0x2b1a12, roughness: 0.3 }));
  bowl.castShadow = true;
  group.add(bowl);
  const drink = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.155, 32).rotateX(-Math.PI / 2), pbr({ color: 0xc8551f, emissive: 0x6a2008, emissiveIntensity: 0.8, roughness: 0.1 }));
  drink.position.y = 0.065;
  group.add(drink);
  const fire = createFire({ width: 0.09, height: 0.16, light: 1.2, distance: 3 });
  fire.group.position.y = 0.1;
  group.add(fire.group);
  group.userData.update = fire.update;
  return group;
}

/* ---------------- Torch ---------------- */

/** A bamboo tiki torch with a real flame. */
export function tikiTorch({ height = 2.2, light = 2.2, shadow = false } = {}) {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, height, 8), surface(bambooSet(), { repeat: [1, height / 1.2] }));
  pole.position.y = height / 2;
  pole.castShadow = true;
  group.add(pole);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.07, 0.22, 10, 1, true), surface(bambooSet(), { color: 0x8a6a3c, side: THREE.DoubleSide }));
  cup.position.y = height + 0.06;
  group.add(cup);
  const fire = createFire({ width: 0.28, height: 0.62, light, distance: 7, shadow });
  fire.group.position.y = height + 0.12;
  group.add(fire.group);
  group.userData.update = fire.update;
  return group;
}

/* ---------------- Palm ---------------- */

let frondTex;
function frondTexture() {
  if (frondTex) return frondTex;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 512;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 512);
  // leaflets: broad tapered blades swept back from the midrib, overlapping like a real frond
  const r = rng(11);
  for (let y = 505; y > 12; y -= 15) {
    const len = 58 * Math.sin((y / 512) * Math.PI * 0.95) + 8;
    for (const s of [-1, 1]) {
      const shade = 70 + r() * 55;
      g.fillStyle = `rgb(${34 + shade * 0.25}, ${shade}, ${40 + shade * 0.2})`;
      g.beginPath();
      g.moveTo(64, y);
      g.quadraticCurveTo(64 + s * len * 0.55, y - 4, 64 + s * len, y - 30);
      g.quadraticCurveTo(64 + s * len * 0.5, y - 16, 64, y - 12);
      g.closePath();
      g.fill();
    }
  }
  g.strokeStyle = '#7d7a3a';
  g.lineWidth = 4;
  g.beginPath(); g.moveTo(64, 512); g.lineTo(64, 4); g.stroke();
  frondTex = new THREE.CanvasTexture(c);
  frondTex.colorSpace = THREE.SRGBColorSpace;
  return frondTex;
}

/** A coconut palm: curved ringed trunk, drooping textured fronds, coconuts. */
export function palm({ height = 5.5, lean = 0.35, seed = 1 } = {}) {
  const r = rng(seed);
  const group = new THREE.Group();
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const k = i / 8;
    pts.push(new THREE.Vector3(Math.sin(k * 1.4) * lean * height * 0.35, k * height, 0));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const trunkGeo = new THREE.TubeGeometry(curve, 24, 0.15, 8, false);
  // taper toward the top
  const p = trunkGeo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / height;
    const c = curve.getPoint(Math.min(1, Math.max(0, y)));
    v.fromBufferAttribute(p, i).sub(c).multiplyScalar(1.15 - y * 0.45);
    p.setXYZ(i, c.x + v.x, p.getY(i), c.z + v.z);
  }
  trunkGeo.computeVertexNormals();
  const ring = document.createElement('canvas');
  ring.width = 64; ring.height = 64;
  const rg = ring.getContext('2d');
  rg.fillStyle = '#6a5238'; rg.fillRect(0, 0, 64, 64);
  rg.fillStyle = '#3e2e1e'; rg.fillRect(0, 0, 64, 12);
  const ringTex = new THREE.CanvasTexture(ring);
  ringTex.colorSpace = THREE.SRGBColorSpace;
  ringTex.wrapS = ringTex.wrapT = THREE.RepeatWrapping;
  ringTex.repeat.set(1, 18);
  const trunk = new THREE.Mesh(trunkGeo, pbr({ map: ringTex, bumpMap: ringTex, bumpScale: 2, roughness: 0.9 }));
  trunk.castShadow = true;
  group.add(trunk);

  const top = curve.getPoint(1);
  const crown = new THREE.Group();
  crown.position.copy(top);
  group.add(crown);
  const frondGeo = new THREE.PlaneGeometry(0.9, 3.2, 1, 10);
  frondGeo.translate(0, 1.6, 0);
  // droop: bend the frond down along its length
  const fp = frondGeo.attributes.position;
  for (let i = 0; i < fp.count; i++) {
    const y = fp.getY(i);
    fp.setZ(i, -Math.pow(y / 3.2, 2) * 1.4);
  }
  frondGeo.computeVertexNormals();
  const frondMat = pbr({ map: frondTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.7 });
  const count = 10;
  for (let i = 0; i < count; i++) {
    const f = new THREE.Mesh(frondGeo, frondMat);
    f.rotation.set(-1.0 - r() * 0.35, (i / count) * TAU + r() * 0.3, 0, 'YXZ');
    f.castShadow = true;
    crown.add(f);
  }
  for (let i = 0; i < 3; i++) {
    const nut = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), pbr({ color: 0x4a3420, roughness: 0.8 }));
    nut.position.set(Math.cos(i * 2.1) * 0.14, -0.15, Math.sin(i * 2.1) * 0.14);
    crown.add(nut);
  }
  group.userData.crown = crown;
  return group;
}

/* ---------------- Lava rock ---------------- */

export function lavaRock({ size = 0.8, seed = 1 } = {}) {
  const r = rng(seed);
  const geo = new THREE.IcosahedronGeometry(size, 2);
  const p = geo.attributes.position, v = new THREE.Vector3();
  const offsets = new Map();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const key = v.toArray().map((n) => n.toFixed(3)).join();
    if (!offsets.has(key)) offsets.set(key, 0.75 + r() * 0.45);
    v.multiplyScalar(offsets.get(key));
    v.y *= 0.65;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, surface(lavaSet(), { color: 0x9a8a80, bumpScale: 3, roughness: 0.95 }));
  m.castShadow = m.receiveShadow = true;
  return m;
}

export { glow };

/* ---------------- Moai head ---------------- */

/** A weathered moai: long head, heavy brow, long nose, tight lips, carved from lava rock. */
export function moai({ height = 2.4 } = {}) {
  const group = new THREE.Group();
  const stone = surface(lavaSet(), { color: 0x8a7f78, bumpScale: 2.5, roughness: 0.95 });
  const h = height;
  // square-ish head: a 4-sided cylinder turned 45°, slightly tapered
  const head = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.21, h * 0.25, h, 4, 1), stone);
  head.rotation.y = Math.PI / 4;
  head.scale.set(1, 1, 0.8);
  head.position.y = h / 2;
  group.add(head);
  const part = (w, hh, d, x, y, z, rx = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), stone);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    return m;
  };
  part(h * 0.4, h * 0.08, h * 0.12, 0, h * 0.72, h * 0.19);            // brow
  part(h * 0.1, h * 0.34, h * 0.1, 0, h * 0.52, h * 0.22, -0.18);      // nose
  part(h * 0.22, h * 0.035, h * 0.06, 0, h * 0.3, h * 0.2);            // lips
  part(h * 0.3, h * 0.12, h * 0.1, 0, h * 0.18, h * 0.18);             // chin
  for (const s of [-1, 1]) part(h * 0.05, h * 0.3, h * 0.08, s * h * 0.23, h * 0.58, 0); // long ears
  group.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  return group;
}
