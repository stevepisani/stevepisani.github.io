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
import { GAUGE, horse, chariot, romanCart, wagon, chaldron, locomotive, boxcar, boosterCar, track, gaugeBar, tunnel, shuttle } from './sets.js';

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
  locomotive: { x: -24, build: locomotive, eye: [-9, 3, 11], at: [-0.5, 1.8, 0], bar: [-6.5, 0.2] },
  tram: { x: -42, horse: true, build: chaldron, eye: [-1.6, 2.1, 7.4], at: [1.3, 1.0, 0], bar: [-1.5, 0.18] },
  wagon: { x: -60, build: wagon, eye: [4.5, 2.4, 6], at: [-0.6, 1, 0], bar: [2, 0.07] },
  ruts: { x: -78, build: romanCart, eye: [4.5, 2, 5.5], at: [0, 0.8, 0], bar: [2, 0.07] },
  horses: { x: -96, horse: true, build: chariot, eye: [3.6, 1.9, 2.4], at: [-2.6, 1.2, 0], bar: [-2.05, 1.05] }, // the measure across their back ends
  booster: { x: 34, build: boosterCar, eye: [-11, 3.6, 10], at: [2, 2.6, 0], bar: [-8.6, 0.2] },
  shuttle: { x: 140, build: shuttle, eye: [-74, 34, 92], at: [0, 29, 0] },
};
const TUNNEL_X = 44; // the booster's flatcar stands at its mouth

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
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2), M.grass);
  ground.position.set(0, -0.02, 0);
  scene.add(ground);
  const strip = (x0, x1, mat, w = 3.2) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.04, w), mat);
    m.position.set((x0 + x1) / 2, 0, 0);
    scene.add(m);
  };
  strip(-125, -69, M.stone);
  strip(-69, -51, M.dirt, 3);
  strip(-51, -33, M.dirt, 2.4);
  // the ruts: Rome's in stone, then the Middle Ages', several widths side by side
  for (const [x0, x1, name] of [[-125, -69, 'ruts'], [-69, -51, 'wagon']]) {
    for (const w of across(name)) for (const s of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.02, 0.16), M.rut);
      r.position.set((x0 + x1) / 2, 0.025, s * (w / 2 + 0.08));
      scene.add(r);
    }
  }
  scene.add(track(M, -51, -33, 'wood'));
  scene.add(track(M, -33, 118, 'iron'));
  const t = tunnel(M);
  t.position.x = TUNNEL_X;
  scene.add(t);
  scatter(scene, M);

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
    horse: std(0x6b3f22), mane: std(0x2a1a10), wood: std(0x8a5a33), hay: std(0xd9b46a),
    iron: std(0x34373c, { roughness: 0.6, metalness: 0.4 }), steel: std(0xa7adb3, { roughness: 0.35, metalness: 0.8 }),
    paint: std(0xd8b23a, { side: THREE.DoubleSide }), boxcar: std(0x7a3524), white: std(0xece8df, { roughness: 0.6 }),
    tank: std(0xc4692b, { roughness: 0.7 }), rock: std(0x8b7b68, { roughness: 1 }), stone: std(0xb9ad97, { roughness: 1 }),
    dirt: std(0x8a6a48, { roughness: 1 }), rut: std(0x352a20, { roughness: 1 }), grass: std(0x5d6436, { roughness: 1 }),
    ballast: std(0x77736c, { roughness: 1 }), sleeper: std(0x4b3626), portal: std(0x9a8f80, { roughness: 1 }), dark: new THREE.MeshBasicMaterial({ color: 0x050505 }),
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

