// "Rockets and Horses" as a walk along one track (published as dist/gauge.js; the stops are
// _data/gauge.yml, the page _includes/gauge-walk.html). The track runs along +x through the eras,
// Rome at the far -x end, today's rails at 0, the tunnel and the pad at +x. Scrolling the cards
// moves the camera from one stop to the next (the first five walk back in time, then it rises and
// flies over all of it to the booster and the Shuttle), and a sideways drag looks around the stop.
// The camera moves only with the scroll or a drag; with reduced motion the same, minus the arc.
// Without WebGL the page stays the cards.
import * as THREE from 'three';
import { GAUGE, horse, chariot, romanCart, wagon, chaldron, locomotive, boxcar, boosterCar, track, gaugeBar, tunnel, shuttle } from './sets.js';

const root = document.getElementById('walk');
const stage = root?.querySelector('.walk__stage');
const canvas = root?.querySelector('.walk__canvas');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Where each scene stands on the track, where the camera stands to see it, and what it looks at
// (all relative to the scene's x). `bar`: where the brass measure lies across the gauge.
const SCENES = {
  rails: { x: 0, build: boxcar, eye: [10, 3.4, 11], at: [1, 1.6, 0], bar: [8.6, 0.2] },
  locomotive: { x: -24, build: locomotive, eye: [-4.5, 2.4, 6.5], at: [0.6, 1.2, 0], bar: [-2.2, 0.2] },
  tram: { x: -42, build: chaldron, eye: [3.5, 2.2, 5.5], at: [-0.8, 1, 0], bar: [1.5, 0.18] },
  wagon: { x: -60, build: wagon, eye: [4.5, 2.4, 6], at: [-0.6, 1, 0], bar: [2, 0.07] },
  ruts: { x: -78, build: romanCart, eye: [4.5, 2, 5.5], at: [0, 0.8, 0], bar: [2, 0.07] },
  horses: { x: -96, build: chariot, eye: [3.6, 1.9, 2.4], at: [-2.6, 1.2, 0], bar: [-2.05, 1.05] }, // the measure across their back ends
  booster: { x: 34, build: boosterCar, eye: [-11, 3.6, 10], at: [2, 2.6, 0], bar: [-8.6, 0.2] },
  shuttle: { x: 100, build: shuttle, eye: [-74, 34, 92], at: [0, 29, 0] },
};
const TUNNEL_X = 44; // the booster's flatcar stands at its mouth

if (root && canvas) start();

