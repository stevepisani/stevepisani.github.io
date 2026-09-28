// Your ship: a little lander that anyone who knows the Saturn V would recognise at a glance
// (the stack of white stages narrowing to the command module and its escape tower, the black-
// and-white roll pattern, "USA" and the flag, five engine bells and four fins), cut down to fit
// the planet and built like the Outer Wilds ship: standing on four sprung landing legs with round
// feet, a glowing porthole for a cockpit, a hatch with a ladder, riveted patch plates, thruster
// quads and an antenna. The front (hatch, porthole, badge) is local -z.
import * as THREE from 'three';
import { PALETTE, pbr, chrome, glow } from './materials.js';

function mesh(geo, material, parent, [x, y, z] = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  parent && parent.add(m);
  return m;
}
const css = (c) => '#' + new THREE.Color(c).getHexString();
const Y_UP = new THREE.Vector3(0, 1, 0);

// The stack, bottom to top: [name, height, radius at its top] (metres; radius at the bottom is
// the previous one's top). A Saturn V squashed to under a third of its slenderness.
const R1 = 0.44, R3 = 0.32, R_SM = 0.21;
const STACK = [
  ['S-IC', 1.2, R1], ['interstage', 0.1, R1], ['S-II', 0.66, R1], ['taper', 0.2, R3], ['S-IVB', 0.46, R3],
  ['IU', 0.05, R3], ['SLA', 0.24, R_SM], ['SM', 0.17, R_SM], ['CM', 0.21, 0.035],
];

/** A strut between two points. */
function strut(parent, a, b, radius, material, segments = 8) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = mesh(new THREE.CylinderGeometry(radius, radius, d.length(), segments), material, parent);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(Y_UP, d.normalize());
  return m;
}

/**
 * Build the ship. `badge`: image URL (the site's logo) painted on the second stage.
 * Returns { group, top, radius, feet, faceFront(x, z) }: origin on the ground between its feet;
 * faceFront turns it so the hatch, porthole and badge face local direction (x, z).
 */