// trees either side of the way, the same every time: stand-ins for the tree model (a slot each)
function scatter(scene, M) {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const trunk = new THREE.CylinderGeometry(0.15, 0.22, 2, 6), crown = new THREE.ConeGeometry(1.4, 3.6, 7);
  const leaves = new THREE.MeshStandardMaterial({ color: 0x3f5a2c, roughness: 1 });
  for (let i = 0; i < 45; i++) {
    const x = -130 + rnd() * 250, side = rnd() < 0.5 ? -1 : 1, z = side * (7 + rnd() * 45), k = 1.6 + rnd() * 1.4;
    if ((x > TUNNEL_X - 4 && x < TUNNEL_X + 52 && Math.abs(z) < 40) || (x > 112 && Math.abs(z) < 22)) { i--; continue; } // the mountain, the pad
    const t = new THREE.Group();
    t.userData.slot = 'tree';
    t.userData.turn = rnd() * Math.PI * 2;
    t.add(new THREE.Mesh(trunk, M.wood).translateY(1), new THREE.Mesh(crown, leaves).translateY(3.6));
    t.scale.setScalar(k);
    t.position.set(x, 0, z);
    scene.add(t);
  }
}

// What tools/gauge-assets.mjs made (assets/models/gauge/manifest.json says what's there), put in
// as each arrives; anything missing stays as it was.
async function dressUp({ scene, M, renderer, hemi, sun, sunDir, ground, loaded, ask, lives }) {
  let made;
  try { made = await (await fetch(MODELS + 'manifest.json')).json(); } catch (e) { return; }

  // the sky: an HDR to be lit by (and to find the sun in), a photograph to see
  if (made._sky) {
    new HDRLoader().setDataType(THREE.FloatType).load(IMAGES + 'sky.hdr', (hdr) => {
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromEquirectangular(hdr).texture;
      pmrem.dispose();
      const { sun: d, color } = readSky(hdr.image);
      sunDir.copy(d);
      sun.color.copy(color);
      sun.intensity = 3.2;
      hemi.intensity = 0.15;
      hdr.dispose();
      loaded.add('sky');
      ask();
    });
    new THREE.TextureLoader().load(IMAGES + 'sky.jpg', (t) => {
      t.mapping = THREE.EquirectangularReflectionMapping;
      t.colorSpace = THREE.SRGBColorSpace;
      scene.background = t;
      // the haze the ground fades into: the photograph's own colour just under its horizon
      const c = document.createElement('canvas');
      c.width = 64; c.height = 32;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(t.image, 0, 0, 64, 32);
      const px = g.getImageData(0, 16, 64, 1).data, sum = [0, 0, 0];
      for (let i = 0; i < px.length; i += 4) for (let k = 0; k < 3; k++) sum[k] += px[i + k];
      scene.fog.color.setRGB(sum[0] / 64 / 255, sum[1] / 64 / 255, sum[2] / 64 / 255, THREE.SRGBColorSpace);
      scene.fog.near = 120;
      scene.fog.far = 700;
      loaded.add('background');
      ask();
    });
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
    mat.color.set(tint);
    mat.roughness = 1;
    mat.needsUpdate = true;
    loaded.add(kind);
    ask();
  };
  const t = made._textures || {};
  if (t.grass) dress(M.grass, 'grass', 750, 750, 0xa4a890);
  if (t.stone) dress(M.stone, 'stone', 19, 1);
  if (t.dirt) dress(M.dirt, 'dirt', 6, 1);
  if (t.ballast) dress(M.ballast, 'ballast', 56, 1.5);
  if (t.rock) { dress(M.rock, 'rock', 8, 8, 0xb0a898); dress(M.portal, 'rock', 1 / 4, 1 / 4); }
  if (t.wood) { dress(M.sleeper, 'wood', 1, 0.15, 0x8a7a68); dress(M.wood, 'wood', 1, 1); }

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
      if (name === 'tree') instanced(scene, copies);
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

// The same model many times over (the trees): one InstancedMesh per part, each copy where fill()
// put it, so the GPU draws them all at once instead of one by one.
function instanced(scene, copies) {
  const parts = (c) => { const l = []; c.updateWorldMatrix(true, true); c.traverse((o) => o.isMesh && l.push(o)); return l; };
  const all = copies.map(parts);
  all[0].forEach((part, k) => {
    const im = new THREE.InstancedMesh(part.geometry, part.material, copies.length);
    all.forEach((l, i) => im.setMatrixAt(i, l[k].matrixWorld));
    im.castShadow = im.receiveShadow = true;
    im.computeBoundingSphere();
    scene.add(im);
  });
  for (const c of copies) c.parent.removeFromParent(); // the holders fill() made
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
