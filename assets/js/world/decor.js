// Dressing for Steve's: the layered density that makes a tiki bar read as real.
//
// From how the great ones look (Smuggler's Cove, Three Dots and a Dash, Trader Vic's, Tiki-Ti,
// the Mai-Kai): a back bar bristling with rum, backlit so the bottles glow; nets full of glass
// floats sagging from the ceiling; grass hanging over the bar; carvings, masks and paddles on
// every wall; rope trim; a working bartender's station; and outside, lush planting (monstera,
// ferns, red ti plants) and strings of warm bulbs. Everything is instanced where it repeats,
// so phones pay little for it.
import * as THREE from 'three';
import * as T from './textures.js';
import { PALETTE, pbr, surface, woodSet, glow, chrome } from './materials.js';

const TAU = Math.PI * 2;

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const tone = (c, k) => new THREE.Color(c).multiplyScalar(k);

function mesh(geo, material, [x, y, z] = [0, 0, 0], parent, { cast = true } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  parent && parent.add(m);
  return m;
}

/* ---------- The rum wall ---------- */

// Three bottle shapes, as lathes (y up, base at 0): a rum bottle, a squat one, a tall liqueur.
const BOTTLES = [
  [[0, 0], [0.045, 0], [0.046, 0.15], [0.03, 0.19], [0.014, 0.21], [0.014, 0.26], [0, 0.26]],
  [[0, 0], [0.055, 0], [0.056, 0.1], [0.04, 0.14], [0.016, 0.155], [0.016, 0.19], [0, 0.19]],
  [[0, 0], [0.034, 0], [0.035, 0.2], [0.02, 0.24], [0.011, 0.26], [0.011, 0.31], [0, 0.31]],
].map((p) => new THREE.LatheGeometry(p.map(([x, y]) => new THREE.Vector2(x, y)), 12));

/**
 * Fill shelves with bottles in rows (`rows`: [{ y, z, x0, x1, gapsAt }]) inside `parent`.
 * Glass tints come from the palette: dark rum, aged amber, light rum, green and blue glass.
 */
export function rumWall(parent, rows, seed = 7) {
  const rand = rng(seed);
  const tints = [tone(PALETTE.amber, 0.5), tone(PALETTE.stain, 0.9), tone(PALETTE.bamboo, 0.75), tone(PALETTE.teal, 0.9), tone(PALETTE.coral, 0.45), tone(PALETTE.lava, 1.6), tone(PALETTE.aqua, 0.45)];
  const placed = BOTTLES.map(() => []);
  for (const r of rows) {
    let x = r.x0;
    while (x < r.x1) {
      const k = Math.floor(rand() * BOTTLES.length);
      if (!(r.gapsAt || []).some((g) => Math.abs(g - x) < 0.14)) placed[k].push([x, r.y, r.z + (rand() - 0.5) * 0.03, rand() * TAU, tints[Math.floor(rand() * tints.length)], 0.92 + rand() * 0.2]);
      x += 0.085 + rand() * 0.035;
    }
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  BOTTLES.forEach((geo, k) => {
    const list = placed[k];
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, pbr({ roughness: 0.12, metalness: 0.1, emissive: PALETTE.amber, emissiveIntensity: 0.05 }), list.length);
    list.forEach(([x, y, z, ry, c, s], i) => {
      im.setMatrixAt(i, m.compose(p.set(x, y, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), sc.set(1, s, 1)));
      im.setColorAt(i, c);
    });
    im.castShadow = true;
    parent.add(im);
    // a paper label on most, and a cap or cork on every one
    const top = geo.parameters.points.at(-1).y, r = geo.parameters.points[2].x;
    const labelled = list.filter((_, i) => i % 4 !== 3);
    const lab = new THREE.InstancedMesh(new THREE.CylinderGeometry(r + 0.002, r + 0.002, 0.07, 12, 1, true), pbr({ roughness: 0.9 }), labelled.length);
    const cap = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.017, 0.017, 0.03, 8), pbr({ roughness: 0.6, metalness: 0.3 }), list.length);
    const labelTints = [PALETTE.cream, PALETTE.cream, PALETTE.bamboo, PALETTE.lava, PALETTE.coral].map((c) => new THREE.Color(c));
    const capTints = [PALETTE.lava, PALETTE.wood, PALETTE.amber, PALETTE.coral].map((c) => new THREE.Color(c));
    labelled.forEach(([x, y, z, ry, , s2], i) => {
      lab.setMatrixAt(i, m.compose(p.set(x, y + 0.075 * s2, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), sc.set(1, s2, 1)));
      lab.setColorAt(i, labelTints[i % labelTints.length]);
    });
    list.forEach(([x, y, z, , , s2], i) => {
      cap.setMatrixAt(i, m.compose(p.set(x, y + top * s2, z), q.identity(), sc.set(1, 1, 1)));
      cap.setColorAt(i, capTints[i % capTints.length]);
    });
    parent.add(lab, cap);
  });
}

