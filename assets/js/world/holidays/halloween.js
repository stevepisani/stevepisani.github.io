// Halloween on the planet (31 October, assets/js/holidays.js): jack-o'-lanterns lit along the walk
// and round the bar, bats circling the roof, the festoon bulbs orange and purple, and a witch's
// hat on the bartender.
//
// Its own bundle (dist/holidays/halloween.js), loaded by URL only on the day, on world.js's own
// three.js (tools/build-js.mjs). Everything else it needs comes in `kit` from main.js, before the
// first frame, so the planet appears already dressed.
import { Group, Mesh, InstancedMesh, Object3D, Color, MeshStandardMaterial, MeshBasicMaterial, CylinderGeometry, SphereGeometry, ShapeGeometry, Shape, DoubleSide } from 'three';
import { placer, pumpkin, instanced, bulbs, hat, coneHat, felt, canvasTexture } from './lib/dress.js';

export function decorate(kit) {
  const { scene, bar, addLamp, colliders, glow, PALETTE, reducedMotion } = kit;
  const root = new Group();
  root.name = 'halloween';
  scene.add(root);
  const at = placer(kit);

  /* ---------- Jack-o'-lanterns ---------- */
  // The carved face glows through the emissive map, on the sphere's +z side (u = 0.25)
  const face = canvasTexture(512, 256, (g) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, 512, 256);
    g.fillStyle = '#ffd27a';
    const tri = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); };
    tri([[96, 100], [122, 100], [110, 70]]);   // eyes
    tri([[134, 100], [160, 100], [146, 70]]);
    tri([[121, 118], [135, 118], [128, 106]]); // nose
    // the grin, with two teeth left in
    tri([[88, 128], [168, 128], [158, 150], [146, 142], [140, 156], [128, 146], [116, 156], [110, 142], [98, 150]]);
  });
  const { body, stem } = pumpkin();
  const skin = new MeshStandardMaterial({ color: PALETTE.pumpkin, roughness: 0.55, emissive: new Color(PALETTE.amber), emissiveMap: face, emissiveIntensity: 4 });
  const spots = [];
  // along the walk from where you land, staggered, each throwing a little lamp light
  [[0.57, 1, 0.24], [0.51, -1, 0.2], [0.45, 1, 0.22], [0.39, -1, 0.26], [0.33, 1, 0.2], [0.27, -1, 0.23]].forEach(([polar, side, size]) => {
    const w = at.walk(polar, side, size);
    if (!w) return;
    spots.push(w.matrix);
    addLamp(w.at.clone().addScaledVector(w.up, size), 4);
    colliders.push({ center: w.at, radius: size + 0.1 });
  });
  // by the front torches, a big one and a little one, and one on the counter, in view from your
  // stool and clear of the robot's work
  spots.push(at.ground(-2.9, 2.95, 0.3, 0.3), at.ground(-3.35, 3.3, 0.18, 0.6), at.ground(2.95, 2.9, 0.26, -0.3), at.bar(-1.05, 1.2, 0.25, 0.09, 0.35));
  root.add(instanced(body, skin, spots), instanced(stem, new MeshStandardMaterial({ color: 0x4a4a22, roughness: 0.9 }), spots));

  bulbs(kit, [PALETTE.pumpkin, PALETTE.hex], [1, 1.6]);

  /* ---------- A witch's hat for the bartender ---------- */
  hat(kit, () => {
    const h = coneHat({ brim: 0.3, material: felt(0x1c1226) });
    h.add(new Mesh(new CylinderGeometry(0.163, 0.17, 0.045, 24, 1, true).translate(0, 0.03, 0), felt(PALETTE.hex, 0.5)));
    h.add(new Mesh(new CylinderGeometry(0.03, 0.03, 0.05, 4).rotateX(Math.PI / 2).translate(0, 0.03, 0.17), glow(PALETTE.amber, 1.4))); // the buckle
    return h;
  });

  /* ---------- Bats round the roof ---------- */
  // Each a body and two scalloped wings, all instanced; they circle the roof at their own height,
  // speed and bob, beating their wings. Under reduced motion there are none.
  const bats = [];
  let wings = null;
  if (!reducedMotion) {
    const wing = new Shape();
    wing.moveTo(0, 0.02);
    wing.quadraticCurveTo(0.12, 0.09, 0.26, 0.05);
    wing.quadraticCurveTo(0.24, -0.02, 0.2, -0.04);
    wing.quadraticCurveTo(0.17, 0, 0.13, -0.03);
    wing.quadraticCurveTo(0.1, 0, 0.06, -0.025);
    wing.quadraticCurveTo(0.04, 0, 0, -0.02);
    const wingGeo = new ShapeGeometry(wing).rotateX(Math.PI / 2);
    const dark = new MeshBasicMaterial({ color: 0x07050b, side: DoubleSide });
    const N = 7;
    const left = new InstancedMesh(wingGeo, dark, N), right = new InstancedMesh(wingGeo, dark, N);
    const bodies = new InstancedMesh(new SphereGeometry(0.035, 8, 6).scale(1, 0.8, 1.7), dark, N);
    for (const m of [left, right, bodies]) { m.frustumCulled = false; root.add(m); }
    for (let i = 0; i < N; i++) bats.push({ r: 3 + (i * 0.37) % 2.4, y: 3.6 + (i * 0.61) % 2.2, w: (0.5 + (i * 0.29) % 0.45) * (i % 3 ? 1 : -1), a: i * 2.4, flap: 9 + (i % 4) });
    wings = { left, right, bodies };
  }
  const frame = new Object3D(), part = new Object3D();
  const set = (mesh, i, x, rz, flip = 1) => {
    part.position.set(x, 0, 0);
    part.rotation.set(0, 0, rz);
    part.scale.set(flip, 1, 1);
    part.updateMatrix();
    mesh.setMatrixAt(i, frame.matrix.clone().multiply(part.matrix));
  };

  return {
    count: spots.length,
    bats: bats.length,
    update(t) {
      if (!wings) return;
      bats.forEach((b, i) => {
        const a = b.a + t * b.w, beat = Math.sin(t * b.flap + i) * 0.8;
        frame.position.set(Math.cos(a) * b.r, b.y + Math.sin(t * 1.3 + i) * 0.35, Math.sin(a) * b.r);
        frame.rotation.set(0, -a + (b.w > 0 ? 0 : Math.PI), Math.sin(t * 2 + i) * 0.2); // along its circle, banking
        frame.updateMatrix();
        frame.matrix.premultiply(bar.group.matrixWorld);
        set(wings.bodies, i, 0, 0);
        set(wings.left, i, 0.02, beat);
        set(wings.right, i, -0.02, -beat, -1);
      });
      for (const m of Object.values(wings)) m.instanceMatrix.needsUpdate = true;
    },
  };
}
