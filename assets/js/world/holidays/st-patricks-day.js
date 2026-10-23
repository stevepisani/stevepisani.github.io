// St. Patrick's Day on the planet (17 March, assets/js/holidays.js): a rainbow over the bar, a pot
// of gold in front of it, shamrocks either side of the walk, the bulbs green and gold, and a green
// bowler on the bartender.
import { Group, Mesh, Color, Shape, ShapeGeometry, TorusGeometry, CylinderGeometry, SphereGeometry, MeshBasicMaterial, MeshStandardMaterial, DoubleSide } from 'three';
import { placer, bulbs, hat, felt, instanced, random, scatter } from './lib/dress.js';

const GREEN = 0x1f9a3a, LIME = 0x7ad04a, GOLD = 0xf0c45a;

export function decorate(kit) {
  const { scene, bar, glow } = kit;
  const root = new Group();
  root.name = 'st-patricks-day';
  scene.add(root);
  const at = placer(kit);

  bulbs(kit, [GREEN, LIME, GOLD], [1.6, 1.2, 1.1]);

  /* ---------- A rainbow arching over the bar from behind, its ends sinking past the planet's edge ---------- */
  const bands = [0xe8473d, 0xf08a2e, 0xf2d23c, 0x4cbf56, 0x3f8fe0, 0x6a4fc8];
  const rainbow = new Group();
  rainbow.position.set(0, -2, -9);
  bands.forEach((c, i) => {
    const arc = new Mesh(new TorusGeometry(16 - i * 0.42, 0.22, 6, 128, Math.PI + 0.7), new MeshBasicMaterial({ color: c, transparent: true, opacity: 0.42, depthWrite: false, toneMapped: false }));
    arc.rotation.z = -0.35;
    arc.renderOrder = 1;
    rainbow.add(arc);
  });
  rainbow.userData.noBatch = true;
  bar.group.add(rainbow);

  /* ---------- A pot of gold in front of the bar ---------- */
  const pot = new Group();
  pot.matrixAutoUpdate = false;
  pot.matrix.copy(at.ground(-2.25, 3.75, 1, 0.4));
  const iron = new MeshStandardMaterial({ color: 0x1b1a19, roughness: 0.5, metalness: 0.6 });
  const belly = new SphereGeometry(0.3, 24, 14, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.7).scale(1, 0.85, 1).translate(0, 0.28, 0);
  pot.add(new Mesh(belly, iron));
  const rim = new Mesh(new TorusGeometry(0.245, 0.03, 8, 32).rotateX(Math.PI / 2).translate(0, 0.43, 0), iron);
  pot.add(rim);
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; const leg = new Mesh(new CylinderGeometry(0.03, 0.02, 0.12, 6), iron); leg.position.set(Math.cos(a) * 0.17, 0.05, Math.sin(a) * 0.17); pot.add(leg); }
  // heaped gold: a mound and coins on it, glinting
  const gold = new MeshStandardMaterial({ color: GOLD, roughness: 0.25, metalness: 1, emissive: new Color(0x8a5a10), emissiveIntensity: 0.6 });
  pot.add(new Mesh(new SphereGeometry(0.235, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.45, 1).translate(0, 0.42, 0), gold));
  const rnd = random(317), coin = new CylinderGeometry(0.035, 0.035, 0.008, 14);
  for (let i = 0; i < 22; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 0.2, c = new Mesh(coin, gold);
    c.position.set(Math.cos(a) * r, 0.42 + 0.1 * (1 - (r / 0.23) ** 2) + 0.01, Math.sin(a) * r);
    c.rotation.set(rnd() - 0.5, 0, rnd() - 0.5);
    pot.add(c);
  }
  for (let i = 0; i < 6; i++) { const c = new Mesh(coin, gold); c.position.set(0.32 + rnd() * 0.2, 0.005, -0.1 + rnd() * 0.3); pot.add(c); } // a few spilled
  root.add(pot);

  /* ---------- Shamrocks either side of the walk ---------- */
  // three heart-shaped leaves as one outline (a three-lobed rose curve), on a short stem
  const trefoil = new Shape();
  for (let i = 0; i <= 90; i++) {
    const a = (i / 90) * Math.PI * 2, r = 0.05 * (0.25 + 0.75 * Math.abs(Math.cos(1.5 * a)) ** 0.6);
    i ? trefoil.lineTo(Math.cos(a) * r, Math.sin(a) * r) : trefoil.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const shamrock = new ShapeGeometry(trefoil);
  const spots = scatter(kit, 150, random(1703), { polar: [0.18, 0.66], keep: (edge, r) => edge > 0.05 && edge < 1.2 * r() + 0.25, size: [0.9, 1.8], tilt: 0.3, lift: 0 });
  const clover = instanced(shamrock.clone().rotateX(-Math.PI / 2).translate(0, 0.06, 0), new MeshStandardMaterial({ roughness: 0.7, side: DoubleSide }), spots, { shadow: false });
  root.add(instanced(new CylinderGeometry(0.003, 0.004, 0.06, 4).translate(0, 0.03, 0), new MeshStandardMaterial({ color: 0x2c6b2a, roughness: 0.8 }), spots, { shadow: false }));
  spots.forEach((_, i) => clover.setColorAt(i, new Color([GREEN, 0x2c8a3e, LIME, 0x178030][i % 4])));
  clover.receiveShadow = true;
  root.add(clover);

  /* ---------- A green bowler with a shamrock in its band ---------- */
  hat(kit, () => {
    const green = felt(0x1d6b33, 0.7), h = new Group();
    const brim = new Mesh(new CylinderGeometry(0.24, 0.24, 0.012, 40), green);
    brim.scale.set(1, 1, 0.92);
    h.add(brim);
    h.add(new Mesh(new SphereGeometry(0.168, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.15, 1), green));
    h.add(new Mesh(new CylinderGeometry(0.171, 0.171, 0.045, 32, 1, true).translate(0, 0.03, 0), felt(0x123d1e, 0.5)));
    const badge = new Mesh(shamrock.clone().scale(0.9, 0.9, 1), glow(LIME, 0.9));
    badge.position.set(0.06, 0.0, 0.172);
    h.add(badge);
    return h;
  }, -0.1);

  return { count: spots.length, update() {} };
}
