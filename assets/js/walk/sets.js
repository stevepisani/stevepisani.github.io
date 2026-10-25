// The things along the track in "Rockets and Horses", built from primitives at real size (metres),
// standing on y = 0. Stand-ins for the Meshy models (tools/models/gauge.json): each part a model
// replaces is a slot (`userData.slot`), which gauge.js fills. Shared:
// the post's walk (gauge.js) builds all of them, the planet (places.js) a length of track and the
// flatcar with its booster segment. Each takes `M`, the materials to use, so each place lights and
// colours them its own way: { horse, wood, iron, steel, paint, brass, white, rock, ... }.
import * as THREE from 'three';

/** Standard gauge, between the inside faces of the rails: 4 ft 8½ in. */
export const GAUGE = 1.435;

const mesh = (geo, mat, [x, y, z] = [0, 0, 0], parent) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (parent) parent.add(m);
  return m;
};
const box = (w, h, d, mat, at, parent) => mesh(new THREE.BoxGeometry(w, h, d), mat, at, parent);
const cyl = (rt, rb, h, mat, at, parent, seg = 16) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, at, parent);
// A part a model can replace (gauge.js fills each slot with its Meshy model, fitted to the stand-in's size).
const slot = (name, parent) => {
  const g = new THREE.Group();
  g.userData.slot = name;
  if (parent) parent.add(g);
  return g;
};
// a wheel turning on an axle across the track (along z)
const wheel = (r, w, mat, at, parent) => mesh(new THREE.CylinderGeometry(r, r, w, 20).rotateX(Math.PI / 2), mat, at, parent);
// a pair of wheels on one axle, their flanges just inside the gauge
function wheelset(r, mat, x, parent, w = 0.12) {
  for (const s of [-1, 1]) wheel(r, w, mat, [x, r, s * (GAUGE / 2 + w / 2)], parent);
  mesh(new THREE.CylinderGeometry(0.05, 0.05, GAUGE, 8).rotateX(Math.PI / 2), mat, [x, r, 0], parent);
}

/** A horse, head toward -x. */
export function horse(M) {
  const g = slot('horse');
  mesh(new THREE.SphereGeometry(1, 16, 12).scale(0.95, 0.42, 0.33), M.horse, [0, 1.25, 0], g);
  cyl(0.15, 0.24, 0.9, M.horse, [-0.88, 1.62, 0], g).rotation.z = 0.65;
  const head = box(0.6, 0.24, 0.22, M.horse, [-1.3, 1.9, 0], g);
  head.rotation.z = 0.55;
  for (const s of [-1, 1]) box(0.06, 0.14, 0.05, M.horse, [-1.12, 2.16, s * 0.07], g);
  for (const x of [-0.6, 0.62]) for (const s of [-1, 1]) cyl(0.065, 0.05, 1.05, M.horse, [x, 0.52, s * 0.17], g, 8);
  cyl(0.03, 0.1, 0.75, M.mane, [1.0, 1.05, 0], g, 8).rotation.z = -0.35;
  box(0.7, 0.12, 0.06, M.mane, [-0.75, 1.82, 0], g).rotation.z = -0.65;
  return g;
}

/** The chariot of the story and its two horses, side by side ahead of it (toward -x). */
export function chariot(M) {
  const g = new THREE.Group(), c = slot('chariot', g);
  for (const s of [-1, 1]) wheel(0.45, 0.08, M.wood, [0, 0.45, s * (GAUGE / 2 + 0.04)], c);
  mesh(new THREE.CylinderGeometry(0.04, 0.04, GAUGE + 0.2, 8).rotateX(Math.PI / 2), M.iron, [0, 0.45, 0], c);
  box(0.9, 0.08, 1.2, M.wood, [0.05, 0.55, 0], c);
  mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.7, 20, 1, true, Math.PI, Math.PI), M.paint, [0.05, 0.92, 0], c); // the front, open at the back (M.paint is two-sided)
  box(2.3, 0.07, 0.07, M.wood, [-1.5, 0.85, 0], c); // the pole
  for (const s of [-1, 1]) { const h = horse(M); h.position.set(-3.1, 0, s * 0.42); g.add(h); }
  return g;
}

/** A Roman cart, two heavy wheels in the ruts, and a milestone by the road. */
export function romanCart(M) {
  const g = new THREE.Group(), c = slot('roman-cart', g);
  for (const s of [-1, 1]) wheel(0.62, 0.12, M.wood, [0, 0.62, s * (GAUGE / 2 + 0.06)], c);
  box(2.1, 0.32, 1.35, M.wood, [0.1, 0.92, 0], c);
  for (const s of [-1, 1]) box(1.9, 0.06, 0.06, M.wood, [-1.9, 0.86, s * 0.55], c);
  cyl(0.28, 0.32, 1.6, M.stone, [0.9, 0.8, -2.3], g);
  return g;
}

