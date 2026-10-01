// Tiki props, built procedurally in the classic mid-century style:
// carved tiki posts (Marquesan / Witco pop), glass floats in rope nets, pufferfish lamps,
// tiki mugs, a volcano bowl, bamboo torches, palms with real fronds, and lava rocks.
// Hero props can be swapped for AI-generated GLBs later (see hero.js).
import * as THREE from 'three';
import { PALETTE, pbr, surface, woodSet, bambooSet, lavaSet, glow } from './materials.js';
import { createFire } from './fire.js';
import * as T from './textures.js';

const TAU = Math.PI * 2;

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/* ---------------- Carved tiki ---------------- */

// A face drawn as a height map (white = raised, black = cut deep), mid-century pop style:
// crown, heavy brow, big lozenge eyes, broad nose, a huge mouth with tongue, hands on the belly.
// Drawn sharp and blurred once at the end: a canvas filter on every shape costs seconds.
const faceCache = new Map();
function faceHeightMap(style) {
  if (faceCache.has(style)) return faceCache.get(style);
  const W = 256, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#808080';
  g.fillRect(0, 0, W, H);
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
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const o = out.getContext('2d', { willReadFrequently: true });
  o.fillStyle = '#808080';
  o.fillRect(0, 0, W, H); // what the blur pulls in at the edges
  o.filter = 'blur(2px)';
  o.drawImage(c, 0, 0);
  const img = o.getImageData(0, 0, W, H);
  faceCache.set(style, img);
  return img;
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
  const bamboo = surface(bambooSet(), { repeat: [1, height / 1.2] });
  // a tapering bamboo pole with raised nodes
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.058, height, 10), bamboo);
  pole.position.y = height / 2;
  pole.castShadow = true;
  group.add(pole);
  const node = new THREE.TorusGeometry(1, 0.18, 6, 14).rotateX(Math.PI / 2);
  for (let i = 1; i < 5; i++) {
    const y = (i / 5) * height * 0.92, r = 0.058 - (y / height) * 0.016;
    const n = new THREE.Mesh(node, bamboo);
    n.scale.setScalar(r * 1.02);
    n.position.y = y;
    group.add(n);
  }
  // rope lashing below the cup: a tight helix
  const lash = [];
  for (let i = 0; i <= 90; i++) { const k = i / 90, a = k * TAU * 9; lash.push(new THREE.Vector3(Math.cos(a) * 0.05, height - 0.2 + k * 0.14, Math.sin(a) * 0.05)); }
  const rope = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lash), 180, 0.009, 5), pbr({ color: PALETTE.thatch, roughness: 1 }));
  group.add(rope);
  // a cup of split bamboo slats flaring out, round a dark metal fuel canister and its wick
  const slat = new THREE.BoxGeometry(0.03, 0.3, 0.01).translate(0, 0.15, 0);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    const m = new THREE.Mesh(slat, bamboo);
    m.position.set(Math.cos(a) * 0.075, height - 0.1, Math.sin(a) * 0.075);
    m.rotation.set(0, -a + Math.PI / 2, 0);
    m.rotateX(0.3); // flaring outward
    m.castShadow = true;
    group.add(m);
  }
  const can = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.14, 16), pbr({ color: PALETTE.lava, metalness: 0.6, roughness: 0.4 }));
  can.position.y = height + 0.06;
  group.add(can);
  const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.05, 8), glow(PALETTE.coral, 1.5));
  wick.position.y = height + 0.13;
  group.add(wick);
  const fire = createFire({ width: 0.28, height: 0.62, light, distance: 7, shadow });
  fire.group.position.y = height + 0.13;
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
  const trunkGeo = new THREE.TubeGeometry(curve, Math.round(height * 16), 0.15, 12, false);
  // taper toward the top, and ring it: each old leaf scar is a ridge you can see in silhouette
  const p = trunkGeo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / height;
    const c = curve.getPoint(Math.min(1, Math.max(0, y)));
    const ring = 1 + 0.07 * Math.pow(Math.abs(Math.sin(p.getY(i) * 11)), 6) - 0.03;
    v.fromBufferAttribute(p, i).sub(c).multiplyScalar((1.15 - y * 0.45) * ring);
    p.setXYZ(i, c.x + v.x, p.getY(i), c.z + v.z);
  }
  trunkGeo.computeVertexNormals();
  const ring = document.createElement('canvas');
  ring.width = 64; ring.height = 64;
  const rg = ring.getContext('2d');
  const bark = new THREE.Color(PALETTE.wood).lerp(new THREE.Color(PALETTE.thatch), 0.35);
  rg.fillStyle = '#' + bark.getHexString(); rg.fillRect(0, 0, 64, 64);
  rg.fillStyle = '#' + new THREE.Color(PALETTE.stain).getHexString(); rg.fillRect(0, 0, 64, 12);
  for (let i = 0; i < 40; i++) { rg.fillStyle = `rgba(0,0,0,${0.08 + r() * 0.1})`; rg.fillRect(r() * 64, 12 + r() * 50, 1 + r() * 2, 4 + r() * 10); } // fibres
  const ringTex = new THREE.CanvasTexture(ring);
  ringTex.colorSpace = THREE.SRGBColorSpace;
  ringTex.wrapS = ringTex.wrapT = THREE.RepeatWrapping;
  ringTex.repeat.set(2, height * 3.5);
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
  // two dead fronds hanging straight down under the crown, brown and ragged
  const deadMat = pbr({ map: frondTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, color: PALETTE.thatch });
  for (let i = 0; i < 2; i++) {
    const f = new THREE.Mesh(frondGeo, deadMat);
    f.scale.setScalar(0.75);
    f.rotation.set(-2.7 + r() * 0.2, i * 2.6 + r(), 0, 'YXZ');
    crown.add(f);
  }
  for (let i = 0; i < 3; i++) {
    const nut = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), pbr({ color: PALETTE.stain, roughness: 0.8 }));
    nut.position.set(Math.cos(i * 2.1) * 0.14, -0.15, Math.sin(i * 2.1) * 0.14);
    crown.add(nut);
  }
  group.userData.crown = crown;
  return group;
}

