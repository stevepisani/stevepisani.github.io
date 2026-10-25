// "Rockets and Horses" as a walk along one track (published as dist/gauge.js; the stops are
// _data/gauge.yml, the page _includes/gauge-walk.html). The track runs along +x through the eras,
// Rome at the far -x end, today's rails at 0, the tunnel and the pad at +x. Scrolling the cards
// moves the camera from one stop to the next (the first five walk back in time, then it rises and
// flies over all of it to the booster and the Shuttle), and a sideways drag looks around the stop.
// The camera moves only with the scroll or a drag; with reduced motion the same, but the long way
// is a cut. Each stop says what its brass measure reads (`measure` in gauge.yml, in the corner),
// and how wide the way is there (`gauge`, inches): the ruts before Stephenson don't agree.
// Without WebGL the page stays the cards. It draws at once with stand-ins built in code (sets.js)
// and a plain sky, then puts in what tools/gauge-assets.mjs made, as each arrives: the Meshy
// models in their stand-ins' places (assets/models/gauge/), a real sky to see and be lit by, the
// sun where the sky's sun is, and photographed ground (assets/images/gauge/, Poly Haven, CC0).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import SPEC from '../../../tools/models/gauge.json';
import { alive } from './alive.js';
import { GAUGE, horse, chariot, romanCart, wagon, chaldron, locomotive, boxcar, boosterCar, track, gaugeBar, shuttle } from './sets.js';
import { eras, eraMaterials, groundMaterial } from './eras.js';

const root = document.getElementById('walk');
const stage = root?.querySelector('.walk__stage');
const canvas = root?.querySelector('.walk__canvas');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches; // a phone: lighter shadows, fewer pixels
const script = document.querySelector('script[data-models]');
const MODELS = script?.dataset.models, IMAGES = script?.dataset.images;

// Where each scene stands on the track, where the camera stands to see it, and what it looks at
// (all relative to the scene's x). `bar`: where the brass measure lies across the gauge.
const SCENES = {
  rails: { x: 0, build: boxcar, eye: [10, 3.4, 11], at: [1, 1.6, 0], bar: [8.6, 0.2] },
  locomotive: { x: -24, build: locomotive, eye: [-6.5, 2.4, 7.5], at: [0.2, 1.5, 0], bar: [-4.5, 0.2] },
  tram: { x: -42, horse: true, build: chaldron, eye: [-1.6, 2.1, 7.4], at: [1.3, 1.0, 0], bar: [-1.5, 0.18] },
  wagon: { x: -60, build: wagon, eye: [4.5, 2.4, 6], at: [-0.6, 1, 0], bar: [2, 0.07] },
  ruts: { x: -78, build: romanCart, eye: [4.5, 2, 5.5], at: [0, 0.8, 0], bar: [2, 0.07] },
  horses: { x: -96, horse: true, build: chariot, eye: [3.6, 1.9, 2.4], at: [-2.6, 1.2, 0], bar: [-2.05, 1.05] }, // the measure across their back ends
  booster: { x: 34, build: boosterCar, eye: [-11, 3.6, 10], at: [2, 2.6, 0], bar: [-8.6, 0.2] },
  shuttle: { x: 140, build: shuttle, eye: [-74, 34, 92], at: [0, 29, 0] },
};
const TUNNEL_X = 49; // the booster's flatcar stands short of its mouth

if (root && canvas) start();

