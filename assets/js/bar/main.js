// Steve's space tiki bar: renderer, camera, interaction, and the content panels.
// The scene is in world.js; the panel content is plain HTML in index.html <template>s.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildWorld } from './world.js';
import { fontsReady } from './textures.js';

const $ = (id) => document.getElementById(id);
const root = $('bar');
const canvas = $('bar-canvas');
const panel = $('bar-panel');
const panelBody = $('bar-panel-body');
const bubble = $('bar-bubble');
const data = JSON.parse($('bar-data').textContent);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const small = () => innerWidth < 760;

/* ---------------- Panels (work with or without WebGL) ---------------- */
let flyTo = () => {};      // replaced once the scene exists
let flyHome = () => {};
let openSpot = null;
let lastFocus = null;

function openPanel(id, { fromHash } = {}) {
  const tpl = $('panel-' + id);
  if (!tpl) return;
  lastFocus = document.activeElement;
  panelBody.replaceChildren(tpl.content.cloneNode(true));
  panel.hidden = false;
  panel.dataset.spot = id;
  root.dataset.panel = 'open';
  openSpot = id;
  document.querySelectorAll('.spot').forEach((b) => b.setAttribute('aria-expanded', String(b.dataset.spot === id)));
  if (!fromHash) history.replaceState(null, '', '#' + id);
  panelBody.querySelectorAll('[data-launch]').forEach(fillLaunch);
  panel.scrollTop = 0;
  $('bar-close').focus({ preventScroll: true });
  flyTo(id);
}

function closePanel() {
  if (!openSpot) return;
  panel.hidden = true;
  delete root.dataset.panel;
  openSpot = null;
  document.querySelectorAll('.spot').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  history.replaceState(null, '', location.pathname + location.search);
  if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  flyHome();
}

function fillLaunch(el) {
  const q = (k) => el.querySelector('[data-launch-' + k + ']');
  if (!window.nextLaunch) return;
  window.nextLaunch().then((l) => {
    q('name').textContent = l.name;
    q('meta').textContent = [l.provider, l.pad].filter(Boolean).join(' · ');
    const tick = () => { if (el.isConnected) q('clock').textContent = window.tMinus(l.net); else clearInterval(iv); };
    const iv = setInterval(tick, 1000);
    tick();
  }).catch(() => { q('name').textContent = 'Ad astra.'; });
}

document.querySelectorAll('.spot').forEach((b) => {
  b.setAttribute('aria-expanded', 'false');
  b.addEventListener('click', () => (openSpot === b.dataset.spot ? closePanel() : openPanel(b.dataset.spot)));
  b.addEventListener('pointerenter', () => setHover(b.dataset.spot));
  b.addEventListener('pointerleave', () => setHover(null));
  b.addEventListener('focus', () => setHover(b.dataset.spot));
  b.addEventListener('blur', () => setHover(null));
});
$('bar-close').addEventListener('click', closePanel);
addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanel(); });

let hovered = null;
function setHover(id) {
  hovered = id;
  document.querySelectorAll('.spot').forEach((b) => b.classList.toggle('is-hover', b.dataset.spot === id));
  canvas.style.cursor = id ? 'pointer' : '';
}

/* ---------------- Bartender chatter ---------------- */
function startBubble() {
  let i = 0;
  const say = () => {
    if (openSpot) return;
    bubble.textContent = data.bartender[i++ % data.bartender.length];
    bubble.hidden = false;
    bubble.classList.remove('is-in');
    void bubble.offsetWidth; // restart the CSS animation
    bubble.classList.add('is-in');
  };
  say();
  setInterval(say, 6500);
}

/* ---------------- WebGL ---------------- */
function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch (e) {
    return false;
  }
}

function fallback(reason) {
  console.info('Bar: showing the menu without 3D.', reason || '');
  root.dataset.state = 'fallback';
  startBubble();
  if (location.hash.length > 1) openPanel(location.hash.slice(1), { fromHash: true });
}