/** A fallen coconut, husk and all: a lumpy brown egg with fibres, about 22 cm long. Loose on the
 *  ground for the physics (physics.js rolls it as a ball of `userData.radius`). */
let nutGeo, nutMat;
export function coconut(seed = 1) {
  if (!nutGeo) {
    nutGeo = new THREE.SphereGeometry(0.1, 24, 16);
    const p = nutGeo.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const k = 1 + 0.05 * Math.sin(v.x * 60) * Math.sin(v.z * 55) + 0.04 * Math.sin(Math.atan2(v.z, v.x) * 3); // three ridges
      p.setXYZ(i, v.x * k, v.y * k * 1.12, v.z * k);
    }
    nutGeo.computeVertexNormals();
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d'), r = rng(77);
    const husk = new THREE.Color(PALETTE.stain).lerp(new THREE.Color(PALETTE.wood), 0.4);
    g.fillStyle = '#' + husk.getHexString(); g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 90; i++) { g.fillStyle = r() < 0.5 ? `rgba(0,0,0,${0.1 + r() * 0.15})` : `rgba(230,190,140,${0.06 + r() * 0.08})`; g.fillRect(r() * 64, r() * 64, 1, 5 + r() * 12); } // fibres
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    nutMat = pbr({ map: tex, bumpMap: tex, bumpScale: 1.5, roughness: 0.9 });
  }
  const m = new THREE.Mesh(nutGeo, nutMat);
  m.rotation.set(seed * 1.3, seed * 2.1, seed * 0.7);
  m.castShadow = true;
  m.userData.radius = 0.105;
  m.userData.label = 'Coconut';
  return m;
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

/* ---------- Out on the planet ---------- */

/**
 * A retro radio telescope: a concrete pedestal, a yoke you could imagine turning, a white
 * parabolic dish with panel seams and ribs behind it, and a feed horn held out on three struts.
 * About 2.8 m tall. Faces local +z, tipped back toward the sky.
 */