function start() {
  // no WebGL: the cards are the whole story (asked of a spare canvas, so three.js logs no error)
  if (!document.createElement('canvas').getContext('webgl2')) return;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.5 : 2)); // and less, if frames come slowly (draw)
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const stops = [...root.querySelectorAll('.walk__stop')];
  const order = stops.map((s) => SCENES[s.dataset.scene]).filter(Boolean);
  if (order.length !== stops.length) throw new Error('gauge.js: a stop in _data/gauge.yml names a scene it has no set for');
  // each stop's widths across the way, in metres: the first is where its wheels run
  const widths = stops.map((s) => (s.dataset.gauge || '56.5').split(' ').map((n) => n * 0.0254));
  const across = (name) => widths[order.indexOf(SCENES[name])] || [GAUGE];
  root.classList.add('is-live');
  // lost the GPU (a phone under pressure): the cards alone, until it's back
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); root.classList.remove('is-live'); });
  canvas.addEventListener('webglcontextrestored', () => { root.classList.add('is-live'); ask(); });

  const scene = new THREE.Scene();
  const sky = skyTexture();
  scene.background = sky;
  scene.fog = new THREE.Fog(0xe8b98f, 60, 260);
  const hemi = new THREE.HemisphereLight(0xffe2c0, 0x4a4030, 1.4);
  scene.add(hemi);
  // the sun, its shadow following the stop you're at (sunDir is set from the sky once it's in)
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.6), sunDir = new THREE.Vector3(-0.6, 0.45, 0.5).normalize();
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(coarse ? 1024 : 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  const M = materials();
  // the ground, and the way across it, era by era
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2), M.ground);
  ground.position.set(0, -0.02, 0);
  scene.add(ground);
  const strip = (x0, x1, mat, w = 3.2) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.04, w), mat);
    m.position.set((x0 + x1) / 2, 0, 0);
    scene.add(m);
  };
  const X = Object.fromEntries(Object.entries(SCENES).map(([k, s]) => [k, s.x]));
  X.tunnel = TUNNEL_X;
  // the way: the Circus's raked sand (Pompeii's paving is its setting's), the lane, the wagonway
  strip(-128, X.ruts - 10, M.arena, 5);
  strip(X.wagon - 9, X.wagon + 9, M.dirt, 3);
  strip(X.tram - 9, X.tram + 9, M.dirt, 2.4);
  // the ruts: wheel tracks in the sand, grooves worn in Pompeii's stone, then the Middle Ages', several widths side by side
  for (const [x0, x1, name, mat] of [[-128, X.ruts - 10, 'horses', M.track], [X.ruts - 10, X.ruts + 9, 'ruts', M.rut], [X.wagon - 9, X.wagon + 9, 'wagon', M.rut]]) {
    for (const w of across(name)) for (const s of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.02, 0.16), mat);
      r.position.set((x0 + x1) / 2, 0.035, s * (w / 2 + 0.08));
      scene.add(r);
    }
  }
  scene.add(track(M, X.tram - 9, X.tram + 9, 'wood'));
  scene.add(track(M, X.tram + 9, TUNNEL_X + 2, 'iron'));
  // each era's setting, shown only near its stop (draw)
  const settings = eras(M, X), shown = order.map((s) => settings[Object.keys(SCENES).find((k) => SCENES[k] === s)]);
  for (const g of Object.values(settings)) scene.add(g);

  for (const [i, s] of order.entries()) {
    const w = widths[i][0], thing = s.build(M, w);
    thing.position.x = s.x;
    thing.traverse((o) => { if (o.userData.slot) o.userData.gauge = w; }); // fill() puts the wheels this far apart
    scene.add(thing);
    if (s.bar) {
      const b = gaugeBar(M, s.bar[1], w);
      b.position.x = s.x + s.bar[0];
      scene.add(b);
    }
  }

  scene.traverse((o) => { if (o.isMesh) { o.castShadow = o !== ground; o.receiveShadow = true; } });

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1200);
  const v = (a, x) => new THREE.Vector3(a[0] + x, a[1], a[2]);
  const poses = order.map((s) => ({ eye: v(s.eye, s.x), at: v(s.at, s.x) }));
  // where each stop's card leaves room: the view is shifted so its subject sits in the middle of
  // that room, right of the card on a wide screen, above it on a tall one (resize)
  let room = order.map(() => [0, 0]);

  let yaw = 0, progress = -1, visible = true, queued = false;
  const lives = [], horseStops = order.flatMap((s, i) => (s.horse ? [i] : []));
  const eye = new THREE.Vector3(), at = new THREE.Vector3();

  function pose(p) {
    const i = Math.min(Math.floor(p), poses.length - 1), j = Math.min(i + 1, poses.length - 1);
    // hold still while a card is near the middle, then move on: smoothstep over the gap's middle
    let f = THREE.MathUtils.clamp((p - i - 0.2) / 0.6, 0, 1);
    f = f * f * (3 - 2 * f);
    const far = Math.abs(poses[j].eye.x - poses[i].eye.x);
    if (far > 60 && reducedMotion) f = f < 0.5 ? 0 : 1; // the long way, with reduced motion: a cut
    eye.lerpVectors(poses[i].eye, poses[j].eye, f);
    at.lerpVectors(poses[i].at, poses[j].at, f);
    // a long way (Rome to Utah): rise and fly over it all
    if (far > 60 && !reducedMotion) eye.y += Math.sin(f * Math.PI) * far * 0.22;
    // a drag turns the view round the stop
    if (yaw) {
      const d = eye.clone().sub(at);
      d.applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
      eye.copy(at).add(d);
    }
    // a tall, narrow screen sees less across: stand further back
    if (camera.aspect < 1) eye.sub(at).multiplyScalar(Math.min(1.7, 0.85 / camera.aspect)).add(at);
    camera.position.copy(eye);
    camera.lookAt(at);
    const [ox, oy] = [0, 1].map((k) => THREE.MathUtils.lerp(room[i][k], room[j][k], f));
    if (ox || oy) camera.setViewOffset(stage.clientWidth, stage.clientHeight, -ox, oy, stage.clientWidth, stage.clientHeight);
    // the shadow's box round what you're looking at, as wide as the view needs
    const r = THREE.MathUtils.clamp(eye.distanceTo(at) * 1.2, 12, 90), c = sun.shadow.camera;
    c.left = c.bottom = -r; c.right = c.top = r; c.near = 1; c.far = r * 6;
    c.updateProjectionMatrix();
    sun.target.position.copy(at);
    sun.position.copy(at).addScaledVector(sunDir, r * 3);
  }

  // progress: which stop's card is at the middle of the screen, and how far on toward the next
  function measure() {
    const mid = innerHeight / 2;
    const c = stops.map((s) => { const r = s.getBoundingClientRect(); return r.top + r.height / 2 - mid; });
    if (c[0] >= 0) return 0;
    for (let i = 0; i < c.length - 1; i++) if (c[i + 1] > 0) return i + -c[i] / (c[i + 1] - c[i]);
    return c.length - 1;
  }

  const pill = root.querySelector('.walk__gauge');
  let last = 0, slow = 0, drawn = 0, said = 0;
  function draw(now) {
    queued = false;
    if (!visible) return;
    // the camera eases after the scroll instead of jumping with each scroll event (a phone's come
    // in bursts), and settles a moment after it stops; with reduced motion it keeps up exactly.
    // By the clock, so a slow phone keeps up too; after a pause (nothing drawn), one frame's worth.
    const gap = (now - last) / 1000, dt = gap < 0.25 ? gap : 1 / 60, want = measure();
    let p = progress < 0 || reducedMotion ? want : progress + (want - progress) * (1 - Math.exp(-dt * 9));
    if (Math.abs(want - p) < 0.002) p = want;
    if (progress >= 0 && p !== progress) yaw *= Math.exp(-Math.abs(p - progress) * 3); // scrolling on brings the view back round
    progress = p;
    // what the measure reads: the nearest stop's
    const near = Math.round(p);
    if (pill && near !== said) { said = near; pill.textContent = stops[near].dataset.measure || ''; }
    let more = p !== want;
    // the horses breathe while one's in view: 30 frames a second is plenty for that alone
    const breathing = lives.length && !reducedMotion && horseStops.some((i) => Math.abs(p - i) < 0.8);
    last = now;
    if (breathing) {
      if (!more && now - drawn < 30) { ask(); return; }
      for (const l of lives) l.update(now / 1000);
      more = true;
    }
    // a setting is there from when the camera sets off toward its stop until it's nearly at the next
    shown.forEach((g, i) => { if (g) g.visible = Math.abs(p - i) < 0.8; });
    pose(p);
    renderer.render(scene, camera);
    drawn = now;
    // frame after frame (only while it moves): if they come slowly, draw fewer pixels
    if (gap > 0 && gap < 0.1) {
      slow = slow * 0.9 + (gap > 0.03 ? 0.1 : 0);
      if (slow > 0.6 && renderer.getPixelRatio() > 1) { renderer.setPixelRatio(Math.max(1, renderer.getPixelRatio() - 0.25)); resize(); slow = 0; }
    }
    if (more) ask();
  }
  const ask = () => { if (!queued) { queued = true; requestAnimationFrame(draw); } };

  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // a narrow screen: a little wider (and pose() stands further back)
    camera.fov = w < h ? 58 : 50;
    room = stops.map((s) => {
      const card = s.querySelector('.walk__card'), r = card.getBoundingClientRect();
      // wide: half the card's right edge, so the subject centres in what's beside it; tall: up by half the card
      return w >= h ? [Math.min(r.right / 2, w * 0.2), 0] : [0, Math.min((card.offsetHeight + 52) / 2, h * 0.24)];
    });
    camera.clearViewOffset();
    camera.updateProjectionMatrix();
    ask();
  }
  new ResizeObserver(resize).observe(stage);
  addEventListener('scroll', ask, { passive: true });
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) ask(); }).observe(root);

  // drag sideways to look round the stop (vertical swipes still scroll the page)
  let dragX = null, down = null;
  // the hint goes once you've dragged, here or on an earlier visit
  const knows = () => { try { return localStorage.getItem('walk-dragged'); } catch { return null; } };
  if (knows()) root.classList.add('knows-drag');
  stage.addEventListener('pointerdown', (e) => {
    dragX = e.clientX; down = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    stage.setPointerCapture(e.pointerId);
    root.classList.add('is-dragged');
    try { localStorage.setItem('walk-dragged', '1'); } catch { /* private window: the hint comes back next time */ }
  });
  stage.addEventListener('pointermove', (e) => {
    if (dragX === null) return;
    yaw = THREE.MathUtils.clamp(yaw - (e.clientX - dragX) * 0.006, -1.4, 1.4);
    dragX = e.clientX;
    ask();
  });
  const end = () => { dragX = null; };
  // a tap (not a drag) on a horse: it tosses its head
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  stage.addEventListener('pointerup', (e) => {
    end();
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8 || e.timeStamp - down.t > 500) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = lives.find((l) => ray.intersectObjects(l.meshes(), false).length);
    if (hit) { hit.tap(performance.now() / 1000); ask(); }
  });
  stage.addEventListener('pointercancel', end);

  resize();
  const loaded = new Set();
  window.__walk = { scenes: order.length, progress: () => progress, loaded }; // for tools/smoke.mjs
  // the real things, once the stand-ins are drawn
  if (MODELS) requestAnimationFrame(() => dressUp({ scene, M, renderer, hemi, sun, sunDir, ground, loaded, ask, lives }));
}

