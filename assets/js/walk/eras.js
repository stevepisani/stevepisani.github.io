// The settings the track runs through in "Rockets and Horses", one per era, so each stop looks like
// where and when it is: the Circus Maximus, a street in Pompeii, an English lane between stone
// walls, a pit head and its spoil heap, the grandstand at Rainhill, the prairie, the Utah desert and
// its tunnel, and the pad by the sea in Florida. Built from primitives at real size (metres), drawn
// once; the photographed textures go on later (gauge.js, dressUp). The ground under all of them is
// one plane whose colour and grain change along the track (`ERAS`), blended over a few metres.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { GAUGE } from './sets.js';

// Along the track (x): where each era's ground starts, its tint, and how much of it is bare earth
// rather than grass (0 to 1). Each blends into the next over `BLEND` metres.
const ERAS = [
  [-1600, [1.25, 1.06, 0.8], 1], // the Circus: raked sand
  [-88, [1.08, 0.95, 0.78], 0.85], // Pompeii: dry, dusty
  [-69, [0.8, 1.0, 0.7], 0], // an English lane: green
  [-51, [0.46, 0.43, 0.4], 0.75], // the pits: coal-black earth
  [-33, [0.86, 1.0, 0.74], 0.05], // Rainhill: green
  [-12, [1.2, 1.04, 0.72], 0.25], // the prairie: dry grass
  [20, [1.3, 0.78, 0.55], 1], // Utah: red desert
  [62, [0.78, 0.95, 0.66], 0.35], // Florida, past the ridge: scrub and sand
];
const BLEND = 8, X0 = -160, X1 = 280; // the strip the table covers; beyond it, the ends' looks

// A texture of the table above, one texel a metre: rgb the tint, a the share of bare earth.
function eraTexture() {
  const n = X1 - X0, data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const x = X0 + i + 0.5, tint = [0, 0, 0];
    let earth = 0;
    // each era's weight: on from its start, off at the next's, each change smoothed over BLEND
    const w = ERAS.map(([x0], k) => {
      const next = ERAS[k + 1]?.[0] ?? Infinity, s = (a) => THREE.MathUtils.smoothstep(x, a - BLEND / 2, a + BLEND / 2);
      return s(x0) - s(next);
    });
    ERAS.forEach(([, t, e], k) => { for (let c = 0; c < 3; c++) tint[c] += t[c] * w[k]; earth += e * w[k]; });
    for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round(THREE.MathUtils.clamp(tint[c] / 1.4, 0, 1) * 255);
    data[i * 4 + 3] = Math.round(earth * 255);
  }
  const t = new THREE.DataTexture(data, n, 1);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/**
 * The ground's material: the grass photograph and the bare-earth one (`earth`, once loaded) mixed
 * and tinted along x by era. Without photographs, its colour tinted the same way.
 */
export function groundMaterial(color) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 1 });
  const uniforms = { uEras: { value: eraTexture() }, uEarth: { value: null }, uHasEarth: { value: 0 }, uSpan: { value: new THREE.Vector2(X0, X1 - X0) } };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vEraX;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEraX = (modelMatrix * vec4(position, 1.0)).x;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vEraX;\nuniform sampler2D uEras, uEarth;\nuniform float uHasEarth;\nuniform vec2 uSpan;')
      .replace('#include <map_fragment>', /* glsl */ `
        vec4 era = texture2D(uEras, vec2(clamp((vEraX - uSpan.x) / uSpan.y, 0.0, 1.0), 0.5));
        #ifdef USE_MAP
          vec3 grass = texture2D(map, vMapUv).rgb;
          vec3 earth = uHasEarth > 0.5 ? texture2D(uEarth, vMapUv * 1.7).rgb : grass;
          diffuseColor.rgb *= mix(grass, earth, era.a);
        #endif
        diffuseColor.rgb *= era.rgb * 1.4;`);
  };
  mat.customProgramCacheKey = () => 'eras';
  return mat;
}

// ---- building blocks --------------------------------------------------------------------------