function start() {
  // no WebGL: the cards are the whole story (asked of a spare canvas, so three.js logs no error)
  if (!document.createElement('canvas').getContext('webgl2')) return;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  root.classList.add('is-live');

  const stops = [...root.querySelectorAll('.walk__stop')];
  const order = stops.map((s) => SCENES[s.dataset.scene]).filter(Boolean);
  if (order.length !== stops.length) throw new Error('gauge.js: a stop in _data/gauge.yml names a scene it has no set for');

  const scene = new THREE.Scene();
  const sky = skyTexture();
  scene.background = sky;
  scene.fog = new THREE.Fog(0xe8b98f, 60, 260);
  scene.add(new THREE.HemisphereLight(0xffe2c0, 0x4a4030, 1.4));
  const sun = new THREE.DirectionalLight(0xffc690, 2.6);
  sun.position.set(-60, 40, 50);
  scene.add(sun);

  const M = materials();
  // the ground, and the way across it, era by era
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 300).rotateX(-Math.PI / 2), M.grass);
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
  for (const s of [-1, 1]) { // the ruts, with the gauge between them
    const r = new THREE.Mesh(new THREE.BoxGeometry(125 - 51, 0.02, 0.16), M.rut);
    r.position.set((-125 - 51) / 2, 0.025, s * (GAUGE / 2 + 0.08));
    scene.add(r);
  }
  scene.add(track(M, -51, -33, 'wood'));
  scene.add(track(M, -33, 79, 'iron'));
  const t = tunnel(M);
  t.position.x = TUNNEL_X;
  scene.add(t);
  scatter(scene, M);

  for (const s of order) {
    const thing = s.build(M);
    thing.position.x = s.x;
    scene.add(thing);
    if (s.bar) {
      const b = gaugeBar(M, s.bar[1]);
      b.position.x = s.x + s.bar[0];
      scene.add(b);
    }
  }

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 900);
  const v = (a, x) => new THREE.Vector3(a[0] + x, a[1], a[2]);
  const poses = order.map((s) => ({ eye: v(s.eye, s.x), at: v(s.at, s.x) }));

  let yaw = 0, progress = -1, visible = true, queued = false;
  const eye = new THREE.Vector3(), at = new THREE.Vector3();

  function pose(p) {
    const i = Math.min(Math.floor(p), poses.length - 1), j = Math.min(i + 1, poses.length - 1);
    // hold still while a card is near the middle, then move on: smoothstep over the gap's middle
    let f = THREE.MathUtils.clamp((p - i - 0.2) / 0.6, 0, 1);
    f = f * f * (3 - 2 * f);
    eye.lerpVectors(poses[i].eye, poses[j].eye, f);
    at.lerpVectors(poses[i].at, poses[j].at, f);
    // a long way (Rome to Utah): rise and fly over it all
    const far = Math.abs(poses[j].eye.x - poses[i].eye.x);
    if (far > 60 && !reducedMotion) eye.y += Math.sin(f * Math.PI) * far * 0.22;
    // a drag turns the view round the stop
    if (yaw) {
      const d = eye.clone().sub(at);
      d.applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
      eye.copy(at).add(d);
    }
    camera.position.copy(eye);
    camera.lookAt(at);
  }

  // progress: which stop's card is at the middle of the screen, and how far on toward the next
  function measure() {
    const mid = innerHeight / 2;
    const c = stops.map((s) => { const r = s.getBoundingClientRect(); return r.top + r.height / 2 - mid; });
    if (c[0] >= 0) return 0;
    for (let i = 0; i < c.length - 1; i++) if (c[i + 1] > 0) return i + -c[i] / (c[i + 1] - c[i]);
    return c.length - 1;
  }

  function draw() {
    queued = false;
    if (!visible) return;
    const p = measure();
    if (progress >= 0 && p !== progress) yaw *= Math.exp(-Math.abs(p - progress) * 3); // scrolling on brings the view back round
    progress = p;
    pose(p);
    renderer.render(scene, camera);
  }
  const ask = () => { if (!queued) { queued = true; requestAnimationFrame(draw); } };

  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // a narrow screen sees as much across as a wide one
    camera.fov = w < h ? 64 : 50;
    camera.updateProjectionMatrix();
    ask();
  }
  new ResizeObserver(resize).observe(stage);
  addEventListener('scroll', ask, { passive: true });
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) ask(); }).observe(root);

  // drag sideways to look round the stop (vertical swipes still scroll the page)
  let dragX = null;
  stage.addEventListener('pointerdown', (e) => { dragX = e.clientX; stage.setPointerCapture(e.pointerId); root.classList.add('is-dragged'); });
  stage.addEventListener('pointermove', (e) => {
    if (dragX === null) return;
    yaw = THREE.MathUtils.clamp(yaw - (e.clientX - dragX) * 0.006, -1.4, 1.4);
    dragX = e.clientX;
    ask();
  });
  const end = () => { dragX = null; };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);

  resize();
  window.__walk = { scenes: order.length, progress: () => progress, renderer };
}

function materials() {
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
  return {
    horse: std(0x6b3f22), mane: std(0x2a1a10), wood: std(0x8a5a33), hay: std(0xd9b46a),
    iron: std(0x34373c, { roughness: 0.6, metalness: 0.4 }), steel: std(0xa7adb3, { roughness: 0.35, metalness: 0.8 }),
    paint: std(0xd8b23a, { side: THREE.DoubleSide }), boxcar: std(0x7a3524), white: std(0xece8df, { roughness: 0.6 }),
    tank: std(0xc4692b, { roughness: 0.7 }), rock: std(0x8b7b68, { roughness: 1 }), stone: std(0xb9ad97, { roughness: 1 }),
    dirt: std(0x8a6a48, { roughness: 1 }), rut: std(0x4a3828, { roughness: 1 }), grass: std(0x5d6436, { roughness: 1 }),
    ballast: std(0x77736c, { roughness: 1 }), sleeper: std(0x4b3626),
    brass: std(0xe0b04a, { emissive: 0xffb43a, emissiveIntensity: 0.9, metalness: 0.6, roughness: 0.3 }),
    flame: new THREE.MeshBasicMaterial({ color: 0xffb35a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
  };
}

// late afternoon, warm low down
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

// trees and boulders either side of the way, the same every time
function scatter(scene, M) {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const n = 140;
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.22, 2, 6), M.wood, n);
  const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(1.4, 3.6, 7), new THREE.MeshStandardMaterial({ color: 0x3f5a2c, roughness: 1 }), n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const x = -130 + rnd() * 205, side = rnd() < 0.5 ? -1 : 1, z = side * (6 + rnd() * 40), k = 0.7 + rnd() * 0.9;
    if (x > TUNNEL_X - 4 && x < TUNNEL_X + 26) { i--; continue; } // the rock
    s.set(k, k, k);
    trunks.setMatrixAt(i, m.compose(new THREE.Vector3(x, k, z), q, s));
    crowns.setMatrixAt(i, m.compose(new THREE.Vector3(x, k * 3.6, z), q, s));
  }
  scene.add(trunks, crowns);
}