function materials() {
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
  return {
    ...eraMaterials(std),
    ground: groundMaterial(0x7d8050), arena: std(0xd8c39a, { roughness: 1 }), track: std(0xb59a72, { roughness: 1 }),
    horse: std(0x6b3f22), mane: std(0x2a1a10), wood: std(0x8a5a33), hay: std(0xd9b46a),
    iron: std(0x34373c, { roughness: 0.6, metalness: 0.4 }), steel: std(0xa7adb3, { roughness: 0.35, metalness: 0.8 }),
    paint: std(0xd8b23a, { side: THREE.DoubleSide }), boxcar: std(0x7a3524), white: std(0xece8df, { roughness: 0.6 }),
    tank: std(0xc4692b, { roughness: 0.7 }), stone: std(0xb9ad97, { roughness: 1 }),
    dirt: std(0x8a6a48, { roughness: 1 }), rut: std(0x352a20, { roughness: 1 }),
    ballast: std(0x77736c, { roughness: 1 }), sleeper: std(0x4b3626), dark: new THREE.MeshBasicMaterial({ color: 0x050505 }),
    brass: std(0xe0b04a, { emissive: 0xffb43a, emissiveIntensity: 0.9, metalness: 0.6, roughness: 0.3 }),
    flame: new THREE.MeshBasicMaterial({ color: 0xffb35a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
  };
}

// late afternoon, warm low down: the sky until the real one is in
function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d'), grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#6f8fb8');
  grd.addColorStop(0.55, '#e6b48c');
  grd.addColorStop(1, '#f2c79a');
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// The site's dark theme (or the terminal one, or none chosen on a dark system): the scene at dusk.
const dark = () => { const t = document.documentElement.dataset.theme; return t ? t !== 'light' : matchMedia('(prefers-color-scheme: dark)').matches; };

// What tools/gauge-assets.mjs made (assets/models/gauge/manifest.json says what's there), put in
// as each arrives; anything missing stays as it was.
async function dressUp({ scene, M, renderer, hemi, sun, sunDir, ground, loaded, ask, lives }) {
  let made;
  try { made = await (await fetch(MODELS + 'manifest.json')).json(); } catch (e) { return; }

  // the sky: an HDR to be lit by (and to find the sun in), a photograph to see. Two of them: the
  // day, and dusk for the dark theme, each fetched the first time it's wanted and kept
  const skies = {};
  const sky = (name) => (skies[name] ||= Promise.all([
    new Promise((ok) => new HDRLoader().setDataType(THREE.FloatType).load(IMAGES + name + '.hdr', ok, undefined, () => ok(null))),
    new Promise((ok) => new THREE.TextureLoader().load(IMAGES + name + '.jpg', ok, undefined, () => ok(null))),
  ]).then(([hdr, photo]) => {
    if (!hdr || !photo) return null;
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(renderer), env = pmrem.fromEquirectangular(hdr).texture;
    pmrem.dispose();
    const lit = readSky(hdr.image);
    hdr.dispose();
    photo.mapping = THREE.EquirectangularReflectionMapping;
    photo.colorSpace = THREE.SRGBColorSpace;
    // the haze the ground fades into: the photograph's own colour just above its horizon
    const c = document.createElement('canvas');
    c.width = 64; c.height = 32;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(photo.image, 0, 0, 64, 32);
    const px = g.getImageData(0, 15, 64, 1).data, sum = [0, 0, 0];
    for (let i = 0; i < px.length; i += 4) for (let k = 0; k < 3; k++) sum[k] += px[i + k];
    const haze = new THREE.Color().setRGB(sum[0] / 64 / 255, sum[1] / 64 / 255, sum[2] / 64 / 255, THREE.SRGBColorSpace);
    return { env, photo, haze, ...lit };
  }));
  const light = async () => {
    const dusk = dark() && made._dusk, s = await sky(dusk ? 'dusk' : 'sky');
    if (!s || (dark() && made._dusk) !== dusk) return; // none, or the theme changed again meanwhile
    scene.environment = s.env;
    scene.background = s.photo;
    sunDir.copy(s.sun);
    sun.color.copy(s.color);
    sun.intensity = dusk ? 2.2 : 3.2;
    hemi.intensity = 0.15;
    renderer.toneMappingExposure = dusk ? 0.8 : 0.9;
    scene.fog.color.copy(s.haze);
    scene.fog.near = 120;
    scene.fog.far = 700;
    loaded.add(dusk ? 'dusk' : 'sky');
    ask();
  };
  if (made._sky) {
    light();
    new MutationObserver(light).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', light);
  }

  // the ground: each material its own copy of its photographs, tiled to its size (metres a tile)
  const tex = new THREE.TextureLoader();
  const sets = {};
  const photos = (kind) => (sets[kind] ||= ['diff', 'nor', 'rough'].map((m) => new Promise((ok) => tex.load(IMAGES + `${kind}-${m}.jpg`, ok, undefined, () => ok(null)))));
  const dress = async (mat, kind, rx, ry, tint = 0xffffff) => {
    const [map, normal, rough] = await Promise.all(photos(kind));
    if (!map) return;
    const fit = (t) => { t = t.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8; return t; };
    mat.map = fit(map);
    mat.map.colorSpace = THREE.SRGBColorSpace;
    if (normal) mat.normalMap = fit(normal);
    if (rough) mat.roughnessMap = fit(rough);
    if (Array.isArray(tint)) mat.color.setRGB(...tint); else mat.color.set(tint); // [r, g, b]: brighter than the photograph
    mat.roughness = 1;
    mat.needsUpdate = true;
    loaded.add(kind);
    ask();
  };
  const t = made._textures || {};
  if (t.grass) dress(M.ground, 'grass', 750, 750, 0xa4a890);
  if (t.dirt) {
    dress(M.dirt, 'dirt', 6, 1);
    dress(M.arena, 'dirt', 13, 1.6, 0xf4e2bc);
    dress(M.sand, 'dirt', 1, 1, 0xf4e2bc);
    photos('dirt')[0].then((map) => { if (map) { const u = M.ground.userData.uniforms; u.uEarth.value = map.clone(); u.uEarth.value.wrapS = u.uEarth.value.wrapT = THREE.RepeatWrapping; u.uEarth.value.colorSpace = THREE.SRGBColorSpace; u.uHasEarth.value = 1; ask(); } });
  }
  if (t.ballast) dress(M.ballast, 'ballast', 56, 1.5);
  // the settings' blocks have their UVs in metres (eras.js): a photograph once a unit, tinted
  if (t.stone) for (const [mat, tint] of [[M.basalt, 0x6e6c6a], ...(t.masonry ? [] : [[M.kerb, 0xb4ad9f], [M.drystone, 0xc9bfae], [M.marble, 0xf2ece0]])]) dress(mat, 'stone', 1, 1, tint);
  if (t.rock) dress(M.redrock, 'rock', 1, 1, [1.9, 1.05, 0.68]);
  if (t.wood) { dress(M.sleeper, 'wood', 1, 0.15, 0x8a7a68); dress(M.wood, 'wood', 1, 1); dress(M.oak, 'wood', 1, 1, 0x9a8670); dress(M.pole, 'wood', 1, 1, 0x8a7560); }
  if (t.masonry) for (const [mat, tint] of [[M.marble, 0xf4eee2], [M.kerb, 0xb4ad9f], [M.drystone, 0xc2b8a6]]) dress(mat, 'masonry', 1, 1, tint);
  if (t.plaster) for (const [mat, tint] of [[M.plaster, 0xe8d8b8], [M.plasterRed, 0xa04432], [M.plasterOchre, 0xd6a860], [M.whitewash, 0xf2eee4], [M.concrete, 0xc8c4bc]]) dress(mat, 'plaster', 1, 1, tint);
  if (t.thatch) dress(M.thatch, 'thatch', 1, 1, 0xd8c090);

  // the models, each in every stand-in's place that's its slot
  const gltf = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const slots = {};
  scene.traverse((o) => { if (o.userData.slot) (slots[o.userData.slot] ||= []).push(o); });
  await Promise.all(Object.entries(SPEC.models).filter(([name]) => made[name]?.file && slots[name]).map(([name, m]) => new Promise((ok) => {
    gltf.load(MODELS + made[name].file, ({ scene: model }) => {
      model.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = o.receiveShadow = true;
        if (o.material.map) o.material.map.anisotropy = 8;
      });
      const copies = slots[name].map((stand) => fill(stand, model, m.fit || {}));
      if (name === 'horse') lives.push(...copies.map(alive));
      loaded.add(name);
      ask();
      ok();
    }, undefined, ok);
  })));
}