const mesh = (geo, mat, [x, y, z] = [0, 0, 0], parent) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (parent) parent.add(m);
  return m;
};
// UVs in metres (a tile of `tile` metres a repeat), projected along each face's main axis, so a
// photograph keeps one scale on every size of block: its material's maps repeat once a unit.
function metres(geo, tile = 2) {
  if (!geo.attributes.normal) geo.computeVertexNormals();
  geo = geo.index ? geo.toNonIndexed() : geo; // each face its own projection (the normals stay smooth)
  const p = geo.attributes.position, n = geo.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const [u, v] = ay >= ax && ay >= az ? [p.getX(i), p.getZ(i)] : ax >= az ? [p.getZ(i), p.getY(i)] : [p.getX(i), p.getY(i)];
    uv[i * 2] = u / tile; uv[i * 2 + 1] = v / tile;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
// a block w × h × d standing on y (its base), photograph-scaled
const block = (w, h, d, mat, [x, y, z], parent, tile) => mesh(metres(new THREE.BoxGeometry(w, h, d), tile), mat, [x, y + h / 2, z], parent);
// a lumpy, irregular shape: an icosphere pushed in and out by a few waves (seeded, so the same each time)
function lumpy(seed, amount = 0.12, detail = 4, [sx, sy, sz] = [1, 1, 1]) {
  const geo = mergeVertices(new THREE.IcosahedronGeometry(1, detail).deleteAttribute('normal').deleteAttribute('uv')), p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 1 + amount * (Math.sin(v.x * 5.3 + seed) * Math.cos(v.z * 4.1 + seed * 2) + 0.6 * Math.sin(v.y * 9.7 + v.x * 3.1 + seed * 3) + 0.35 * Math.sin(v.z * 17 + v.y * 11 + seed));
    p.setXYZ(i, v.x * k * sx, v.y * k * sy, v.z * k * sz);
  }
  geo.computeVertexNormals();
  return geo;
}
// many copies of one shape as one InstancedMesh: [x, y, z, sx, sy, sz, turn] each
function many(geo, mat, list, parent) {
  const im = new THREE.InstancedMesh(geo, mat, list.length), o = new THREE.Object3D();
  list.forEach(([x, y, z, sx, sy, sz, turn = 0], i) => {
    o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.set(0, turn, 0); o.updateMatrix();
    im.setMatrixAt(i, o.matrix);
  });
  im.computeBoundingSphere();
  parent.add(im);
  return im;
}
const random = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// ---- the eras, Rome first ---------------------------------------------------------------------

/** The Circus Maximus: the sand track, the spina down its middle with its turning posts and obelisk, and the stands. */
function circus(M, g, x0, x1) {
  const z = -9; // the spina's line, the far side of the track the chariot runs on
  block(x1 - x0 - 6, 1.4, 2.6, M.marble, [(x0 + x1) / 2, 0, z], g, 3);
  // the turning posts (metae) at each end: three tall cones on a half-round base
  for (const [x, s] of [[x0 + 1, -1], [x1 - 1, 1]]) {
    mesh(metres(new THREE.CylinderGeometry(2.4, 2.4, 2, 24, 1, false, s < 0 ? 0 : Math.PI, Math.PI), 3), M.marble, [x - s * 2, 1, z], g);
    for (const dz of [-1.2, 0, 1.2]) mesh(new THREE.ConeGeometry(0.55, 6, 16), M.bronze, [x, 5, z + dz], g);
  }
  // the obelisk, halfway along: a tall tapering shaft and its pyramid cap
  const ox = (x0 + x1) / 2;
  block(2.2, 2, 2.2, M.marble, [ox, 1.4, z], g);
  mesh(new THREE.CylinderGeometry(0.95, 1.35, 22, 4, 1).rotateY(Math.PI / 4), M.granite, [ox, 3.4 + 11, z], g);
  mesh(new THREE.ConeGeometry(1.0, 1.6, 4).rotateY(Math.PI / 4), M.bronze, [ox, 3.4 + 22.8, z], g);
  // the stands, far side: rows of seats rising, then the arcaded outer wall
  const rows = new THREE.Shape([[0, 0], [0, 1.2], [2, 1.2], [2, 2.4], [4, 2.4], [4, 3.6], [6, 3.6], [6, 4.8], [8, 4.8], [8, 6], [10, 6], [10, 7.2], [12, 7.2], [12, 8.4], [14, 8.4], [14, 9.6], [16, 9.6], [16, 18], [17.5, 18], [17.5, 0]].map(([a, b]) => new THREE.Vector2(a, b)));
  const st = mesh(metres(new THREE.ExtrudeGeometry(rows, { depth: x1 - x0 + 30, bevelEnabled: false }), 3), M.marble, [x0 - 15, 0, -21], g);
  st.rotation.y = Math.PI / 2; st.scale.z = -1; // the extrusion along +x, the rows rising away from the track
  for (let x = x0 - 13; x < x1 + 14; x += 6) block(1.4, 1.9, 0.3, M.doorway, [x, 0, -21.1], g); // arches at the foot of the stands
  // and the same on the near side, behind you
  const near = mesh(st.geometry, M.marble, [x0 - 15, 0, 30], g);
  near.rotation.y = Math.PI / 2;
}