export function saturnLander({ badge = null } = {}) {
  const group = new THREE.Group();
  const LIFT = 0.46; // the legs hold the first stage this high: the engine bells hang below it

  // heights of each joint in the stack, and the lathe profile from them
  const joints = [0];
  for (const [, h] of STACK) joints.push(joints[joints.length - 1] + h);
  const H = joints[joints.length - 1];
  const at = (name) => { const i = STACK.findIndex((s) => s[0] === name); return [joints[i], joints[i + 1]]; };
  const profile = [new THREE.Vector2(0, 0), new THREE.Vector2(R1, 0)];
  STACK.forEach(([, , r], i) => profile.push(new THREE.Vector2(r, joints[i + 1])));
  profile.push(new THREE.Vector2(0, H));

  // Livery, painted by height (canvas y from metres). u runs round from +z towards +x, so the
  // front (-z) is u = 0.5.
  const W = 512, CH = 1024;
  const c = document.createElement('canvas');
  c.width = W; c.height = CH;
  const g = c.getContext('2d');
  const Y = (m) => CH * (1 - m / H);
  const white = css(PALETTE.rocketWhite), black = css(PALETTE.rocketBlack);
  g.fillStyle = white; g.fillRect(0, 0, W, CH);
  // the roll pattern: quarters of black and white, offset so the front stays white for the hatch
  const quarters = ([m0, m1], start) => { for (let q = 0; q < 4; q++) if ((q + start) % 2 === 0) { g.fillStyle = black; g.fillRect(((q + 0.125) / 4) * W, Y(m1), W / 4, Y(m0) - Y(m1)); } };
  const [ic0, ic1] = at('S-IC');
  quarters([ic0, ic0 + 0.22], 0);
  quarters([ic0 + 0.52, ic0 + 0.64], 1);   // intertank
  quarters([ic1 - 0.16, ic1], 0);          // forward skirt
  quarters([at('S-IVB')[0] + 0.3, at('S-IVB')[1]], 0);
  const [is0, is1] = at('interstage');
  g.fillStyle = black; g.fillRect(0, Y(is1), W, Y(is0) - Y(is1)); // the dark interstage ring
  // "USA" down both flanks, with the flag above it
  g.textAlign = 'center';
  g.font = `bold ${Math.round(CH * 0.034)}px "Inter", Arial, sans-serif`;
  for (const u of [0.25, 0.75]) {
    g.fillStyle = black;
    'USA'.split('').forEach((ch, i) => g.fillText(ch, u * W, Y(ic1 - 0.5 - i * 0.13)));
    const fx = u * W - 22, fy = Y(ic1 - 0.2), fw = 44, fh = Y(ic1 - 0.36) - Y(ic1 - 0.2);
    for (let k = 0; k < 13; k++) { g.fillStyle = k % 2 ? white : css(PALETTE.coral); g.fillRect(fx, fy + (k / 13) * fh, fw, fh / 13 + 0.5); }
    g.fillStyle = css(PALETTE.teal); g.fillRect(fx, fy, fw * 0.42, fh * 0.54);
  }
  // silver adapter and service module
  g.fillStyle = css(PALETTE.chrome); g.fillRect(0, Y(at('SM')[1]), W, Y(at('SLA')[0]) - Y(at('SM')[1]));
  // hand-built: panel seams, rows of rivets, scuffs, and patch plates in a not-quite white
  let seed = 7;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 1.5;
  for (let k = 0; k < 12; k++) { const x = (k / 12) * W; g.beginPath(); g.moveTo(x, Y(at('S-II')[1])); g.lineTo(x, Y(0)); g.stroke(); }
  g.fillStyle = 'rgba(0,0,0,.35)';
  for (const m of joints) for (let x = 4; x < W; x += 10) { g.beginPath(); g.arc(x, Math.min(CH - 2, Y(m) + 4), 1.3, 0, 7); g.fill(); }
  for (let k = 0; k < 7; k++) {
    const x = rand() * W, y = Y(0.3 + rand() * (at('S-II')[1] - 0.4)), w = 26 + rand() * 30, h = 20 + rand() * 26;
    if (Math.abs((x + w / 2) / W - 0.5) < 0.14) continue; // not over the hatch or the badge
    g.fillStyle = css(new THREE.Color(PALETTE.rocketWhite).lerp(new THREE.Color(PALETTE.bamboo), 0.25 + rand() * 0.2));
    g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(0,0,0,.4)';
    for (let i = 0; i <= 3; i++) for (const py of [y + 3, y + h - 3]) { g.beginPath(); g.arc(x + 3 + i * (w - 6) / 3, py, 1.4, 0, 7); g.fill(); }
  }
  for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(60,45,30,${0.05 + rand() * 0.08})`; g.beginPath(); g.ellipse(rand() * W, Y(rand() * H * 0.7), 6 + rand() * 20, 2 + rand() * 6, 0, 0, 7); g.fill(); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (badge) {
    const img = new Image();
    img.onload = () => {
      // square on the hull: a pixel round the body covers more metres than a pixel up it
      const [s0, s1] = at('S-II');
      const h = Y(s0 + 0.08) - Y(s1 - 0.08);
      const wpx = h * (H / CH) / (2 * Math.PI * R1 / W);
      g.drawImage(img, 0.5 * W - wpx / 2, Y(s1 - 0.08), wpx, h);
      tex.needsUpdate = true;
    };
    img.src = badge;
  }

  const body = new THREE.LatheGeometry(profile, 64);
  { const pos = body.attributes.position, uv = body.attributes.uv; for (let i = 0; i < pos.count; i++) uv.setY(i, pos.getY(i) / H); }
  mesh(body, pbr({ map: tex, roughness: 0.5, metalness: 0.05 }), group, [0, LIFT, 0]);

  const white3 = pbr({ color: PALETTE.rocketWhite, roughness: 0.5 });
  const black3 = pbr({ color: PALETTE.rocketBlack, roughness: 0.55 });
  const metal = pbr({ color: PALETTE.lava, metalness: 0.6, roughness: 0.45, side: THREE.DoubleSide });
  const steel = chrome({ roughness: 0.35 });
  const brass = pbr({ color: PALETTE.brass, metalness: 0.55, roughness: 0.3 });

  // five engine bells under the first stage: one in the middle, four in a cross
  const bell = new THREE.LatheGeometry([[0.05, 0], [0.06, -0.04], [0.09, -0.16], [0.13, -0.3]].map(([r, y]) => new THREE.Vector2(r, y)), 20);
  for (const [x, z] of [[0, 0], [0.22, 0], [-0.22, 0], [0, 0.22], [0, -0.22]]) mesh(bell, metal, group, [x, LIFT, z]);
  // fins at the diagonals, over little fairings, black and white
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    const s = new THREE.Shape();
    s.moveTo(0, -0.05); s.lineTo(0.3, -0.14); s.lineTo(0.3, 0.1); s.lineTo(0, 0.5); s.closePath();
    const fin = mesh(new THREE.ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: false }).translate(0, 0, -0.0175), k % 2 ? white3 : black3, group);
    fin.position.set(Math.sin(a) * (R1 - 0.02), LIFT, Math.cos(a) * (R1 - 0.02));
    fin.rotation.y = a - Math.PI / 2;
    mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.2, 12, 1, true), white3, group, [Math.sin(a) * (R1 - 0.03), LIFT - 0.08, Math.cos(a) * (R1 - 0.03)]);
  }

  // landing legs, under the fins: a main leg from a hinge out to a round foot, a shock strut
  // (a piston: a dark cylinder and a bright rod), and a ball joint on each foot
  const FOOT = 1.05;
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2, ox = Math.sin(a), oz = Math.cos(a);
    const hinge = new THREE.Vector3(ox * (R1 + 0.02), LIFT + 0.42, oz * (R1 + 0.02));
    const foot = new THREE.Vector3(ox * FOOT, 0.09, oz * FOOT);
    mesh(new THREE.BoxGeometry(0.1, 0.12, 0.08), metal, group, [hinge.x, hinge.y, hinge.z]).rotation.y = a;
    strut(group, hinge, foot, 0.03, steel);
    const mid = hinge.clone().lerp(foot, 0.55);
    const base = new THREE.Vector3(ox * (R1 - 0.02), LIFT + 0.05, oz * (R1 - 0.02));
    const split = base.clone().lerp(mid, 0.55);
    strut(group, base, split, 0.03, metal);   // cylinder
    strut(group, split, mid, 0.016, steel);   // rod
    mesh(new THREE.SphereGeometry(0.045, 12, 8), metal, group, [foot.x, foot.y, foot.z]);
    mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.06, 20), metal, group, [foot.x, 0.03, foot.z]);
  }

  // the cockpit: a big round porthole in the third stage, lit warm from inside, in a riveted brass ring
  const [iv0, iv1] = at('S-IVB');
  const py = LIFT + iv0 + 0.17;
  mesh(new THREE.TorusGeometry(0.12, 0.022, 10, 32), brass, group, [0, py, -R3 - 0.006]);
  const glass = mesh(new THREE.CircleGeometry(0.115, 32), glow(PALETTE.amber, 1.6), group, [0, py, -R3 + 0.004]);
  glass.rotation.y = Math.PI;
  glass.castShadow = false;
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; mesh(new THREE.SphereGeometry(0.01, 6, 4), brass, group, [Math.cos(a) * 0.145, py + Math.sin(a) * 0.145, -R3 - 0.012]); }
  // the hatch low on the first stage, with a small lit window and a handle, and a ladder to the ground
  const hy = LIFT + 0.42;
  mesh(new THREE.BoxGeometry(0.34, 0.54, 0.035), black3, group, [0, hy, -R1 + 0.01]);
  const hatch = mesh(new THREE.BoxGeometry(0.3, 0.5, 0.04), white3, group, [0, hy, -R1 + 0.002]);
  const win = mesh(new THREE.CircleGeometry(0.05, 20), glow(PALETTE.amber, 1.2), hatch, [0, 0.1, -0.021]);
  win.rotation.y = Math.PI;
  mesh(new THREE.BoxGeometry(0.03, 0.08, 0.03), brass, hatch, [0.1, -0.05, -0.03]);
  const ladderTop = hy - 0.26, ladderOut = 0.36;
  for (const x of [-0.1, 0.1]) strut(group, new THREE.Vector3(x, ladderTop, -R1 - 0.03), new THREE.Vector3(x, 0.02, -R1 - ladderOut), 0.012, steel);
  for (let k = 1; k <= 5; k++) {
    const f = k / 6;
    const rung = mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.2, 6), steel, group, [0, ladderTop + (0.02 - ladderTop) * f, -R1 - 0.03 - (ladderOut - 0.03) * f]);
    rung.rotation.z = Math.PI / 2;
  }
  // thruster quads on the service module, and a little dish antenna on the third stage
  const [sm0, sm1] = at('SM');
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4;
    mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), steel, group, [Math.sin(a) * (R_SM + 0.03), LIFT + (sm0 + sm1) / 2, Math.cos(a) * (R_SM + 0.03)]).rotation.y = a;
  }
  {
    const arm = new THREE.Vector3(R3 + 0.01, LIFT + iv1 - 0.08, 0.05);
    const tipAt = arm.clone().add(new THREE.Vector3(0.14, 0.12, 0));
    strut(group, arm, tipAt, 0.008, steel);
    const dish = mesh(new THREE.SphereGeometry(0.08, 16, 8, 0, Math.PI * 2, 0, 0.9), pbr({ color: PALETTE.chrome, metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide }), group, [tipAt.x, tipAt.y, tipAt.z]);
    dish.rotation.z = -0.9;
  }
  // the launch escape tower on the command module: a little red truss, the motor and its nose
  const towerMat = pbr({ color: PALETTE.towerRed, roughness: 0.6 });
  const t0 = LIFT + H - 0.02, t1 = t0 + 0.22;
  const corner = (r, y, k) => new THREE.Vector3(Math.sin(k * Math.PI / 2 + Math.PI / 4) * r, y, Math.cos(k * Math.PI / 2 + Math.PI / 4) * r);
  for (let k = 0; k < 4; k++) { strut(group, corner(0.06, t0, k), corner(0.028, t1, k), 0.006, towerMat, 5); strut(group, corner(0.06, t0, k), corner(0.028, t1, k + 1), 0.004, towerMat, 5); }
  mesh(new THREE.LatheGeometry([[0, 0], [0.03, 0], [0.03, 0.2], [0.02, 0.26], [0, 0.3]].map(([r, y]) => new THREE.Vector2(r, y)), 16), white3, group, [0, t1, 0]);
  const top = t1 + 0.3;

  return {
    group,
    top,
    radius: R1,
    feet: FOOT + 0.17,
    faceFront(x, z) { group.rotation.y = Math.atan2(x, z) - Math.PI; },
  };
}