export function radioDish() {
  const g = new THREE.Group();
  const concrete = surface(lavaSet(), { color: PALETTE.ash, roughness: 0.95, bumpScale: 1 });
  const white = pbr({ color: PALETTE.rocketWhite, roughness: 0.45, metalness: 0.1, side: THREE.DoubleSide });
  const steel = pbr({ color: PALETTE.chrome, metalness: 0.6, roughness: 0.4 });
  const dark = pbr({ color: PALETTE.lava, metalness: 0.4, roughness: 0.6 });
  // an octagonal plinth and a round pedestal
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.78, 0.3, 8), concrete);
  plinth.position.y = 0.15;
  g.add(plinth);
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.9, 16), concrete);
  pedestal.position.y = 0.75;
  g.add(pedestal);
  // the turntable and yoke
  const turn = new THREE.Group();
  turn.position.y = 1.22;
  g.add(turn);
  const table = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 20), dark);
  turn.add(table);
  for (const x of [-0.42, 0.42]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.16), white);
    arm.position.set(x, 0.3, 0);
    turn.add(arm);
  }
  // the dish on its elevation axis, tipped back to look up
  const tilt = new THREE.Group();
  tilt.position.y = 0.56;
  tilt.rotation.x = -0.75;
  turn.add(tilt);
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.92, 12), steel);
  axle.rotation.z = Math.PI / 2;
  tilt.add(axle);
  const R = 1.1, DEPTH = 0.32;
  const bowl = [];
  for (let i = 0; i <= 12; i++) { const r = (i / 12) * R; bowl.push(new THREE.Vector2(r, (r * r) / (R * R) * DEPTH)); }
  const dishGeo = new THREE.LatheGeometry(bowl, 48).rotateX(Math.PI / 2); // opening toward +z
  const dish = new THREE.Mesh(dishGeo, white);
  dish.position.z = 0.12;
  dish.castShadow = true;
  tilt.add(dish);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.025, 8, 48), white);
  rim.position.z = 0.12 + DEPTH;
  tilt.add(rim);
  // panel seams on the face, and ribs across the back
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const seam = [];
    for (let k = 1; k <= 8; k++) { const r = (k / 8) * R; seam.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0.12 + (r * r) / (R * R) * DEPTH + 0.006)); }
    tilt.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(seam), 12, 0.005, 4), pbr({ color: PALETTE.stone })));
  }
  // behind it, a hub, eight ribs following the curve and a ring truss tying them together
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.14, 16), dark);
  hub.rotation.x = Math.PI / 2;
  hub.position.z = 0.05;
  tilt.add(hub);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU, pts = [];
    for (let k = 0; k <= 6; k++) { const r = 0.15 + (k / 6) * (R - 0.17); pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0.1 + (r * r) / (R * R) * DEPTH - 0.04)); }
    tilt.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.018, 5), dark));
  }
  const truss = new THREE.Mesh(new THREE.TorusGeometry(R * 0.62, 0.014, 6, 40), dark);
  truss.position.z = 0.1 + 0.38 * DEPTH - 0.04;
  tilt.add(truss);
  // the feed horn out front on three struts, with its beacon mount
  const feedZ = 0.12 + DEPTH + 0.75;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + Math.PI / 2;
    const from = new THREE.Vector3(Math.cos(a) * R * 0.92, Math.sin(a) * R * 0.92, 0.12 + DEPTH * 0.85);
    const to = new THREE.Vector3(0, 0, feedZ);
    const d = to.clone().sub(from);
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, d.length(), 6), steel);
    s.position.copy(from).addScaledVector(d, 0.5);
    s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    tilt.add(s);
  }
  const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.1, 0.22, 16), white);
  horn.rotation.x = Math.PI / 2;
  horn.position.z = feedZ - 0.02;
  tilt.add(horn);
  // a little equipment hut at the foot, with a lit window
  const hut = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.36, 0.3), white);
  hut.position.set(0.52, 0.48, -0.36);
  g.add(hut);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.08), glow(PALETTE.amber, 1.4));
  win.position.set(0.52, 0.52, -0.2);
  win.rotation.y = 0;
  g.add(win);
  g.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  return g;
}

/**
 * A Polynesian outrigger canoe (va'a), pulled up on the beach: a carved hull with raised ends,
 * a float (ama) off to one side on two curved booms (iako) lashed across, and a paddle.
 * About 3 m long, along local z.
 */
export function outriggerCanoe() {
  const g = new THREE.Group();
  const wood = surface(woodSet(PALETTE.wood), { roughness: 0.75 });
  const stain = surface(woodSet(PALETTE.stain), { roughness: 0.8 });
  // hull: the lower half of a long, narrow spindle, open at the top
  const hullGeo = new THREE.SphereGeometry(1, 28, 10, 0, TAU, Math.PI / 2, Math.PI / 2);
  const hp = hullGeo.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    const z = hp.getZ(i);
    hp.setX(i, hp.getX(i) * (1 - Math.abs(z) * 0.25)); // finer at the ends
  }
  hullGeo.computeVertexNormals();
  const hull = new THREE.Mesh(hullGeo, surface(woodSet(PALETTE.wood), { roughness: 0.75, side: THREE.DoubleSide }));
  hull.scale.set(0.3, 0.28, 1.5);
  hull.position.y = 0.26;
  g.add(hull);
  // gunwales and the raised, carved ends
  for (const x of [-0.29, 0.29]) {
    const gw = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 2.7), stain);
    gw.position.set(x * 0.95, 0.27, 0);
    g.add(gw);
  }
  for (const z of [-1, 1]) {
    const end = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.45, 4), stain);
    end.position.set(0, 0.42, z * 1.45);
    end.rotation.x = z * 0.9;
    g.add(end);
  }
  // the float and the two booms that carry it, lashed to the gunwales
  const ama = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 1.4, 6, 12), wood);
  ama.rotation.x = Math.PI / 2;
  ama.position.set(1.15, 0.08, 0);
  g.add(ama);
  for (const z of [-0.55, 0.55]) {
    const boom = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.3, 0.3, z), new THREE.Vector3(0.45, 0.36, z), new THREE.Vector3(1.0, 0.24, z), new THREE.Vector3(1.15, 0.12, z)]), 16, 0.025, 6), stain);
    g.add(boom);
    const knot = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.012, 6, 10), pbr({ color: PALETTE.thatch, roughness: 1 }));
    knot.position.set(0.29, 0.29, z);
    knot.rotation.y = Math.PI / 2;
    g.add(knot);
  }
  // a paddle laid across the hull
  const paddle = new THREE.Group();
  paddle.position.set(-0.05, 0.31, 0.2);
  paddle.rotation.set(0, 0.5, 0.05);
  g.add(paddle);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.1, 8), wood);
  shaft.rotation.x = Math.PI / 2;
  paddle.add(shaft);
  const blade = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), stain);
  blade.scale.set(0.09, 0.012, 0.24);
  blade.position.z = 0.72;
  paddle.add(blade);
  g.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  return g;
}