// Put a copy of `model` where `stand` (a stand-in) is: turned, scaled, centred on it and standing
// where it stands; the stand-in is hidden. Scaled so its size along `along` (x, the track; y, up)
// matches the stand-in's, or, with along "wheels", so its wheels sit on the rails (or in the ruts):
// what it stands on, its lowest few centimetres, as wide as the gauge and the wheels' treads.
const box = new THREE.Box3(), size = new THREE.Vector3(), mid = new THREE.Vector3();
function fill(stand, model, { rotateY = 0, along = 'x' }) {
  const treads = (stand.userData.gauge || GAUGE) + 0.26;
  stand.updateWorldMatrix(true, true);
  box.setFromObject(stand);
  const want = box.getSize(new THREE.Vector3()), at = box.getCenter(new THREE.Vector3()), floor = box.min.y;
  const copy = model.clone();
  const holder = new THREE.Group().add(copy);
  copy.rotation.y = rotateY + (stand.userData.turn || 0);
  holder.updateMatrixWorld(true);
  box.setFromObject(holder).getSize(size);
  const feet = along === 'wheels' && footprint(holder, box.min.y + size.y * 0.03);
  holder.scale.setScalar(feet ? treads / (feet[1] - feet[0]) : want[along] / size[along]);
  holder.updateMatrixWorld(true);
  box.setFromObject(holder).getCenter(mid);
  // on the track's centre line: the wheels' middle, not the middle of everything (a cylinder on one side)
  if (feet) mid.z = ((feet[0] + feet[1]) / 2) * holder.scale.x;
  holder.position.set(at.x - mid.x, floor - box.min.y, at.z - mid.z);
  stand.parent.add(holder);
  holder.position.applyMatrix4(new THREE.Matrix4().copy(stand.parent.matrixWorld).invert());
  stand.visible = false;
  return copy;
}

