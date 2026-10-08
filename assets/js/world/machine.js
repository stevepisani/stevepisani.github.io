// The cutaway: a notch cut out of the planet beside the campfire trail (planet.js `CUT`), and what
// it shows: the planet is a machine. The cut's walls are the cross-section (moss, then lava rock,
// then a brass seam and the riveted steel hull below), its edge trimmed with a brass lip. Down on
// the floor, 5 m below: brass gears turning, a row of pistons pumping, a glowing core in a glass
// tube with a governor spinning on top, copper pipes and a panel of lamps. A short spur off the
// trail turns into a steel catwalk on scaffold legs, out over it to a railed platform above the
// core; a railing round the rest of the edge keeps you from walking off into it. Built in the
// cut's own frame (x across it along the catwalk, y up, z along e2), then set on the planet.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE, pbr, glow, chrome } from './materials.js';
import { CUT, RADIUS, surfaceRadius } from './planet.js';
import { lampLit } from './lamps.js';

const [HX, HZ] = CUT.half, DEPTH = CUT.depth;
const DECK_W = 1.1;                         // the catwalk's width
const WALK = { from: -HX - 0.5, to: -1.4 }; // along x: off the trail to the platform
const PLAT = { x0: -1.4, x1: 0.1, z: 1.0 }; // the platform at the end, looking across and down at the core

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, repeat) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

/** The cross-section, top to bottom over DEPTH metres: moss, soil, lava rock, a brass seam, riveted hull plates. */
function strataTexture() {
  const [c, g] = canvas(256, 512), m = 512 / DEPTH; // px per metre down
  const band = (y0, y1, col) => { g.fillStyle = col; g.fillRect(0, y0 * m, 256, (y1 - y0) * m); };
  band(0, 0.12, '#2c4a26'); band(0.12, 0.45, '#3b2a1c'); band(0.45, 1.8, '#2a211d'); band(1.8, 1.95, '#9b7330'); band(1.95, DEPTH, '#3a3f45');
  let seed = 5; const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(${r() < 0.2 ? '90,40,25' : '8,6,5'},${0.3 + r() * 0.5})`; g.beginPath(); g.arc(r() * 256, (0.45 + r() * 1.35) * m, 1 + r() * 4, 0, 7); g.fill(); } // vesicles in the rock
  for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(20,14,10,${0.3 + r() * 0.4})`; g.fillRect(r() * 256, (0.12 + r() * 0.3) * m, 2 + r() * 6, 1 + r() * 2); } // stones in the soil
  // hull plates: seams every metre, rivets along them
  g.strokeStyle = 'rgba(15,17,20,.8)'; g.lineWidth = 3;
  for (let y = 1.95; y < DEPTH; y += 1) { g.beginPath(); g.moveTo(0, y * m); g.lineTo(256, y * m); g.stroke(); }
  for (let x = 0; x <= 256; x += 128) { g.beginPath(); g.moveTo(x, 1.95 * m); g.lineTo(x, DEPTH * m); g.stroke(); }
  g.fillStyle = '#7b828a';
  for (let y = 2.05; y < DEPTH; y += 1) for (let x = 8; x < 256; x += 16) { g.beginPath(); g.arc(x, y * m, 2.2, 0, 7); g.fill(); }
  for (let x = 4; x < 256; x += 12) { g.fillStyle = '#c99a45'; g.beginPath(); g.arc(x, 1.875 * m, 2, 0, 7); g.fill(); } // the brass seam's rivets
  return tex(c);
}

/** A gear: an extruded toothed disc with a hub hole. */
function gearGeometry(r, teeth, thick) {
  const s = new THREE.Shape(), tooth = r * 0.12;
  for (let i = 0; i <= teeth * 4; i++) {
    const a = (i / (teeth * 4)) * Math.PI * 2, out = (i % 4 === 1 || i % 4 === 2) ? r + tooth : r;
    const x = Math.cos(a) * out, y = Math.sin(a) * out;
    i ? s.lineTo(x, y) : s.moveTo(x, y);
  }
  const hole = new THREE.Path(); hole.absarc(0, 0, r * 0.18, 0, Math.PI * 2, true); s.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1, curveSegments: 4 });
  return geo.translate(0, 0, -thick / 2);
}