/*
 * A striped canvas hammock slung between `a` and `b` (world points where it's tied to two trunks),
 * with `up` the local up. The cloth sags in a curve and its edges curl up; fan lines gather each
 * end to a rope round the trunk; an open book lies in it. Returns the group, already in place.
 */
/**
 * A striped hammock slung between two points (`a`, `b`: the ties, world space) with an open book
 * left in it. Its frame: x runs from tie to tie, y is up, z across. `userData.hammock` lets you
 * get in: the cloth and its fan lines hang in `swing`, which swings about the line between the
 * ties (a damped pendulum: `kick()` it, `update(dt)` it), `setLoad(k)` sags it under your weight,
 * and `point(u, lift, across)` gives a spot on the cloth's centre line (u 0..1 along it) in
 * `swing`'s frame, so a body lying in it swings with it.
 */
export function hammock(a, b, up, { sag = 0.95, width = 0.9 } = {}) {
  const g = new THREE.Group();
  const x = b.clone().sub(a), L = x.length();
  x.normalize();
  const z = x.clone().cross(up).normalize(), y = z.clone().cross(x);
  g.matrixAutoUpdate = true;
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  g.position.copy(a);
  const swing = new THREE.Group(); // pivots on the tie line (local x through the origin)
  g.add(swing);
  const END = 0.5; // rope from each tie to the cloth
  const cloth = L - 2 * END;
  let load = 0; // 0..1: someone's weight in it
  const WEIGHT = 0.16; // how much deeper it hangs with you in it (m)
  const sagAt = (u) => -sag * 4 * u * (1 - u) - WEIGHT * load * Math.sin(Math.PI * u);
  const halfW = (u) => (width / 2) * (0.2 + 0.8 * Math.pow(Math.sin(Math.PI * u), 0.5));
  const geo = new THREE.PlaneGeometry(1, 1, 32, 10);
  const pos = geo.attributes.position;
  const uv0 = Array.from({ length: pos.count }, (_, i) => [pos.getX(i) + 0.5, pos.getY(i) * 2]); // u along, v across (-1..1)
  const shape = () => {
    for (let i = 0; i < pos.count; i++) {
      const [u, v] = uv0[i], w = halfW(u);
      pos.setXYZ(i, END + u * cloth, sagAt(u) + 0.2 * v * v * Math.sin(Math.PI * u) - 0.12, v * w);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  };
  shape();
  const mesh = new THREE.Mesh(geo, pbr({ map: T.hammockCloth(), roughness: 0.9, side: THREE.DoubleSide }));
  mesh.castShadow = mesh.receiveShadow = true;
  swing.add(mesh);
  // fan lines: from each tie to points across the cloth's gathered end (they swing with it)
  const rope = pbr({ color: PALETTE.bamboo, roughness: 0.9 });
  const line = (p, q) => {
    const d = q.clone().sub(p), m = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, d.length(), 4), rope);
    m.position.copy(p).add(q).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    swing.add(m);
  };
  for (const [tie, u] of [[new THREE.Vector3(0, 0, 0), 0.02], [new THREE.Vector3(L, 0, 0), 0.98]]) {
    for (const v of [-1, -0.5, 0, 0.5, 1]) line(tie, new THREE.Vector3(END + u * cloth, sagAt(u) - 0.12 + 0.2 * v * v * Math.sin(Math.PI * u), v * halfW(u)));
    const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 5, 16), rope); // round the trunk
    wrap.position.copy(tie); wrap.rotation.x = Math.PI / 2;
    g.add(wrap);
  }
  // an open book, face down where someone left off
  const bu = 0.42;
  const book = new THREE.Group();
  book.position.set(END + bu * cloth, sagAt(bu) - 0.12 + 0.03, 0.08);
  book.rotation.set(0, 0.5, 0);
  // the pages catch a little starlight, so an open book reads as one in the dark
  const cover = pbr({ color: PALETTE.coral, roughness: 0.7 }), pageMap = T.bookPage(), pages = pbr({ color: 0xffffff, map: pageMap, roughness: 0.9, emissive: 0xffffff, emissiveMap: pageMap, emissiveIntensity: 0.12 });
  const halves = [-1, 1].map((s) => {
    const half = new THREE.Group();
    half.rotation.x = s * 0.35; // a tent, spine up
    half.userData.side = s;
    book.add(half);
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.006, 0.14), cover); c.position.set(0, 0.003, s * 0.07); half.add(c);
    const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.012, 0.13), pages); p2.position.set(0, -0.006, s * 0.065); half.add(p2);
    return half;
  });
  swing.add(book);
  const bookHome = { pos: book.position.clone(), quat: book.quaternion.clone() };

  // the swing: a damped pendulum about the tie line
  let angle = 0, vel = 0;
  const OMEGA = 2.9, DAMP = 0.55; // about a 2 s period; it settles in a few swings
  g.userData.hammock = {
    group: g, swing, book, halves, bookHome, length: L,
    /** A spot on the cloth's centre line (u 0..1 along the cloth), `lift` above it and `across` to the side, in `swing`'s frame. */
    point(u, lift = 0, across = 0) { return new THREE.Vector3(END + u * cloth, sagAt(u) - 0.12 + lift, across); },
    setLoad(k) { if (Math.abs(k - load) < 1e-3) return; load = k; shape(); book.position.y = bookHome.pos.y - WEIGHT * load * Math.sin(Math.PI * bu); },
    get load() { return load; },
    kick(v) { vel += v; },
    get angle() { return angle; },
    update(dt, still = false) {
      if (still) { angle = vel = 0; swing.rotation.x = 0; return; }
      if (!angle && !vel) return;
      const h = Math.min(dt, 1 / 30);
      vel += (-OMEGA * OMEGA * angle - 2 * DAMP * OMEGA * vel) * h;
      angle += vel * h;
      if (Math.abs(angle) < 1e-4 && Math.abs(vel) < 1e-3) angle = vel = 0;
      swing.rotation.x = angle;
    },
  };
  return g;
}