/** A farm wagon, its shafts waiting for a horse. */
export function wagon(M) {
  const g = new THREE.Group(), c = slot('wagon', g);
  for (const [x, r] of [[-1, 0.45], [1, 0.6]]) for (const s of [-1, 1]) wheel(r, 0.1, M.wood, [x, r, s * (GAUGE / 2 + 0.05)], c);
  box(2.8, 0.5, 1.3, M.wood, [0, 1.05, 0], c);
  box(2.5, 0.7, 1.2, M.hay, [0.05, 1.6, 0], c);
  for (const s of [-1, 1]) box(2.2, 0.06, 0.06, M.wood, [-2.4, 0.9, s * 0.38], c);
  return g;
}

/** A coal wagon of the 1700s (a chaldron) on wooden rails, its horse walking between them. */
export function chaldron(M) {
  const g = new THREE.Group(), c = slot('chaldron', g);
  const lift = 0.14; // the wooden rails' top
  for (const x of [-0.55, 0.55]) wheelset(0.3, M.iron, x, c, 0.1);
  c.children.forEach((c) => { c.position.y += lift; });
  mesh(new THREE.CylinderGeometry(1, 0.7, 1.1, 4, 1).rotateY(Math.PI / 4).scale(1.1, 1, 0.95), M.wood, [0, 1.15 + lift, 0], c);
  const h = horse(M); // ahead of the wagon toward +x, so its head is to the right as you see it
  h.position.set(2.9, lift - 0.02, 0);
  h.rotation.y = h.userData.turn = Math.PI;
  g.add(h);
  return g;
}

/** Stephenson's Rocket (1829), give or take: yellow, a tall chimney, big front wheels, a tender. */
export function locomotive(M) {
  const g = slot('locomotive');
  const top = 0.15; // the iron rails' top
  wheelset(0.72, M.paint, -0.55, g);
  wheelset(0.4, M.paint, 0.9, g);
  g.children.forEach((c) => { c.position.y += top; });
  mesh(new THREE.CylinderGeometry(0.5, 0.5, 2.3, 20).rotateZ(Math.PI / 2), M.paint, [0.1, 1.45 + top, 0], g).rotation.z = 0.08;
  cyl(0.15, 0.17, 2.4, M.iron, [-1.05, 2.55 + top, 0], g);
  box(0.7, 1.1, 1.1, M.iron, [1.35, 1.45 + top, 0], g);
  for (const s of [-1, 1]) cyl(0.09, 0.09, 1.3, M.iron, [0.6, 1.25 + top, s * 0.62], g).rotation.z = 0.7;
  // the tender, a barrel of water on a wooden frame
  const t = new THREE.Group();
  wheelset(0.4, M.iron, -0.6, t);
  wheelset(0.4, M.iron, 0.6, t);
  t.children.forEach((c) => { c.position.y += top; });
  box(2.2, 0.15, 1.6, M.wood, [0, 0.95 + top, 0], t);
  mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.6, 16).rotateZ(Math.PI / 2), M.wood, [0, 1.5 + top, 0], t);
  t.position.x = 3.1;
  g.add(t);
  return g;
}

/** A freight boxcar of today. */
export function boxcar(M) {
  const g = slot('boxcar');
  const top = 0.15;
  for (const x of [-5.6, -4.2, 4.2, 5.6]) wheelset(0.46, M.iron, x, g);
  for (const x of [-4.9, 4.9]) box(2.2, 0.35, 2.2, M.iron, [x, 0.75, 0], g);
  g.children.forEach((c) => { c.position.y += top; });
  box(14, 3.4, 2.9, M.boxcar, [0, 2.75 + top, 0], g);
  for (const s of [-1, 1]) box(2.4, 2.9, 0.04, M.iron, [0, 2.6 + top, s * 1.47], g); // the doors
  return g;
}

/** A flatcar carrying one segment of a Shuttle solid rocket booster, 3.7 m across. */
export function boosterCar(M) {
  const g = slot('booster-car');
  const top = 0.15;
  for (const x of [-6, -4.6, 4.6, 6]) wheelset(0.46, M.iron, x, g);
  g.children.forEach((c) => { c.position.y += top; });
  box(15, 0.35, 2.9, M.iron, [0, 1.3 + top, 0], g);
  for (const x of [-3, 3]) box(0.8, 0.6, 3.1, M.iron, [x, 1.75 + top, 0], g); // cradles
  const r = 1.85, y = 1.5 + top + r;
  mesh(new THREE.CylinderGeometry(r, r, 8.2, 32).rotateZ(Math.PI / 2), M.white, [0, y, 0], g);
  for (const x of [-4.1, 4.1]) mesh(new THREE.CylinderGeometry(r + 0.05, r + 0.05, 0.25, 32).rotateZ(Math.PI / 2), M.iron, [x, y, 0], g);
  return g;
}

/**
 * Track along +x from x0 to x1: sleepers, and the rails just outside the gauge. kind: "iron"
 * (steel on ballast) or "wood" (the wagonways' wooden rails). One InstancedMesh for the sleepers.
 */