export function buildMachine({ quality }) {
  const group = new THREE.Group();
  group.name = 'machine';
  // its frame on the planet: origin where the middle of the ground was, y up, x across along the catwalk
  const R0 = surfaceRadius(CUT.up);
  group.position.copy(CUT.up).multiplyScalar(R0);
  group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(CUT.e1, CUT.up, CUT.e2));
  group.updateMatrixWorld(true);
  const inv = group.matrixWorld.clone().invert();
  // the cut's geometry, in this frame: a point at (x, z) on the tangent plane, out along its ray
  const ray = (x, z) => CUT.up.clone().multiplyScalar(RADIUS).addScaledVector(CUT.e1, x).addScaledVector(CUT.e2, z).normalize();
  const at = (dir, r) => dir.clone().multiplyScalar(r).applyMatrix4(inv);
  const ground = (x, z) => { const d = ray(x, z); return at(d, surfaceRadius(d)); };          // the planet's surface there
  const floorR = (d) => (R0 - DEPTH) / d.dot(CUT.up);                                           // the flat floor, along a ray
  const floorAt = (x, z) => { const d = ray(x, z); return at(d, floorR(d)); };

  const M = {
    strata: pbr({ map: strataTexture(), roughness: 0.9, side: THREE.DoubleSide }),
    deck: pbr({ color: 0x2c3036, metalness: 0.35, roughness: 0.6 }),
    brass: pbr({ color: PALETTE.brass, metalness: 0.85, roughness: 0.35 }),
    copper: pbr({ color: 0xb06a3f, metalness: 0.85, roughness: 0.4 }),
    steel: pbr({ color: 0x5d646c, metalness: 0.75, roughness: 0.45 }),
    dark: pbr({ color: 0x1b1e22, metalness: 0.5, roughness: 0.6 }),
    teal: pbr({ color: PALETTE.tinTeal, metalness: 0.3, roughness: 0.4 }),
    cream: pbr({ color: PALETTE.cream, roughness: 0.5 }),
    grate: pbr({ color: 0x8a9198, metalness: 0.7, roughness: 0.45 }),
    rail: chrome({ roughness: 0.35 }),
    glass: pbr({ color: 0x9fd8e0, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1, depthWrite: false }),
    amberGlow: glow(PALETTE.amber, 4),
    aquaGlow: glow(PALETTE.aqua, 3),
  };
  M.lip = pbr({ color: PALETTE.brass, metalness: 0.8, roughness: 0.4, side: THREE.DoubleSide });
  // the core's glow and the lamps over the gears light it all; metal catches them as glints
  for (const k of ['strata', 'dark', 'teal', 'cream']) lampLit(M[k]);
  for (const k of ['deck', 'brass', 'copper', 'steel', 'grate', 'rail', 'lip']) lampLit(M[k], { specular: 24 });
  const add = (geo, mat, parent = group) => { const m = new THREE.Mesh(geo, mat); m.castShadow = quality.high; m.receiveShadow = true; parent.add(m); return m; };

  /* ---------- The cut: four walls down to the floor, the floor, a brass lip round the edge ---------- */
  {
    const N = 24, edges = [[[-HX, -HZ], [HX, -HZ]], [[HX, -HZ], [HX, HZ]], [[HX, HZ], [-HX, HZ]], [[-HX, HZ], [-HX, -HZ]]];
    for (const [[x0, z0], [x1, z1]] of edges) {
      const pos = [], uv = [], idx = [];
      for (let i = 0; i <= N; i++) {
        const k = i / N, x = x0 + (x1 - x0) * k, z = z0 + (z1 - z0) * k, d = ray(x, z);
        const top = at(d, surfaceRadius(d) + 0.02), bot = at(d, floorR(d));
        const along = Math.hypot(x1 - x0, z1 - z0) * k;
        pos.push(top.x, top.y, top.z, bot.x, bot.y, bot.z);
        uv.push(along / 2, 1, along / 2, 1 - top.distanceTo(bot) / DEPTH); // the strata by metres down
        if (i) idx.push((i - 1) * 2, (i - 1) * 2 + 1, i * 2, i * 2, (i - 1) * 2 + 1, i * 2 + 1);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      add(g, M.strata);
    }
    M.strata.map.wrapS = THREE.RepeatWrapping;
    // the floor: deck plates at the bottom
    const c = [floorAt(-HX, -HZ), floorAt(HX, -HZ), floorAt(HX, HZ), floorAt(-HX, HZ)];
    const fg = new THREE.BufferGeometry().setFromPoints([c[0], c[1], c[2], c[0], c[2], c[3]]);
    fg.computeVertexNormals();
    if (fg.attributes.normal.getY(0) < 0) { fg.index = null; fg.setFromPoints([c[0], c[2], c[1], c[0], c[3], c[2]]); fg.computeVertexNormals(); }
    add(fg, M.deck);
    // the lip: a brass band over the ragged edge of the ground, a little in and out of it
    const lipGeo = new THREE.BufferGeometry(), lp = [], li = [];
    const ring = [];
    for (const [[x0, z0], [x1, z1]] of edges) for (let i = 0; i < N; i++) { const k = i / N; ring.push([x0 + (x1 - x0) * k, z0 + (z1 - z0) * k]); }
    ring.forEach(([x, z]) => {
      const o = [Math.sign(x) * (Math.abs(x) >= HX - 1e-6 ? 0.22 : 0), Math.sign(z) * (Math.abs(z) >= HZ - 1e-6 ? 0.22 : 0)];
      const outer = ground(x + o[0], z + o[1]), inner = ground(x - o[0] * 0.3, z - o[1] * 0.3);
      lp.push(outer.x, outer.y + 0.05, outer.z, inner.x, inner.y + 0.05, inner.z);
    });
    for (let i = 0; i < ring.length; i++) { const a = i * 2, b = ((i + 1) % ring.length) * 2; li.push(a, b, a + 1, b, b + 1, a + 1); }
    lipGeo.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    lipGeo.setIndex(li);
    lipGeo.computeVertexNormals();
    add(lipGeo, M.lip);
  }

  /* ---------- The machine, on the floor ---------- */
  const base = floorAt(0, 0);                          // the floor's middle
  const machine = new THREE.Group();
  machine.position.copy(base);
  group.add(machine);
  const animated = [];
  // a great gear train along the far wall, meshing, turning slowly
  {
    const gears = [[1.35, 28, -1.3, 2.1], [0.85, 18, 0.95, 1.55], [0.55, 12, 2.3, 2.25]];
    let prevAng = 0, prevR = 0;
    gears.forEach(([r, teeth, x, y], i) => {
      const gear = add(gearGeometry(r, teeth, 0.22), M.brass, machine);
      gear.position.set(x, y, 1.45);
      add(new THREE.CylinderGeometry(0.12, 0.12, 0.6, 12).rotateX(Math.PI / 2), M.steel, gear); // its axle
      const ratio = i ? -prevR / r : 1;
      const speed = 0.25 * (i ? ratio * (gears[i - 1].speed || 1) : 1);
      gears[i].speed = speed;
      gear.rotation.z = (i % 2) * (Math.PI / teeth);
      animated.push((t) => { gear.rotation.z = (i % 2) * (Math.PI / teeth) + t * speed; });
      prevR = r; prevAng = 0;
      // a stand from the floor to the axle
      add(new THREE.BoxGeometry(0.18, y, 0.18), M.dark, machine).position.set(x, y / 2, 1.75);
    });
    void prevAng;
  }
  // the core: a tall glass tube with a glowing column in it, ringed in brass, a governor spinning on top
  const coreAt = new THREE.Vector3(1.05, 0, -0.35);
  {
    const core = new THREE.Group();
    core.position.copy(coreAt);
    machine.add(core);
    add(new THREE.CylinderGeometry(0.75, 0.9, 0.35, 32), M.brass, core).position.y = 0.17;
    add(new THREE.CylinderGeometry(0.6, 0.6, 2.9, 32, 1, true), M.glass, core).position.y = 1.8;
    const column = add(new THREE.CylinderGeometry(0.16, 0.16, 2.6, 16), M.amberGlow, core);
    column.position.y = 1.75;
    column.castShadow = false;
    for (const y of [0.6, 1.4, 2.2, 3.0]) { const ringM = add(new THREE.TorusGeometry(0.62, 0.05, 8, 40).rotateX(Math.PI / 2), M.brass, core); ringM.position.y = y; }
    const plasma = [];
    for (let i = 0; i < 3; i++) { const p = add(new THREE.TorusGeometry(0.3, 0.025, 6, 32).rotateX(Math.PI / 2), M.aquaGlow, core); p.castShadow = false; plasma.push(p); }
    add(new THREE.CylinderGeometry(0.7, 0.75, 0.3, 32), M.brass, core).position.y = 3.35;
    // the governor: two balls on arms, spinning, flying out as it goes
    const gov = new THREE.Group();
    gov.position.y = 3.5;
    core.add(gov);
    add(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 8), M.steel, gov).position.y = 0.45;
    const arms = [-1, 1].map((sd) => {
      const arm = new THREE.Group(); arm.position.y = 0.85; gov.add(arm);
      const rod = add(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 6), M.steel, arm);
      rod.position.set(sd * 0.3, -0.15, 0); rod.rotation.z = sd * 1.0;
      add(new THREE.SphereGeometry(0.11, 16, 12), M.brass, arm).position.set(sd * 0.55, -0.32, 0);
      return arm;
    });
    animated.push((t) => {
      gov.rotation.y = t * 2.4;
      const fly = 0.12 * Math.sin(t * 0.7);
      arms[0].rotation.z = -fly; arms[1].rotation.z = fly;
      plasma.forEach((p, i) => { p.position.y = 0.5 + ((t * 0.5 + i / 3) % 1) * 2.5; p.scale.setScalar(0.8 + 0.4 * Math.sin(t * 3 + i)); });
      column.material.color.copy(M.amberGlowBase).multiplyScalar(0.85 + 0.15 * Math.sin(t * 5.3) * Math.sin(t * 2.1));
    });
    M.amberGlowBase = M.amberGlow.color.clone();
  }
  // a row of pistons by the near wall, pumping one after another, on a manifold
  {
    add(new THREE.BoxGeometry(3.2, 0.5, 0.7), M.teal, machine).position.set(-1.0, 0.25, -1.55);
    for (let i = 0; i < 4; i++) {
      const x = -2.3 + i * 0.85;
      add(new THREE.CylinderGeometry(0.22, 0.22, 1.1, 20), M.cream, machine).position.set(x, 1.05, -1.55);
      const rod = new THREE.Group(); machine.add(rod);
      add(new THREE.CylinderGeometry(0.07, 0.07, 1.2, 10), M.rail, rod).position.y = 0.6;
      add(new THREE.CylinderGeometry(0.16, 0.16, 0.2, 16), M.brass, rod).position.y = 1.25;
      animated.push((t) => { rod.position.set(x, 1.5 + 0.35 * (0.5 + 0.5 * Math.sin(t * 2.2 - i * 1.57)), -1.55); });
    }
  }
  // copper pipes: from the manifold up the wall, along, into the core
  {
    const pipe = (pts, r = 0.07) => add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 48, r, 8), M.copper, machine);
    pipe([[-2.6, 0.4, -1.55], [-2.9, 0.4, -1.2], [-3.0, 2.6, -1.1], [-2.0, 3.2, -0.8], [0.4, 3.0, -0.4], [0.9, 2.6, -0.35]]);
    pipe([[0.6, 0.45, -1.55], [0.9, 0.45, -1.0], [1.05, 0.4, -0.9]], 0.09);
    pipe([[-1.6, 0.3, 1.2], [-0.4, 0.3, 0.6], [0.5, 0.3, 0.1], [0.7, 0.3, -0.2]], 0.06);
    pipe([[2.6, 0.5, 1.6], [2.8, 2.5, 1.0], [2.5, 3.2, 0.0], [1.7, 3.1, -0.3]], 0.06);
  }
  // a panel of lamps on the end wall, blinking in turn
  {
    const panel = new THREE.Group(); panel.position.set(-2.95, 1.6, 0.0); panel.rotation.y = Math.PI / 2; machine.add(panel);
    add(new THREE.BoxGeometry(1.6, 1.0, 0.12), M.dark, panel);
    const bulbs = [];
    for (let i = 0; i < 12; i++) {
      const on = glow(i % 3 ? PALETTE.amber : PALETTE.coral, 3), off = pbr({ color: 0x3a2a1e, roughness: 0.5 });
      const b = add(new THREE.SphereGeometry(0.05, 10, 8), off, panel); b.position.set(-0.6 + (i % 6) * 0.24, i < 6 ? 0.2 : -0.15, 0.08); b.castShadow = false;
      bulbs.push([b, on, off]);
    }
    const dial = add(new THREE.CircleGeometry(0.14, 24), glow(PALETTE.cream, 1.2), panel); dial.position.set(0.62, 0.0, 0.07);
    animated.push((t) => bulbs.forEach(([b, on, off], i) => { const lit = Math.floor(t * 3 + i * 0.7) % 4 === 0; if (b.material !== (lit ? on : off)) b.material = lit ? on : off; }));
    for (const [b] of bulbs) b.userData.noBatch = true;
  }

  // work lamps in cages high on the walls, so the tops of things catch light too
  const workLamps = [[2.2, 3.9, HZ - 0.12, Math.PI], [-1.2, 3.9, -HZ + 0.12, 0], [HX - 0.12, 3.6, -1.6, -Math.PI / 2]].map(([x, y, z, ry]) => {
    const lamp = new THREE.Group(); lamp.position.set(x, y, z); lamp.rotation.y = ry; machine.add(lamp);
    add(new THREE.BoxGeometry(0.2, 0.06, 0.16), M.dark, lamp).position.z = 0.02;
    const bulb = add(new THREE.SphereGeometry(0.07, 12, 8), glow(PALETTE.amber, 3), lamp); bulb.position.set(0, -0.08, 0.12); bulb.castShadow = false;
    for (let k = 0; k < 4; k++) { const w = add(new THREE.TorusGeometry(0.1, 0.008, 4, 16, Math.PI), M.steel, lamp); w.position.set(0, -0.08, 0.12); w.rotation.set(Math.PI / 2, k * Math.PI / 4, 0); }
    return new THREE.Vector3(x, y - 0.3, z).add(new THREE.Vector3(0, 0, 0.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry));
  });

  /* ---------- The catwalk: a steel grating at ground level on scaffold legs, out to a platform ---------- */
  const colliders = [];
  const solids = []; // for physics.js addFixed, in this frame
  {
    // deck strips that follow the ground's own height, so you walk exactly on them: a steel
    // grating, real bars (one mesh a strip), so you see down through it into the machine
    const strip = (x0, x1, z0, z1) => {
      const parts = [], box = (len, w, a, b) => { // a bar from a to b, w wide, 3 cm thick
        const g = new THREE.BoxGeometry(len, 0.03, w), m = new THREE.Matrix4();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), b.clone().sub(a).normalize());
        parts.push(g.applyMatrix4(m.compose(a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, -0.005, 0)), q, new THREE.Vector3(1, 1, 1))));
      };
      const n = Math.max(2, Math.ceil((x1 - x0) / 0.5));
      for (let k = 0; k <= Math.ceil((z1 - z0) / 0.18); k++) { // bars along, every 18 cm, in half-metre lengths
        const z = Math.min(z1, z0 + k * 0.18);
        for (let i = 0; i < n; i++) { const a = ground(x0 + (x1 - x0) * (i / n), z), b = ground(x0 + (x1 - x0) * ((i + 1) / n), z); box(a.distanceTo(b), 0.035, a, b); }
      }
      for (let x = x0 + 0.05; x < x1; x += 0.1) { // cross bars every 10 cm
        const a = ground(x, z0), b = ground(x, z1), g = new THREE.BoxGeometry(0.012, 0.025, b.distanceTo(a));
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), b.clone().sub(a).normalize());
        parts.push(g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1))));
      }
      add(mergeGeometries(parts), M.grate);
      // its frame: two steel edges
      for (const z of [z0, z1]) {
        const a = ground(x0, z), b = ground(x1, z), mid = a.clone().add(b).multiplyScalar(0.5), len = a.distanceTo(b);
        const e = add(new THREE.BoxGeometry(len, 0.12, 0.06), M.steel); e.position.copy(mid).add(new THREE.Vector3(0, -0.05, 0)); e.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), b.clone().sub(a).normalize());
      }
      solids.push({ cuboid: [(x1 - x0) / 2, 0.04, (z1 - z0) / 2], at: [(x0 + x1) / 2, ground((x0 + x1) / 2, (z0 + z1) / 2).y - 0.03, (z0 + z1) / 2] });
    };
    strip(WALK.from, WALK.to + 0.01, -DECK_W / 2, DECK_W / 2);
    strip(PLAT.x0, PLAT.x1, -PLAT.z, PLAT.z);
    // scaffold: legs from the deck down to the floor, braced
    const leg = (x, z) => {
      const top = ground(x, z), bot = floorAt(x, z);
      const l = add(new THREE.CylinderGeometry(0.045, 0.045, top.y - bot.y, 8), M.steel); l.position.set(x, (top.y + bot.y) / 2, z);
      return [top, bot];
    };
    const legs = [];
    for (const x of [-HX + 0.6, -2.5, PLAT.x0, PLAT.x1]) for (const z of (x >= PLAT.x0 ? [-PLAT.z, PLAT.z] : [-DECK_W / 2, DECK_W / 2])) legs.push([x, z, leg(x, z)]);
    for (let i = 0; i + 2 < legs.length; i += 2) {
      for (const k of [0, 1]) { // a diagonal brace down each side
        const [, , [ta]] = legs[i + k], [, , [, bb]] = legs[i + 2 + k];
        const brace = add(new THREE.CylinderGeometry(0.03, 0.03, ta.distanceTo(bb), 6), M.steel);
        brace.position.copy(ta).add(bb).multiplyScalar(0.5);
        brace.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), bb.clone().sub(ta).normalize());
      }
    }
    // railings: posts and two rails, down each side of the catwalk, round the platform (open where you come on) and round the cut's edge (open where the catwalk leaves the trail)
    const railLine = (pts, closed) => {
      const P = pts.map(([x, z]) => ground(x, z));
      for (let i = 0; i < P.length - (closed ? 0 : 1); i++) {
        const a = P[i], b = P[(i + 1) % P.length], len = a.distanceTo(b);
        for (const h of [0.5, 1.0]) {
          const r = add(new THREE.CylinderGeometry(0.025, 0.025, len, 6), M.rail);
          r.position.copy(a).add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, h, 0));
          r.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        }
        // posts about every metre, and colliders every half metre so you can't squeeze through
        const n = Math.max(1, Math.round(len / 1));
        for (let k = 0; k <= n; k++) { const p = a.clone().lerp(b, k / n); add(new THREE.CylinderGeometry(0.035, 0.035, 1.05, 8), M.rail).position.copy(p).add(new THREE.Vector3(0, 0.52, 0)); }
        const m = Math.max(1, Math.ceil(len / 0.45));
        for (let k = 0; k <= m; k++) colliders.push(a.clone().lerp(b, k / m));
      }
    };
    const w = DECK_W / 2;
    railLine([[-HX + 0.05, -w], [PLAT.x0, -w], [PLAT.x0, -PLAT.z], [PLAT.x1, -PLAT.z], [PLAT.x1, PLAT.z], [PLAT.x0, PLAT.z], [PLAT.x0, w], [-HX + 0.05, w]], false);
    railLine([[-HX - 0.15, -w - 0.05], [-HX - 0.15, -HZ - 0.15], [HX + 0.15, -HZ - 0.15], [HX + 0.15, HZ + 0.15], [-HX - 0.15, HZ + 0.15], [-HX - 0.15, w + 0.05]], false);
  }

  /* ---------- Into world space ---------- */
  group.updateMatrixWorld(true);
  const toWorld = (v) => v.clone().applyMatrix4(group.matrixWorld);
  const coreWorld = toWorld(base.clone().add(coreAt).add(new THREE.Vector3(0, 1.8, 0)));
  return {
    group,
    machine,
    /** Player colliders: the railings (physics.js stands them up to rail height). */
    colliders: colliders.map((p) => ({ center: toWorld(p), radius: 0.08, height: 1.1 })),
    /** Fixed things a thrown coconut meets, in this frame (physics.addFixed): the floor, the walls, the catwalk. */
    solids: [
      ...solids,
      { cuboid: [HX, 0.2, HZ], at: [0, base.y - 0.2, 0] },
      ...[[-1, 0], [1, 0], [0, -1], [0, 1]].map(([sx, sz]) => ({ cuboid: [sx ? 0.15 : HX, DEPTH / 2, sz ? 0.15 : HZ], at: [sx * (HX * 0.87), base.y + DEPTH / 2, sz * (HZ * 0.87)] })),
    ],
    /** Lamp pools (lamps.js): the core, and the work lamps on the walls. */
    lamps: [[coreWorld, 22], ...workLamps.map((p) => [toWorld(base.clone().add(p)), 14])],
    /** Where you stand to look in (the platform's middle) and what you look at (the core). */
    platform: toWorld(ground((PLAT.x0 + PLAT.x1) / 2, 0)),
    core: coreWorld,
    update(t) { for (const f of animated) f(t); },
  };
}
