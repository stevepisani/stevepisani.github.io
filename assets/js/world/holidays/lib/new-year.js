// New Year's Eve and New Year's Day on the planet (assets/js/holidays.js): the year in gold
// marquee lights in the gable over the sign, gold and white bulbs, a party hat on the bartender,
// and fireworks over the roof. On the eve the year counts down its last ten seconds at the
// visitor's own midnight, then the sky fills for a minute; on the day there's one now and then.
// A preview (`?holiday=`) has its midnight 20 seconds after the planet appears (`ready()`).
import { Group, Mesh, Vector3, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, BoxGeometry, RepeatWrapping } from 'three';
import { hat, coneHat, bulbs, ball, canvasTexture, fireworks } from './dress.js';

const GOLD = 0xf0c45a, WHITE = 0xfff4dc;
const SHELLS = [GOLD, WHITE, 0xff5aa8, 0x5ae0ff, GOLD];

export function newYear(kit, { eve }) {
  const { scene, bar, reducedMotion, sfx, preview } = kit;
  const root = new Group();
  root.name = eve ? 'new-years-eve' : 'new-years-day';
  scene.add(root);

  bulbs(kit, [GOLD, WHITE], [1.2, 1]);

  /* ---------- The year, in the gable over the sign ---------- */
  let shown = null;
  const plate = new Mesh(new PlaneGeometry(1.25, 0.4), new MeshBasicMaterial({ transparent: true, toneMapped: false, depthWrite: false }));
  plate.material.color.setScalar(2); // into the bloom, like the neon
  plate.position.set(0, 4.9, 2.6);
  const backing = new Mesh(new BoxGeometry(1.33, 0.46, 0.04), new MeshStandardMaterial({ color: 0x2a180e, roughness: 0.9 }));
  backing.position.set(0, 4.9, 2.565);
  plate.userData.noBatch = true; // it changes (batch.js)
  bar.group.add(plate, backing);
  const show = (text) => {
    if (text === shown) return;
    shown = text;
    const old = plate.material.map;
    plate.material.map = canvasTexture(512, 164, (g, w, h) => {
      g.font = `700 ${text.length > 2 ? 120 : 132}px Fraunces, Georgia, serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.shadowColor = '#ffb640';
      g.shadowBlur = 18;
      g.fillStyle = '#ffe6a3';
      g.fillText(text, w / 2, h / 2 + 6);
      // marquee bulbs top and bottom
      g.shadowBlur = 8;
      for (let x = 14; x < w; x += 32) { g.beginPath(); g.arc(x, 9, 5, 0, 7); g.arc(x, h - 9, 5, 0, 7); g.fill(); }
    });
    plate.material.needsUpdate = true;
    if (old) old.dispose();
  };

  /* ---------- A party hat: gold and black stripes, a white pompom ---------- */
  hat(kit, () => {
    const stripes = canvasTexture(256, 32, (g) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#1b1712' : '#e2b440'; g.fillRect(i * 32, 0, 32, 32); } });
    stripes.wrapS = RepeatWrapping;
    const h = coneHat({ base: 0.13, height: 0.34, flop: 0, material: new MeshStandardMaterial({ map: stripes, roughness: 0.35, metalness: 0.3 }) });
    h.add(ball(0.04, new MeshStandardMaterial({ color: 0xf4f1ea, roughness: 1 }), [0, 0.345, 0]));
    return h;
  }, -0.2);

  /* ---------- Fireworks over the roof ---------- */
  const fx = reducedMotion ? null : fireworks(scene, { sfx });
  const local = (x, y, z) => bar.group.localToWorld(new Vector3(x, y, z));
  const shell = (delay = 0) => {
    const x = (Math.random() - 0.5) * 14;
    return fx && fx.launch(local(x * 0.5, 0, -9), local(x, 9 + Math.random() * 5, -6 - Math.random() * 4), SHELLS[Math.floor(Math.random() * SHELLS.length)], { delay });
  };
  let midnight = preview ? Infinity : new Date(new Date().setHours(24, 0, 0, 0)).getTime();
  const year = new Date().getFullYear() + (eve ? 1 : 0);
  let next = 4, wait = 0, show60 = 0;
  show(String(year));

  return {
    count: 1,
    get shown() { return shown; },
    ready() { if (preview) midnight = Date.now() + 20000; },
    update(t, dt) {
      if (eve) {
        const ms = midnight - Date.now(), left = Math.ceil(ms / 1000);
        if (left <= 10 && left > 0) show(String(left));
        else if (left <= 0 && left > -60) { // a happy new year: the year flashing, the sky full
          show(Math.floor(-ms / 500) % 2 && left > -10 ? '' : String(year));
          show60 = 1;
        } else show(String(year));
      }
      if (!fx) return;
      fx.update(dt);
      wait += dt;
      const busy = show60 && (midnight - Date.now()) > -60000;
      if (wait > (busy ? 0.4 : next)) {
        wait = 0;
        next = eve && !show60 ? 25 + Math.random() * 15 : 7 + Math.random() * 7;
        shell();
        if (busy || Math.random() < 0.3) shell(0.25);
      }
    },
  };
}