/** A street in Pompeii: basalt paving between raised kerbs, stepping stones across it, and house fronts. */
function pompeii(M, g, x0, x1) {
  const len = x1 - x0, mid = (x0 + x1) / 2;
  block(len, 0.06, 3.8, M.basalt, [mid, -0.03, 0], g, 3);
  for (const s of [-1, 1]) block(len, 0.38, 1.6, M.kerb, [mid, 0, s * 2.7], g, 2.5);
  // stepping stones: walk across dry-shod; the wheels pass in the gaps between them
  const w = (GAUGE + 0.03) / 2; // the ruts, either side of the middle
  for (const [z, d] of [[0, 0.9], [-(w + 0.62), 0.62], [w + 0.62, 0.62]]) block(0.95, 0.36, d, M.basalt, [x1 - 5.5, 0, z], g, 1);
  // the house fronts across the street, plastered, a dark doorway or shop front in each
  const fronts = [[7, 5.2, M.plaster], [5, 6.4, M.plasterRed], [8, 4.8, M.plaster], [6, 5.8, M.plasterOchre]];
  let x = x0 - 2;
  for (let i = 0; x < x1 + 4; i++) {
    const [fw, fh, mat] = fronts[i % fronts.length];
    block(fw, fh, 0.6, mat, [x + fw / 2, 0, -3.9], g);
    block(fw, 1.0, 0.64, M.plasterRed, [x + fw / 2, 0, -3.9], g); // the red dado
    block(i % 2 ? 3.2 : 1.4, i % 2 ? 2.8 : 2.4, 0.3, M.doorway, [x + fw / 2, 0.38, -3.55], g); // a door, or an open shop
    block(fw + 0.2, 0.25, 1.4, M.roof, [x + fw / 2, fh, -3.5], g); // the tiled eave
    x += fw;
  }
}

/** An English lane in the Middle Ages: a dry-stone wall along the far side, a thatched cottage, a rick of hay. */
function lane(M, g, x0, x1) {
  // the wall, in stretches with a gap for a gate, a little uneven
  for (const [a, b] of [[x0 + 1, x0 + 9.5], [x0 + 12, x1 - 1]]) {
    block(b - a, 1.1, 0.6, M.drystone, [(a + b) / 2, 0, -3.6], g, 1.2);
    block(b - a, 0.18, 0.45, M.drystone, [(a + b) / 2, 1.1, -3.6], g, 0.6); // the coping
  }
  // the cottage: whitewashed walls under a steep thatch
  const cx = x0 + 6, cz = -15;
  block(8, 3, 5, M.whitewash, [cx, 0, cz], g);
  const roof = new THREE.Shape([[-3.6, 0], [3.6, 0], [0, 4.2]].map(([a, b]) => new THREE.Vector2(a, b)));
  mesh(metres(new THREE.ExtrudeGeometry(roof, { depth: 9, bevelEnabled: false }), 1.5), M.thatch, [cx - 4.5, 3, cz], g).rotation.y = Math.PI / 2;
  block(1.1, 1.9, 0.12, M.doorway, [cx + 1.2, 0, cz + 2.52], g);
  block(1.0, 1.0, 1.0, M.drystone, [cx - 2.6, 3.4, cz], g, 1); // the chimney
  // a rick of hay in the field behind the wall
  mesh(metres(lumpy(3, 0.06, 3, [3.2, 2.2, 2.4]), 1.5), M.thatch, [x1 - 4, 1.2, -13], g);
  mesh(metres(new THREE.ConeGeometry(2.6, 1.6, 12), 1.5), M.thatch, [x1 - 4, 3.6, -13], g); // its thatched top
}

