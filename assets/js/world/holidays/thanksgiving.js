// Thanksgiving on the planet (the fourth Thursday of November, assets/js/holidays.js): pumpkins
// along the walk and round the bar, corn shocks by the front torches, gourds and corn on the
// counter, fallen leaves either side of the walk, the bulbs in autumn colours, and a pilgrim's
// hat on the bartender. Its own bundle, loaded only on the day, like Halloween's.
import { Group, Mesh, Color, Object3D, MeshStandardMaterial, CylinderGeometry, SphereGeometry, ConeGeometry, ShapeGeometry, Shape, DoubleSide } from 'three';
import { placer, pumpkin, instanced, bulbs, hat, felt, random, scatter } from './lib/dress.js';

export function decorate(kit) {
  const { scene, colliders, glow, PALETTE } = kit;
  const root = new Group();
  root.name = 'thanksgiving';
  scene.add(root);
  const at = placer(kit);
  const rnd = random(1121);

  /* ---------- Pumpkins: orange, a pale one, a green one ---------- */
  const shades = [PALETTE.pumpkin, 0xe6c58e, PALETTE.pumpkin, 0x5c6b3a, 0xc8761c];
  const spots = [], tints = [];
  [[0.57, 1, 0.24], [0.51, -1, 0.2], [0.45, 1, 0.22], [0.39, -1, 0.26], [0.33, 1, 0.2], [0.27, -1, 0.23]].forEach(([polar, side, size], i) => {
    const w = at.walk(polar, side, size);
    if (!w) return;
    spots.push(w.matrix);
    tints.push(shades[i % shades.length]);
    colliders.push({ center: w.at, radius: size + 0.1 });
  });
  for (const [x, z, s, h, c] of [[-2.3, 3.65, 0.28, 0.3, 0], [-1.95, 3.9, 0.17, 1, 1], [2.3, 3.6, 0.25, -0.4, 4], [1.95, 3.9, 0.16, 2, 3]]) {
    spots.push(at.ground(x, z, s, h));
    tints.push(shades[c]);
  }
  const { body, stem } = pumpkin();
  const bodies = instanced(body, new MeshStandardMaterial({ roughness: 0.6 }), spots);
  tints.forEach((c, i) => bodies.setColorAt(i, new Color(c)));
  root.add(bodies, instanced(stem, new MeshStandardMaterial({ color: 0x4a4a22, roughness: 0.9 }), spots));

  /* ---------- Corn shocks by the front torches: stalks bound in a sheaf ---------- */
  const stalks = [];
  const s = new Object3D();
  for (const [x, z] of [[-3.0, 2.55], [3.05, 2.5]]) {
    const base = at.ground(x, z, 1);
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2, r = 0.16 + rnd() * 0.06;
      s.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      s.rotation.set(Math.sin(a) * 0.14, 0, -Math.cos(a) * 0.14); // leaning in to the tie, splaying out above
      s.scale.set(1, 0.85 + rnd() * 0.35, 1);
      s.updateMatrix();
      stalks.push(base.clone().multiply(s.matrix));
    }
  }
  const stalk = new CylinderGeometry(0.012, 0.02, 1.7, 5).translate(0, 0.85, 0);
  root.add(instanced(stalk, new MeshStandardMaterial({ color: 0xb59a5c, roughness: 0.95 }), stalks));

  /* ---------- On the counter: gourds and two ears of corn, in view from your stool ---------- */
  const counter = new Group();
  counter.matrixAutoUpdate = false;
  counter.matrix.copy(at.bar(-1.05, 1.2, 0.25, 1, 0.35));
  root.add(counter);
  for (const [x, z, r, sy, c] of [[0, 0, 0.06, 1.3, 0xe0b23a], [0.1, 0.05, 0.05, 0.9, 0x5c6b3a], [-0.08, 0.07, 0.045, 1.6, PALETTE.pumpkin], [0.04, -0.09, 0.055, 1, 0xe6c58e]]) {
    const g = new Mesh(new SphereGeometry(r, 14, 10).scale(1, sy, 1), new MeshStandardMaterial({ color: c, roughness: 0.5 }));
    g.position.set(x, r * sy * 0.9, z);
    counter.add(g);
  }
  const kernels = new MeshStandardMaterial({ color: 0xd9a531, roughness: 0.7 }), husk = new MeshStandardMaterial({ color: 0xcdb486, roughness: 0.9, side: DoubleSide });
  for (const [x, z, h] of [[-0.2, 0.02, 0.4], [-0.17, 0.12, -0.2]]) {
    const ear = new Group();
    ear.add(new Mesh(new CylinderGeometry(0.022, 0.026, 0.17, 10).rotateZ(Math.PI / 2), kernels));
    ear.add(new Mesh(new ConeGeometry(0.035, 0.12, 6, 1, true).rotateZ(-Math.PI / 2).translate(0.12, 0, 0), husk)); // the husk pulled back
    ear.position.set(x, 0.026, z);
    ear.rotation.y = h;
    counter.add(ear);
  }

  /* ---------- Fallen leaves either side of the walk ---------- */
  const leaf = new Shape();
  leaf.moveTo(0, -0.05);
  leaf.quadraticCurveTo(0.05, -0.02, 0.045, 0.02);
  leaf.quadraticCurveTo(0.02, 0.03, 0, 0.06);
  leaf.quadraticCurveTo(-0.02, 0.03, -0.045, 0.02);
  leaf.quadraticCurveTo(-0.05, -0.02, 0, -0.05);
  const leafGeo = new ShapeGeometry(leaf).rotateX(-Math.PI / 2);
  const colours = [0xb5431c, 0xd9771f, 0xe6b02e, 0x8f2a17, 0xc9601a];
  const leaves = scatter(kit, 160, rnd, { polar: [0.2, 0.66], keep: (edge, r) => edge > 0.05 && edge < 1.4 * r() + 0.2 }); // thickest by the walk
  const fallen = instanced(leafGeo, new MeshStandardMaterial({ roughness: 0.8, side: DoubleSide }), leaves, { shadow: false });
  leaves.forEach((_, i) => fallen.setColorAt(i, new Color(colours[i % colours.length])));
  fallen.receiveShadow = true;
  root.add(fallen);

  bulbs(kit, [PALETTE.amber, PALETTE.pumpkin, 0xc0391b, 0xe6b02e], [1, 1.1, 1.3, 1]);

  /* ---------- A pilgrim's hat: a tall black crown, a brim, a band and a buckle ---------- */
  hat(kit, () => {
    const black = felt(0x15120f), h = new Group();
    h.add(new Mesh(new CylinderGeometry(0.29, 0.29, 0.014, 40), black));
    h.add(new Mesh(new CylinderGeometry(0.15, 0.175, 0.3, 32).translate(0, 0.15, 0), black));
    h.add(new Mesh(new CylinderGeometry(0.168, 0.172, 0.05, 32, 1, true).translate(0, 0.045, 0), felt(0x2b221a, 0.6)));
    const buckle = new Mesh(new CylinderGeometry(0.04, 0.04, 0.012, 4).rotateX(Math.PI / 2).rotateZ(Math.PI / 4).translate(0, 0.045, 0.172), glow(0xd9b45a, 1.1));
    h.add(buckle);
    return h;
  }, -0.05);

  return { count: spots.length + leaves.length, update() {} };
}