/** A small stack of books to leave on the sand: a few colours, slightly askew. */
export function bookStack(n = 3, seed = 9) {
  const r = rng(seed);
  const g = new THREE.Group();
  const cols = [PALETTE.tinTeal, PALETTE.coral, PALETTE.amber, PALETTE.leaf, PALETTE.cream];
  let y = 0;
  for (let i = 0; i < n; i++) {
    const h = 0.035 + r() * 0.03, w = 0.17 + r() * 0.06, d = 0.23 + r() * 0.06;
    const m = new THREE.Mesh(new THREE.BoxGeometry(d, h, w), pbr({ color: cols[i % cols.length], roughness: 0.75 }));
    m.position.y = y + h / 2; m.rotation.y = (r() - 0.5) * 0.6;
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    y += h;
  }
  return g;
}

/**
 * Messages in bottles washed up at the waterline: green glass, a cork, a rolled letter inside.
 * `n` bottles in a loose group, one stuck upright in the sand.
 */
/**
 * One message in a bottle, standing on its base (y = 0): a green glass bottle, a cork, and the
 * rolled letter inside. userData { cork, letter, neck } (neck: the mouth's height).
 */
const BOTTLE_PROFILE = [[0, 0], [0.045, 0], [0.05, 0.01], [0.05, 0.15], [0.042, 0.18], [0.02, 0.21], [0.016, 0.24], [0.018, 0.26], [0, 0.26]];
let bottleParts = null;
export function messageBottle() {
  bottleParts ||= {
    geo: new THREE.LatheGeometry(BOTTLE_PROFILE.map(([x, y]) => new THREE.Vector2(x, y)), 16),
    glass: new THREE.MeshStandardMaterial({ color: 0x3f8f5a, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.5, depthWrite: false }),
    cork: pbr({ color: PALETTE.thatch, roughness: 0.9 }),
    letter: pbr({ color: PALETTE.cream, roughness: 0.9 }),
  };
  const b = new THREE.Group();
  const glass = new THREE.Mesh(bottleParts.geo, bottleParts.glass);
  glass.renderOrder = 1; // drawn after what's inside it
  b.add(glass);
  const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.015, 0.03, 8), bottleParts.cork); cork.position.y = 0.265; b.add(cork);
  const letter = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 10), bottleParts.letter); letter.position.y = 0.08; letter.rotation.z = 0.08; b.add(letter);
  b.userData = { cork, letter, neck: 0.26 };
  return b;
}