/** A warm backlight strip behind a row of bottles, so they glow in silhouette. */
export function backlight(parent, { y, z, width, height = 0.3 }) {
  const panel = mesh(new THREE.PlaneGeometry(width, height), pbr({ color: PALETTE.lava, emissive: PALETTE.amber, emissiveIntensity: 0.55, roughness: 1 }), [0, y + height / 2, z], parent, { cast: false });
  panel.receiveShadow = false;
  return panel;
}

/* ---------- On the walls ---------- */

/** A pair of outrigger paddles, crossed, with coral-banded blades. */
export function crossedPaddles() {
  const g = new THREE.Group();
  const wood = surface(woodSet(PALETTE.wood), { roughness: 0.7 });
  const band = pbr({ color: PALETTE.coral, roughness: 0.6 });
  for (const s of [-1, 1]) {
    const paddle = new THREE.Group();
    paddle.rotation.z = s * 0.55;
    g.add(paddle);
    mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.62, 8), wood, [0, 0.2, 0], paddle);
    const blade = mesh(new THREE.SphereGeometry(1, 16, 10), wood, [0, -0.25, 0], paddle);
    blade.scale.set(0.075, 0.2, 0.012);
    const b = mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.035, 8), band, [0, -0.06, 0], paddle);
    b.scale.z = 0.5;
  }
  return g;
}

/* ---------- Overhead ---------- */

/**
 * A fishing net slung under the roof, sagging in the middle, with glass floats caught in it.
 * `width` across the bar (x), `depth` along it (z), hung at `y` with `sag` at the centre.
 */