export function track(M, x0, x1, kind = 'iron') {
  const g = new THREE.Group();
  const wood = kind === 'wood', step = wood ? 0.9 : 0.65, n = Math.floor((x1 - x0) / step);
  const sl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.24, 0.12, wood ? 1.9 : 2.5), M.sleeper, n);
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) sl.setMatrixAt(i, m.makeTranslation(x0 + (i + 0.5) * step, 0.04, 0));
  g.add(sl);
  const rw = wood ? 0.1 : 0.07, rh = wood ? 0.12 : 0.15;
  for (const s of [-1, 1]) box(x1 - x0, rh - 0.04, rw, wood ? M.wood : M.steel, [(x0 + x1) / 2, rh / 2 + 0.02, s * (GAUGE / 2 + rw / 2)], g);
  if (!wood) box(x1 - x0, 0.06, 3.1, M.ballast, [(x0 + x1) / 2, 0.0, 0], g);
  return g;
}

/** The measure: a brass bar across the gauge with a tick at each end, `y` above the ground. */
export function gaugeBar(M, y = 0.2) {
  const g = new THREE.Group();
  box(0.05, 0.05, GAUGE, M.brass, [0, y, 0], g);
  for (const s of [-1, 1]) box(0.05, 0.3, 0.05, M.brass, [0, y + 0.1, s * GAUGE / 2], g);
  return g;
}

/**
 * A tunnel into a mountain, its mouth toward -x at x = 0: a stone portal about 5 m wide (a little
 * more than the load), black inside, and the mountain behind it, a lumpy dome of rock.
 */
export function tunnel(M) {
  const g = new THREE.Group();
  const face = new THREE.Shape([[-6.5, -1], [6.5, -1], [5, 9.5], [-5, 9.5]].map(([x, y]) => new THREE.Vector2(x, y)));
  const hole = new THREE.Path();
  hole.moveTo(-2.6, -1); hole.lineTo(2.6, -1); hole.lineTo(2.6, 5.2);
  hole.absarc(0, 5.2, 2.6, 0, Math.PI, false);
  hole.lineTo(-2.6, -1);
  face.holes.push(hole);
  const portal = mesh(new THREE.ExtrudeGeometry(face, { depth: 6, bevelEnabled: false }), M.portal, [0, 0, 0], g);
  portal.rotation.y = Math.PI / 2; // the extrusion along +x
  box(30, 8, 5.4, M.dark, [16, 3.5, 0], g); // the dark inside
  // the mountain: a dome pushed in and out by a few waves, so no two sides look alike
  const geo = new THREE.IcosahedronGeometry(1, 5), p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = 1 + 0.09 * Math.sin(v.x * 7 + 1) * Math.cos(v.z * 6) + 0.05 * Math.sin(v.y * 11 + v.x * 5) + 0.03 * Math.sin(v.z * 19 + v.y * 13);
    v.multiplyScalar(n);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const hill = mesh(geo, M.rock, [23, -9, 0], g);
  hill.scale.set(25, 26, 36);
  return g;
}

/** The Shuttle on the pad, just lifting off: the tank, both boosters lit, the orbiter on the -x side. */
export function shuttle(M) {
  const g = new THREE.Group();
  box(40, 7, 30, M.iron, [0, 3.5, 0], g); // the mobile launch platform
  const up = 13; // lifting off
  const st = slot('shuttle', g); // the stack; the flames stay as they are
  cyl(4.2, 4.2, 47, M.tank, [0, up + 23.5, 0], st, 32);
  mesh(new THREE.SphereGeometry(4.2, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.6, 1), M.tank, [0, up + 47, 0], st);
  for (const s of [-1, 1]) {
    cyl(1.85, 1.85, 41, M.white, [0, up + 20.5, s * 6.3], st, 24);
    cyl(0, 1.85, 4.5, M.white, [0, up + 43.25, s * 6.3], st, 24);
    cyl(1.6, 2.2, 3, M.iron, [0, up - 1.5, s * 6.3], st, 24);
    cyl(2.2, 0.2, 14, M.flame, [0, up - 10, s * 6.3], g, 16).rotation.x = Math.PI;
  }
  // the orbiter, nose up, belly to the tank
  const o = new THREE.Group();
  cyl(2.6, 2.6, 30, M.white, [0, 15, 0], o, 24);
  mesh(new THREE.SphereGeometry(2.6, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 2, 1), M.white, [0, 30, 0], o);
  const wing = new THREE.Shape([new THREE.Vector2(-12, 0), new THREE.Vector2(12, 0), new THREE.Vector2(0, 20)]);
  const w = mesh(new THREE.ExtrudeGeometry(wing, { depth: 0.6, bevelEnabled: false }), M.white, [0.3, 1, 0], o);
  w.rotation.y = Math.PI / 2;
  const fin = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0, 9), new THREE.Vector2(-5, 2)]);
  mesh(new THREE.ExtrudeGeometry(fin, { depth: 0.5, bevelEnabled: false }), M.white, [-2.4, 2, -0.25], o);
  o.position.set(-7.3, up + 2, 0);
  st.add(o);
  for (const z of [-1.1, 0, 1.1]) cyl(0.2, 1.4, 6, M.flame, [-7.3, up - 1, z], g, 12).rotation.x = Math.PI; // the orbiter's engines
  return g;
}