/** A colliery of the 1700s: the pit's headframe with its wheel, and the black spoil heap. */
function pit(M, g, x0, x1) {
  const hx = x0 + 10, hz = -13;
  // the headframe: two legs leaning together over the shaft, a back stay, and the wheel at the top
  for (const s of [-1, 1]) {
    const leg = mesh(new THREE.BoxGeometry(0.35, 11, 0.35), M.oak, [hx + s * 1.6, 5.3, hz], g);
    leg.rotation.z = s * 0.14;
    const stay = mesh(new THREE.BoxGeometry(0.3, 12, 0.3), M.oak, [hx + s * 1.2, 5, hz + 3.2], g);
    stay.rotation.x = 0.55;
  }
  block(4.6, 0.3, 0.4, M.oak, [hx, 10.2, hz], g);
  const wheel = new THREE.Group();
  mesh(new THREE.TorusGeometry(1.5, 0.09, 8, 32), M.iron, [0, 0, 0], wheel);
  for (let i = 0; i < 4; i++) mesh(new THREE.BoxGeometry(0.08, 3, 0.08), M.iron, [0, 0, 0], wheel).rotation.z = (i * Math.PI) / 4;
  wheel.position.set(hx, 11.2, hz);
  g.add(wheel);
  block(4, 0.5, 4, M.oak, [hx, 0, hz], g); // the shaft's timber collar
  // the rope down from the wheel into the shaft
  mesh(new THREE.CylinderGeometry(0.03, 0.03, 10.6, 6), M.iron, [hx + 1.5, 5.6, hz], g);
  // the spoil heap: a long, low ridge of black waste
  mesh(lumpy(9, 0.08, 4, [13, 9, 8]), M.coal, [x1 - 2, -2, -24], g);
  // and coal spilled by the rails
  const rnd = random(23), lumps = [];
  for (let i = 0; i < 40; i++) lumps.push([x0 + rnd() * (x1 - x0), 0.03, (rnd() < 0.5 ? -1 : 1) * (1.3 + rnd() * 1.4), 0.12 + rnd() * 0.12, 0.08, 0.12 + rnd() * 0.1, rnd() * 3]);
  many(new THREE.IcosahedronGeometry(1, 0), M.coal, lumps, g);
}

/** Rainhill, 1829: the grandstand put up for the trials, across the line. */
function rainhill(M, g, x0) {
  const sx = x0 + 9, sz = -10, w = 16;
  for (let r = 0; r < 5; r++) block(w, 0.5 + r * 0.55, 1.1, M.oak, [sx, 0, sz - r * 1.1], g, 1.5); // the rising benches
  block(w, 0.1, 6.4, M.oak, [sx, 5, sz - 2.2], g, 1.5); // the roof
  for (const x of [-w / 2 + 0.2, -w / 4, 0, w / 4, w / 2 - 0.2]) for (const z of [0.4, -4.8]) block(0.2, 5, 0.2, M.oak, [sx + x, 0, sz + z], g);
  // its flags along the roof's edge
  const colours = [M.flagRed, M.flagCream, M.flagBlue];
  for (let i = 0; i < 7; i++) {
    const x = sx - w / 2 + 1 + i * ((w - 2) / 6);
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 6), M.oak, [x, 5.9, sz + 0.5], g);
    mesh(new THREE.PlaneGeometry(0.8, 0.5), colours[i % 3], [x + 0.4, 6.5, sz + 0.5], g);
  }
}

/** Telegraph poles along the line, every 32 m from x0 to x1, and their wires sagging between them. */
function poles(M, g, x0, x1) {
  const at = [];
  for (let x = x0; x < x1; x += 32) at.push(x);
  const pole = new THREE.CylinderGeometry(0.11, 0.15, 9, 8), arm = new THREE.BoxGeometry(0.12, 0.12, 2.4);
  for (const x of at) {
    mesh(pole, M.pole, [x, 4.5, -4.2], g);
    mesh(arm, M.pole, [x, 8.4, -4.2], g);
  }
  const pts = [], sag = (t) => 8.5 - 0.5 * Math.sin(t * Math.PI);
  for (const dz of [-1, -0.35, 0.35, 1]) for (let i = 0; i < at.length - 1; i++) for (let k = 0; k < 8; k++) {
    const t0 = k / 8, t1 = (k + 1) / 8, x = (t) => at[i] + (at[i + 1] - at[i]) * t;
    pts.push(new THREE.Vector3(x(t0), sag(t0), -4.2 + dz), new THREE.Vector3(x(t1), sag(t1), -4.2 + dz));
  }
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), M.wire));
}