async function start() {
  if (!webglAvailable()) return fallback('no WebGL2');
  await fontsReady();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, small() ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05060f);
  scene.fog = new THREE.Fog(0x05060f, 40, 500);

  const camera = new THREE.PerspectiveCamera(small() ? 55 : 42, 1, 0.1, 1000);
  const { world, island, spots, update } = buildWorld(data);
  scene.add(world);

  // Home pose: a bit further out on phones so the whole bar fits.
  // Desktop: the bar sits right of the headline. Phones: the bar sits below it.
  const home = () => small()
    ? { pos: new THREE.Vector3(3.2, 6.0, 20), target: new THREE.Vector3(0, 2.6, 0) }
    : { pos: new THREE.Vector3(5.5, 4.2, 16.5), target: new THREE.Vector3(-3.6, 2.0, 0) };
  const h0 = home();
  camera.position.copy(h0.pos);

  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(h0.target);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 5;
  controls.maxDistance = 28;
  controls.minPolarAngle = 0.75;
  controls.maxPolarAngle = 1.62;
  controls.minAzimuthAngle = -1.2;
  controls.maxAzimuthAngle = 1.2;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 0.7;
  controls.update();

  // Bloom makes the neon, torches, and thrusters glow. Skipped on phones for battery.
  let composer = null;
  if (!small()) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.75, 0.5, 0.82));
    composer.addPass(new OutputPass());
  }

  function resize() {
    const w = root.clientWidth, h = root.clientHeight;
    renderer.setSize(w, h, false);
    composer && composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  /* Camera flights */
  let flight = null;
  const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  function fly(pos, target) {
    if (reducedMotion) {
      camera.position.copy(pos);
      controls.target.copy(target);
      controls.update();
      return;
    }
    flight = { start: performance.now(), from: camera.position.clone(), fromT: controls.target.clone(), to: pos, toT: target };
  }
  const toWorld = (arr) => island.localToWorld(new THREE.Vector3(...arr));
  flyTo = (id) => {
    const s = spots[id];
    if (!s) return;
    controls.enabled = false;
    // With the panel on the right (desktop), aim a little right of the object so it sits in the open space on the left.
    const target = toWorld(s.view.target);
    const pos = toWorld(s.view.pos);
    if (!small()) {
      const right = new THREE.Vector3().subVectors(target, pos).cross(camera.up).normalize();
      target.addScaledVector(right, 0.9);
      pos.addScaledVector(right, 0.9);
    } else {
      target.y -= 0.9; // bottom sheet on phones: nudge the object up
    }
    fly(pos, target);
  };
  flyHome = () => {
    const h = home();
    fly(h.pos, h.target);
    controls.enabled = true;
  };

  /* Picking */
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const pickables = [];
  Object.values(spots).forEach((s) => s.object.traverse((o) => { if (o.isMesh) pickables.push(o); }));
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickables, false)[0];
    return hit ? hit.object.userData.spot : null;
  }
  canvas.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') setHover(pick(e)); });
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', (e) => {
    // a click, not the end of a drag
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    const id = pick(e);
    if (id) openPanel(id);
    else if (openSpot) closePanel();
  });

  /* Spot markers: the menu buttons also float over their objects in the scene. */
  const markers = [...document.querySelectorAll('.spot')];
  const v = new THREE.Vector3();
  function placeMarkers() {
    const w = root.clientWidth, h = root.clientHeight;
    for (const m of small() ? [] : markers) {
      const s = spots[m.dataset.spot];
      if (!s) continue;
      v.copy(s.anchor);
      island.localToWorld(v);
      v.project(camera);
      const visible = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      m.style.setProperty('--x', ((v.x + 1) / 2 * w).toFixed(1) + 'px');
      m.style.setProperty('--y', ((1 - v.y) / 2 * h).toFixed(1) + 'px');
      m.classList.toggle('is-offscreen', !visible);
    }
    // the speech bubble follows the robot's head
    const about = spots.about;
    if (about) {
      v.set(about.anchor.x, about.anchor.y + 0.5, about.anchor.z);
      island.localToWorld(v).project(camera);
      bubble.style.setProperty('--x', ((v.x + 1) / 2 * w).toFixed(1) + 'px');
      bubble.style.setProperty('--y', ((1 - v.y) / 2 * h).toFixed(1) + 'px');
    }
  }

  /* Hover highlight: scale the hovered object up a touch. */
  const baseScale = new Map(Object.entries(spots).map(([id, s]) => [id, s.object.scale.clone()]));

  /* Loop */
  const timer = new THREE.Timer();
  let t = 0;
  function frame(now) {
    timer.update(now);
    const dt = Math.min(timer.getDelta(), 0.05);
    if (!reducedMotion) t += dt;
    update(t, dt);

    for (const [id, s] of Object.entries(spots)) {
      const want = id === hovered || id === openSpot ? 1.06 : 1;
      const cur = s.object.scale.x / baseScale.get(id).x;
      const k = cur + (want - cur) * Math.min(1, dt * 10);
      s.object.scale.copy(baseScale.get(id)).multiplyScalar(k);
    }

    if (flight) {
      // wall-clock, so the flight takes the same time on a slow device
      const p = Math.min(1, (performance.now() - flight.start) / 1100);
      const k = ease(p);
      camera.position.lerpVectors(flight.from, flight.to, k);
      controls.target.lerpVectors(flight.fromT, flight.toT, k);
      if (p === 1) flight = null;
    }
    controls.update();
    placeMarkers();
    composer ? composer.render() : renderer.render(scene, camera);
  }
  renderer.setAnimationLoop(frame);
  document.addEventListener('visibilitychange', () => {
    renderer.setAnimationLoop(document.hidden ? null : frame);
    timer.reset();
  });

  frame(performance.now());
  root.dataset.state = 'ready';
  startBubble();
  if (location.hash.length > 1 && spots[location.hash.slice(1)]) openPanel(location.hash.slice(1), { fromHash: true });
}

start().catch((err) => {
  console.error(err);
  fallback(err && err.message);
});
