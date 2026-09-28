// Your rocket: a Saturn V, parked on its launcher next to a red umbilical tower.
// Built at the real proportions (S-IC, S-II, S-IVB, instrument unit, adapter, service and command
// modules, launch escape tower), a little stouter than life so it reads at this size, and painted
// from one texture: the black-and-white roll pattern, "USA" and a flag on the first stage, and
// Steve's SJPJr badge on the second.
import * as THREE from 'three';
import { PALETTE, pbr, glow } from './materials.js';

const REAL = 122.8;              // metres, engines' mounting plane to the escape tower's tip

function mesh(geo, material, parent, [x, y, z] = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  parent && parent.add(m);
  return m;
}
const css = (c) => '#' + new THREE.Color(c).getHexString();

/** The livery, painted by height (v = real metres / REAL) and round the body (u = 0..1 from +z towards +x). */
function livery(W = 512, H = 2048) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const Y = (m) => H * (1 - m / REAL);               // canvas y of a height in real metres
  const white = css(PALETTE.rocketWhite), black = css(PALETTE.rocketBlack);
  g.fillStyle = white; g.fillRect(0, 0, W, H);
  // the roll pattern: quarters of black and white, so the tracking cameras could see it turn
  const quarters = (m0, m1, start) => {
    for (let q = 0; q < 4; q++) if ((q + start) % 2 === 0) { g.fillStyle = black; g.fillRect((q / 4) * W, Y(m1), W / 4, Y(m0) - Y(m1)); }
  };
  quarters(0, 6.5, 0);       // S-IC thrust structure
  quarters(19, 24.5, 1);     // S-IC intertank
  quarters(36.5, 42, 0);     // S-IC forward skirt
  quarters(88, 96, 1);       // S-IVB
  g.fillStyle = black; g.fillRect(0, Y(79.6), W, Y(79) - Y(79.6)); // S-IVB aft skirt seam
  // "USA", top to bottom, on two opposite faces of the first stage, with the flag above
  g.fillStyle = black;
  g.textAlign = 'center';
  g.font = `bold ${Math.round(H * 0.024)}px "Inter", Arial, sans-serif`;
  for (const u of [0.375, 0.875]) {
    'USA'.split('').forEach((ch, i) => g.fillText(ch, u * W, Y(33 - i * 4.2)));
    // a small flag: 13 stripes and a blue canton
    const fx = u * W - 26, fy = Y(35.5), fw = 52, fh = Y(32.5) - Y(35.5);
    for (let k = 0; k < 13; k++) { g.fillStyle = k % 2 ? white : css(PALETTE.coral); g.fillRect(fx, fy + (k / 13) * fh, fw, fh / 13 + 0.5); }
    g.fillStyle = css(PALETTE.teal); g.fillRect(fx, fy, fw * 0.42, fh * 0.54);
  }
  // panel lines on the adapter and service module, silver
  g.fillStyle = css(PALETTE.chrome); g.fillRect(0, Y(109.4), W, Y(97) - Y(109.4));
  g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2;
  for (let k = 0; k < 16; k++) { const x = (k / 16) * W; g.beginPath(); g.moveTo(x, Y(105.5)); g.lineTo(x, Y(97)); g.stroke(); }
  for (let k = 0; k < 24; k++) { const x = (k / 24) * W; g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x, Y(109), 3, Y(106) - Y(109)); } // radiators
  g.fillStyle = 'rgba(0,0,0,.35)'; for (const m of [42, 48, 73, 96, 97]) g.fillRect(0, Y(m) - 1, W, 2); // stage joints
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { tex, canvas: c, ctx: g, Y, W, H };
}

/**
 * Build it. `height` is the model's height in metres (engines to tip); `badge` an image URL for
 * the second stage. Returns { group, top, faceBadge(dir) } with the group's origin on the
 * launcher's base: `faceBadge` turns the rocket so the badge faces a local direction.
 */