export function ceilingNet({ width, depth, y, sag, floats = 16, seed = 11 }) {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(width, depth, 18, 14).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const drop = (x, z) => sag * (1 - (2 * x / width) ** 2) * Math.sin(Math.PI * (z / depth + 0.5));
  for (let i = 0; i < pos.count; i++) pos.setY(i, -drop(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const net = mesh(geo, pbr({ map: T.fishingNet(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 }), [0, y, 0], g, { cast: false });
  net.receiveShadow = false;
  const rand = rng(seed);
  const colors = [PALETTE.aqua, PALETTE.teal, PALETTE.amber, PALETTE.aqua, PALETTE.lime].map((c) => new THREE.Color(c));
  const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), pbr({ roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.85, emissive: 0xffffff, emissiveIntensity: 0.22 }), floats);
  const m = new THREE.Matrix4();
  for (let i = 0; i < floats; i++) {
    const x = (rand() - 0.5) * width * 0.8, z = (rand() - 0.5) * depth * 0.8, r = 0.07 + rand() * 0.06;
    m.makeScale(r, r, r).setPosition(x, y - drop(x, z) - r * 0.9, z);
    balls.setMatrixAt(i, m);
    balls.setColorAt(i, colors[i % colors.length]);
  }
  g.add(balls);
  return g;
}

/** Grass hanging from a beam: strands along x from x0 to x1 at (y, z). */
export function grassFringe({ x0, x1, y, z, count = 90, length = 0.45, seed = 5 }) {
  const rand = rng(seed);
  const im = new THREE.InstancedMesh(new THREE.ConeGeometry(0.016, 1, 3).translate(0, -0.5, 0), pbr({ color: PALETTE.thatch, roughness: 1 }), count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < count; i++) {
    const x = x0 + (i / (count - 1)) * (x1 - x0) + (rand() - 0.5) * 0.04;
    q.setFromEuler(e.set((rand() - 0.5) * 0.3, rand() * TAU, (rand() - 0.5) * 0.2));
    m.compose(new THREE.Vector3(x, y, z + (rand() - 0.5) * 0.06), q, new THREE.Vector3(1, length * (0.6 + rand() * 0.6), 1));
    im.setMatrixAt(i, m);
  }
  im.castShadow = true;
  return im;
}

/** A string of warm festoon bulbs sagging between points (a list of [x, y, z]). */
export function festoon(points, { perSpan = 7, sag = 0.18 } = {}) {
  const g = new THREE.Group();
  const bulbs = [];
  const wire = [];
  for (let s = 0; s < points.length - 1; s++) {
    const a = new THREE.Vector3(...points[s]), b = new THREE.Vector3(...points[s + 1]);
    for (let i = 0; i <= perSpan; i++) {
      const k = i / perSpan;
      const p = a.clone().lerp(b, k);
      p.y -= sag * 4 * k * (1 - k);
      wire.push(p);
      if (i > 0 && i < perSpan) bulbs.push(p.clone().add(new THREE.Vector3(0, -0.05, 0)));
    }
  }
  const curve = new THREE.CatmullRomCurve3(wire);
  mesh(new THREE.TubeGeometry(curve, wire.length * 3, 0.005, 4), pbr({ color: PALETTE.lava }), [0, 0, 0], g, { cast: false });
  const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 10, 8), glow(PALETTE.amber, 2.6), bulbs.length);
  bulbs.forEach((p, i) => im.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)));
  g.add(im);
  return g;
}

/** Rope trim along a line (a list of points). */
export function rope(points, radius = 0.018) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return mesh(new THREE.TubeGeometry(curve, 60, radius, 8), pbr({ map: T.ropeTexture(), roughness: 0.95 }), [0, 0, 0]);
}

/* ---------- The bartender's station, on the bar top ---------- */