// how far across (z, from and to) the points of `o` below `y` reach: where its wheels touch
function footprint(o, y) {
  const p = new THREE.Vector3();
  let lo = Infinity, hi = -Infinity;
  o.traverse((m) => {
    if (!m.isMesh) return;
    const a = m.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) {
      p.fromBufferAttribute(a, i).applyMatrix4(m.matrixWorld);
      if (p.y < y) { lo = Math.min(lo, p.z); hi = Math.max(hi, p.z); }
    }
  });
  return hi > lo ? [lo, hi] : null;
}

// The sun in an equirectangular HDR (its brightest texel) and its colour. Rows run top to bottom (the loader flips them: v = 1 is the top).
function readSky({ data, width, height }) {
  let best = 0, bi = 0;
  for (let i = 0; i < width * height; i++) {
    const l = data[i * 4] * 0.2126 + data[i * 4 + 1] * 0.7152 + data[i * 4 + 2] * 0.0722;
    if (l > best) { best = l; bi = i; }
  }
  const px = bi % width, py = Math.floor(bi / width);
  const u = (px + 0.5) / width, v = 1 - (py + 0.5) / height;
  const lat = (v - 0.5) * Math.PI, lon = (u - 0.5) * Math.PI * 2;
  const sun = new THREE.Vector3(Math.cos(lon) * Math.cos(lat), Math.max(Math.sin(lat), 0.15), Math.sin(lon) * Math.cos(lat)).normalize();
  const color = new THREE.Color(data[bi * 4], data[bi * 4 + 1], data[bi * 4 + 2]);
  color.multiplyScalar(1 / Math.max(color.r, color.g, color.b));
  return { sun, color };
}