export function saturnV({ height = 8, badge = null } = {}) {
  const group = new THREE.Group();
  const sy = height / REAL, sr = sy * 1.25; // stouter than life, so it reads at this size
  const LIFT = 6.2 * sy;                     // the engines hang below the first stage; the launcher holds it up
  const paint = livery();
  const skin = pbr({ map: paint.tex, roughness: 0.42, metalness: 0.05 });

  // the body, turned on a lathe: stage by stage, radius against height (real metres)
  const profile = [[0, 0], [5.05, 0], [5.05, 42], [5.05, 48], [5.05, 73], [3.3, 79], [3.3, 96], [3.3, 97], [1.95, 105.5],
    [1.95, 109.4], [1.9, 109.6], [0.45, 112.3], [0.3, 112.6], [0, 112.6]];
  const body = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r * sr, y * sy)), 64);
  { // UVs by height, so the livery is painted in metres, not by profile point
    const pos = body.attributes.position, uv = body.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setY(i, pos.getY(i) / (REAL * sy));
  }
  const hull = mesh(body, skin, group, [0, LIFT, 0]);

  // engines: five F-1 bells in a cross, the outer four under fairings with the fins
  const dark = pbr({ color: PALETTE.lava, metalness: 0.6, roughness: 0.45, side: THREE.DoubleSide });
  const bellPts = [[0.55, 0], [0.62, -0.6], [0.95, -2.2], [1.45, -4.2], [1.85, -5.8]].map(([r, y]) => new THREE.Vector2(r * sr, y * sy));
  const bell = new THREE.LatheGeometry(bellPts, 24);
  const white = pbr({ color: PALETTE.rocketWhite, roughness: 0.45 });
  const blackPaint = pbr({ color: PALETTE.rocketBlack, roughness: 0.5 });
  mesh(bell, dark, group, [0, LIFT, 0]);
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2, cx = Math.sin(a) * 3.3 * sr, cz = Math.cos(a) * 3.3 * sr;
    mesh(bell, dark, group, [cx, LIFT, cz]);
    // fairing: a cone over the engine's top, flaring from the skirt
    mesh(new THREE.CylinderGeometry(1.25 * sr, 1.75 * sr, 3.2 * sy, 20, 1, true), white, group, [Math.sin(a) * 4.3 * sr, LIFT - 1.6 * sy, Math.cos(a) * 4.3 * sr]);
    // fin: a swept trapezoid standing out from the fairing
    const s = new THREE.Shape();
    s.moveTo(0, -1.2 * sy); s.lineTo(3.4 * sr, -2.4 * sy); s.lineTo(3.4 * sr, 1.4 * sy); s.lineTo(0, 7.8 * sy); s.closePath();
    const fin = mesh(new THREE.ExtrudeGeometry(s, { depth: 0.32 * sr, bevelEnabled: false }).translate(0, 0, -0.16 * sr), k % 2 ? white : blackPaint, group);
    fin.position.set(Math.sin(a) * 5.0 * sr, LIFT, Math.cos(a) * 5.0 * sr);
    fin.rotation.y = a - Math.PI / 2;
  }

  // launch escape tower: a truss on the command module, the escape motor, a pointed nose
  const towerMat = pbr({ color: PALETTE.towerRed, roughness: 0.6 });
  const Y0 = LIFT + 112.3 * sy, Y1 = LIFT + 116.8 * sy;
  const corners = (r, y) => [0, 1, 2, 3].map((k) => new THREE.Vector3(Math.sin(k * Math.PI / 2 + Math.PI / 4) * r, y, Math.cos(k * Math.PI / 2 + Math.PI / 4) * r));
  const lo = corners(0.95 * sr, Y0), hi = corners(0.42 * sr, Y1);
  const strut = (a, b, r = 0.012) => {
    const d = new THREE.Vector3().subVectors(b, a);
    const m = mesh(new THREE.CylinderGeometry(r, r, d.length(), 5), towerMat, group);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  };
  for (let k = 0; k < 4; k++) { strut(lo[k], hi[k]); strut(lo[k], hi[(k + 1) % 4], 0.007); }
  const motor = [[0, 116.8], [0.36, 116.8], [0.36, 120.6], [0.25, 121.6], [0.08, 122.6], [0, 122.8]];
  mesh(new THREE.LatheGeometry(motor.map(([r, y]) => new THREE.Vector2(r * sr, y * sy + LIFT)), 20), white, group);
  const top = LIFT + REAL * sy;

  // the badge goes on the second stage, both sides, once the image is in
  const BADGE_U = 0.125;
  if (badge) {
    const img = new Image();
    img.onload = () => {
      const { ctx, Y, W } = paint;
      // square on the hull: a pixel round the body covers more metres than a pixel up it
      const h = Y(56) - Y(64);
      const wpx = h * (REAL * sy / paint.H) / (2 * Math.PI * 5.05 * sr / W);
      for (const u of [BADGE_U, BADGE_U + 0.5]) ctx.drawImage(img, u * W - wpx / 2, Y(64), wpx, h);
      paint.tex.needsUpdate = true;
    };
    img.src = badge;
  }
  return {
    group,
    top,
    lift: LIFT,
    radius: 5.05 * sr,
    hull,
    /** Turn the rocket (about its axis) so the badge faces local direction (x, z). */
    faceBadge(x, z) { group.rotation.y = Math.atan2(x, z) - BADGE_U * Math.PI * 2; },
  };
}