/** The Utah desert: sagebrush on red ground, the ridge, and the tunnel's concrete portal. */
function desert(M, g, x0, tunnelX) {
  const rnd = random(31), bush = [];
  for (let i = 0; i < 320; i++) {
    const x = x0 + rnd() * (tunnelX - 3 - x0), z = (rnd() < 0.5 ? -1 : 1) * (4 + rnd() * rnd() * 60), k = 0.25 + rnd() * rnd() * 0.5;
    bush.push([x, k * 0.3, z, k * (0.8 + rnd() * 0.5), k * 0.6, k * (0.8 + rnd() * 0.5), rnd() * 6]);
  }
  many(lumpy(2, 0.35, 1), M.sage, bush, g);
  poles(M, g, x0 + 4, tunnelX - 4);
  // the ridge the line runs into: long across the way, steep at the front, its rock red and layered
  mesh(metres(lumpy(4, 0.1, 5, [26, 30, 75]), 10), M.redrock, [tunnelX + 25, -6, 0], g);
  // the portal: a concrete face with an arched opening a little wider than one train, its wing
  // walls holding back the rock, and the dark inside
  const face = new THREE.Shape([[-7, 0], [7, 0], [7, 10.5], [-7, 10.5]].map(([a, b]) => new THREE.Vector2(a, b)));
  const hole = new THREE.Path();
  hole.moveTo(-2.6, 0); hole.lineTo(2.6, 0); hole.lineTo(2.6, 5.2);
  hole.absarc(0, 5.2, 2.6, 0, Math.PI, false);
  hole.lineTo(-2.6, 0);
  face.holes.push(hole);
  const portal = mesh(metres(new THREE.ExtrudeGeometry(face, { depth: 1.2, bevelEnabled: false }), 2), M.concrete, [tunnelX, 0, 0], g);
  portal.rotation.y = Math.PI / 2; // facing -x, down the line
  block(1.6, 0.6, 14.4, M.concrete, [tunnelX + 0.5, 10.5, 0], g, 2); // the coping along its top
  for (const s of [-1, 1]) {
    const wing = block(9, 6, 0.8, M.concrete, [tunnelX - 3.2, 0, s * 9.4], g, 2);
    wing.rotation.y = s * 0.5;
  }
  block(1.2, 7.8, 5.2, M.dark, [tunnelX + 1.2, 0, 0], g); // the dark beyond the arch
  mesh(metres(lumpy(6, 0.12, 3, [7, 9, 10]), 10), M.redrock, [tunnelX + 7, 2, 0], g); // the rock right behind the face
}

