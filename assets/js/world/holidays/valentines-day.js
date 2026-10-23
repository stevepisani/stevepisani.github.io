// Valentine's Day on the planet (14 February, assets/js/holidays.js): a pink neon heart in the
// gable over the sign, beating, rose petals strewn up the walk, the bulbs pink, red and white,
// and a headband of two hearts on springs for the bartender.
import { Group, Mesh, Vector3, Color, Shape, ShapeGeometry, ExtrudeGeometry, TubeGeometry, TorusGeometry, CatmullRomCurve3, CylinderGeometry, MeshStandardMaterial, BoxGeometry, DoubleSide } from 'three';
import { bulbs, hat, instanced, random, scatter } from './lib/dress.js';

const PINK = 0xff4f9a, RED = 0xd8203a, ROSE = 0xb3142e, BLUSH = 0xf7a8c4;

// the classic heart curve, `size` across, its point at the bottom
const heartAt = (t, size) => new Vector3(16 * Math.sin(t) ** 3, 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t), 0).multiplyScalar(size / 34);
function heartShape(size) {
  const s = new Shape();
  for (let i = 0; i <= 48; i++) { const p = heartAt((i / 48) * Math.PI * 2, size); i ? s.lineTo(p.x, p.y) : s.moveTo(p.x, p.y); }
  return s;
}

export function decorate(kit) {
  const { scene, bar, glow, reducedMotion } = kit;
  const root = new Group();
  root.name = 'valentines-day';
  scene.add(root);

  bulbs(kit, [PINK, RED, 0xfff0f4], [1.6, 1.4, 0.9]);

  /* ---------- A neon heart in the gable, over the sign ---------- */
  const heart = new Group();
  heart.position.set(0, 5.05, 2.66);
  heart.userData.noBatch = true; // it beats (batch.js)
  const tube = new CatmullRomCurve3(Array.from({ length: 64 }, (_, i) => heartAt((i / 64) * Math.PI * 2, 0.78)), true);
  heart.add(new Mesh(new TubeGeometry(tube, 160, 0.022, 6, true), glow(PINK, 3.2)));
  const back = new Mesh(new BoxGeometry(0.95, 0.82, 0.04), new MeshStandardMaterial({ color: 0x2a180e, roughness: 0.9 }));
  back.position.set(0, -0.06, -0.05);
  heart.add(back);
  bar.group.add(heart);

  /* ---------- Rose petals strewn up the walk ---------- */
  const petal = new Shape();
  petal.moveTo(0, -0.03);
  petal.quadraticCurveTo(0.04, -0.02, 0.035, 0.025);
  petal.quadraticCurveTo(0, 0.045, -0.035, 0.025);
  petal.quadraticCurveTo(-0.04, -0.02, 0, -0.03);
  const petals = scatter(kit, 140, random(214), { polar: [0.18, 0.62], spread: 0.35, keep: (edge, r) => edge < 0.25 * r() + 0.05, size: [0.8, 1.3], tilt: 0.6, lift: 0.012 });
  const strewn = instanced(new ShapeGeometry(petal).rotateX(-Math.PI / 2), new MeshStandardMaterial({ roughness: 0.6, side: DoubleSide }), petals, { shadow: false });
  const shades = [RED, ROSE, PINK, BLUSH, RED];
  petals.forEach((_, i) => strewn.setColorAt(i, new Color(shades[i % shades.length])));
  strewn.receiveShadow = true;
  root.add(strewn);

  /* ---------- A headband with two hearts on springs ---------- */
  const springs = [];
  hat(kit, () => {
    const h = new Group(), red = new MeshStandardMaterial({ color: RED, roughness: 0.4, metalness: 0.1 });
    h.add(new Mesh(new TorusGeometry(0.18, 0.01, 6, 32, Math.PI).translate(0, -0.14, 0), new MeshStandardMaterial({ color: 0x1b1712, roughness: 0.5 }))); // the band, ear to ear over the top
    const little = new ExtrudeGeometry(heartShape(0.12), { depth: 0.025, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2 }).translate(0, 0, -0.0125);
    for (const s of [-1, 1]) {
      const stalk = new Group();
      stalk.position.set(s * 0.08, 0.02, 0);
      stalk.rotation.z = -s * 0.25;
      stalk.add(new Mesh(new CylinderGeometry(0.004, 0.004, 0.2, 5).translate(0, 0.1, 0), new MeshStandardMaterial({ color: 0x8a8a8a, metalness: 0.8, roughness: 0.3 })));
      const top = new Mesh(little, red);
      top.position.y = 0.24;
      stalk.add(top);
      h.add(stalk);
      springs.push(stalk);
    }
    return h;
  }, 0);

  return {
    count: petals.length,
    update(t) {
      if (reducedMotion) return;
      // a heartbeat: lub-dub, then a rest
      const k = (t * 1.1) % 1, beat = Math.exp(-((k - 0.08) ** 2) / 0.002) + 0.6 * Math.exp(-((k - 0.28) ** 2) / 0.002);
      heart.scale.setScalar(1 + 0.07 * beat);
      springs.forEach((s, i) => { s.rotation.z = (i ? -1 : 1) * 0.25 + Math.sin(t * 7 + i) * 0.08; });
    },
  };
}