/**
 * The launcher: a steel deck with four hold-down arms, and a red umbilical tower with swing
 * arms reaching to the stages and a hammerhead crane on top. `rocket` is saturnV()'s result;
 * the tower stands `side` (unit x, z) of the rocket. Returns { group, towerAt, beaconAt }.
 */
export function launcher(rocket, { side = [1, 0] } = {}) {
  const group = new THREE.Group();
  const steel = pbr({ color: PALETTE.stone, metalness: 0.5, roughness: 0.55 });
  const red = pbr({ color: PALETTE.towerRed, roughness: 0.65, metalness: 0.2 });
  const H = rocket.top;
  // the deck, with a dark flame hole under the engines
  mesh(new THREE.BoxGeometry(1.7, 0.12, 1.7), steel, group, [0, 0.06, 0]);
  mesh(new THREE.CircleGeometry(0.5, 24).rotateX(-Math.PI / 2), pbr({ color: PALETTE.rocketBlack, roughness: 1 }), group, [0, 0.122, 0]).castShadow = false;
  // hold-down arms, between the fins, up to the base of the first stage
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2, r = rocket.radius * 0.95;
    const arm = mesh(new THREE.BoxGeometry(0.1, rocket.lift - 0.1, 0.14), steel, group, [Math.sin(a) * r, 0.12 + (rocket.lift - 0.12) / 2, Math.cos(a) * r]);
    arm.rotation.y = a;
  }
  // the tower: four corner posts and a braced lattice (instanced), square in plan
  const [sx, sz] = side;
  const dist = rocket.radius + 1.05, w = 0.7, TH = H * 0.93;
  const tower = new THREE.Group();
  tower.position.set(sx * dist, 0.12, sz * dist);
  tower.rotation.y = Math.atan2(sx, sz);
  group.add(tower);
  const hw = w / 2, levels = Math.round(TH / 0.55);
  const pieces = [];
  for (const [x, z] of [[-hw, -hw], [hw, -hw], [hw, hw], [-hw, hw]]) pieces.push([x, TH / 2, z, 0.05, TH, 0.05, 0, 0]);
  for (let l = 0; l <= levels; l++) {
    const y = (l / levels) * TH;
    for (const [x, z, ry] of [[0, -hw, 0], [0, hw, 0], [-hw, 0, Math.PI / 2], [hw, 0, Math.PI / 2]]) pieces.push([x, y, z, w, 0.03, 0.03, ry, 0]);
    if (l < levels) {
      const dy = TH / levels, diag = Math.hypot(w, dy), tilt = Math.atan2(w, dy) * (l % 2 ? 1 : -1);
      for (const [x, z, ry] of [[0, -hw, 0], [0, hw, 0], [-hw, 0, Math.PI / 2], [hw, 0, Math.PI / 2]]) pieces.push([x, y + dy / 2, z, 0.02, diag, 0.02, ry, tilt]);
    }
  }
  const lattice = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), red, pieces.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  pieces.forEach(([x, y, z, a, b, c, ry, tilt], i) => {
    q.setFromEuler(e.set(0, ry, tilt, 'YXZ'));
    lattice.setMatrixAt(i, m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(a, b, c)));
  });
  lattice.castShadow = lattice.receiveShadow = true;
  tower.add(lattice);
  // swing arms to the stages (the tower's -z faces the rocket), the top one to the command module
  // each arm reaches the hull at its own height (it narrows above the second stage)
  const sy = (H - rocket.lift) / REAL, sr = rocket.radius / 5.05;
  for (const [realM, r, thick] of [[40, 5.05, 0.1], [70, 5.05, 0.1], [92, 3.3, 0.1], [110, 1.95, 0.18]]) {
    const reach = dist - r * sr - hw;
    mesh(new THREE.BoxGeometry(0.16, thick, reach), red, tower, [0, rocket.lift - 0.12 + realM * sy, -hw - reach / 2]);
  }
  // hammerhead crane on top, and an aircraft warning light
  mesh(new THREE.BoxGeometry(0.12, 0.12, 1.6), red, tower, [0, TH + 0.08, 0.2]);
  const beacon = mesh(new THREE.SphereGeometry(0.06, 10, 8), glow(PALETTE.coral, 8), tower, [0, TH + 0.2, 0]);
  beacon.castShadow = false;
  return { group, tower, beacon };
}