export function barStation() {
  const g = new THREE.Group();
  const steel = chrome({ roughness: 0.3 });
  // a wooden bowl of limes and oranges
  const bowl = mesh(new THREE.CylinderGeometry(0.13, 0.08, 0.07, 18, 1, true), surface(woodSet(PALETTE.wood), { roughness: 0.6, side: THREE.DoubleSide }), [0, 0.035, 0], g);
  mesh(new THREE.CircleGeometry(0.08, 18).rotateX(-Math.PI / 2), surface(woodSet(PALETTE.wood), { roughness: 0.6 }), [0, 0.003, 0], bowl.parent);
  const fruit = new THREE.InstancedMesh(new THREE.SphereGeometry(0.034, 12, 8), pbr({ roughness: 0.55 }), 9);
  const rand = rng(3);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU * 1.6, r = i < 6 ? 0.07 : 0.025;
    fruit.setMatrixAt(i, new THREE.Matrix4().makeTranslation(Math.cos(a) * r, 0.05 + (i >= 6 ? 0.035 : 0), Math.sin(a) * r));
    fruit.setColorAt(i, new THREE.Color(i % 3 === 2 ? PALETTE.amber : PALETTE.lime));
  }
  g.add(fruit);
  // two shaker tins and a jigger
  mesh(new THREE.CylinderGeometry(0.045, 0.036, 0.17, 16), steel, [0.25, 0.085, -0.02], g);
  mesh(new THREE.CylinderGeometry(0.038, 0.03, 0.13, 16), steel, [0.35, 0.065, 0.04], g);
  const jig = new THREE.Group(); jig.position.set(0.2, 0, 0.12); g.add(jig);
  mesh(new THREE.CylinderGeometry(0.022, 0.008, 0.035, 12), steel, [0, 0.0175, 0], jig);
  mesh(new THREE.CylinderGeometry(0.008, 0.02, 0.03, 12), steel, [0, 0.05, 0], jig);
  // bitters bottles with cream labels
  const label = pbr({ color: PALETTE.cream, roughness: 0.9 });
  [[-0.2, 0.05], [-0.26, -0.02], [-0.3, 0.07]].forEach(([x, z], i) => {
    const b = new THREE.Group(); b.position.set(x, 0, z); b.scale.setScalar(0.55 + i * 0.05); g.add(b);
    mesh(BOTTLES[1], pbr({ color: tone(i % 2 ? PALETTE.stain : PALETTE.lava, 1.2), roughness: 0.15 }), [0, 0, 0], b);
    mesh(new THREE.CylinderGeometry(0.057, 0.057, 0.06, 12, 1, true), label, [0, 0.06, 0], b);
  });
  // a glass of swizzle sticks and paper umbrellas
  const cup = new THREE.Group(); cup.position.set(-0.42, 0, -0.05); g.add(cup);
  mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.1, 14, 1, true), pbr({ color: PALETTE.aqua, roughness: 0.05, transparent: true, opacity: 0.35, side: THREE.DoubleSide }), [0, 0.05, 0], cup, { cast: false });
  const umbrellaColors = [PALETTE.coral, PALETTE.aqua, PALETTE.amber, PALETTE.hibiscus];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU, tilt = 0.18 + (i % 2) * 0.12;
    const stick = new THREE.Group(); stick.position.set(Math.cos(a) * 0.012, 0.02, Math.sin(a) * 0.012); stick.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt); cup.add(stick);
    mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.19, 4), pbr({ color: i < 4 ? PALETTE.bamboo : PALETTE.hibiscus }), [0, 0.095, 0], stick, { cast: false });
    if (i < 4) mesh(new THREE.ConeGeometry(0.04, 0.022, 8, 1, true), pbr({ color: umbrellaColors[i], roughness: 0.8, side: THREE.DoubleSide }), [0, 0.19, 0], stick, { cast: false });
  }
  // a folded bar towel
  mesh(new THREE.BoxGeometry(0.16, 0.02, 0.1), pbr({ color: PALETTE.cream, roughness: 1 }), [0.08, 0.01, 0.17], g);
  return g;
}

/* ---------- Planting ---------- */

let leafMats = null;
function leaves() {
  if (!leafMats) {
    const mk = (kind) => pbr({ map: T.leafCard(kind), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75 });
    leafMats = { monstera: mk('monstera'), ti: mk('ti'), fern: mk('fern') };
  }
  return leafMats;
}

/**
 * Tropical planting beds: `spots` is a list of [x, z, groundY] in the parent's frame. Each bed
 * gets a monstera, a red ti plant and ferns, tinted from the palette. One instanced mesh per
 * leaf kind for the lot.
 */
export function planting(spots, seed = 21) {
  const rand = rng(seed);
  const g = new THREE.Group();
  const kinds = { monstera: [], ti: [], fern: [] };
  const up = new THREE.Vector3(0, 1, 0);
  for (const [cx, cz, gy] of spots) {
    const plant = (kind, ox, oz, n, size, lean, lift = 0) => {
      for (let i = 0; i < n; i++) {
        const yaw = (i / n) * TAU + rand() * 0.6;
        const tilt = lean * (0.7 + rand() * 0.5);
        kinds[kind].push({ x: cx + ox, y: gy + lift, z: cz + oz, yaw, tilt, size: size * (0.75 + rand() * 0.45) });
      }
    };
    const a = rand() * TAU;
    plant('monstera', Math.cos(a) * 0.35, Math.sin(a) * 0.35, 8, 1.15, 0.75, 0.05);
    plant('ti', Math.cos(a + 2.2) * 0.45, Math.sin(a + 2.2) * 0.45, 14, 1.0, 0.4);
    plant('fern', Math.cos(a + 4.2) * 0.5, Math.sin(a + 4.2) * 0.5, 12, 0.85, 1.0);
  }
  const tintFor = {
    monstera: () => tone(PALETTE.leaf, 1.3 + rand() * 0.4),
    ti: () => tone(PALETTE.hibiscus, 0.55 + rand() * 0.25).lerp(tone(PALETTE.stain, 1), 0.25),
    fern: () => tone(PALETTE.lime, 0.7 + rand() * 0.3).lerp(tone(PALETTE.leaf, 1), 0.5),
  };
  const mats = leaves();
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  for (const kind of Object.keys(kinds)) {
    const list = kinds[kind];
    // a card with its stem at the origin, standing up, 1 unit tall
    const geo = new THREE.PlaneGeometry(0.5, 1).translate(0, 0.5, 0);
    const im = new THREE.InstancedMesh(geo, mats[kind], list.length);
    list.forEach((l, i) => {
      qa.setFromAxisAngle(up, l.yaw);
      qb.setFromAxisAngle(new THREE.Vector3(1, 0, 0), l.tilt);
      q.copy(qa).multiply(qb);
      m.compose(new THREE.Vector3(l.x, l.y, l.z), q, new THREE.Vector3(l.size, l.size, l.size));
      im.setMatrixAt(i, m);
      im.setColorAt(i, tintFor[kind]());
    });
    im.castShadow = true;
    g.add(im);
  }
  return g;
}

