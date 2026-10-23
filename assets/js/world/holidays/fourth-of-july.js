// The Fourth of July on the planet (assets/js/holidays.js): fireworks over the lagoon and the bar
// all night, bunting on the front of the bar, little flags along the walk, the bulbs red, white
// and blue, and a top hat in stars and stripes on the bartender.
import { Group, Mesh, Vector3, CircleGeometry, PlaneGeometry, CylinderGeometry, MeshStandardMaterial, DoubleSide } from 'three';
import { placer, bulbs, hat, instanced, canvasTexture, fireworks } from './lib/dress.js';

const RED = 0xc8202f, WHITE = 0xf4f1ea, BLUE = 0x1f3a8a;

// a five-pointed star on a canvas
function star(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, k = i % 2 ? r * 0.4 : r; g.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k); }
  g.fill();
}

export function decorate(kit) {
  const { scene, bar, reducedMotion, sfx, surfacePoint, pond } = kit;
  const root = new Group();
  root.name = 'fourth-of-july';
  scene.add(root);
  const at = placer(kit);

  bulbs(kit, [RED, WHITE, BLUE], [1.5, 0.9, 2]);

  /* ---------- Bunting: pleated half-round fans on the bar front ---------- */
  const fan = canvasTexture(256, 256, (g) => {
    // the lower half of a circle (CircleGeometry's uvs are the square round it): rings of red,
    // white and blue from the rim in, stars on the blue, pleats over them
    for (const [r, c] of [[128, '#c8202f'], [100, '#f4f1ea'], [74, '#c8202f'], [50, '#1f3a8a']]) { g.fillStyle = c; g.beginPath(); g.arc(128, 128, r, 0, Math.PI); g.fill(); }
    g.fillStyle = '#f4f1ea';
    for (let i = 0; i < 5; i++) { const a = ((i + 0.5) / 5) * Math.PI; star(g, 128 + Math.cos(a) * 32, 128 + Math.sin(a) * 32, 7); }
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    g.lineWidth = 2;
    for (let i = 1; i < 16; i++) { const a = (i / 16) * Math.PI; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.cos(a) * 128, 128 + Math.sin(a) * 128); g.stroke(); }
  });
  const pleats = new MeshStandardMaterial({ map: fan, roughness: 0.8, side: DoubleSide });
  const half = new CircleGeometry(0.32, 32, Math.PI, Math.PI); // the lower half
  for (const x of [-1.72, -0.58, 0.58, 1.72]) {
    const f = new Mesh(half, pleats);
    f.position.set(x, 1.04, 1.14);
    bar.group.add(f);
  }

  /* ---------- Little flags along the walk ---------- */
  const flag = canvasTexture(190, 100, (g, w, h) => {
    for (let i = 0; i < 13; i++) { g.fillStyle = i % 2 ? '#f4f1ea' : '#c8202f'; g.fillRect(0, (i * h) / 13, w, h / 13 + 1); }
    g.fillStyle = '#1f3a8a';
    g.fillRect(0, 0, w * 0.4, (h * 7) / 13);
    g.fillStyle = '#f4f1ea';
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) star(g, 8 + c * 14 + (r % 2) * 7, 7 + r * 12, 3.2);
  });
  const spots = [];
  [0.6, 0.55, 0.5, 0.45, 0.4, 0.35, 0.3, 0.25].forEach((polar, i) => {
    const w = at.walk(polar, i % 2 ? -1 : 1, 0.08);
    if (w) spots.push(w.matrix);
  });
  // each flag on a stick, a metre is 12.5 of its sizes (placed 0.08 across)
  root.add(instanced(new CylinderGeometry(0.06, 0.06, 7, 5).translate(0, 3.5, 0), new MeshStandardMaterial({ color: 0xc9b48a, roughness: 0.9 }), spots));
  root.add(instanced(new PlaneGeometry(3.6, 1.9).translate(1.8, 5.9, 0), new MeshStandardMaterial({ map: flag, roughness: 0.8, side: DoubleSide }), spots));

  /* ---------- A top hat in stars and stripes ---------- */
  hat(kit, () => {
    const stripes = canvasTexture(256, 64, (g) => { for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#f4f1ea' : '#c8202f'; g.fillRect(i * 16, 0, 16, 64); } });
    const band = canvasTexture(256, 32, (g) => { g.fillStyle = '#1f3a8a'; g.fillRect(0, 0, 256, 32); g.fillStyle = '#f4f1ea'; for (let x = 12; x < 256; x += 25) star(g, x, 16, 9); });
    const h = new Group();
    h.add(new Mesh(new CylinderGeometry(0.27, 0.27, 0.014, 40), new MeshStandardMaterial({ color: BLUE, roughness: 0.6 })));
    h.add(new Mesh(new CylinderGeometry(0.16, 0.16, 0.34, 32, 1, true).translate(0, 0.17, 0), new MeshStandardMaterial({ map: stripes, roughness: 0.6, side: DoubleSide })));
    h.add(new Mesh(new CylinderGeometry(0.16, 0.16, 0.01, 32).translate(0, 0.34, 0), new MeshStandardMaterial({ color: WHITE, roughness: 0.6 })));
    h.add(new Mesh(new CylinderGeometry(0.163, 0.163, 0.06, 32, 1, true).translate(0, 0.045, 0), new MeshStandardMaterial({ map: band, roughness: 0.5 })));
    return h;
  }, -0.06);

  /* ---------- Fireworks over the lagoon and the bar, all night (none under reduced motion) ---------- */
  const fx = reducedMotion ? null : fireworks(scene, { sfx, pool: 10 });
  const up = pond.clone().normalize(), side = new Vector3().crossVectors(up, new Vector3(0, 1, 0)).normalize(), fwd = new Vector3().crossVectors(side, up);
  const local = (x, y, z) => bar.group.localToWorld(new Vector3(x, y, z));
  // over the lagoon, and every other one behind the bar, so they're in view from where you land
  let n = 0;
  const shell = (delay = 0) => {
    let from, to;
    if (n++ % 2) {
      from = surfacePoint(up).addScaledVector(side, (Math.random() - 0.5) * 3);
      to = from.clone().addScaledVector(up, 9 + Math.random() * 6).addScaledVector(side, (Math.random() - 0.5) * 10).addScaledVector(fwd, (Math.random() - 0.5) * 6);
    } else {
      const x = (Math.random() - 0.5) * 14;
      from = local(x * 0.5, 0, -9);
      to = local(x, 9 + Math.random() * 5, -6 - Math.random() * 4);
    }
    return fx && fx.launch(from, to, [RED, WHITE, BLUE, RED, 0xf0c45a][Math.floor(Math.random() * 5)], { delay, speed: 5 });
  };
  let wait = 0, next = 1;

  return {
    count: spots.length,
    update(t, dt) {
      if (!fx) return;
      fx.update(dt);
      wait += dt;
      if (wait > next) {
        wait = 0;
        next = 1.5 + Math.random() * 3.5;
        shell();
        if (Math.random() < 0.35) shell(0.3);
        if (Math.random() < 0.1) { shell(0.6); shell(0.9); } // now and then a flurry
      }
    },
  };
}