/** A few of them washed up at the waterline; the last stands upright (userData.upright). */
export function messageBottles(n = 3, seed = 17) {
  const r = rng(seed);
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const b = messageBottle();
    const upright = i === n - 1;
    const a = (i / n) * TAU + r() * 0.8, rr = 0.15 + r() * 0.25;
    b.position.set(Math.cos(a) * rr, upright ? -0.05 : 0.04, Math.sin(a) * rr);
    b.rotation.set(upright ? 0.25 : Math.PI / 2 - 0.08, r() * TAU, upright ? 0.15 : 0);
    if (!upright) b.rotation.order = 'YXZ';
    else g.userData.upright = b;
    g.add(b);
  }
  return g;
}

/**
 * A tiki signpost: a wooden post with a small carved head on top and arrow boards, one per
 * destination ([{ text, angle }], angle in radians about the post, 0 = local +x), stacked down
 * the post, lettered on both faces.
 */
export function signpost(boards, { height = 1.9 } = {}) {
  const g = new THREE.Group();
  const wood = surface(woodSet(PALETTE.wood), { roughness: 0.8 });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, height, 10), wood);
  post.position.y = height / 2;
  post.castShadow = true;
  g.add(post);
  const head = carvedTiki({ height: 0.42, radius: 0.1, style: 'ku' });
  head.position.y = height;
  g.add(head);
  const W = 0.64, H = 0.13, TIP = 0.1, D = 0.03;
  const shape = new THREE.Shape();
  shape.moveTo(0, -H / 2); shape.lineTo(W - TIP, -H / 2); shape.lineTo(W, 0); shape.lineTo(W - TIP, H / 2); shape.lineTo(0, H / 2); shape.closePath();
  const plankGeo = new THREE.ExtrudeGeometry(shape, { depth: D, bevelEnabled: false }).translate(0.05, 0, -D / 2);
  const plank = surface(woodSet(PALETTE.stain), { roughness: 0.85 });
  boards.forEach(({ text, angle }, i) => {
    const board = new THREE.Group();
    board.position.y = height - 0.2 - i * (H + 0.045);
    board.rotation.y = angle + (i % 2 ? 0.04 : -0.04); // a little hand-hammered
    const m = new THREE.Mesh(plankGeo, plank);
    m.castShadow = true;
    board.add(m);
    const tex = T.signLettering(text);
    const face = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.8, depthWrite: false });
    for (const s of [1, -1]) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(W - TIP - 0.04, H * 0.86), face);
      f.position.set(0.05 + (W - TIP) / 2 + 0.01, 0, s * (D / 2 + 0.002));
      if (s < 0) f.rotation.y = Math.PI;
      board.add(f);
    }
    g.add(board);
  });
  return g;
}

/**
 * A stand-in Thinker in bronze, from simple forms, for when the hero model isn't there: a
 * figure seated on a rock, bent forward, chin on the back of the right hand, the right elbow on
 * the left knee. About 1.35 m tall; base at y = 0; faces +z.
 */
export function thinkerFallback() {
  const g = new THREE.Group();
  const bronze = pbr({ color: PALETTE.bronze, metalness: 0.6, roughness: 0.45 });
  const add = (geo, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, bronze); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; g.add(m); return m; };
  const limb = (r, len) => new THREE.CapsuleGeometry(r, len, 4, 10);
  add(new THREE.DodecahedronGeometry(0.34, 1), 0, 0.3, -0.05).scale.set(1.1, 0.9, 1); // the rock
  add(limb(0.14, 0.34), 0, 0.82, 0.02, 0.55, 0, 0);          // torso, bent forward
  add(new THREE.SphereGeometry(0.1, 16, 12), 0, 1.2, 0.26);   // head, down
  for (const s of [-1, 1]) {
    add(limb(0.07, 0.34), s * 0.1, 0.62, 0.2, Math.PI / 2, 0, 0);   // thighs, forward
    add(limb(0.055, 0.34), s * 0.12, 0.33, 0.4, 0.15, 0, 0);          // shins, down
  }
  add(limb(0.045, 0.28), 0.12, 0.88, 0.22, 0.2, 0, 0.45);        // right upper arm, down to the knee
  add(limb(0.04, 0.26), 0.02, 1.02, 0.32, -0.3, 0, -0.25);       // right forearm, up to the chin
  add(limb(0.045, 0.3), -0.18, 0.78, 0.2, 0.7, 0, -0.2);         // left arm over the left knee
  return g;
}

