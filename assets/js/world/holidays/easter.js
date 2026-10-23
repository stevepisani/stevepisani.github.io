// Easter on the planet (Easter Sunday, computed: assets/js/holidays.js): painted eggs hidden in
// the grass round the walk to spot, a basket of them on the counter, the bulbs in pastels, and
// bunny ears on the bartender.
import { Group, Mesh, Color, SphereGeometry, CylinderGeometry, TorusGeometry, MeshStandardMaterial, RepeatWrapping } from 'three';
import { placer, bulbs, hat, felt, instanced, canvasTexture, random, scatter } from './lib/dress.js';

const PASTELS = [0xf7a8c4, 0xa8d8f0, 0xfbe38a, 0xb8e6a8, 0xd4b8f0, 0xffc49a];

export function decorate(kit) {
  const { scene } = kit;
  const root = new Group();
  root.name = 'easter';
  scene.add(root);
  const at = placer(kit);

  bulbs(kit, PASTELS, [1.3, 1.3, 1.1, 1.2, 1.4, 1.2]);

  /* ---------- Painted eggs: white bands and dots, tinted per egg ---------- */
  const paint = canvasTexture(256, 128, (g, w, h) => {
    g.fillStyle = '#d8d8d8';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff';
    g.fillRect(0, h * 0.42, w, h * 0.16);
    g.beginPath();
    for (let x = 0; x <= w; x += 16) g.lineTo(x, h * (x % 32 ? 0.28 : 0.34));
    g.lineTo(w, h * 0.31); g.lineTo(0, h * 0.31);
    g.fill();
    for (let x = 8; x < w; x += 32) { g.beginPath(); g.arc(x, h * 0.72, 5, 0, 7); g.fill(); }
  });
  paint.wrapS = RepeatWrapping;
  const shell = new MeshStandardMaterial({ map: paint, roughness: 0.45 });
  const egg = new SphereGeometry(0.05, 16, 12).scale(1, 1.3, 1).translate(0, 0.055, 0);
  // hidden in the grass on both sides of the walk, a few further out
  const hidden = scatter(kit, 28, random(404), { polar: [0.14, 0.75], spread: 1.4, keep: (edge) => edge > 0.35 && edge < 3, size: [0.9, 1.2], tilt: 0.9, lift: -0.01 });
  const eggs = instanced(egg, shell, hidden);
  hidden.forEach((_, i) => eggs.setColorAt(i, new Color(PASTELS[i % PASTELS.length])));
  root.add(eggs);

  /* ---------- A basket of eggs on the counter, in view from your stool ---------- */
  const basket = new Group();
  basket.matrixAutoUpdate = false;
  basket.matrix.copy(at.bar(-1.05, 1.2, 0.25, 1, 0.35));
  const wicker = new MeshStandardMaterial({ color: 0xb08a4e, roughness: 0.95 });
  basket.add(new Mesh(new CylinderGeometry(0.13, 0.1, 0.09, 20, 1, true).translate(0, 0.045, 0), felt(0xb08a4e, 0.95)));
  basket.add(new Mesh(new CylinderGeometry(0.1, 0.1, 0.01, 20).translate(0, 0.005, 0), wicker));
  basket.add(new Mesh(new TorusGeometry(0.13, 0.008, 6, 24).rotateX(Math.PI / 2).translate(0, 0.09, 0), wicker));
  basket.add(new Mesh(new TorusGeometry(0.12, 0.008, 6, 24, Math.PI).translate(0, 0.09, 0), wicker)); // the handle
  basket.add(new Mesh(new SphereGeometry(0.11, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.25, 1).translate(0, 0.07, 0), new MeshStandardMaterial({ color: 0x8ccf6a, roughness: 1 }))); // the grass
  const inBasket = [[-0.05, 0.03, 0.3], [0.05, -0.02, -0.4], [0, 0.06, 0.9], [-0.03, -0.06, -0.2], [0.07, 0.05, 0.5]].map(([x, z, r], i) => {
    const e = new Mesh(egg, shell.clone());
    e.material.color.set(PASTELS[i]);
    e.position.set(x, 0.065, z);
    e.rotation.set(r, 0, r * 0.7);
    return e;
  });
  basket.add(...inBasket);
  root.add(basket);

  /* ---------- Bunny ears ---------- */
  hat(kit, () => {
    const h = new Group(), white = felt(0xf4f1ea, 1), pink = felt(0xf7a8c4, 0.8);
    h.add(new Mesh(new TorusGeometry(0.18, 0.012, 6, 32, Math.PI).translate(0, -0.14, 0), white)); // the band, ear to ear over the top
    for (const s of [-1, 1]) {
      const ear = new Group();
      ear.position.set(s * 0.06, 0.02, 0);
      ear.rotation.set(s > 0 ? 0.35 : 0, 0, -s * 0.22); // leaning apart, the right one flopping forward a little
      ear.add(new Mesh(new SphereGeometry(0.05, 16, 10).scale(0.9, 3.2, 0.35).translate(0, 0.15, 0), white));
      ear.add(new Mesh(new SphereGeometry(0.032, 12, 8).scale(0.9, 3.4, 0.2).translate(0, 0.15, 0.012), pink));
      h.add(ear);
    }
    return h;
  }, 0);

  return { count: hidden.length, update() {} };
}