/** The pad in Florida: the concrete hardstand and flame trench, the service tower, the exhaust, and the sea. */
function pad(M, g, padX, x1) {
  // the hardstand, the trench across it, the crawlerway's gravel up to it
  block(70, 0.4, 90, M.concrete, [padX, -0.38, 0], g, 4);
  block(30, 0.05, 20, M.ballast, [padX - 50, -0.02, 0], g, 2);
  // the fixed service structure: a square steel lattice beside the stack, its lightning mast on top
  const tx = padX, tz = -19, H = 75, side = 10, bars = [], beam = new THREE.BoxGeometry(1, 1, 1);
  for (const [cx, cz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) bars.push([tx + (cx * side) / 2, H / 2, tz + (cz * side) / 2, 0.7, H, 0.7]);
  for (let y = 0; y <= H; y += 6) {
    for (const s of [-1, 1]) {
      bars.push([tx, y, tz + (s * side) / 2, side, 0.45, 0.45]);
      bars.push([tx + (s * side) / 2, y, tz, 0.45, 0.45, side]);
    }
    if (y % 12 === 0) bars.push([tx, y, tz, side, 0.25, side]); // a deck every other level
  }
  many(beam, M.tower, bars, g);
  // the crossed braces up each face, as one tilted bar per bay
  const brace = new THREE.CylinderGeometry(0.18, 0.18, Math.hypot(side, 6), 6);
  for (let y = 0; y < H; y += 6) for (const s of [-1, 1]) {
    const b = mesh(brace, M.tower, [tx, y + 3, tz + (s * side) / 2], g);
    b.rotation.z = (s * (y % 12 ? 1 : -1)) * Math.atan2(side, 6);
    const c = mesh(brace, M.tower, [tx + (s * side) / 2, y + 3, tz], g);
    c.rotation.x = (s * (y % 12 ? 1 : -1)) * Math.atan2(side, 6);
  }
  block(3, 1.2, 12, M.tower, [tx, H - 14, tz + 9], g); // the access arm out to the tank's top
  mesh(new THREE.CylinderGeometry(0.25, 0.6, 24, 8), M.tower, [tx, H + 12, tz], g); // the lightning mast
  // the exhaust: billows of steam and smoke rolling out of the trench both ways
  const rnd = random(5), puffs = [];
  for (let i = 0; i < 26; i++) {
    const s = rnd() < 0.5 ? -1 : 1, d = 10 + rnd() * 50, k = 4 + rnd() * 6 + d * 0.08;
    puffs.push([padX + (rnd() - 0.5) * 18, k * 0.6, s * d, k * 1.2, k, k, rnd() * 6]);
  }
  many(lumpy(8, 0.22, 3), M.cloud, puffs, g);
  // the beach, and the Atlantic beyond it
  block(40, 0.1, 3000, M.sand, [x1 + 20, -0.06, 0], g, 4);
  const sea = mesh(new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2), M.sea, [x1 + 1540, 0.02, 0], g);
  sea.receiveShadow = true;
}

/**
 * Every era's setting, each its own group, by the stop it's round (gauge.js SCENES); `x` says
 * where each stop stands on the track. gauge.js shows a setting only near its stop, so one era's
 * buildings never stand behind another's.
 */
export function eras(M, x) {
  const sets = {}, add = (name, build, ...a) => { const g = new THREE.Group(); build(M, g, ...a); sets[name] = g; };
  add('horses', circus, -128, x.ruts - 10);
  add('ruts', pompeii, x.ruts - 10, x.ruts + 9);
  add('wagon', lane, x.wagon - 9, x.wagon + 9);
  add('tram', pit, x.tram - 9, x.tram + 9);
  add('locomotive', rainhill, x.locomotive - 9);
  add('rails', poles, x.rails - 8, x.rails + 30);
  add('booster', desert, x.rails + 20, x.tunnel);
  add('shuttle', pad, x.shuttle, x.shuttle + 95);
  for (const g of Object.values(sets)) g.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  return sets;
}

/** The materials the settings use, beyond the walk's own (gauge.js materials()). */
export function eraMaterials(std) {
  return {
    marble: std(0xd8cfbf), granite: std(0x9a6f62), bronze: std(0x8a6a3a, { metalness: 0.6, roughness: 0.45 }),
    basalt: std(0x5b5a58), kerb: std(0x8c877d), plaster: std(0xd9c7a6), plasterRed: std(0x8e3b2a), plasterOchre: std(0xc49a55), doorway: std(0x2a2119, { roughness: 1 }), roof: std(0x9a5a3a),
    drystone: std(0x9b9284), whitewash: std(0xe6e1d4), thatch: std(0xb08a4a), oak: std(0x6b4a2e), coal: std(0x1c1b1a, { roughness: 0.9 }),
    flagRed: std(0xa3302a, { side: THREE.DoubleSide }), flagCream: std(0xe8dcc0, { side: THREE.DoubleSide }), flagBlue: std(0x2f4a7a, { side: THREE.DoubleSide }),
    pole: std(0x5a4632), wire: new THREE.LineBasicMaterial({ color: 0x2a2a2a }), concrete: std(0xbdb8ae),
    redrock: std(0xc27a52), sage: std(0x5d6650, { roughness: 1 }), tower: std(0x8f9499, { metalness: 0.5, roughness: 0.55 }),
    cloud: std(0xf3f1ec, { roughness: 1 }), sand: std(0xe2cfa4), sea: std(0x2f5f74, { roughness: 0.12, metalness: 0.1 }),
  };
}