/* ---------------- Glassware, for the drinks the robot makes ---------------- */

// Profiles (outer wall, bottom to rim) in metres, for LatheGeometry. `base` is the inside floor.
const GLASSES = {
  rocks:   { r: 0.043, h: 0.09, base: 0.014, wall: 0.004 },  // old fashioned
  collins: { r: 0.031, h: 0.15, base: 0.014, wall: 0.0035 },
  coupe:   { r: 0.056, h: 0.125, base: 0.085, wall: 0.003, stem: true }, // bowl from 0.085 up
};

/**
 * A glass for a real drink: clear glass, the drink inside (fill it as it's poured), ice,
 * foam, frost and garnish. Stands on y = 0; `mouth` is the top centre, in its own frame.
 */
export function barGlass(kind = 'rocks') {
  const G = GLASSES[kind] || GLASSES.rocks;
  const group = new THREE.Group();
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.15, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide });
  const pts = [];
  if (G.stem) {
    // foot, stem, and a wide shallow bowl
    pts.push(new THREE.Vector2(0.001, 0), new THREE.Vector2(0.036, 0), new THREE.Vector2(0.036, 0.004), new THREE.Vector2(0.006, 0.01), new THREE.Vector2(0.004, 0.07), new THREE.Vector2(0.01, G.base - 0.006));
    for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI * 0.5; pts.push(new THREE.Vector2(Math.sin(a) * G.r, G.base - 0.004 + (1 - Math.cos(a)) * (G.h - G.base))); }
  } else {
    pts.push(new THREE.Vector2(0.001, 0), new THREE.Vector2(G.r * 0.96, 0), new THREE.Vector2(G.r, 0.006), new THREE.Vector2(G.r, G.h));
  }
  const shell = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), glassMat);
  shell.renderOrder = 2; // after what's inside it
  group.add(shell);
  // a heavy clear base on the tumblers, which is what makes them read as glass in low light
  if (!G.stem) {
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(G.r - G.wall, G.r * 0.96, G.base, 24), glassMat.clone());
    foot.material.opacity = 0.35;
    foot.position.y = G.base / 2;
    foot.renderOrder = 2;
    group.add(foot);
  }

  // The drink: straight glasses fill as a cylinder; the coupe's bowl as a cap that widens.
  const inner = G.r - G.wall;
  const depth = (G.stem ? G.h - G.base : G.h - G.base) * 0.9;
  const liquidMat = pbr({ color: PALETTE.amber, emissive: PALETTE.amber, emissiveIntensity: 0.05, roughness: 0.1 }); // just enough to read in the dark; more washes reds out to pink
  let liquid;
  if (G.stem) {
    const cap = [];
    for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI * 0.5; cap.push(new THREE.Vector2(Math.sin(a) * inner * 0.97, (1 - Math.cos(a)))); }
    cap.push(new THREE.Vector2(0, 1));
    liquid = new THREE.Mesh(new THREE.LatheGeometry(cap, 24), liquidMat);
    liquid.position.y = G.base - 0.002;
  } else {
    liquid = new THREE.Mesh(new THREE.CylinderGeometry(inner * 0.98, inner * 0.98, 1, 24).translate(0, 0.5, 0), liquidMat);
    liquid.position.y = G.base;
  }
  liquid.renderOrder = 1;
  liquid.visible = false;
  group.add(liquid);
  let level = 0;
  const fill = (k) => {
    level = THREE.MathUtils.clamp(k, 0, 1);
    liquid.visible = level > 0.01;
    if (G.stem) { // the bowl is a quarter circle: scale it so its top sits at the fill height, as wide as the bowl is there
      const hgt = Math.max(0.001, level * depth), a = Math.acos(1 - hgt / (G.h - G.base));
      liquid.scale.set(Math.sin(a), hgt, Math.sin(a));
    } else liquid.scale.y = Math.max(0.001, level * depth);
    const top = liquid.position.y + level * depth;
    for (const f of floaters) f.position.y = Math.max(f.userData.rest, top - f.userData.sink);
  };

  // Ice floats on what's poured; crushed ice fills the glass. Garnish and foam sit on top.
  const floaters = [];
  const iceMat = new THREE.MeshPhysicalMaterial({ color: PALETTE.ice, roughness: 0.25, transparent: true, opacity: 0.6, clearcoat: 1, depthWrite: false });
  function ice(type) {
    if (type === 'cubes') {
      const cube = new THREE.BoxGeometry(0.026, 0.026, 0.026);
      [[-0.01, 0.009, 0.3], [0.012, -0.006, 1.1], [-0.002, -0.013, 2.2]].forEach(([x, z, r], i) => {
        const c = new THREE.Mesh(cube, iceMat);
        c.position.set(x, G.base + 0.014 + i * 0.022, z);
        c.rotation.set(r, r * 0.7, r * 0.3);
        c.userData.rest = c.position.y; c.userData.sink = 0.012 - i * 0.004;
        c.renderOrder = 1;
        group.add(c); floaters.push(c);
      });
    } else if (type === 'crushed') {
      // packed to the rim: a rough column, and a mound on top once it's topped up
      const col = new THREE.Mesh(new THREE.CylinderGeometry(inner * 0.95, inner * 0.95, G.h - G.base - 0.004, 16, 6), iceMat);
      const pos = col.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) { const k = 1 + Math.sin(i * 12.9898) * 0.05; pos.setX(i, pos.getX(i) * k); pos.setZ(i, pos.getZ(i) * k); }
      col.geometry.computeVertexNormals();
      col.position.y = G.base + (G.h - G.base) / 2;
      col.renderOrder = 1;
      group.add(col);
    }
  }
  function mound() {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(inner * 1.05, 1).scale(1, 0.55, 1), iceMat);
    m.position.y = G.h;
    m.renderOrder = 1;
    group.add(m);
  }
  function foam(color) {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(inner * 0.99, inner * 0.97, 0.01, 24), pbr({ color, roughness: 0.9, emissive: color, emissiveIntensity: 0.08 }));
    f.position.y = G.base + depth - 0.002;
    group.add(f);
  }
  function frost(k) { // a swizzle frosts the glass over
    glassMat.opacity = 0.15 + k * 0.5;
    glassMat.roughness = 0.05 + k * 0.6;
  }
  function garnish(name) {
    const g = garnishFor(name);
    if (!g) return;
    if (name === 'pineapple') { g.position.set(G.r * 0.9, G.h - 0.01, 0); g.rotation.y = 0.2; }
    else if (name === 'orange') { g.position.set(G.r * 0.45, G.base + depth * 0.55, 0.004); g.rotation.set(0, Math.PI / 2, 0.15); } // slid down the inside
    else if (name === 'mint') g.position.set(-0.004, G.h + 0.02, 0.004);
    else if (name === 'beans') g.position.set(0.002, (kind === 'rocks' ? G.h - 0.012 : G.base + depth), -0.006);
    group.add(g);
  }
  return {
    group, liquid, fill, ice, mound, foam, frost, garnish,
    color(c) { liquidMat.color.set(c); liquidMat.emissive.set(c); },
    get level() { return level; },
    mouth: new THREE.Vector3(0, G.h, 0),
    height: G.h,
  };
}