/* ---------- Shrubs out on the planet ---------- */

// One merged geometry per kind (a clump of leaf cards, coloured per leaf), shared by every shrub
// of that kind: each shrub is one mesh and one draw call.
const shrubGeos = {};
let shrubMats = null;
function shrubGeometry(kind) {
  if (shrubGeos[kind]) return shrubGeos[kind];
  const rand = rng(kind.length * 31 + 7);
  const spec = { monstera: [9, 0.9, 0.8], ti: [14, 0.8, 0.35], fern: [13, 0.7, 1.0] }[kind];
  const [n, size, lean] = spec;
  const tint = {
    monstera: () => tone(PALETTE.leaf, 1.2 + rand() * 0.4),
    ti: () => tone(PALETTE.hibiscus, 0.5 + rand() * 0.25).lerp(tone(PALETTE.stain, 1), 0.25),
    fern: () => tone(PALETTE.lime, 0.7 + rand() * 0.3).lerp(tone(PALETTE.leaf, 1), 0.5),
  }[kind];
  const parts = [];
  const q = new THREE.Quaternion(), m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const card = new THREE.PlaneGeometry(0.5, 1).translate(0, 0.5, 0);
    const s = size * (0.7 + rand() * 0.5);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (i / n) * Math.PI * 2 + rand() * 0.5)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), lean * (0.6 + rand() * 0.6)));
    card.applyMatrix4(m.compose(new THREE.Vector3((rand() - 0.5) * 0.2, 0, (rand() - 0.5) * 0.2), q, new THREE.Vector3(s, s, s)));
    const c = tint();
    const col = new Float32Array(card.attributes.position.count * 3);
    for (let k = 0; k < card.attributes.position.count; k++) col.set([c.r, c.g, c.b], k * 3);
    card.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(card.toNonIndexed());
  }
  const geo = new THREE.BufferGeometry();
  for (const [name, size2] of [['position', 3], ['normal', 3], ['uv', 2], ['color', 3]]) {
    const arr = new Float32Array(parts.reduce((t, p) => t + p.attributes[name].array.length, 0));
    let off = 0;
    for (const p of parts) { arr.set(p.attributes[name].array, off); off += p.attributes[name].array.length; }
    geo.setAttribute(name, new THREE.BufferAttribute(arr, size2));
  }
  geo.computeBoundingSphere();
  return (shrubGeos[kind] = geo);
}
/** A tropical shrub (a clump of monstera, red ti or fern) standing at the origin. */
export function shrub(i) {
  if (!shrubMats) {
    const mk = (kind) => pbr({ map: T.leafCard(kind), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75, vertexColors: true });
    shrubMats = { monstera: mk('monstera'), ti: mk('ti'), fern: mk('fern') };
  }
  const kind = ['fern', 'monstera', 'ti'][i % 3];
  const m = new THREE.Mesh(shrubGeometry(kind), shrubMats[kind]);
  m.castShadow = true;
  return m;
}
