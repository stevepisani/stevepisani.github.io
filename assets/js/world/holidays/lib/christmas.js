// Christmas on the planet (Christmas Eve and Christmas Day, assets/js/holidays.js): coloured
// bulbs, lights along the roof's front edges that twinkle, wreaths on the bar front, presents in
// front of the bar, and a Santa hat on the bartender.
import { Group, Mesh, Color, Object3D, BoxGeometry, SphereGeometry, TorusGeometry, MeshStandardMaterial } from 'three';
import { placer, instanced, bulbs, hat, coneHat, felt, ball } from './dress.js';

const RED = 0xc4202b, GREEN = 0x1f7a3a, GOLD = 0xe2b440, BLUE = 0x2e6fd8, WHITE = 0xfff4dc;

export function christmas(kit, id) {
  const { scene, bar, glow, reducedMotion } = kit;
  const root = new Group();
  root.name = id;
  scene.add(root);
  const at = placer(kit);
  const colours = [RED, GREEN, GOLD, BLUE, WHITE];

  bulbs(kit, colours, [1.4, 1.6, 1, 1.6, 0.9]);

  /* ---------- Lights along the front edges of the roof ---------- */
  // the gable's two edges (bar.js: the eaves at 2.95 and 3.05 out, the ridge at 6.05), just above the thatch
  const lights = [], o = new Object3D();
  for (const s of [-1, 1]) {
    const n = Math.hypot(3.1, 3.05);
    for (let i = 0; i < 34; i++) {
      const k = i / 33;
      o.position.set(s * (3.3 * (1 - k) + (3.1 / n) * 0.18), 2.78 + k * 3.3 + (3.05 / n) * 0.18, 2.68);
      o.updateMatrix();
      lights.push(bar.group.matrixWorld.clone().multiply(o.matrix));
    }
  }
  const wrap = instanced(new SphereGeometry(0.045, 8, 6), glow(0xffffff, 2.6), lights, { shadow: false });
  const base = lights.map((_, i) => new Color(colours[i % colours.length]));
  base.forEach((c, i) => wrap.setColorAt(i, c));
  root.add(wrap);

  /* ---------- Wreaths on the front of the bar, between the stools, each with a red bow ---------- */
  const green = new MeshStandardMaterial({ color: 0x1d4a2a, roughness: 0.9 }), berry = new MeshStandardMaterial({ color: RED, roughness: 0.4 });
  for (const x of [-0.58, 0.58]) {
    const wreath = new Group();
    wreath.matrixAutoUpdate = false;
    wreath.matrix.copy(at.bar(x, 0.78, 1.13, 0.8));
    wreath.add(new Mesh(new TorusGeometry(0.2, 0.065, 10, 32), green));
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2 + 0.3; wreath.add(ball(0.018, berry, [Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0.06])); }
    for (const s of [-1, 1]) { const loop = new Mesh(new SphereGeometry(0.06, 10, 8).scale(1, 0.55, 0.4), berry); loop.position.set(s * 0.06, -0.2, 0.07); loop.rotation.z = s * 0.4; wreath.add(loop); }
    wreath.add(ball(0.025, berry, [0, -0.2, 0.08]));
    root.add(wreath);
  }

  /* ---------- Presents by the front torches ---------- */
  const boxes = [], tints = [];
  for (const [x, z, w, h, ry, c] of [[-2.3, 3.7, 0.42, 0.3, 0.3, RED], [-1.9, 3.95, 0.3, 0.22, 0.9, GREEN], [-2.65, 4.0, 0.26, 0.34, 0.1, BLUE], [-2.22, 3.7, 0.22, 0.18, 0.7, GOLD],
    [2.3, 3.65, 0.38, 0.28, -0.4, GREEN], [1.95, 3.95, 0.28, 0.2, 0.2, RED]]) {
    const m = at.ground(x, z, 1, ry);
    o.position.set(0, x === -2.22 ? 0.3 : 0, 0); // the little gold one sits on the red one
    o.rotation.set(0, 0, 0);
    o.scale.set(w, h, w * 0.9);
    o.updateMatrix();
    boxes.push(m.multiply(o.matrix));
    tints.push(c);
  }
  const box = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const wrapped = instanced(box, new MeshStandardMaterial({ roughness: 0.45 }), boxes);
  tints.forEach((c, i) => wrapped.setColorAt(i, new Color(c)));
  const ribbon = new MeshStandardMaterial({ color: GOLD, roughness: 0.35, metalness: 0.4 });
  root.add(wrapped, instanced(new BoxGeometry(1.02, 1.02, 0.14).translate(0, 0.5, 0), ribbon, boxes), instanced(new BoxGeometry(0.14, 1.02, 1.02).translate(0, 0.5, 0), ribbon, boxes));

  /* ---------- A Santa hat ---------- */
  hat(kit, () => {
    const h = coneHat({ base: 0.17, height: 0.36, flop: 0.16, material: felt(RED, 0.9) });
    const fur = felt(0xf4f1ea, 1);
    h.add(new Mesh(new TorusGeometry(0.172, 0.04, 10, 32).rotateX(Math.PI / 2).translate(0, 0.02, 0), fur));
    h.add(ball(0.045, fur, [h.userData.tip.x, h.userData.tip.y, 0]));
    return h;
  }, -0.12);

  // the roof lights twinkle, each now and then a little brighter (not under reduced motion)
  const c = new Color();
  return {
    count: lights.length + boxes.length,
    update(t) {
      if (reducedMotion) return;
      for (let i = 0; i < base.length; i++) wrap.setColorAt(i, c.copy(base[i]).multiplyScalar(0.75 + 0.5 * Math.max(0, Math.sin(t * 1.7 + i * 2.3))));
      wrap.instanceColor.needsUpdate = true;
    },
  };
}