/** A garnish, full size (the robot holds one, then it goes on the glass). */
export function garnishFor(name) {
  const g = new THREE.Group();
  if (name === 'pineapple') {
    const wedge = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 3, 1, false, 0, Math.PI / 3).rotateX(Math.PI / 2), pbr({ color: PALETTE.pineapple, roughness: 0.6, emissive: PALETTE.pineapple, emissiveIntensity: 0.1 }));
    wedge.rotation.z = -Math.PI / 2 - Math.PI / 6;
    g.add(wedge);
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.06, 4), pbr({ color: PALETTE.leaf, roughness: 0.7 }));
    leaf.position.set(0, 0.04, 0);
    g.add(leaf);
  } else if (name === 'orange') {
    const slice = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.005, 20, 1, false, 0, Math.PI), [pbr({ color: PALETTE.orange, roughness: 0.6 }), pbr({ color: PALETTE.pineapple, roughness: 0.5, emissive: PALETTE.orange, emissiveIntensity: 0.15 }), pbr({ color: PALETTE.cream })]);
    slice.rotation.x = Math.PI / 2;
    g.add(slice);
  } else if (name === 'mint') {
    const m = pbr({ color: PALETTE.mint, roughness: 0.6, side: THREE.DoubleSide });
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6).scale(1, 0.25, 0.6), m);
      const a = i * 2.3, y = i * 0.006;
      leaf.position.set(Math.cos(a) * 0.008, y, Math.sin(a) * 0.008);
      leaf.rotation.set(0.6, a, 0.4);
      g.add(leaf);
    }
  } else if (name === 'beans') {
    const m = pbr({ color: PALETTE.stain, roughness: 0.5 });
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6).scale(1, 0.6, 0.8), m);
      b.position.set(Math.cos(i * 2.1) * 0.009, 0, Math.sin(i * 2.1) * 0.009);
      b.rotation.y = i;
      g.add(b);
    }
  } else return null;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
