// Steve's asteroid: you're dropped onto a tiny planet with a tiki bar in view.
// Walk over, sit down, pick something from the menu.
//
// Design rules (Krug, "Don't Make Me Think"; Apple HIG): no start screen, no
// instructions to read, click/tap where you want to go, clickable things look
// clickable, one just-in-time hint at a time, every section is also one click away
// in the top bar, and every state has an obvious way back (Esc, ×, browser Back).
//
// #world[data-state] = loading | walk | seat | camp | fallback
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createPipeline } from './render.js';
import { Fire } from './fire.js';
import { PALETTE, restyle, glow } from './materials.js';
import { buildPlanet, surfacePoint, surfaceRadius, pondK, BAR_DIR, POND, RADIUS } from './planet.js';
import { buildSky, earthPoint } from './sky.js';
import { buildBar } from './bar.js';
import { buildPlaces, SPOTS, trailEdge, keepClear, nearLandmark } from './places.js';
import { Player, bindInput, BODY } from './player.js';
import { onPlanet } from './route.js';
import { fontsReady, paintMenuCard } from './textures.js';
import { lampLitTree, finishLamps, updateLamps } from './lamps.js';
import { loadHeroes } from './hero.js';
import { createRoaster, verdict } from './camp.js';
import { createSound } from './sound.js';
import { createSkipper } from './stones.js';
import { createNoteRitual } from './note.js';
import { createFireflies } from './fireflies.js';
import { createPhysics } from './physics.js';
import { createBookSky } from './booksky.js';
import { houseAnswer } from './barback.js';
import { createEyepiece } from './eyepiece.js';
import { createGlints } from './glints.js';
import { createHoop } from './hoop.js';
import { createBatcher } from './batch.js';

const $ = (id) => document.getElementById(id);
const root = $('world');
const canvas = $('world-canvas');
const data = JSON.parse($('world-data').textContent);
// The one Supabase project (url and public key from _config.yml, in the page head)
const DB = { url: document.querySelector('meta[name="supabase-url"]').content, key: document.querySelector('meta[name="supabase-key"]').content };
const TEST = new URLSearchParams(location.search).has('test');
const reducedMotion = TEST || matchMedia('(prefers-reduced-motion: reduce)').matches;
// a tap you can feel, where the phone can (Android; iPhones ignore it): picks and the telescope's gears
const buzz = (pattern) => { try { if (navigator.vibrate && !reducedMotion) navigator.vibrate(pattern); } catch (e) { /* not allowed here */ } };
// a sideways swipe on a card steps it, like its ‹ ›
function onSwipe(el, step) {
  let from = null;
  el.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') from = { x: e.clientX, y: e.clientY }; });
  el.addEventListener('pointerup', (e) => {
    if (!from) return;
    const dx = e.clientX - from.x, dy = e.clientY - from.y;
    from = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > 1.5 * Math.abs(dy)) step(dx < 0 ? 1 : -1);
  });
  el.addEventListener('pointercancel', () => { from = null; });
}
const coarse = matchMedia('(pointer: coarse)').matches;
const quality = { high: !coarse && innerWidth > 900 && (navigator.deviceMemory || 8) >= 4 };

let state = 'loading';
const setState = (s) => { state = s; root.dataset.state = s; };

// "Never show a hint again once it's been used" (HIG onboarding), remembered per browser.
const done = {
  get: (k) => { try { return localStorage.getItem('world-' + k) === '1'; } catch (e) { return false; } },
  set: (k) => { try { localStorage.setItem('world-' + k, '1'); } catch (e) {} },
};

/* =====================================================================
   Content: panels, the menu, the top bar. Works before (and without) 3D.
   ===================================================================== */
const panel = $('panel'), panelBody = $('panel-body'), menu = $('menu'), bubble = $('bubble'), hint = $('hint');
const menuBtn = $('menu-btn');
let menuMode = null; // 'seat' (you're at the bar) | 'nav' (opened from the Menu button)
let pushed = false;  // did we push a history entry for the open panel?

function markCurrent(id) {
  document.querySelectorAll('[data-order]').forEach((a) => {
    if (a.dataset.order === id) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

function openPanel(id, { push = true, from = null } = {}) {
  const tpl = $('panel-' + id);
  if (!tpl) return false;
  panelBody.replaceChildren(tpl.content.cloneNode(true));
  panel.hidden = false;
  // served in a mug: the panel pours open out of the mug's mouth (a screen point)
  panel.classList.remove('is-pouring');
  if (from) {
    const r = panel.getBoundingClientRect();
    panel.style.setProperty('--ox', (from.x - r.left).toFixed(0) + 'px');
    panel.style.setProperty('--oy', (from.y - r.top).toFixed(0) + 'px');
    void panel.offsetWidth; // restart the animation
    panel.classList.add('is-pouring');
  }
  panel.dataset.id = id;
  root.dataset.panel = id;
  menu.hidden = true;
  markCurrent(id);
  panelBody.querySelectorAll('[data-launch]').forEach(fillLaunch);
  if (window.fillSky) panelBody.querySelectorAll('[data-sky]').forEach(window.fillSky);
  if (id === 'drinks') decorateDrinks();
  panel.scrollTop = 0;
  if (push && location.hash !== '#' + id) { history.pushState({ panel: id }, '', '#' + id); pushed = true; }
  $('panel-close').focus({ preventScroll: true });
  return true;
}

function closePanel({ fromHistory } = {}) {
  if (panel.hidden) return;
  // If opening it added a history entry, go back and let popstate close it,
  // so the browser's Back button and our × behave identically.
  if (!fromHistory && pushed) { pushed = false; history.back(); return; }
  panel.hidden = true;
  delete root.dataset.panel;
  markCurrent(null);
  if (!fromHistory && location.hash) history.replaceState(null, '', location.pathname + location.search);
  afterPanel();
}

// Where you land after closing a panel: at the bar, the mug goes back down and the menu comes
// back up for the next order; otherwise back to the menu if you were holding it.
function afterPanel() {
  if (state === 'hammock') afterHammockPanel();
  else if (state === 'seat' && drinkUp()) putDownDrink();
  else if (state === 'seat' && seatMenuHeld()) showMenu('seat');
  else canvas.focus({ preventScroll: true });
}

function showMenu(mode) {
  menuMode = mode;
  menu.hidden = false;
  menu.dataset.mode = mode;
  $('menu-title').textContent = mode === 'seat' ? "What'll it be?" : 'Menu';
  menuBtn.setAttribute('aria-expanded', 'true');
  menu.querySelector('a').focus({ preventScroll: true });
}

function hideMenu() {
  menu.hidden = true;
  menu.classList.remove('is-landed');
  menuMode = null;
  menuBtn.setAttribute('aria-expanded', 'false');
}

addEventListener('popstate', () => {
  const id = location.hash.slice(1);
  if (id && $('panel-' + id)) openPanel(id, { push: false });
  else if (!panel.hidden) { pushed = false; closePanel({ fromHistory: true }); }
  else backTo(id); // Back steps out of the places you've stepped into, one at a time
});

// The places on the planet you step into (the chalkboard, the hammock and a shelf of its sky, the
// telescope and a landing site): each adds a history entry, so the browser's Back steps out of
// them one at a time, the way it closes a panel. Leaving one any other way takes its entry (and
// any inside it) back off.
const levels = []; // { key, back }: innermost last
function enterLevel(key, back) {
  if (levels.some((l) => l.key === key)) return;
  history.pushState({ level: key }, '', '#' + key);
  levels.push({ key, back });
}
function leaveLevel(key) {
  const i = levels.findIndex((l) => l.key === key);
  if (i < 0) return;
  const inner = levels.splice(i);
  for (const l of inner.slice(1).reverse()) l.back(); // the ones inside it go too
  // and a panel open over it (it has its own entry) closes with it
  const over = !panel.hidden && pushed ? 1 : 0;
  if (over) { pushed = false; closePanel({ fromHistory: true }); }
  history.go(-(inner.length + over));
}
function backTo(id) {
  while (levels.length && levels[levels.length - 1].key !== id) levels.pop().back();
}

// At the bar the menu is a card you pick up off the counter and put back down; the world
// replaces these once it's built. Everywhere else it's just shown and hidden.
let leaveBar = () => hideMenu();
let pickUpMenu = () => showMenu('seat');
let putDownMenu = () => hideMenu();
let seatMenuHeld = () => !menu.hidden;
// Ordering at the bar: the world makes the drink, serves it and lifts it to you, then the
// content opens out of the mug. Before (or without) the world it just opens the panel.
let order = (id) => openPanel(id);
let drinkUp = () => false;
let putDownDrink = () => {};
// Once the world is up, each recipe in the Favorite drinks panel gets a "Make me one" button.
let decorateDrinks = () => {};
let skipMaking = () => false;
let afterHammockPanel = () => {};

$('panel-close').addEventListener('click', () => closePanel());
$('panel-back').addEventListener('click', () => {
  closePanel();
  if (state !== 'seat') showMenu('nav');
  else if (!seatMenuHeld() && !drinkUp()) pickUpMenu();
});
$('menu-close').addEventListener('click', () => { if (state === 'seat') putDownMenu(); else hideMenu(); });
menuBtn.addEventListener('click', () => {
  if (state === 'seat' && skipMaking()) return; // making you a drink: finish it first
  if (state === 'seat') { if (menu.hidden) pickUpMenu(); else putDownMenu(); }
  else if (menu.hidden) showMenu('nav');
  else hideMenu();
});

// Every [data-order] link (top bar and menu) opens its panel in place. Their real hrefs (a
// page, the résumé on Google Drive, a mailto:) are only the fallback for no JS or no WebGL:
// while panels are in charge they point at the panel, so choosing from the menu, and anything
// the drink animation does, can never leave the page. (Some app webviews act on an outbound
// link before our click handler can stop it.) fallback() puts the real links back.
const orderLinks = [...document.querySelectorAll('a[data-order]')].filter((a) => $('panel-' + a.dataset.order));
for (const a of orderLinks) {
  a.dataset.href = a.getAttribute('href');
  a.dataset.target = a.getAttribute('target') || '';
  a.setAttribute('href', '#' + a.dataset.order);
  a.removeAttribute('target');
}
function restoreLinks() {
  for (const a of orderLinks) {
    a.setAttribute('href', a.dataset.href);
    if (a.dataset.target) a.setAttribute('target', a.dataset.target);
  }
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-order]');
  if (!a || state === 'fallback' || e.metaKey || e.ctrlKey || e.shiftKey) return;
  const id = a.dataset.order;
  if (!$('panel-' + id)) return;
  e.preventDefault();
  if (state === 'seat') order(id);
  else openPanel(id);
});

function fillLaunch(el) {
  const q = (k) => el.querySelector('[data-launch-' + k + ']');
  if (!window.nextLaunch) return;
  window.nextLaunch().then((l) => {
    q('name').textContent = l.name;
    q('meta').textContent = [l.provider, l.pad].filter(Boolean).join(' · ');
    const iv = setInterval(() => { if (!el.isConnected) return clearInterval(iv); q('clock').textContent = window.tMinus(l.net); }, 1000);
    q('clock').textContent = window.tMinus(l.net);
  }).catch(() => { q('name').textContent = 'Ad astra.'; });
}

let bubbleTimer;
function say(text, ms = 5000) {
  bubble.textContent = text;
  bubble.hidden = false;
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => { bubble.hidden = true; }, ms);
}

function showHint(text, key) {
  if (key && done.get(key)) return;
  hint.textContent = text;
  hint.hidden = false;
  hint.dataset.key = key || '';
}
function clearHint(key) {
  if (key) done.set(key);
  if (!key || hint.dataset.key === key) hint.hidden = true;
}

// Deep link straight into content (don't make anyone walk to get it).
const initial = location.hash.slice(1);
if (initial && $('panel-' + initial)) openPanel(initial, { push: false });

/* =====================================================================
   The world
   ===================================================================== */
function fallback(reason) {
  console.info('World: showing the plain menu.', reason || '');
  setState('fallback');
  restoreLinks();
  $('veil').hidden = true;
  showMenu('nav');
}

function webgl2() {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch (e) { return false; }
}

async function start() {
  if (!webgl2()) return fallback('no WebGL2');
  // Launch screen: say what's happening, and let it paint between the heavy steps.
  const progress = $('veil-progress'), status = $('veil-status');
  const setProgress = (k) => progress.style.setProperty('--p', k);
  const step = (k, text) => {
    setProgress(k);
    if (text) status.textContent = text;
    return new Promise((r) => setTimeout(r, 30));
  };

  // antialias off: SMAA in the post chain handles it (and AO dislikes MSAA)
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, quality.high ? 1.75 : 1.25));
  renderer.shadowMap.enabled = quality.high;
  renderer.shadowMap.type = THREE.PCFShadowMap; // soft via shadow.radius (PCFSoft was removed in r18x)

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(PALETTE.night, 0.016); // distance fades into the night sky
  const NEAR = 0.05;
  const camera = new THREE.PerspectiveCamera(coarse ? 72 : 68, 1, NEAR, 2000);

  // Models: one GLB, plus fonts for the canvas textures.
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const modelsUrl = document.querySelector('script[data-models]').dataset.models;
  await step(0.1, 'Loading the bar…');
  const [gltf] = await Promise.all([
    new Promise((res, rej) => loader.load(modelsUrl, res, (e) => e.total && setProgress(0.1 + 0.4 * (e.loaded / e.total)), rej)),
    fontsReady(),
  ]);
  const library = new Map(gltf.scene.children.map((c) => [c.name, c]));
  restyle(gltf.scene, { tint: 0xd8cfc4 });
  const prop = (name, scale = 1) => {
    const src = library.get(name);
    if (!src) { console.warn('missing model', name); return new THREE.Group(); }
    const o = src.clone(true);
    o.position.set(0, 0, 0);
    o.rotation.set(0, 0, 0);
    o.scale.setScalar(scale);
    return o;
  };

  const heroes = await loadHeroes(loader, modelsUrl.replace(/props\.glb$/, 'hero/'));
  await step(0.55, 'Shaping the planet…');
  const sky = buildSky({ quality });
  const planet = buildPlanet({ quality, trailEdge, keepClear });
  await step(0.7, 'Stocking the bar…');
  const bar = buildBar({ prop, quality, favorites: (data.drinks || []).map((d) => d.name), heroes, reducedMotion });
  // the site's logo (the 180px touch icon) goes on the rocket
  const badge = document.querySelector('link[rel="apple-touch-icon"]')?.href || null;
  await step(0.82, 'Lighting the torches…');
  const places = buildPlaces({ prop, quality, heroes, badge });
  places.machine.camera = camera; // the inside of the planet is drawn only when you're near enough to see in
  scene.add(sky.group, planet.group, bar.group, places.group);
  for (const l of bar.loose) scene.add(l.object); // the bar's fallen coconuts live in world space
  // the lanterns and torches without real lights light the ground through its shaders (lamps.js)
  finishLamps();
  lampLitTree(planet.group);
  lampLitTree(places.group);
  scene.add(camera); // things you hold (the marshmallow stick) ride on it

  // Night: a faint sky/ground ambient, cool moonlight as the key (with soft shadows around the
  // bar), and every warm tone comes from practical lights: torches, lamps, neon, fire.
  // (a touch brighter than pitch dark, so everything on the planet reads as a shape at night)
  scene.add(new THREE.HemisphereLight(0x33407a, 0x241a16, 1.2));
  const moon = new THREE.DirectionalLight(PALETTE.moon, 1.8);
  moon.position.copy(sky.sunDir).multiplyScalar(40).add(bar.group.position);
  moon.target = bar.group;
  if (quality.high) {
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    const sc = moon.shadow.camera;
    sc.left = sc.bottom = -11; sc.right = sc.top = 11; sc.near = 1; sc.far = 90;
    moon.shadow.bias = -0.0004;
    moon.shadow.normalBias = 0.03;
    moon.shadow.radius = 4;
  }
  scene.add(moon, moon.target);
  // Point lights with shadows (the campfire) redraw six shadow faces every frame; out of sight
  // over the horizon nobody sees them, so they only update within reach.
  const pointShadows = [];
  scene.traverse((o) => { if (o.isPointLight && o.castShadow) pointShadows.push([o, o.getWorldPosition(new THREE.Vector3())]); });

  const player = new Player(camera, { colliders: [...bar.colliders, ...places.colliders] });
  // Loose things (coconuts, glass floats) for the physics engine, which loads once the planet is up
  const physics = createPhysics({
    scene,
    loose: [...bar.loose, ...places.loose],
    posts: [...bar.colliders, ...places.colliders],
    solids: bar.solids,
    on(kind, at, k) {
      sound.play(kind, at, k);
      if (kind === 'splash') skipper.ripple(at, 0.4 + k * 0.6, 1.6);
    },
  });
  const interactables = [...bar.interactables, ...places.interactables];
  const barSpot = interactables.find((i) => i.id === 'seat');
  const campSpot = interactables.find((i) => i.id === 'campfire');
  const roaster = createRoaster(camera, { reducedMotion });
  const signPoint = bar.group.localToWorld(new THREE.Vector3(0, 2.6, 0));
  player.spawn(SPOTS.spawn, signPoint);
  // tilt the view so the bar and its sign sit comfortably in frame
  {
    const eye = player.pos.clone().addScaledVector(player.up, player.eye);
    const to = signPoint.clone().sub(eye);
    const upAmt = to.dot(player.up);
    player.pitch = Math.atan2(upAmt, Math.sqrt(Math.max(0, to.lengthSq() - upAmt * upAmt)));
  }

  const pipeline = createPipeline(renderer, scene, camera, quality);

  function resize() {
    const w = root.clientWidth, h = root.clientHeight;
    renderer.setSize(w, h, false);
    pipeline.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();
  // the world can change size without the window doing so (fitting above a phone's keyboard)
  if (window.ResizeObserver) new ResizeObserver(() => resize()).observe(root);

  /* ---------- Markers: where you're going, and where you could go ---------- */
  // Each ring is draped on the ground vertex by vertex (the analytic surface, like the trails), so
  // it follows the slope instead of cutting into it, and rides just over the flagstones' tops.
  // Where it goes is pushed clear of anything solid (player.clearOf), so it's where you'll stand.
  const RING = new THREE.RingGeometry(0.28, 0.38, 48, 1).rotateX(-Math.PI / 2);
  const RING_R = 0.38, RING_LIFT = 0.05;
  const marker = (color) => {
    const m = new THREE.Mesh(RING.clone(), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    m.renderOrder = 2;
    m.frustumCulled = false; // its vertices are in world space
    scene.add(m);
    return m;
  };
  const hoverRing = marker(0xffffff);
  const destRing = marker(0x3ff5e8);
  const _ru = new THREE.Vector3(), _r1 = new THREE.Vector3(), _r2 = new THREE.Vector3(), _rd = new THREE.Vector3();
  const standOn = (obj, point, scale = 1) => {
    const up = _ru.copy(point).normalize();
    _r1.set(1, 0, 0).addScaledVector(up, -up.x);
    if (_r1.lengthSq() < 1e-4) _r1.set(0, 0, 1).addScaledVector(up, -up.z);
    _r1.normalize();
    _r2.crossVectors(_r1, up); // (x, z) as RingGeometry lays them, so it stays wound to face up
    const src = RING.attributes.position, dst = obj.geometry.attributes.position;
    for (let i = 0; i < src.count; i++) {
      const d = _rd.copy(up).multiplyScalar(RADIUS).addScaledVector(_r1, src.getX(i) * scale).addScaledVector(_r2, src.getZ(i) * scale).normalize();
      d.multiplyScalar(groundRadius(d) + RING_LIFT);
      dst.setXYZ(i, d.x, d.y, d.z);
    }
    dst.needsUpdate = true;
  };
  const clearSpot = (point) => player.clearOf(point, RING_R + 0.04);
  // The ground, or the top of a solid standing on it (the bar's deck): how far from the centre in `dir`
  function groundRadius(dir) {
    let r = surfaceRadius(dir);
    for (const s of bar.solids) {
      const top = s.center.dot(s.up) + s.half, k = dir.dot(s.up);
      if (k <= 0) continue;
      const t = top / k, axis = s.center.clone().addScaledVector(s.up, top - s.center.dot(s.up));
      if (dir.clone().multiplyScalar(t).sub(axis).length() < s.radius && t > r) r = t;
    }
    return r;
  }

  /* ---------- Picking ---------- */
  const raycaster = new THREE.Raycaster();
  raycaster.layers.enableAll(); // the batched originals are on a layer of their own (batch.js)
  raycaster.far = 60;
  const ndc = new THREE.Vector2();
  const ground = planet.group.getObjectByName('ground');
  // mesh -> interactable. The bar group contains the chalkboard, so register the bar first
  // and let more specific things overwrite their own meshes.
  const interactMeshes = new Map();
  const byGenerality = [...interactables].sort((a, b) => (a.id === 'seat' ? -1 : b.id === 'seat' ? 1 : 0));
  for (const it of byGenerality) for (const obj of [it.object, ...(it.extra || [])]) obj && obj.traverse((o) => { if (o.isMesh) interactMeshes.set(o, it); });
  // the loose things: picked up once the physics is there to throw them
  const looseMeshes = new Map();
  for (const it of physics.items) it.object.traverse((o) => { if (o.isMesh) looseMeshes.set(o, it); });
  const bridge = places.machine.deck; // the bridge over the cutaway: walked on like the ground
  const pickList = [...interactMeshes.keys(), ...looseMeshes.keys(), ground, bridge];

  function pick(x, y) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(pickList, false).find((h) => !(looseMeshes.get(h.object) || {}).held);
    if (!hit) return null;
    if (hit.object === ground || hit.object === bridge) return { ground: hit.point };
    const loose = looseMeshes.get(hit.object);
    if (loose) return physics.ready ? { loose, point: hit.point } : { ground: hit.point };
    return { thing: interactMeshes.get(hit.object), point: hit.point };
  }

  /* ---------- Glints: things you can use catch the light, now and then ---------- */
  // Where each one glints (a little above its middle), what you've used so far, and what could
  // glint right now: out walking, anything you haven't used yet (or anything, once you have);
  // at the bar, the chalkboard, until you've read it.
  const glints = createGlints({ scene, reducedMotion });
  const used = new Set();
  const glintAt = new Map();
  const _box = new THREE.Box3(), _bc = new THREE.Vector3(), _bs = new THREE.Vector3();
  function glintPoint(it) {
    if (!glintAt.has(it)) {
      _box.setFromObject(it.object).getCenter(_bc);
      const lift = Math.min(_box.getSize(_bs).length() * 0.18, 0.6);
      glintAt.set(it, _bc.clone().addScaledVector(_bc.clone().normalize(), lift));
    }
    return glintAt.get(it);
  }
  function glintThings() {
    if (flight || leaving || !panel.hidden || !menu.hidden) return [];
    if (state === 'seat') {
      const it = interactables.find((x) => x.id === 'drinks');
      return it && !used.has('drinks') && !board.on && !making && !held ? [{ key: 'drinks', at: glintPoint(it) }] : [];
    }
    if (state !== 'walk' || carry) return [];
    const all = interactables.filter((x) => x.id !== 'seat' && x.id !== 'menu' && x.id !== 'drinks' && x.object).map((x) => ({ key: x.id, at: glintPoint(x) }));
    if (physics.ready) for (const l of physics.items) if (!l.held) all.push({ key: l.label, at: l.object.position.clone().addScaledVector(l.object.position.clone().normalize(), (l.radius || 0.15) * 1.6) });
    const fresh = all.filter((x) => !used.has(x.key));
    return fresh.length ? fresh : all;
  }

  /* ---------- Doing things ---------- */
  function use(it) {
    player.stop();
    used.add(it.id);
    glints.clear();
    if (it.id === 'seat') return sitDown();
    if (it.id === 'menu') return sitDown({ pickUp: true });
    if (it.id === 'drinks') return sitDown({ then: () => lookAtBoard() });
    if (it.id === 'make') return sitDown({ then: () => startMaking(it.make) });
    if (it.id === 'rocket') { location.href = menu.querySelector('.menu__foot a').href; return; }
    if (it.id === 'campfire') return sitAtFire();
    if (it.id === 'hammock') return lieInHammock();
    if (it.id === 'stones') return goToShore();
    if (it.id === 'bottles') return goToBottles();
    if (it.id === 'launch') return lookThroughScope();
    // a landmark that's a panel: turn to it first, so it's there when the panel closes
    player.face(it.point, () => { if (state === 'walk' && panel.hidden) openPanel(it.id === 'console' ? 'launch' : it.id); });
  }
  let destT = -1;
  const destAt = new THREE.Vector3();
  function showDest(point) { destAt.copy(point); standOn(destRing, point, 0.6); destT = 0; }
  // A straight line can run into the counter, a post, a palm, a rock or the machine's railing:
  // walk round instead (route.js), anywhere on the planet.
  function routeTo(point) {
    return onPlanet(player.pos, point, player.colliders, { R: RADIUS, body: BODY + 0.03 }).map((up) => up.multiplyScalar(surfaceRadius(up)));
  }
  function goUse(it) {
    clearHint('walk');
    if (player.pos.distanceTo(it.approach) < 0.6 || player.pos.distanceTo(it.point) < it.radius * 0.7) return use(it);
    player.walkTo(it.approach, { arrive: 0.45, onArrive: () => use(it), via: routeTo(it.approach) });
    showDest(it.approach);
  }

  // A tap is followed by a click at the same spot. On phones the menu opens right under the
  // finger, so that click would land on a menu item and order it: eat it.
  function swallowNextClick() {
    const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
    document.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => document.removeEventListener('click', stop, { capture: true }), 500);
  }

  function onTap(x, y) {
    if (state === 'hammock' && lying && !flight && !leaving && panel.hidden && menu.hidden && bookSky.settled) {
      // the whole sky: a tap on a shelf leans in on it (a comet is still a book). Leaned in: a
      // star is its card, another shelf's name moves over to it, empty sky puts the card away.
      const rect = canvas.getBoundingClientRect();
      if (!zoom.region) {
        const c = bookSky.pick(x, y, camera, rect, coarse ? 34 : 26);
        if (c && c.comet) return openStar(c);
        const r = bookSky.regionAt(x, y, camera, rect, { near: true });
        if (r) zoomTo(r);
        return;
      }
      const b = labelAt(x, y) || bookSky.pick(x, y, camera, rect, coarse ? 64 : 44, zoom.region);
      if (b) return openStar(b);
      const r = bookSky.regionAt(x, y, camera, rect);
      if (r && r !== zoom.region) { closeStar(); zoomTo(r); } else closeStar();
      return;
    }
    if (state === 'scope' && !scope.leaving && scope.k === 1 && scopeCard.hidden && panel.hidden) { scopeCard.hidden = false; return; }
    if (state === 'seat' && panel.hidden && menu.hidden) {
      if (making) return; // it's making you a drink
      if (board.on) { // leaned in on the chalkboard: a name is its recipe, off the board closes the card
        const i = boardRowAt(x, y);
        if (i >= 0) { swallowNextClick(); showRecipe(i); } else if (board.pick >= 0) hideRecipe();
        return;
      }
      const p = pick(x, y);
      if (p && p.thing && p.thing.id === 'menu') { swallowNextClick(); pickUpMenu(); }
      else if (p && p.thing && p.thing.id === 'drinks') { swallowNextClick(); lookAtBoard(); }
      return;
    }
    if (state !== 'walk' || !panel.hidden || !menu.hidden) return;
    const p = pick(x, y);
    if (!p) return;
    if (p.thing) return goUse(p.thing);
    if (p.loose) return goGrab(p.loose);
    clearHint('walk');
    const to = clearSpot(p.ground);
    player.walkTo(to, { via: routeTo(to) });
    showDest(to);
  }

  const tip = $('tip');
  let hovered = null;
  function onHover(x, y) {
    // in the hammock: the stars are (the books)
    if (x !== null && state === 'hammock' && lying && !flight && panel.hidden && menu.hidden && bookSky.settled) {
      const rect = canvas.getBoundingClientRect();
      const b = (zoom.region && labelAt(x, y)) || bookSky.pick(x, y, camera, rect, zoom.region ? 44 : 26, zoom.region);
      const r = !zoom.region && !(b && b.comet) ? bookSky.regionAt(x, y, camera, rect, { near: true }) : null;
      const show = (b && (zoom.region || b.comet)) ? [b.book.title, starStatus(b.book)] : r ? [r.name, `${r.count} books`] : null;
      canvas.style.cursor = show ? 'pointer' : '';
      tip.hidden = !show || !starCard.hidden;
      if (show) {
        tip.querySelector('strong').textContent = show[0];
        tip.querySelector('span').textContent = show[1];
        tip.style.transform = `translate(${x + 16}px, ${y + 14}px)`;
      }
      return;
    }
    // leaned in on the chalkboard: the names are clickable
    if (x !== null && state === 'seat' && board.on && panel.hidden && menu.hidden) {
      const i = making ? -1 : boardRowAt(x, y);
      canvas.style.cursor = i >= 0 ? 'pointer' : '';
      bar.board.mark(i >= 0 ? i : board.pick);
      tip.hidden = true;
      return;
    }
    // seated: only the menu card is clickable
    if (x !== null && state === 'seat' && panel.hidden && menu.hidden && !cardFlight) {
      const p = pick(x, y);
      const onCard = !!(p && p.thing && (p.thing.id === 'menu' || p.thing.id === 'drinks'));
      canvas.style.cursor = onCard ? 'pointer' : '';
      hovered = onCard ? p.thing : null;
      tip.hidden = !onCard;
      if (onCard) {
        tip.querySelector('strong').textContent = p.thing.label;
        tip.querySelector('span').textContent = p.thing.verb;
        tip.style.transform = `translate(${x + 16}px, ${y + 14}px)`;
      }
      return;
    }
    if (x === null || state !== 'walk' || !panel.hidden || !menu.hidden) {
      hovered = null; tip.hidden = true; hoverRing.material.opacity = 0; canvas.style.cursor = '';
      return;
    }
    const p = pick(x, y);
    hovered = p && (p.thing || (p.loose && { label: p.loose.label, verb: 'Pick it up' }));
    if (hovered) {
      tip.hidden = false;
      tip.querySelector('strong').textContent = hovered.label;
      tip.querySelector('span').textContent = hovered.verb;
      tip.style.transform = `translate(${x + 16}px, ${y + 14}px)`;
      hoverRing.material.opacity = 0;
      canvas.style.cursor = 'pointer';
    } else {
      tip.hidden = true;
      canvas.style.cursor = p ? 'pointer' : '';
      if (p) { standOn(hoverRing, clearSpot(p.ground)); hoverRing.material.opacity = 0.35; } else hoverRing.material.opacity = 0;
    }
  }

  function nearestInReach() {
    let best = null, bestD = Infinity;
    for (const it of interactables) {
      const d = player.pos.distanceTo(it.point);
      if (d < it.radius && d < bestD) { best = it; bestD = d; }
    }
    return best;
  }

  // Seated, you can still look around: a head turn on top of the seat's pose, within what a
  // neck allows. It resets when you sit down again.
  const seatLook = { yaw: 0, pitch: 0 };
  const look = (dx, dy) => {
    if (state === 'scope') { // at the eyepiece a drag moves the telescope a little, within the field
      const f = camera.fov * Math.PI / 180, lim = f * 0.3;
      scope.nudge.yaw = THREE.MathUtils.clamp(scope.nudge.yaw - dx * (f / 1.2), -lim, lim);
      scope.nudge.pitch = THREE.MathUtils.clamp(scope.nudge.pitch - dy * (f / 1.2), -lim, lim);
      return;
    }
    if (state === 'seat' || state === 'camp' || state === 'hammock' || state === 'shore' || state === 'note') {
      if (flight || leaving || drink || view.k > 0) return;
      // same feel as walking (player.look): drag the world, so dragging right turns you left
      const k = camera.fov / BASE_FOV; // leaned in on the book sky, a drag moves the view as much as the hand
      if (aimTween) aimTween = null; // dragging takes over from a pan to a book
      seatLook.yaw = THREE.MathUtils.clamp(seatLook.yaw - dx * k, -1.9, 1.9);
      seatLook.pitch = THREE.MathUtils.clamp(seatLook.pitch - dy * k, -0.95, 0.95);
    } else if (player.enabled) player.look(dx, dy);
  };
  // At the fire: press and hold (without dragging) to reach the marshmallow into the flames;
  // a drag still looks around. Space does the same from the keyboard.
  const roast = { pointer: false, key: false, timer: 0 };
  const input = bindInput(player, canvas, {
    onTap,
    onHover,
    onDrag: look,
    onPress: () => {
      if (state === 'camp') { clearTimeout(roast.timer); roast.timer = setTimeout(() => { roast.pointer = true; }, 120); }
      if (state === 'shore') { clearTimeout(roast.timer); roast.timer = setTimeout(startWind, 120); } // held, not dragged
    },
    onDragStart: () => { clearTimeout(roast.timer); roast.pointer = false; if (state === 'shore') windUp = -1; },
    onRelease: () => { clearTimeout(roast.timer); roast.pointer = false; if (state === 'shore' && windUp >= 0) releaseThrow(); },
    // Keyboard: E / Enter uses whatever you're next to, otherwise heads for the bar.
    onKeyAction: () => {
      if (state === 'note') return; // the bottles have their own keys (below)
      if (state === 'seat' && panel.hidden && menu.hidden && board.on) { if (board.pick >= 0) startMaking(board.pick); return; } // on the board: make the one you're reading
      if (state === 'seat' && panel.hidden && menu.hidden) { if (!skipMaking()) pickUpMenu(); return; }
      if (state === 'camp' && panel.hidden && menu.hidden) { eatIt(); return; }
      if (state === 'hammock' && panel.hidden && menu.hidden) { readBook(); return; }
      if (state !== 'walk' || !panel.hidden || !menu.hidden) return;
      const it = nearestInReach();
      it ? use(it) : goUse(barSpot);
    },
  });

  /* ---------- Sitting and leaving ---------- */
  let seatPose = null;
  let flight = null;
  function poseLooking(eye, target) {
    const m = new THREE.Matrix4().lookAt(eye, target, eye.clone().normalize());
    return { pos: eye.clone(), quat: new THREE.Quaternion().setFromRotationMatrix(m) };
  }
  // Move your eyes through a few poses ({ pos, quat, ms }) like a body would: one smooth curve
  // from wherever the camera is now, eased in and out as a whole so it never stops at a key.
  // Reduced motion: jump to the last pose.
  function flyPath(keys, then) {
    const last = keys[keys.length - 1];
    if (reducedMotion) { camera.position.copy(last.pos); camera.quaternion.copy(last.quat); flight = null; then && then(); return; }
    const from = { pos: camera.position.clone(), quat: camera.quaternion.clone(), ms: 0 };
    const poses = [from, ...keys];
    const ends = [];
    let total = 0;
    for (const k of keys) ends.push(total += k.ms);
    const curve = new THREE.CatmullRomCurve3(poses.map((p) => p.pos), false, 'centripetal');
    flight = { t0: performance.now(), total, ends, poses, curve, then };
  }
  function flightStep(now) {
    const f = flight;
    const k = Math.min(1, (now - f.t0) / f.total);
    // eased time along the path: speeding up over the first quarter, steady, slowing over the last
    // (a steady middle peaks at 4/3 of the average speed; an ease-in-out curve would peak at twice it)
    const A = 0.25, t = (k < A ? (k * k) / (2 * A * (1 - A)) : k < 1 - A ? (k - A / 2) / (1 - A) : 1 - ((1 - k) * (1 - k)) / (2 * A * (1 - A))) * f.total;
    let i = 0;
    while (i < f.ends.length - 1 && t > f.ends[i]) i++;
    const start = i ? f.ends[i - 1] : 0;
    const local = Math.min(1, (t - start) / (f.ends[i] - start || 1));
    camera.position.copy(f.curve.getPoint((i + local) / f.ends.length));
    camera.quaternion.copy(f.poses[i].quat).slerp(f.poses[i + 1].quat, local); // the path's own easing is enough
    if (k === 1) { flight = null; f.then && f.then(); }
  }

  /* ---------- The menu card: pick it up off the bar, put it back down ---------- */
  // Picking up flies the 3D card from the counter to where the HTML menu sits on screen,
  // sized to match, then the HTML menu fades in over it. Putting down is the reverse.
  // The camera never moves; only the card does. Reduced motion: no flight.
  const card = bar.menu.card;
  const cardHome = { parent: card.parent, pos: card.position.clone(), quat: card.quaternion.clone() };
  let held = false;
  let cardFlight = null;
  const _m = new THREE.Matrix4();
  seatMenuHeld = () => held;

  function cardWorldHome() {
    cardHome.parent.updateMatrixWorld(true);
    _m.compose(cardHome.pos, cardHome.quat, new THREE.Vector3(1, 1, 1)).premultiply(cardHome.parent.matrixWorld);
    const pos = new THREE.Vector3(), quat = new THREE.Quaternion();
    _m.decompose(pos, quat, new THREE.Vector3());
    return { pos, quat };
  }
  // Where the card must be, facing the camera, to cover the HTML menu card's rectangle.
  function cardInHand() {
    const r = menu.querySelector('.menu__card').getBoundingClientRect();
    const c = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector3(((r.left + r.width / 2 - c.left) / c.width) * 2 - 1, -((r.top + r.height / 2 - c.top) / c.height) * 2 + 1, 0.5);
    const dist = (bar.menu.height * c.height) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * r.height);
    const dir = ndc.unproject(camera).sub(camera.position).normalize();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const quat = camera.quaternion.clone();
    // the card's origin is its bottom edge: drop it by half its height along the camera's up
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    // and the painted face is 4 mm in front of the card's origin, which matters at 20 cm
    const pos = camera.position.clone().addScaledVector(dir, dist / dir.dot(fwd)).addScaledVector(up, -bar.menu.height / 2).addScaledVector(fwd, 0.004);
    return { pos, quat };
  }
  function flyCard(from, to, ms, then, light) {
    pipeline.overlay.attach(card); // drawn after the grade, so in your hands it's the page's own colours
    card.position.copy(from.pos);
    card.quaternion.copy(from.quat);
    card.visible = true;
    cardFlight = { t0: performance.now(), ms, from, to, then, light };
  }
  // Paint the card's face from the HTML menu as it would look in your hands (laid out out of
  // sight if it's hidden), so the card and the page are one and the same.
  function paintMenu() {
    const hidden = menu.hidden, mode = menu.dataset.mode, title = $('menu-title').textContent;
    if (hidden) {
      menu.classList.add('is-arriving');
      menu.dataset.mode = 'seat';
      $('menu-title').textContent = "What'll it be?";
      menu.hidden = false;
    }
    bar.menu.paint(paintMenuCard(menu.querySelector('.menu__card'), Math.min(2, Math.max(1.5, devicePixelRatio || 1))));
    if (hidden) {
      menu.hidden = true;
      menu.classList.remove('is-arriving');
      if (mode) menu.dataset.mode = mode; else delete menu.dataset.mode;
      $('menu-title').textContent = title;
    }
  }
  paintMenu();
  let repaint = 0;
  addEventListener('resize', () => { clearTimeout(repaint); repaint = setTimeout(() => { if (!held && !cardFlight && menu.hidden) paintMenu(); }, 250); });
  function cardBackOnBar() {
    cardFlight = null;
    bar.menu.light(0);
    cardHome.parent.add(card);
    card.position.copy(cardHome.pos);
    card.quaternion.copy(cardHome.quat);
    card.visible = true;
  }

  pickUpMenu = () => {
    if (state !== 'seat') return;
    // still settling onto the stool: pick it up once the view is still, so the card lands in the right place
    if (leaving) return;
    if (flight) { const then = flight.then; flight.then = () => { then && then(); pickUpMenu(); }; return; }
    if (held) { if (menu.hidden && panel.hidden) showMenu('seat'); return; }
    held = true;
    done.set('menu');
    tip.hidden = true;
    canvas.style.cursor = '';
    if (reducedMotion) { card.visible = false; showMenu('seat'); return; }
    menu.classList.add('is-arriving'); // laid out (so it can be measured) but invisible
    showMenu('seat');
    paintMenu();
    flyCard(cardWorldHome(), cardInHand(), 520, () => {
      // the page fades in over the card it was painted from; the card goes only once the page
      // is fully opaque, so there's never a frame with neither (or a half of each)
      const sheet = menu.querySelector('.menu__card');
      menu.classList.add('is-landed');
      menu.classList.remove('is-arriving');
      let gone = false;
      const hide = () => { if (gone) return; gone = true; sheet.removeEventListener('transitionend', hide); if (held && !menu.hidden) card.visible = false; };
      sheet.addEventListener('transitionend', hide);
      setTimeout(hide, 400);
    }, [0, 1]);
  };
  putDownMenu = () => {
    if (!held) { hideMenu(); return; }
    const from = menu.hidden || reducedMotion ? null : cardInHand();
    if (from) { paintMenu(); bar.menu.light(1); }
    held = false;
    hideMenu();
    menu.classList.remove('is-arriving');
    canvas.focus({ preventScroll: true });
    if (!from) return cardBackOnBar();
    flyCard(from, cardWorldHome(), 420, cardBackOnBar, [1, 0]);
  };

  /* ---------- Ordering: watch it made, then drink it in ---------- */
  // Choosing from the menu puts the menu down so you can watch the bartender shake the drink
  // and slide it over. Then you lift the mug and look into it, and the content pours open out
  // of it. Closing that sets the mug back on the bar and the menu comes back up. The camera
  // stays put; only the menu and the mug move. Reduced motion: no flights.
  let drink = null;   // { mug, home: { parent, pos, quat } } while the mug is off the bar
  let ordering = false;
  const objFlights = [];
  const X_AX = new THREE.Vector3(1, 0, 0);
  function worldPose(o) {
    o.updateWorldMatrix(true, false);
    const pos = new THREE.Vector3(), quat = new THREE.Quaternion();
    o.matrixWorld.decompose(pos, quat, new THREE.Vector3());
    return { pos, quat };
  }
  function flyObject(obj, from, to, ms, then) {
    scene.attach(obj);
    obj.position.copy(from.pos);
    obj.quaternion.copy(from.quat);
    objFlights.push({ obj, from, to, ms, t0: performance.now(), then });
  }
  // Held up in front of you, tipped toward you so you're looking down into it.
  function drinkInHand(mug) {
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const quat = camera.quaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(X_AX, 1.05));
    const mouth = camera.position.clone().addScaledVector(fwd, 0.42).addScaledVector(up, -0.04);
    const mouthOffset = mug.userData.mouth.clone().multiplyScalar(mug.scale.x).applyQuaternion(quat);
    return { pos: mouth.clone().sub(mouthOffset), quat, mouth };
  }
  function drinkHome(d) {
    d.home.parent.updateMatrixWorld(true);
    const m = new THREE.Matrix4().compose(d.home.pos, d.home.quat, d.mug.scale).premultiply(d.home.parent.matrixWorld);
    const pos = new THREE.Vector3(), quat = new THREE.Quaternion();
    m.decompose(pos, quat, new THREE.Vector3());
    return { pos, quat };
  }
  function liftDrink(mug, id) {
    const home = { parent: mug.parent, pos: mug.position.clone(), quat: mug.quaternion.clone() };
    const d = (drink = { mug, home });
    const to = drinkInHand(mug);
    const reveal = () => {
      if (drink !== d) return;
      ordering = false;
      const m = to.mouth.clone().project(camera);
      const r = canvas.getBoundingClientRect();
      openPanel(id, { from: { x: r.left + ((m.x + 1) / 2) * r.width, y: r.top + ((1 - m.y) / 2) * r.height } });
    };
    if (reducedMotion) { scene.attach(mug); mug.position.copy(to.pos); mug.quaternion.copy(to.quat); return reveal(); }
    // a beat to see it land, then lift it
    setTimeout(() => { if (drink === d) flyObject(mug, worldPose(mug), to, 850, reveal); }, 250);
  }
  function drinkBackOnBar() {
    const d = drink;
    if (!d) return;
    for (let i = objFlights.length - 1; i >= 0; i--) if (objFlights[i].obj === d.mug) objFlights.splice(i, 1);
    d.home.parent.attach(d.mug);
    d.mug.position.copy(d.home.pos);
    d.mug.quaternion.copy(d.home.quat);
    drink = null;
  }
  order = (id) => {
    if (drink && !ordering) { openPanel(id); return; } // already holding one: just change what's in it
    if (ordering) return;
    if (making) { making.skip(); return; } // one thing at a time: finish the drink first
    ordering = true;
    if (held) putDownMenu(); else hideMenu();
    bar.serve(id, (mug) => {
      if (state !== 'seat') { ordering = false; return; }
      liftDrink(mug, id);
    });
  };
  drinkUp = () => !!drink;
  putDownDrink = () => {
    const d = drink;
    if (!d) return;
    const back = () => { drinkBackOnBar(); if (state === 'seat') pickUpMenu(); };
    if (reducedMotion) return back();
    for (let i = objFlights.length - 1; i >= 0; i--) if (objFlights[i].obj === d.mug) objFlights.splice(i, 1);
    flyObject(d.mug, worldPose(d.mug), drinkHome(d), 650, () => { if (drink === d) back(); });
  };

  /* ---------- A real drink, made in front of you ---------- */
  // "Make me one" on a recipe: the robot makes it step by step (bar.make), a caption says what
  // it's doing, and Skip (or Esc) jumps to the finished drink. From anywhere on the planet it
  // walks you to your stool first. Leaving the bar stops it.
  const makingCard = $('making'), makingCount = $('making-count'), makingText = $('making-text'), makingDots = $('making-dots'), makingBuild = $('making-build'), makeSkip = $('make-skip');
  let making = null, makingDone;
  // The view while it's made: you lean in over the counter and your eyes follow the work, one
  // step at a time (bar.make's focus()), with the view narrowed like leaning in to watch closely.
  // Something you asked for, so the camera moves; eased like a head turn, snapped under
  // reduced motion. You sit back once the drink's in front of you.
  const BASE_FOV = camera.fov, LEAN_FOV = BASE_FOV * (coarse ? 0.66 : 0.52);
  // `eye`, `aim` and `fov` are where it's headed; `eyeNow` and `fovNow` ease after them, so going
  // from the chalkboard straight to the work is one head turn.
  const view = { k: 0, want: 0, eye: new THREE.Vector3(), look: new THREE.Vector3(), aim: new THREE.Vector3(), hold: 0, job: null, fov: LEAN_FOV, eyeNow: new THREE.Vector3(), fovNow: LEAN_FOV };
  function leanIn(job) {
    view.job = job;
    view.want = 1;
    view.hold = 0;
    view.fov = LEAN_FOV;
    // lean toward the work: a head's worth forward over the counter, a little lower
    const S = bar.seat, toward = job.center.clone().sub(S.eye);
    const up = S.eye.clone().normalize();
    toward.addScaledVector(up, -toward.dot(up)).normalize();
    view.eye.copy(S.eye).addScaledVector(toward, 0.32).addScaledVector(up, -0.06);
    view.aim.copy(job.focus());
    if (view.k === 0 || reducedMotion) { view.look.copy(view.aim); view.eyeNow.copy(view.eye); view.fovNow = view.fov; }
    seatLook.yaw = seatLook.pitch = 0;
  }
  function startMaking(idx) {
    const recipe = (data.drinks || [])[idx];
    if (!recipe) return;
    if (state === 'walk') return goUse({ ...interactables.find((x) => x.id === 'seat'), id: 'make', make: idx });
    if (state !== 'seat' || ordering) return;
    if (making) making.cancel();
    making = null;
    if (board.on) leaveBoard({ keepView: true }); // from the board's card: turn straight to the work
    drinkBackOnBar();
    if (held) putDownMenu(); else hideMenu();
    bubble.hidden = true;
    clearTimeout(makingDone);
    makingDots.replaceChildren();
    // the recipe, a chip a pour: lit while it's poured, ticked once it's in
    makingBuild.replaceChildren(...recipe.build.map((line) => Object.assign(document.createElement('li'), { textContent: line })));
    let job = null; // its steps say which are pours (onStep can come before it's assigned)
    job = making = bar.make(recipe, {
      onStep(i, n, text) {
        if (makingDots.children.length !== n) makingDots.replaceChildren(...Array.from({ length: n }, () => document.createElement('li')));
        [...makingDots.children].forEach((li, k) => li.classList.toggle('is-done', k <= i));
        const verbs = job ? job.steps : [], poured = verbs.slice(0, i + 1).filter((v) => v === 'pour').length, now = verbs[i] === 'pour';
        [...makingBuild.children].forEach((li, k) => { li.classList.toggle('is-done', k < poured - (now ? 1 : 0)); li.classList.toggle('is-now', now && k === poured - 1); });
        makingCount.textContent = `${recipe.name} · ${i + 1} of ${n}`;
        makingText.textContent = text;
        makingCard.hidden = false;
      },
      onDone() {
        making = null;
        [...makingDots.children].forEach((li) => li.classList.add('is-done'));
        [...makingBuild.children].forEach((li) => { li.classList.remove('is-now'); li.classList.add('is-done'); });
        makingCount.textContent = recipe.name;
        makingText.textContent = 'There you go. Cheers!';
        makingDone = setTimeout(() => { if (!making) makingCard.hidden = true; }, 4000);
        view.hold = 1.4; // watch it arrive, then sit back
      },
    });
    leanIn(job);
  }
  function stopMaking() {
    if (making) making.cancel();
    making = null;
    makingCard.hidden = true;
    leaveBoard({ keepView: true });
    view.want = 0; view.hold = 0;
    if (view.k) { view.k = 0; camera.fov = BASE_FOV; camera.updateProjectionMatrix(); }
  }

  /* ---------- The chalkboard: lean in, read it, pick a drink ---------- */
  // Tapping the board turns your head to it and narrows the view until it fills it (the same
  // lean as watching a drink made). Its names are tap targets: one chalks its recipe onto a
  // card (to the side on wide screens, below the board on phones), with "Make me one", which
  // turns you straight to the robot to watch it made. ×, Esc and Back step back out.
  const board = { on: false, pick: -1 };
  const boardCard = $('board-card'), boardBackBtn = $('board-back');
  const _uvRay = new THREE.Raycaster();
  _uvRay.layers.enableAll();
  function boardRowAt(x, y) {
    const r = canvas.getBoundingClientRect();
    _uvRay.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera);
    const hit = _uvRay.intersectObject(bar.board.face, false)[0];
    return hit && hit.uv ? bar.board.rowAt(hit.uv) : -1;
  }
  function lookAtBoard() {
    if (state !== 'seat' || flight || making || ordering) return;
    if (held) putDownMenu(); else hideMenu();
    drinkBackOnBar();
    bubble.hidden = true;
    tip.hidden = true;
    board.on = true;
    used.add('drinks');
    glints.clear();
    board.pick = -1;
    boardList.hidden = false;
    bar.board.mark(-1);
    // where it is and how big, from your stool
    const B = bar.board;
    B.group.updateMatrixWorld(true);
    const center = B.face.getWorldPosition(new THREE.Vector3());
    const eye = bar.seat.eye.clone();
    const d = eye.distanceTo(center), aspect = camera.aspect;
    // narrow until the board fills the view (with room round it), leaving room for the recipe:
    // below it on a tall screen, beside it on a wide one
    const tall = aspect < 1;
    const span = Math.max(B.size.y / (tall ? 0.36 : 0.62), B.size.x / ((tall ? 0.92 : 0.5) * aspect)); // metres of view, top to bottom
    view.fov = Math.min(BASE_FOV, THREE.MathUtils.radToDeg(2 * Math.atan(span / 2 / d)));
    const pose = poseLooking(eye, center);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(pose.quat), camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(pose.quat);
    // aim off its centre so it sits up top (tall) or on the left (wide)
    view.aim.copy(center);
    if (tall) view.aim.addScaledVector(camUp, -span * 0.2);
    else if (innerWidth > 760) view.aim.addScaledVector(right, span * aspect * 0.2);
    view.eye.copy(eye);
    view.job = null;
    view.want = 1;
    view.hold = 0;
    if (view.k === 0 || reducedMotion) { view.look.copy(view.aim); view.eyeNow.copy(view.eye); view.fovNow = view.fov; }
    seatLook.yaw = seatLook.pitch = 0;
    enterLevel('board', () => leaveBoard({ fromHistory: true }));
    showHint(`${coarse ? 'Tap' : 'Click'} a drink to see how it's made.`, 'board-pick');
  }
  function showRecipe(i) {
    const r = (data.drinks || [])[i];
    if (!r || !board.on) return;
    clearHint('board-pick');
    if (board.pick !== i) { sound.play('chalk'); buzz(8); }
    board.pick = i;
    bar.board.mark(i);
    $('board-name').textContent = r.name;
    $('board-meta').textContent = [r.origin, r.glass].filter(Boolean).join(' · ');
    $('board-build').replaceChildren(...r.build.map((line) => Object.assign(document.createElement('li'), { textContent: line })));
    $('board-method').textContent = r.method || '';
    $('board-note').textContent = r.note || '';
    boardCard.hidden = false;
    boardCard.scrollTop = 0;
  }
  function hideRecipe() {
    board.pick = -1;
    bar.board.mark(-1);
    boardCard.hidden = true;
  }
  function leaveBoard({ keepView = false, fromHistory = false } = {}) {
    if (!board.on) return;
    board.on = false;
    boardList.hidden = true;
    hideRecipe();
    if (hint.dataset.key === 'board-pick') hint.hidden = true;
    if (!keepView) view.want = 0;
    if (!fromHistory) leaveLevel('board');
  }
  const stepRecipe = (dir) => { const n = bar.board.rows; if (n) showRecipe(board.pick < 0 ? (dir > 0 ? 0 : n - 1) : (board.pick + dir + n) % n); };
  $('board-prev').addEventListener('click', () => stepRecipe(-1));
  $('board-next').addEventListener('click', () => stepRecipe(1));
  $('board-close').addEventListener('click', hideRecipe);
  $('board-make').addEventListener('click', () => { if (board.pick >= 0) startMaking(board.pick); });
  onSwipe(boardCard, stepRecipe);
  // the board's names as buttons too, unseen, for keyboards and screen readers (they're only paint on the board)
  const boardList = $('board-list');
  boardList.replaceChildren(...(data.drinks || []).slice(0, bar.board.rows).map((r, i) => Object.assign(document.createElement('button'), { type: 'button', textContent: r.name, onclick: () => showRecipe(i) })));
  boardBackBtn.addEventListener('click', () => leaveBoard());
  skipMaking = () => { if (!making) return false; making.skip(); return true; };
  makeSkip.addEventListener('click', skipMaking);
  decorateDrinks = () => {
    if (state !== 'walk' && state !== 'seat') return;
    panelBody.querySelectorAll('.recipe').forEach((sec, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'recipe__make';
      b.dataset.make = i;
      b.textContent = state === 'seat' ? 'Make me one' : 'Make me one at the bar';
      sec.append(b);
    });
  };
  panelBody.addEventListener('click', (e) => {
    const b = e.target.closest('[data-make]');
    if (!b) return;
    startMaking(+b.dataset.make); // first, so closing the panel doesn't bring the menu back up
    closePanel();
  });

  let chatter;
  // Ask the bartender: a real conversation (Claude, through supabase/functions/bartender, which
  // knows the site from /bartender.json). When that can't answer, the house answers do, from the
  // same facts (barback.js). Your question and its answer stack up in a short
  // transcript just above the question box, on phones too, and the answer shows as it's said.
  // The rotating chatter stops once you've said something.
  const chat = $('chat'), chatInput = $('chat-input'), chatLog = $('chat-log'), chatAsk = $('chat-ask');
  // Typing on a phone: the keyboard takes the bottom of the screen and iOS would slide the page up
  // to show the box (losing the top bar and the robot's head). Instead the world fits what's left
  // above the keyboard (`.is-typing`: fixed to the visual viewport), so the bar stays whole.
  const vv = window.visualViewport;
  const fitView = () => {
    if (!vv) return;
    root.style.setProperty('--vv-top', `${vv.offsetTop}px`);
    root.style.setProperty('--vv-h', `${vv.height}px`);
  };
  if (vv) { vv.addEventListener('resize', fitView); vv.addEventListener('scroll', fitView); }
  // Face to face: when you go to ask something, you look the bartender in the eye (the same eased
  // lean as watching a drink made: something you asked for, so the camera moves); you sit back
  // when you're done typing and it's done talking.
  let faceTimer = 0;
  function faceRobot(on) {
    clearTimeout(faceTimer);
    if (on) {
      if (state !== 'seat' || making || board.on || flight || leaving) return;
      const head = bar.robot.head.getWorldPosition(new THREE.Vector3()), up = bar.seat.eye.clone().normalize();
      view.job = null;
      view.eye.copy(bar.seat.eye);
      view.aim.copy(head).addScaledVector(up, -0.12); // the face in the upper part of the view, the talk below it
      view.fov = BASE_FOV * 0.82;
      view.want = 1;
      view.hold = 0;
      if (view.k === 0 || reducedMotion) { view.look.copy(view.aim); view.eyeNow.copy(view.eye); view.fovNow = view.fov; }
      seatLook.yaw = seatLook.pitch = 0;
    } else if (!making && !board.on) view.want = 0;
  }
  // typing is the box having focus (a phone's keyboard is up exactly then)
  chatInput.addEventListener('focus', () => { root.classList.add('is-typing'); fitView(); faceRobot(true); });
  chatInput.addEventListener('blur', () => {
    root.classList.remove('is-typing');
    faceTimer = setTimeout(() => { if (document.activeElement !== chatInput && !talking) faceRobot(false); }, 350);
  });
  // Ask and the questions don't take focus from the box: the keyboard stays up and nothing moves
  // under your finger mid-tap (as in any chat app)
  for (const el of [chat.querySelector('button'), chatAsk]) el.addEventListener('pointerdown', (e) => { if (document.activeElement === chatInput) e.preventDefault(); });
  // something to ask, until you've asked something
  chatAsk.replaceChildren(...(data.ask || []).map((q) => Object.assign(document.createElement('button'), { type: 'button', textContent: q,
    onclick: () => { chatInput.value = q; chat.requestSubmit(); } })));
  const talk = [];
  let talking = false, talked = false;
  const CLOSED = "The bar's closed for a moment. The menu's right in front of you.";
  const said = (who, text) => { // one line of the transcript; the robot's starts empty and fills in
    const li = document.createElement('li');
    li.className = `chat-log__${who}`;
    li.textContent = text;
    chatLog.append(li);
    while (chatLog.children.length > 12) chatLog.firstElementChild.remove(); // the last six exchanges
    chatLog.scrollTop = chatLog.scrollHeight;
    return li;
  };
  chat.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = chatInput.value.trim();
    if (!q || talking) return;
    talked = true;
    chatAsk.hidden = true;
    clearInterval(chatter);
    bubble.hidden = true;
    talking = true;
    chatLog.hidden = false;
    said('q', q);
    const line = said('a', '');
    line.classList.add('is-thinking');
    chatInput.value = '';
    talk.push({ role: 'user', content: q });
    let answer = '';
    try {
      const res = await fetch(`${DB.url}/functions/v1/bartender`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: DB.key, authorization: `Bearer ${DB.key}` },
        body: JSON.stringify({ messages: talk.slice(-12), stream: true }),
      });
      if ((res.headers.get('content-type') || '').includes('application/json')) answer = (await res.json()).reply || '';
      else if (res.ok && res.body) { // plain text, streamed: show it as it comes
        const reader = res.body.getReader(), decoder = new TextDecoder();
        bar.robot.talk(true); // its gauge flickers as the words come
        for (let r = await reader.read(); !r.done; r = await reader.read()) {
          answer += decoder.decode(r.value, { stream: true });
          line.classList.remove('is-thinking');
          line.textContent = answer;
          chatLog.scrollTop = chatLog.scrollHeight;
        }
        answer += decoder.decode();
      }
    } catch (err) { /* offline, or the function isn't there: the house answers below */ }
    answer = answer.trim();
    if (!answer) answer = await houseAnswer(q).catch(() => ''); // the model's out (no credit, an outage, offline): answer from the site's own facts
    if (answer) talk.push({ role: 'assistant', content: answer });
    else talk.pop(); // keep the conversation taking turns
    line.classList.remove('is-thinking');
    line.textContent = answer || CLOSED;
    chatLog.scrollTop = chatLog.scrollHeight;
    bar.robot.talk(false);
    talking = false;
    if (document.activeElement !== chatInput) faceTimer = setTimeout(() => faceRobot(false), 4000); // a moment to read it, then sit back
  });
  let leaving = false;
  function sitDown({ pickUp = false, then = null } = {}) {
    leaving = false;
    seatLook.yaw = seatLook.pitch = 0;
    input.clear();
    player.stop();
    clearHint('walk');
    done.set('sat');
    tip.hidden = true;
    setState('seat');
    bar.greet();
    seatPose = poseLooking(bar.seat.eye, bar.seat.look);
    // step up behind the stool, dip down onto it with an eye on the bar, settle facing the robot
    const S = bar.seat;
    const step = Math.min(700, Math.max(250, camera.position.distanceTo(S.stand) * 420));
    flyPath([
      { ...poseLooking(S.stand, S.look), ms: step },
      { ...poseLooking(S.dip, S.barTop), ms: 480 },
      { ...seatPose, ms: 420 },
    ], () => {
      if (state !== 'seat') return;
      if (pickUp && panel.hidden) pickUpMenu();
      else if (then && panel.hidden) then();
      say(data.bartender[0]);
      let i = 1;
      clearInterval(chatter);
      // his lines, and one about tonight's moon (pointing you at the telescope)
      const m = window.moonTonight && window.moonTonight();
      const lines = m ? [...data.bartender, `Tonight's moon: ${m.name.toLowerCase()}. Have a look through the telescope.`] : data.bartender;
      if (!talked) chatter = setInterval(() => { if (state === 'seat' && panel.hidden && !making && !board.on) say(lines[i++ % lines.length]); }, 12000);
    });
  }

  leaveBar = () => {
    stopMaking(); // and leans back from the board
    drinkBackOnBar();
    ordering = false;
    hideMenu();
    held = false;
    menu.classList.remove('is-arriving');
    cardBackOnBar();
    closePanel();
    clearInterval(chatter);
    bubble.hidden = true;
    bar.farewell();
    // You end up standing where you walked in, facing back down the path. Get up into that
    // exact view (lean forward, stand behind the stool, turn around as you step back), so the
    // walk picks up from the same frame.
    const wasSeated = state === 'seat';
    player.spawn(barSpot.approach.clone().normalize(), surfacePoint(SPOTS.spawn), -0.05);
    const endPos = player.pos.clone().addScaledVector(player.pos.clone().normalize(), player.eye);
    const endQuat = player.quat.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), player.pitch));
    const finish = () => {
      leaving = false;
      setState('walk');
      player.applyToCamera();
      canvas.focus({ preventScroll: true });
    };
    if (!wasSeated) { flight = null; return finish(); }
    leaving = true;
    const S = bar.seat;
    // halfway through the turn you're looking along the counter, so it turns the natural way
    const mid = S.stand.clone().lerp(endPos, 0.45);
    const side = mid.clone().add(new THREE.Vector3(3, 0, 0));
    flyPath([
      // unhurried, so the turn never disorients: about 4 s, the turn peaking near 140°/s
      { ...poseLooking(S.lean, S.barTop), ms: 480 },
      { ...poseLooking(S.stand, S.look), ms: 760 },
      { ...poseLooking(mid, side), ms: 1350 },
      { pos: endPos, quat: endQuat, ms: 1450 },
    ], finish);
  };
  $('leave').addEventListener('click', () => leaveBar());
  const seatLeave = $('seat-leave');
  seatLeave.addEventListener('click', () => leaveBar());

  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (e.target === chatInput) { chatInput.blur(); return; } // first Esc just leaves the question box
    if (!starCard.hidden) { closeStar(); return; } // first Esc puts the book's card away
    if (zoom.region && panel.hidden) { zoomOut(); return; } // the next leans back out to the whole sky
    if (board.on && panel.hidden) { if (board.pick >= 0) hideRecipe(); else leaveBoard(); return; } // the card first, then the board
    if (!panel.hidden) closePanel();
    else if (making && menu.hidden) skipMaking(); // Esc while it's making one: straight to the drink
    else if (!menu.hidden && menuMode === 'nav') hideMenu();
    else if (state === 'seat' && held) putDownMenu(); // first Esc puts the menu down, the next one leaves
    else if (state === 'seat') leaveBar();
    else if (state === 'camp') leaveFire();
    else if (state === 'hammock') getOutOfHammock();
    else if (state === 'shore') leaveShore();
    else if (state === 'scope') { if (scope.site >= 0) closeSite(); else leaveScope(); } // a landing site first
    else if (state === 'note') { if (noteStep === 'writing') putNoteBack(); else leaveBottles(); } // first Esc puts the letter back
    else if (state === 'walk' && carry) putDown();
  });
  addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || e.target.closest('button, a, input, textarea')) return;
    if (state === 'camp') { roast.key = true; e.preventDefault(); }
    if (state === 'shore') { if (!e.repeat) startWind(); e.preventDefault(); }
    if (state === 'walk' && carry && panel.hidden && menu.hidden) { if (!e.repeat) windCarry(); e.preventDefault(); }
  });
  addEventListener('keyup', (e) => {
    if (e.code !== 'Space') return;
    roast.key = false;
    if (state === 'shore' && windUp >= 0) releaseThrow();
    if (carryWind >= 0) throwCarried();
  });

  /* ---------- The campfire: sit on a log, roast marshmallows ---------- */
  // The same continuous body motion as the bar: step up behind the log, sit, face the fire.
  // Getting up stands you back where you walked in, still facing the fire.
  let campPose = null, eaten = 0, thought;
  const campLeave = $('camp-leave'), campEat = $('camp-eat');
  function sitAtFire() {
    leaving = false;
    seatLook.yaw = seatLook.pitch = 0;
    input.clear();
    player.stop();
    clearHint('walk');
    tip.hidden = true;
    setState('camp');
    const S = campSpot.seat;
    campPose = poseLooking(S.eye, S.look);
    const step = Math.min(900, Math.max(300, camera.position.distanceTo(S.stand) * 420));
    flyPath([
      { ...poseLooking(S.stand, S.look), ms: step },
      { ...poseLooking(S.dip, S.look), ms: 520 },
      { ...campPose, ms: 480 },
    ], () => {
      if (state !== 'camp') return;
      roaster.show(true);
      showHint(coarse ? 'Press and hold to roast a marshmallow.' : 'Press and hold (or Space) to roast a marshmallow.', 'roast');
    });
  }
  function leaveFire() {
    if (state !== 'camp' || leaving) return;
    roaster.show(false);
    clearTimeout(thought);
    bubble.hidden = true;
    if (hint.dataset.key === 'roast') hint.hidden = true;
    player.spawn(campSpot.approach.clone().normalize(), campSpot.point, -0.12);
    const endPos = player.pos.clone().addScaledVector(player.pos.clone().normalize(), player.eye);
    const endQuat = player.quat.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), player.pitch));
    const finish = () => { leaving = false; setState('walk'); player.applyToCamera(); canvas.focus({ preventScroll: true }); };
    leaving = true;
    const S = campSpot.seat;
    flyPath([
      { ...poseLooking(S.rise, S.look), ms: 480 },
      { ...poseLooking(S.stand, S.look), ms: 800 },
      { pos: endPos, quat: endQuat, ms: 700 },
    ], finish);
  }
  // Eat what's on the stick (or blow it out first, if it's on fire), and hear how it went.
  // Every marshmallow comes with something Steve thinks about by the fire.
  function eatIt() {
    if (state !== 'camp' || flight) return;
    if (roaster.state.burning) { roaster.blowOut(); say('Phew. Blown out.', 2500); return; }
    const k = roaster.eat();
    if (k === null) return;
    clearHint('roast');
    say(verdict(k), 3200);
    const like = (data.likes || [])[eaten++ % Math.max(1, (data.likes || []).length)];
    clearTimeout(thought);
    if (like) thought = setTimeout(() => { if (state === 'camp') say('On my mind: ' + like, 5000); }, 3400);
  }
  campLeave.addEventListener('click', () => leaveFire());
  campEat.addEventListener('click', () => eatIt());

  /* ---------- Loop ---------- */
  const timer = new THREE.Timer();
  let t = 0;
  const _v = new THREE.Vector3();
  const beacon = $('beacon');
  let movedFrom = null;
  /* ---------- The hammock: climb in, lie back, read ---------- */
  // One continuous body motion, like the bar and the fire: step up to the middle of it, turn
  // round and sit on its edge (it takes your weight), swing your legs up and lie back looking up
  // through the palms. It swings from you getting in, and you swing with it until it settles
  // (not under reduced motion). You pick up the book left open in it and the reading list opens
  // out of the book. Getting up is the reverse: you end standing where you walked in, facing it,
  // the book back where it was.
  const hmSpot = interactables.find((i) => i.id === 'hammock');
  const HM = hmSpot && hmSpot.hammock;
  const hmLeave = $('hammock-leave'), hmRead = $('hammock-read');
  let sound = { play() {} }; // until the scene's up (createSound below)
  let fireflies = null, clock = 0;
  let lying = null, loadTo = 0, bookTween = null, hmTimer;
  // held open in front of you, spine up and down, pages toward you (its covers are its +y side, so +y points away)
  const READ = { pos: new THREE.Vector3(0, -0.05, -0.48), quat: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0))) };
  const CHEST = { pos: new THREE.Vector3(0.02, -0.3, -0.34), quat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.9).multiply(READ.quat) };
  // Where your eyes go, in the hammock's frame (the lying ones in its swing, so you swing with it).
  // Worked out with your weight in it, since that's how it hangs when you're there.
  function hammockPoses() {
    const was = HM.load;
    HM.setLoad(1);
    HM.group.updateMatrixWorld(true);
    const side = Math.sign(HM.group.worldToLocal(hmSpot.approach.clone()).z) || 1;
    const L = HM.length, P = (u, lift, across = 0) => HM.point(u, lift, across);
    const ground = HM.group.worldToLocal(hmSpot.point.clone()).y;
    const mid = P(0.5, 0);
    const g = (v) => HM.group.localToWorld(v.clone()), w = (v) => HM.swing.localToWorld(v.clone());
    const poses = {
      stand: poseLooking(g(new THREE.Vector3(L / 2, ground + 1.62, side * 0.85)), g(mid.clone().setY(mid.y + 0.45).setZ(-side * 0.6))), // at its side, looking at it and past it
      sit: poseLooking(w(P(0.5, 0.6, side * 0.2)), w(new THREE.Vector3(L / 2, mid.y + 0.45, side * 3.5))),       // on the edge, back to it
      back: poseLooking(w(P(0.42, 0.42, side * 0.06)), w(new THREE.Vector3(L * 0.95, mid.y + 3.2, 0))),       // legs up and in, leaning back along it (you turn as you swing round)
      lie: { eye: P(0.42, 0.19, 0), look: new THREE.Vector3(L * 0.5, mid.y + 2.7, -side * 3.4) },              // lying back across it, looking up and out over the water between two palms
    };
    poses.lie = { ...poses.lie, ...poseLooking(w(poses.lie.eye), w(poses.lie.look)) };
    HM.setLoad(was);
    return poses;
  }
  function tweenBook(to, open, ms, then) {
    bookTween = { from: { pos: HM.book.position.clone(), quat: HM.book.quaternion.clone(), open: HM.halves[1].rotation.x }, to, open, t0: performance.now(), ms: reducedMotion ? 0 : ms, then };
  }
  function bookStep(now) {
    const b = bookTween, k = b.ms ? Math.min(1, (now - b.t0) / b.ms) : 1, e = k * k * (3 - 2 * k);
    HM.book.position.lerpVectors(b.from.pos, b.to.pos, e);
    HM.book.quaternion.copy(b.from.quat).slerp(b.to.quat, e);
    for (const h of HM.halves) h.rotation.x = h.userData.side * THREE.MathUtils.lerp(b.from.open, b.open, e); // halves[1] is side +1, so its angle is the opening
    if (k === 1) { bookTween = null; b.then && b.then(); }
  }
  // the book, held open above you; the list pours out of it
  function readBook() {
    if (state !== 'hammock' || leaving) return;
    if (HM.book.parent !== camera) camera.attach(HM.book);
    tweenBook(READ, 0.45, 800, () => { // opened into a V, spine away from you
      if (state !== 'hammock' || leaving) return;
      const c = HM.book.getWorldPosition(new THREE.Vector3()).project(camera), r = canvas.getBoundingClientRect();
      openPanel('shelf', { from: { x: r.left + ((c.x + 1) / 2) * r.width, y: r.top + ((1 - c.y) / 2) * r.height } });
    });
  }
  function lieInHammock() {
    if (!HM || state !== 'walk') return;
    leaving = false;
    seatLook.yaw = seatLook.pitch = 0;
    input.clear();
    player.stop();
    clearHint('walk');
    tip.hidden = true;
    setState('hammock');
    enterLevel('hammock', () => getOutOfHammock({ fromHistory: true }));
    const P = hammockPoses();
    lying = P.lie;
    const step = Math.min(900, Math.max(300, camera.position.distanceTo(P.stand.pos) * 420));
    clearTimeout(hmTimer);
    hmTimer = setTimeout(() => { loadTo = 1; sound.play('creak'); }, reducedMotion ? 0 : step + 1300); // it takes your weight as you sit
    flyPath([
      { ...P.stand, ms: step },
      { ...P.sit, ms: 1800 },  // turn round and sit on the edge: an unhurried half turn
      { ...P.back, ms: 1150 }, // swing your legs up and in, leaning back
      { ...P.lie, ms: 1100 },  // and settle across it, looking up and out over the water
    ], () => {
      if (state !== 'hammock') return;
      loadTo = 1;
      if (!reducedMotion) HM.kick(0.32); // and you set it swinging
      lookUp(); // the stars first; the list is a button away ("Reading list")
    });
  }
  function getOutOfHammock({ fromHistory = false } = {}) {
    if (state !== 'hammock' || leaving) return;
    leaving = true;
    if (!fromHistory) leaveLevel('hammock'); // (and a shelf you'd leaned in on, and the reading list)
    closePanel();
    closeStar();
    zoomOut();
    skyGather = false;
    // the book goes back where it was, as you sit up
    HM.swing.attach(HM.book);
    tweenBook(HM.bookHome, 0.35, 700);
    const P = hammockPoses();
    player.spawn(hmSpot.approach.clone().normalize(), hmSpot.point, -0.12);
    const endPos = player.pos.clone().addScaledVector(player.pos.clone().normalize(), player.eye);
    const endQuat = player.quat.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), player.pitch));
    clearTimeout(hmTimer);
    hmTimer = setTimeout(() => { loadTo = 0; sound.play('creak'); if (!reducedMotion) HM.kick(-0.22); }, reducedMotion ? 0 : 1500); // you stand, it springs back
    const finish = () => { leaving = false; lying = null; setState('walk'); player.applyToCamera(); canvas.focus({ preventScroll: true }); };
    flyPath([
      { ...P.back, ms: 900 },  // sit up
      { ...P.sit, ms: 1100 },  // legs over the side
      { ...P.stand, ms: 1800 }, // stand, turning back round to it
      { pos: endPos, quat: endQuat, ms: 700 },
    ], finish);
  }
  hmLeave.addEventListener('click', () => getOutOfHammock());
  hmRead.addEventListener('click', readBook);
  // lying back, you look up: the loose stars drift together into their shelves
  function lookUp() {
    if (state !== 'hammock' || leaving) return;
    skyGather = true;
    if (bookSky.count && !bookSky.settled) showHint('Aligning…'); // while they gather (frame loop: then the stars' hint)
    else if (bookSky.count) starsHint();
  }
  const starsHint = () => showHint(`Every star above you is a book Steve has read. ${coarse ? 'Tap' : 'Click'} a group to see its books.`, 'stars');
  // closing the list: the book comes down to your chest, and you're lying looking at the sky
  afterHammockPanel = () => {
    if (state !== 'hammock' || leaving || HM.book.parent !== camera) return;
    tweenBook(CHEST, 0.1, 600);
    lookUp();
  };

  /* ---------- The book sky: every book Steve has read, as stars over the hammock ---------- */
  // booksky.js lays them out by shelf in a cone round where you look when you lie back. From the
  // hammock, tap a shelf and you lean in on it: the view narrows onto it (and the swing stills,
  // or the stars would swing too), the other shelves fade back, its books' titles come up beside
  // their stars, and a strip at the bottom steps from shelf to shelf. Tap a star for its card:
  // cover, who wrote it, when he read it (or how far through he is), the sample (site.js
  // playSample), and ‹ › through the rest of its shelf, newest first, the order of /bookshelf.
  // ×, Esc and Back lean back out. The data is /library.json, fetched once the planet's up.
  const bookSky = createBookSky({
    center: (() => {
      if (!HM) return new THREE.Vector3(0, 1, 0);
      const P = hammockPoses();
      // right where your eyes rest when you lie back: up between the two palms, which frame it
      return new THREE.Vector3(0, 0, -1).applyQuaternion(P.lie.quat);
    })(),
    reducedMotion,
  });
  scene.add(bookSky.group);
  const starCard = $('star-card'), starSample = $('star-sample'), starPrev = $('star-prev'), starNext = $('star-next');
  const skyShelf = $('sky-shelf'), skyLabels = $('sky-labels'), skyList = $('sky-list');
  let starOpen = null, skyGather = false;
  // leaning in on a shelf: k eases 0..1 as the view narrows from BASE_FOV to `cur`, which follows
  // `fov` (the shelf's) when you step to another
  const zoom = { region: null, k: 0, want: 0, fov: BASE_FOV, cur: BASE_FOV, applied: false, openFirst: null };
  let aimTween = null; // turning your head to a star or a shelf: { from: { yaw, pitch }, dir, t, ms }
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const regionOf = (slug) => bookSky.regions.find((r) => r.slug === slug) || null;
  function starStatus(b) {
    if (b.percent !== undefined) return `Reading now, ${b.percent}% through`;
    const name = (regionOf(b.shelf) || {}).name || '';
    if (!b.on) return name;
    const [y, m] = b.on.split('-');
    return `${name}${name ? ' · ' : ''}Read ${MONTHS[+m - 1]} ${y}`;
  }
  function openStar(s, { auto = false } = {}) {
    if (!s) return;
    tip.hidden = true; // the hover label goes; the card says it all
    const b = s.book;
    clearHint('stars');
    if (!auto) clearHint('star-pick'); // opened by leaning in: the hint about picking another stays
    starOpen = s;
    bookSky.select(s);
    const cover = $('star-cover');
    cover.textContent = '';
    cover.style.setProperty('--hue', (s.region || regionOf(b.shelf) || { hue: 220 }).hue);
    if (b.cover) { const img = new Image(); img.onerror = () => { cover.textContent = b.title; }; img.src = b.cover; img.alt = ''; cover.append(img); } else cover.textContent = b.title;
    $('star-kind').textContent = starStatus(b);
    $('star-title').textContent = b.title;
    $('star-meta').textContent = [b.by && `by ${b.by}`, b.series && `${b.series}${b.seq ? `, book ${b.seq}` : ''}`].filter(Boolean).join(' · ');
    starSample.hidden = !b.sample;
    starSample.setAttribute('aria-pressed', 'false');
    starPrev.hidden = starNext.hidden = !(s.region && s.region.books.length > 1);
    // where it is on its shelf, so these ‹ › read as books and the strip's below as shelves
    $('star-pos').textContent = s.region && s.region.books.length > 1 ? `${s.region.books.indexOf(s) + 1} of ${s.region.books.length}` : '';
    if (!auto) { sound.play('page'); buzz(8); }
    starCard.hidden = false; // above the shelf's strip, which stays
    labelsKey = ''; // the open one's title goes first
    // stepping to a book that's off screen (or under the card): turn to it
    if (zoom.region && s.region === zoom.region) {
      const r = canvas.getBoundingClientRect(), p = bookSky.screenOf(s, camera, r);
      if (!p.visible || p.x < r.left + r.width * 0.12 || p.x > r.right - r.width * 0.12 || p.y < r.top + r.height * 0.15 || p.y > r.bottom - r.height * 0.35) aimAt(s.dir, 500);
    }
  }
  function closeStar() {
    if (starCard.hidden) return;
    starCard.hidden = true;
    starOpen = null;
    bookSky.select(null);
    if (window.stopSample) window.stopSample();
    labelsKey = '';
  }
  function stepBook(d) {
    const list = starOpen && starOpen.region && starOpen.region.books;
    if (!list || !list.length) return;
    openStar(list[(list.indexOf(starOpen) + d + list.length) % list.length]);
  }
  starSample.addEventListener('click', () => { if (starOpen && window.playSample) window.playSample(starOpen.book.sample, starSample); });
  $('star-close').addEventListener('click', closeStar);
  starPrev.addEventListener('click', () => stepBook(-1));
  onSwipe(starCard, stepBook);
  starNext.addEventListener('click', () => stepBook(1));

  // turn your head (seatLook, on top of the lying pose) to look along `dir`, over `ms`
  function aimAt(dir, ms) { aimTween = { from: { yaw: seatLook.yaw, pitch: seatLook.pitch }, dir: dir.clone(), t: 0, ms: reducedMotion ? 0 : ms }; }
  const _inv = new THREE.Quaternion(), _ld = new THREE.Vector3();
  function stepAim(base, dt) {
    _ld.copy(aimTween.dir).applyQuaternion(_inv.copy(base).invert()); // in the pose's frame
    const yaw = Math.atan2(-_ld.x, -_ld.z), pitch = Math.asin(THREE.MathUtils.clamp(_ld.y, -1, 1));
    aimTween.t += dt * 1000;
    const u = aimTween.ms ? Math.min(1, aimTween.t / aimTween.ms) : 1, e = u * u * (3 - 2 * u);
    seatLook.yaw = THREE.MathUtils.clamp(THREE.MathUtils.lerp(aimTween.from.yaw, yaw, e), -1.9, 1.9);
    seatLook.pitch = THREE.MathUtils.clamp(THREE.MathUtils.lerp(aimTween.from.pitch, pitch, e), -0.95, 0.95);
    if (u >= 1) aimTween = null;
  }

  function zoomTo(r) {
    if (!r || state !== 'hammock' || !lying || leaving || !bookSky.settled) return;
    clearHint('stars');
    tip.hidden = true;
    if (!starCard.hidden) { starCard.hidden = true; starOpen = null; bookSky.select(null); if (window.stopSample) window.stopSample(); }
    const first = !zoom.region;
    zoom.region = r;
    zoom.want = 1;
    zoom.fov = bookSky.aim(r, BASE_FOV).fov;
    if (first) zoom.cur = zoom.fov;
    bookSky.setFocus(r);
    aimAt(r.dir, first ? 1100 : 700);
    zoom.openFirst = r; // its newest book's card, once you're looking at it (frame loop)
    // a history entry, so Back leans out again (and a link can't land you here)
    enterLevel('sky', () => zoomOut({ fromHistory: true }));
    skyList.replaceChildren(...r.books.map((b) => Object.assign(document.createElement('button'), { type: 'button', textContent: `${b.book.title}${b.book.by ? `, by ${b.book.by}` : ''}`, onclick: () => openStar(b) })));
    skyList.hidden = false;
    $('sky-name').textContent = r.name;
    $('sky-count').textContent = `${r.count} ${r.count === 1 ? 'book' : 'books'}`;
    skyShelf.style.setProperty('--hue', r.hue);
    skyShelf.hidden = false;
    showHint(`${coarse ? 'Tap' : 'Click'} any title or star to see that book.`, 'star-pick');
  }
  function zoomOut({ fromHistory } = {}) {
    if (!zoom.region) return;
    closeStar();
    zoom.region = null;
    zoom.want = 0;
    bookSky.setFocus(null);
    skyShelf.hidden = true;
    skyList.hidden = true;
    if (hint.dataset.key === 'star-pick') hint.hidden = true;
    if (!fromHistory) leaveLevel('sky');
  }
  function stepShelf(d) {
    const rs = bookSky.regions;
    if (zoom.region && rs.length) zoomTo(rs[(rs.indexOf(zoom.region) + d + rs.length) % rs.length]);
  }
  $('sky-prev').addEventListener('click', () => stepShelf(-1));
  $('sky-next').addEventListener('click', () => stepShelf(1));
  $('sky-close').addEventListener('click', () => zoomOut());
  // the reading list's shelves: in the hammock, lean in on that shelf instead of leaving for /bookshelf
  panelBody.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-shelf]');
    const r = a && state === 'hammock' && lying && !leaving && regionOf(a.dataset.shelf);
    if (!r) return;
    e.preventDefault();
    closePanel();
    // once the list's gone and the stars have gathered (the first time, they drift in as you watch)
    const go = () => { if (state !== 'hammock' || leaving) return; if (panel.hidden && location.hash !== '#shelf' && bookSky.settled) zoomTo(r); else requestAnimationFrame(go); };
    go();
  });

  // Leaned in, each visible book's title sits beside its star: as many as fit without touching
  // each other or the buttons (the open book's first, then newest first), laid out again only
  // when the view changes.
  const labelEls = [];
  let labelsKey = '';
  // a title on screen is its book's tap target (with its star), padded to 44 px tall; the
  // nearest one wins where padding overlaps
  const labelHits = [];
  function labelAt(x, y) {
    if (!zoom.region || zoom.k < 1) return null;
    let best = null, bestD = Infinity;
    for (const h of labelHits) {
      if (x < h.left || x > h.right || y < h.top || y > h.bottom) continue;
      const d = Math.abs(y - (h.top + h.bottom) / 2);
      if (d < bestD) { best = h.b; bestD = d; }
    }
    return best;
  }
  function layoutLabels() {
    const r = zoom.region, e = zoom.k * zoom.k * (3 - 2 * zoom.k);
    skyLabels.style.opacity = r ? Math.max(0, (e - 0.5) * 2) : 0;
    if (!r || zoom.k < 0.5) { if (labelsKey) { for (const el of labelEls) el.hidden = true; labelsKey = ''; labelHits.length = 0; } return; }
    camera.updateMatrixWorld(true);
    const key = `${camera.quaternion.toArray().map((v) => v.toFixed(4))}${camera.fov.toFixed(2)}|${starOpen ? starOpen.index : ''}|${innerWidth}x${innerHeight}|${starCard.hidden}`;
    if (key === labelsKey) return;
    labelsKey = key;
    const rect = canvas.getBoundingClientRect();
    const avoid = ['topbar', 'sky-shelf', 'star-card', 'hammock-leave', 'hammock-read', 'hint'].map((id) => $(id)).filter((el) => el && !el.hidden).map((el) => el.getBoundingClientRect()).filter((b) => b.width);
    const hit = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const order = starOpen && starOpen.region === r ? [starOpen, ...r.books.filter((b) => b !== starOpen)] : r.books;
    const boxes = [];
    labelHits.length = 0;
    let n = 0;
    for (const b of order) {
      if (n >= 70) break;
      const p = bookSky.screenOf(b, camera, rect);
      if (!p.visible) continue;
      const w = Math.min(118, Math.ceil(b.book.title.length * 6.3) + 6), h = 16;
      let box = { left: p.x + 9, right: p.x + 9 + w, top: p.y - h / 2, bottom: p.y + h / 2 };
      if (box.right > rect.right - 6) box = { ...box, left: p.x - 9 - w, right: p.x - 9 };
      if (boxes.some((o) => hit(o, box)) || avoid.some((o) => hit(o, box))) continue;
      boxes.push(box);
      labelHits.push({ b, left: Math.min(box.left, p.x - 12), right: Math.max(box.right, p.x + 12), top: p.y - 22, bottom: p.y + 22 });
      const el = labelEls[n] || skyLabels.appendChild(Object.assign(document.createElement('span'), { className: 'sky-label' }));
      labelEls[n] = el;
      el.textContent = b.book.title;
      el.hidden = false;
      el.style.width = `${w}px`;
      el.style.transform = `translate(${box.left - rect.left}px, ${box.top - rect.top}px)`;
      el.classList.toggle('is-open', b === starOpen);
      n++;
    }
    for (let i = n; i < labelEls.length; i++) labelEls[i].hidden = true;
  }

  /* ---------- The telescope: look through it ---------- */
  // Walk up and bend to the eyepiece: the telescope swings round to its first sight (with its
  // gears' ratchet) as you step up behind it, looking down at the eyepiece; you bend to it and the
  // view goes dark as your eye meets it (by how close it is), then opens in the eyepiece's round
  // field, already on what it's pointed at. Stepping back does it the other way. What it can see
  // from here: the moon, the real one this hour (eyepiece.js: NASA's picture over the drawn one,
  // with rings where people landed; tap one to look closer), the real sun today through a solar
  // filter, and Earth. ‹ › swings it from one to the next. A card says what you're
  // looking at, and "Next launch and the ISS" opens the launch panel: the text backs up the view,
  // it isn't the way in. "Step back" or Esc stands you up again (Esc leaves a landing site first).
  const scopeSpot = interactables.find((i) => i.id === 'launch');
  const scopeCard = $('scope-card'), scopeLeaveBtn = $('scope-leave'), eyepiece = $('eyepiece'), eyeDark = $('eyepiece-dark'), scopeMore = $('scope-more');
  const scopePrev = $('scope-prev'), scopeNext = $('scope-next'), scopeMag = $('eyepiece-mag');
  const scope = { eye: null, targets: [], i: 0, k: 0, want: 0, fov: BASE_FOV, cur: BASE_FOV, quat: new THREE.Quaternion(), leaving: false, site: -1, aim: null, marks: null, mag: '', nudge: { yaw: 0, pitch: 0 }, cardKey: '', cup: null, lean: null, dark: 0, open: false };
  const SITES = data.moon || [];
  const liveLayer = $('eyepiece-live');
  const live = createEyepiece({ layer: liveLayer, db: DB, sites: SITES, sunDir: sky.sunDir, onSite: (i) => openSite(i) });
  const PHASES = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
  function scopeTargets(eye) {
    const up = eye.clone().normalize();
    const above = (b) => b && b.dir.dot(up) > Math.sin(THREE.MathUtils.degToRad(10)); // clear of the ground and the palms
    const { moon, sun, earth } = sky.bodies;
    const list = [];
    if (above(moon)) list.push({ id: 'moon', body: moon, fill: 0.55, name: 'The moon' });
    if (above(sun)) list.push({ id: 'sun', body: sun, fill: 0.62, name: 'The sun' });
    if (above(earth)) list.push({ id: 'earth', body: earth, fill: 0.9, name: 'Earth', line: `Right now.${above(moon) ? '' : ' The moon is below the horizon from here tonight.'}` });
    return list;
  }
  // what the card says about it: the moon and sun as they really are, once their pictures are in
  // what the card says about it: short; the moon and sun as they really are, once their pictures are in
  const dayMonth = (t) => new Date(`${t}Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  function scopeLine(t) {
    if (t.id === 'moon') {
      const m = live.moon, est = window.moonTonight ? window.moonTonight() : null;
      if (m) return `${PHASES[Math.round(m.age / 29.53 * 8) % 8]} · ${Math.round(m.phase)}% lit`;
      return est ? `${est.name} · ${Math.round(est.lit * 100)}% lit` : '';
    }
    if (t.id === 'sun') return 'Through a solar filter. The dark spots are sunspots.';
    return t.line;
  }
  // is what you're looking at live? (the tag), and if it should be but isn't, a line saying so
  function scopeLive(t) {
    if (t.id === 'moon') return live.status === 'live' ? (live.picture === 'failed' ? 'off' : 'on') : live.status === 'failed' ? 'off' : live.status === 'loading' ? 'loading' : 'none';
    if (t.id === 'sun') return live.picture === 'shown' ? 'on' : live.picture === 'failed' ? 'off' : 'loading';
    return 'none';
  }
  // how narrow a view makes it fill `fill` of the eyepiece's round field
  function scopeFov(t) {
    const H = root.clientHeight, W = root.clientWidth, r = Math.min(0.4 * Math.min(W, H), 0.44 * W);
    return Math.min(BASE_FOV, THREE.MathUtils.radToDeg(2 * Math.atan(t.body.across * H / (4 * t.fill * r))));
  }
  function showScopeCard() {
    const t = scope.targets[scope.i], s = SITES[scope.site], liveNow = scopeLive(t);
    const daylight = s ? live.daylight(scope.site) : null;
    $('scope-kicker').textContent = s ? `On the moon · ${s.when}` : 'Through the telescope';
    $('scope-live').hidden = liveNow !== 'on';
    $('scope-name').textContent = s ? s.name : t.name;
    $('scope-line').textContent = s ? s.line : scopeLine(t);
    const note = s ? (daylight ? `It's night there now. This is it at full moon, ${dayMonth(daylight)}.` : '')
      : liveNow === 'loading' ? 'Finding it live…' : liveNow === 'off' ? "Live view unavailable. Showing tonight's phase." : '';
    $('scope-note').textContent = note;
    scopeMore.hidden = !s; // on a landing site: back to the whole moon (the launch is at the console by the rocket)
    scopePrev.hidden = scopeNext.hidden = s ? SITES.length < 2 : scope.targets.length < 2;
    scope.cardKey = cardKey();
  }
  // the card is written again only when something on it would change
  const cardKey = () => `${scope.i}|${scope.site}|${live.status}|${live.picture}|${!!(scope.site >= 0 && live.daylight(scope.site))}`;
  function pointScope(i) {
    const t = scope.targets[i];
    if (!t) return;
    scope.i = i;
    scope.site = -1;
    scope.aim = null;
    scope.nudge.yaw = scope.nudge.pitch = 0;
    scope.fov = scopeFov(t);
    aimMount(t.body.dir);
    showScopeCard();
    if (t.id === 'moon') live.load()?.then(() => { if (state === 'scope' && scope.targets[scope.i] === t) showScopeCard(); });
  }
  // a landing site: the view narrows three times further, centred on it
  function openSite(i) {
    const t = scope.targets[scope.i];
    if (state !== 'scope' || !t || t.id !== 'moon' || scope.leaving) return;
    if (i === scope.site) return closeSite();
    const at = scope.marks && scope.marks[i];
    if (!at) return;
    // aim at where it is on screen now (from the whole moon, or from another site)
    const r = canvas.getBoundingClientRect();
    scope.aim = new THREE.Vector3((at.x / r.width) * 2 - 1, 1 - (at.y / r.height) * 2, 0.5).unproject(camera).sub(camera.position).normalize();
    scope.site = i;
    scope.nudge.yaw = scope.nudge.pitch = 0;
    sound.play('tick');
    buzz(8);
    enterLevel('site', () => closeSite({ fromHistory: true }));
    scope.fov = scopeFov(t) / 3;
    showScopeCard();
  }
  function closeSite({ fromHistory = false } = {}) {
    if (scope.site < 0) return;
    if (!fromHistory) leaveLevel('site');
    scope.site = -1;
    scope.aim = null;
    scope.nudge.yaw = scope.nudge.pitch = 0;
    scope.fov = scopeFov(scope.targets[scope.i]);
    showScopeCard();
  }
  // where it points, nudged by a drag (a few degrees of the field, like moving a telescope by hand)
  const scopeLook = (t) => poseLooking(scope.eye, scope.eye.clone().add(scope.aim || t.body.dir)).quat
    .multiply(_q.setFromAxisAngle(Y_AXIS, scope.nudge.yaw)).multiply(_q2.setFromAxisAngle(X_AXIS, scope.nudge.pitch));
  // the telescope itself swings round to look where you do, its gears ratcheting as it goes
  const mount = scopeSpot && scopeSpot.mount;
  const mountWant = { az: 0, alt: 0, on: false };
  function aimMount(dir) {
    if (!mount) return;
    const g = scopeSpot.object;
    g.updateMatrixWorld(true);
    const local = dir.clone().applyQuaternion(g.getWorldQuaternion(new THREE.Quaternion()).invert());
    let az = Math.atan2(local.x, local.z);
    az = mount.az.rotation.y + Math.atan2(Math.sin(az - mount.az.rotation.y), Math.cos(az - mount.az.rotation.y)); // the short way round
    const alt = -Math.asin(THREE.MathUtils.clamp(local.y, -1, 1));
    const turn = Math.max(Math.abs(az - mount.az.rotation.y), Math.abs(alt - mount.alt.rotation.x));
    Object.assign(mountWant, { az, alt, on: true });
    mount.held = true;
    if (turn > 0.05) { sound.play('ratchet', Math.min(1.6, turn / 1.2 + 0.2)); buzz([4, 50, 4, 50, 4, 70, 4]); }
  }
  function mountFrame(realDt) {
    if (!mount || !mountWant.on) return;
    const step = reducedMotion ? 9 : realDt * 1.2; // about 70°/s at most, as a hand would turn it
    const toward = (v, w) => v + THREE.MathUtils.clamp(w - v, -step, step);
    mount.az.rotation.y = toward(mount.az.rotation.y, mountWant.az);
    mount.alt.rotation.x = toward(mount.alt.rotation.x, mountWant.alt);
  }
  function lookThroughScope() {
    if (!scopeSpot || state !== 'walk') return;
    leaving = false;
    input.clear();
    player.stop();
    clearHint('walk');
    tip.hidden = true;
    scope.targets = scopeTargets(scopeSpot.approach.clone().addScaledVector(scopeSpot.approach.clone().normalize(), 1.4));
    if (!scope.targets.length) { openPanel('launch'); return; } // nothing up there from here: just the panel
    setState('scope');
    enterLevel('scope', () => leaveScope({ fromHistory: true }));
    scope.leaving = false;
    scope.open = false;
    pointScope(0); // and the telescope swings round to it as you step up
    // where the eyepiece will be once it has: you stand behind it looking down at it, then bend to it
    const cup = eyecupAt(), upv = cup.at.clone().normalize();
    const back = cup.tube.clone().addScaledVector(upv, -cup.tube.dot(upv)).normalize();
    const stand = surfacePoint(cup.at.clone().addScaledVector(back, -0.62).normalize()).addScaledVector(upv, player.eye);
    scope.cup = cup.at;
    scope.eye = cup.at.clone().addScaledVector(cup.tube, -0.03);
    scope.lean = poseLooking(cup.at.clone().addScaledVector(upv, 0.15).addScaledVector(back, -0.1), cup.at);
    scope.quat.copy(scopeLook(scope.targets[0]));
    scope.k = 0;
    flyPath([
      { ...poseLooking(stand, cup.at.clone().addScaledVector(cup.tube, 0.35)), ms: Math.min(900, Math.max(300, camera.position.distanceTo(stand) * 420)) }, // step up behind it: the eyepiece, the tube rising past it
      { ...scope.lean, ms: 850 }, // and bend to it
    ], () => {
      if (state !== 'scope' || scope.leaving) return; // stepped back before you got there: the frame loop stands you up
      scope.open = true; // eye to the glass: the field opens on what it's pointed at
      scope.k = scope.want = 1;
      scope.cur = scope.fov;
      scope.dark = reducedMotion ? 0 : 1;
      camera.near = 2; // looking out of the telescope, not at its insides
      scopeCard.hidden = false;
      scopeFrame(0); // this frame, not the next
    });
  }
  // The eyecup, where it will be once the telescope has swung round to what it's turning to:
  // { at, tube } (tube: the way the telescope points).
  function eyecupAt() {
    const g = scopeSpot.object, cup = g.userData.eyecup;
    const az = mount.az.rotation.y, alt = mount.alt.rotation.x;
    if (mountWant.on) { mount.az.rotation.y = mountWant.az; mount.alt.rotation.x = mountWant.alt; }
    g.updateMatrixWorld(true);
    const at = cup.getWorldPosition(new THREE.Vector3()), tube = new THREE.Vector3(0, 1, 0).transformDirection(cup.matrixWorld);
    mount.az.rotation.y = az; mount.alt.rotation.x = alt;
    g.updateMatrixWorld(true);
    return { at, tube };
  }
  // how dark it is while your eye is coming to (or leaving) the eyepiece: by how close it is
  function eyeNear() {
    if (!scope.cup) return 0;
    const d = camera.position.distanceTo(scope.cup);
    return THREE.MathUtils.clamp((0.42 - d) / 0.2, 0, 1);
  }
  function stepScope(d) {
    if (state !== 'scope' || scope.leaving) return;
    if (scope.site >= 0) { const n = SITES.length; return openSite((scope.site + d + n) % n); }
    const n = scope.targets.length;
    if (n > 1) pointScope((scope.i + d + n) % n);
  }
  function leaveScope({ fromHistory = false } = {}) {
    if (state !== 'scope' || scope.leaving) return;
    if (!fromHistory) leaveLevel('scope'); // (and a landing site you were looking at)
    scope.leaving = true;
    scope.want = 0; // the field widens back out first (frame loop), then you stand up
    scopeCard.hidden = true;
  }
  function standUpFromScope() {
    live.hide();
    if (mount) { mount.held = false; mountWant.on = false; } // and it goes back to slowly sweeping the sky
    player.spawn(scopeSpot.approach.clone().normalize(), scopeSpot.point, -0.1);
    const endPos = player.pos.clone().addScaledVector(player.pos.clone().normalize(), player.eye);
    const endQuat = player.quat.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), player.pitch));
    scope.open = false;
    camera.position.copy(scope.lean.pos); camera.quaternion.copy(scope.lean.quat); // your eye leaves the glass, the telescope in front of you
    flyPath([
      { ...poseLooking(scope.lean.pos.clone().addScaledVector(scope.lean.pos.clone().normalize(), 0.35), scope.cup), ms: 700 }, // straighten up
      { pos: endPos, quat: endQuat, ms: 700 },
    ], () => { scope.leaving = false; eyeDark.style.setProperty('--dark', '0'); earthPinsFrame(false); setState('walk'); player.applyToCamera(); canvas.focus({ preventScroll: true }); });
  }
  scopeLeaveBtn.addEventListener('click', () => leaveScope());
  onSwipe(scopeCard, stepScope);
  $('scope-close').addEventListener('click', () => { scopeCard.hidden = true; }); // the whole view; a tap brings it back
  scopePrev.addEventListener('click', () => stepScope(-1));
  scopeNext.addEventListener('click', () => stepScope(1));
  scopeMore.addEventListener('click', () => closeSite());
  // each frame at the eyepiece: swing to what it's pointed at, narrow (or widen) the field, and
  // lay the real moon or sun over the drawn one
  // Earth in the eyepiece: a few cities pinned where they are on it, each with the time there now;
  // a warm dot where it's day, a pale ring where it's night. The globe shows the rest.
  const CITIES = [['Philadelphia', 39.95, -75.17, 'America/New_York', true], ['Honolulu', 21.31, -157.86, 'Pacific/Honolulu'], ['London', 51.51, -0.13, 'Europe/London'],
    ['Tokyo', 35.68, 139.69, 'Asia/Tokyo'], ['Sydney', -33.87, 151.21, 'Australia/Sydney'], ['Cape Town', -33.92, 18.42, 'Africa/Johannesburg'], ['Rio', -22.91, -43.17, 'America/Sao_Paulo']];
  const earthPins = $('earth-pins');
  const pins = CITIES.map(([name, lat, lon, zone, home]) => {
    const el = document.createElement('div');
    el.className = `earth-pin${home ? ' is-home' : ''}`;
    el.innerHTML = '<i></i><span></span>';
    earthPins.append(el);
    return { el, label: el.lastChild, name, at: earthPoint(lat, lon), clock: new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: zone }), shown: '' };
  });
  const _ec = new THREE.Vector3(), _eq = new THREE.Quaternion(), _en = new THREE.Vector3(), _ep = new THREE.Vector3();
  function earthPinsFrame(on, k, rect) {
    earthPins.hidden = !on;
    if (!on) return;
    earthPins.style.opacity = k.toFixed(3);
    const E = sky.earth, R = E.userData.radius, now = new Date();
    E.getWorldPosition(_ec); E.getWorldQuaternion(_eq);
    const toEye = camera.position.clone().sub(_ec).normalize();
    for (const p of pins) {
      _en.copy(p.at).applyQuaternion(_eq);
      const facing = _en.dot(toEye);
      p.el.hidden = facing < 0.2; // on the side facing you, not right at the edge
      if (p.el.hidden) continue;
      _ep.copy(_ec).addScaledVector(_en, R).project(camera);
      p.el.style.transform = `translate(${((_ep.x + 1) / 2) * rect.width}px, ${((1 - _ep.y) / 2) * rect.height}px) translateY(-50%)`;
      p.el.classList.toggle('is-left', _ep.x > 0.15);
      const day = _en.dot(sky.sunDir) > 0;
      const text = `${p.name}|${p.clock.format(now)}|${day}`;
      if (text !== p.shown) {
        p.shown = text;
        p.el.classList.toggle('is-night', !day);
        p.label.innerHTML = `${p.name} <b>${p.clock.format(now).toLowerCase()}</b>`;
      }
    }
  }
  function scopeFrame(realDt) {
    if (!scope.open) { if (scope.leaving) standUpFromScope(); return; } // stepped back before your eye got there
    const t = scope.targets[scope.i];
    // at the glass: the dark lifts as the field opens, and comes down again as you step back
    const dark = scope.leaving ? 1 : 0;
    if (scope.dark !== dark) scope.dark = reducedMotion ? dark : THREE.MathUtils.clamp(scope.dark + Math.sign(dark - scope.dark) * realDt / 0.45, 0, 1);
    eyeDark.style.setProperty('--dark', scope.dark.toFixed(3));
    if (scope.leaving && scope.dark === 1) scope.k = 0;
    const ease = reducedMotion ? 1 : 1 - Math.exp(-realDt * 3);
    if (t) scope.quat.slerp(scopeLook(t), ease);
    scope.cur += (scope.fov - scope.cur) * (reducedMotion ? 1 : 1 - Math.exp(-realDt * 2.5));
    const e = scope.k * scope.k * (3 - 2 * scope.k);
    camera.position.copy(scope.eye);
    camera.quaternion.copy(scope.quat);
    camera.fov = BASE_FOV + (scope.cur - BASE_FOV) * e;
    camera.updateProjectionMatrix();
    eyepiece.style.setProperty('--k', e.toFixed(3));
    const rect = canvas.getBoundingClientRect();
    scope.marks = t ? live.update(camera, rect, { id: t.id, ...t.body }, scope.leaving ? 0 : e, scope.site) : null;
    // on a landing site, keep it centred (its picture can change under it: the full moon's, in daylight)
    const at = scope.site >= 0 && scope.marks && scope.marks[scope.site];
    if (at) scope.aim = new THREE.Vector3((at.x / rect.width) * 2 - 1, 1 - (at.y / rect.height) * 2, 0.5).unproject(camera).sub(camera.position).normalize();
    if (t && cardKey() !== scope.cardKey) showScopeCard();
    liveLayer.classList.toggle('is-sun', !!t && t.id === 'sun');
    earthPinsFrame(!!t && t.id === 'earth' && scope.site < 0, scope.leaving ? 0 : e * (1 - scope.dark), rect);
    // the eyepiece's power, engraved on its ring, in an eyepiece set's steps
    const power = BASE_FOV / camera.fov * 10, mag = `${[30, 60, 120, 240].reduce((a, b) => (Math.abs(Math.log(b / power)) < Math.abs(Math.log(a / power)) ? b : a))}×`;
    if (mag !== scope.mag) { scope.mag = mag; scopeMag.textContent = `STEVE'S · ${mag}`; }
    if (scope.leaving && scope.k === 0) { eyepiece.style.setProperty('--k', '0'); camera.fov = scope.cur = BASE_FOV; camera.near = NEAR; camera.updateProjectionMatrix(); standUpFromScope(); }
  }

  /* ---------- Skipping stones at the lagoon ---------- */
  // Walk down to the pile at the waterline and crouch there, facing across the water, a flat
  // stone in your hand. Press and hold (the canvas, Space, or "Hold to throw") to wind up, let
  // go to throw: how long you held it is how hard, where you're looking is where it goes. It
  // skips or it doesn't (stones.js), and you hear how it went. Your best is remembered.
  const stoneSpot = interactables.find((i) => i.id === 'stones');
  const skipper = createSkipper(scene);
  const shoreLeave = $('shore-leave'), shoreThrow = $('shore-throw');
  let shorePose = null, inHand = null, windUp = -1, reload = 0;
  const HAND = new THREE.Vector3(0.21, -0.2, -0.46);
  const bestSkips = { get() { try { return +localStorage.getItem('world-best-skips') || 0; } catch (e) { return 0; } }, set(n) { try { localStorage.setItem('world-best-skips', String(n)); } catch (e) {} } };
  function holdStone(v) {
    if (v && !inHand) { inHand = skipper.stone(); inHand.scale.setScalar(1.15); inHand.position.copy(HAND); inHand.rotation.set(0.3, 0.4, -0.2); camera.add(inHand); }
    else if (!v && inHand) { camera.remove(inHand); inHand = null; }
  }
  function goToShore() {
    if (!stoneSpot || state !== 'walk') return;
    leaving = false;
    seatLook.yaw = seatLook.pitch = 0;
    input.clear();
    player.stop();
    clearHint('walk');
    tip.hidden = true;
    setState('shore');
    const S = stoneSpot.shore;
    shorePose = poseLooking(S.eye, S.look);
    flyPath([
      { ...poseLooking(S.stand, S.look), ms: Math.min(900, Math.max(300, camera.position.distanceTo(S.stand) * 420)) },
      { ...shorePose, ms: 700 }, // crouch down at the water
    ], () => {
      if (state !== 'shore') return;
      holdStone(true);
      showHint(coarse ? 'Press and hold, then let go to skip a stone.' : 'Press and hold (or Space), then let go to skip a stone.', 'skip');
    });
  }
  function leaveShore() {
    if (state !== 'shore' || leaving) return;
    leaving = true;
    holdStone(false);
    windUp = -1;
    if (hint.dataset.key === 'skip') hint.hidden = true;
    bubble.hidden = true;
    const S = stoneSpot.shore;
    player.spawn(stoneSpot.approach.clone().normalize(), stoneSpot.point, -0.1);
    const endPos = player.pos.clone().addScaledVector(player.pos.clone().normalize(), player.eye);
    const endQuat = player.quat.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), player.pitch));
    flyPath([
      { ...poseLooking(S.stand, S.look), ms: 600 },
      { pos: endPos, quat: endQuat, ms: 700 },
    ], () => { leaving = false; shorePose = null; setState('walk'); player.applyToCamera(); canvas.focus({ preventScroll: true }); });
  }
  function startWind() { if (state === 'shore' && !flight && !leaving && inHand && windUp < 0) windUp = 0; }
  function releaseThrow() {
    if (windUp < 0 || !inHand) { windUp = -1; return; }
    const power = Math.min(1, windUp / 1.1);
    windUp = -1;
    // sidearm and low: from beside you, just above the water, level to a touch upward
    const up = camera.position.clone().normalize();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    fwd.addScaledVector(up, -fwd.dot(up)).normalize();
    const right = fwd.clone().cross(up);
    // released a hand's height over the water, beside you and a little ahead, level and a touch down
    const from = camera.position.clone().addScaledVector(right, 0.12).addScaledVector(fwd, 0.75); // you reach out over the water's edge
    from.setLength(skipper.water + 0.3);
    const vel = fwd.multiplyScalar(3 + 5.5 * power).addScaledVector(up, -0.3 + (Math.random() - 0.5) * 0.3);
    holdStone(false);
    reload = 0.7;
    sound.play('whoosh');
    skipper.throw(from, vel, (what, at, info) => {
      if (what === 'skip') { sound.play('skip', info.n); return; }
      sound.play(what === 'plop' ? 'plop' : 'clack');
      window.__lastThrow = { what, power, ...info }; // for tests
      if (state !== 'shore') return;
      const n = info.skips, best = bestSkips.get();
      if (n > 0) clearHint('skip');
      let line = n === 0 ? 'Plop. Throw it flatter and harder.' : n === 1 ? 'One skip.' : `${n} skips.`;
      if (what === 'shore' && !info.across && !n) line = 'Into the sand. Aim across the water.';
      if (what === 'shore' && info.across) line = n ? `${n} skips, all the way across!` : 'All the way across, without touching the water.';
      if (n > best) { bestSkips.set(n); if (best) line += ` A new best (it was ${best}).`; }
      else if (best && n) line += ` Your best is ${best}.`;
      say(line, 3600);
    }, camera.position);
  }
  shoreLeave.addEventListener('click', leaveShore);
  shoreThrow.addEventListener('pointerdown', (e) => { e.preventDefault(); startWind(); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) shoreThrow.addEventListener(ev, () => { if (windUp >= 0) releaseThrow(); });

  /* ---------- A message in a bottle ---------- */
  // Crouch behind the bottles washed up at the waterline and write one (note.js does the hands):
  // pick it up, uncork it, slide the letter out and it unrolls into the paper you write on (the
  // #note form sits exactly over it). "Roll it up" puts your words on the paper, rolls it back
  // in and corks it; it's sent to public.bottles (unapproved until Steve reads it) while that
  // happens. Then "Throw it" and it drifts off into space. Esc while writing puts the letter
  // back; Esc otherwise (or "Leave the shore") stands you up.
  const bottleSpot = interactables.find((i) => i.id === 'bottles');
  const ritual = createNoteRitual({ camera, scene, reducedMotion, sound: { play: (...a) => sound.play(...a) } });
  const noteForm = $('note'), noteText = $('note-text'), noteSign = $('note-sign'), noteLeft = $('note-left');
  const noteLeave = $('note-leave'), noteGo = $('note-go');
  let notePose = null, noteStep = null; // null (crouched, nothing in hand) | opening | writing | closing | ready | thrown
  const uprightBottle = bottleSpot && bottleSpot.note.upright;
  function goToBottles() {
    if (!bottleSpot || state !== 'walk') return;
    if (document.fonts) document.fonts.load('500 24px Caveat'); // the letter's hand, ready by the time it's unrolled
    leaving = false;
    seatLook.yaw = seatLook.pitch = 0;
    input.clear();
    player.stop();
    clearHint('walk');
    tip.hidden = true;
    setState('note');
    noteStep = null;
    const S = bottleSpot.note;
    notePose = poseLooking(S.eye, S.look);
    flyPath([
      { ...poseLooking(S.stand, S.look), ms: Math.min(900, Math.max(300, camera.position.distanceTo(S.stand) * 420)) },
      { ...notePose, ms: 700 }, // crouch down behind the bottles
    ], () => { if (state === 'note') openBottle(); });
  }
  function openBottle() {
    if (state !== 'note' || ritual.busy) return;
    noteStep = 'opening';
    seatLook.yaw = seatLook.pitch = 0;
    if (uprightBottle) uprightBottle.visible = false; // that's the one you picked up
    ritual.open(() => {
      if (state !== 'note') return;
      noteStep = 'writing';
      noteText.value = noteSign.value = '';
      countLeft();
      placeNote();
      noteForm.hidden = false;
      noteText.focus({ preventScroll: true });
    });
  }
  function placeNote() {
    const r = ritual.rect();
    if (!r) return;
    const w = root.clientWidth, h = root.clientHeight, ht = (r.bottom - r.top) * h;
    Object.assign(noteForm.style, { left: `${r.left * w}px`, top: `${r.top * h}px`, width: `${(r.right - r.left) * w}px`, height: `${ht}px` });
    noteForm.style.setProperty('--gap', `${ht * 0.085}px`); // the letter's ruled lines (note.js paintPaper)
  }
  const countLeft = () => { noteLeft.textContent = `${280 - noteText.value.length} left`; };
  noteText.addEventListener('input', countLeft);
  noteText.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); noteForm.requestSubmit(); } });
  // Sent to the shared table. Tests (?test, automated browsers) don't write to it.
  async function sendBottle(message, signed) {
    if (TEST || navigator.webdriver) { window.__lastBottle = { message, signed }; return { ok: true }; }
    try {
      const res = await fetch(`${DB.url}/rest/v1/bottles`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: DB.key, authorization: `Bearer ${DB.key}`, prefer: 'return=minimal' },
        body: JSON.stringify({ message, signed: signed || null }),
      });
      if (res.ok) return { ok: true };
      const body = await res.json().catch(() => ({}));
      return { ok: false, full: /full of bottles/.test(body.message || '') };
    } catch (e) { return { ok: false }; }
  }
  noteForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = noteText.value.trim().slice(0, 280), signed = noteSign.value.trim().slice(0, 40);
    if (!text) { noteText.focus(); return; }
    noteForm.hidden = true;
    noteStep = 'closing';
    const sent = sendBottle(text, signed);
    ritual.close(text, signed, async () => {
      const r = await sent;
      if (state !== 'note') return;
      if (r.ok) { noteStep = 'ready'; showHint('Now throw it. It will drift off into space.', 'bottle'); return; }
      say(r.full ? 'The sky is full of bottles right now. Try again another day.' : "It wouldn't send just now. Try again in a moment.", 5000);
      putNoteBack();
    });
  });
  function putNoteBack() {
    noteForm.hidden = true;
    ritual.putBack();
    if (uprightBottle) uprightBottle.visible = true;
    noteStep = null;
  }
  function throwBottle() {
    if (noteStep !== 'ready') return;
    ritual.throwIt();
    clearHint('bottle');
    noteStep = 'thrown';
    say("It's drifting off among the stars. If Steve likes it, it will wash up here for others to find.", 6500);
    setTimeout(() => { if (uprightBottle && noteStep !== 'opening' && noteStep !== 'writing' && noteStep !== 'closing' && noteStep !== 'ready') uprightBottle.visible = true; }, 2500);
  }
  function leaveBottles() {
    if (state !== 'note' || leaving) return;
    leaving = true;
    if (noteStep && noteStep !== 'thrown') putNoteBack();
    noteStep = null;
    bubble.hidden = true;
    if (hint.dataset.key === 'bottle') hint.hidden = true;
    const S = bottleSpot.note;
    player.spawn(bottleSpot.approach.clone().normalize(), bottleSpot.point, -0.1);
    const endPos = player.pos.clone().addScaledVector(player.pos.clone().normalize(), player.eye);
    const endQuat = player.quat.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), player.pitch));
    flyPath([
      { ...poseLooking(S.stand, S.look), ms: 600 },
      { pos: endPos, quat: endQuat, ms: 700 },
    ], () => { leaving = false; notePose = null; setState('walk'); player.applyToCamera(); canvas.focus({ preventScroll: true }); });
  }
  $('note-cancel').addEventListener('click', putNoteBack);
  noteLeave.addEventListener('click', leaveBottles);
  noteGo.addEventListener('click', () => { if (noteStep === 'ready') throwBottle(); else if (!noteStep || noteStep === 'thrown') openBottle(); });
  addEventListener('keydown', (e) => {
    if (state !== 'note' || e.target.closest('button, a, input, textarea') || !panel.hidden || !menu.hidden) return;
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') { e.preventDefault(); noteGo.click(); }
  });

  /* ---------- Loose things: pick them up, throw them (physics.js) ---------- */
  // Click a coconut or a glass float and you walk over and pick it up; it's in your hand while you
  // walk about. Press and hold "Hold to throw" (or Space), let go: held longer is harder (full at
  // 1 s), and it goes where you look. "Put it down" (or Esc) sets it at your feet; doing anything
  // else (sitting down, the fire...) puts it down first. Walking into one knocks it along.
  const CARRY = new THREE.Vector3(0.3, -0.3, -0.85); // at arm's length, low on the right
  const carryDrop = $('carry-drop'), carryThrow = $('carry-throw');
  let carry = null, carryWind = -1;
  // Pick up a coconut a second time and a neon hoop flickers into being (hoop.js) straight in
  // front of you. If that spot would sit on or against something (a landmark, the bar, the lagoon,
  // anything lying about, or the middle of a path), it takes the clear spot nearest straight ahead that's still in
  // view; if nothing in view is clear, it waits and keeps looking while you carry the coconut, and
  // appears as soon as you face open ground. Get one through it and it goes; two more and it's back.
  const hoop = createHoop({ scene, physics, colliders: player.colliders, sound: { play: (...a) => sound.play(...a) }, reducedMotion });
  let coconuts = 0, hoopWanted = false, hoopLook = 0;
  function hoopSpot() {
    const up = player.up, fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(player.quat); // the way you face (level)
    fwd.addScaledVector(up, -fwd.dot(up)).normalize();
    const fits = (dir) => {
      // beside a path is fine (the pole stays off the walkway); never on a landmark, the bar or the lagoon
      if (pondK(dir) < 1.3 || trailEdge(dir) < 0.6 || nearLandmark(dir, 1.2) || dir.angleTo(BAR_DIR) * RADIUS < 7.5) return false;
      const at = dir.clone().multiplyScalar(surfaceRadius(dir));
      if (player.colliders.some((c) => c.center.distanceTo(at) < c.radius + 1.6)) return false;
      if (physics.items.some((x) => !x.held && x.object.position.distanceTo(at) < 1.4)) return false;
      return !interactables.some((x) => x.approach && x.approach.distanceTo(at) < 2.2);
    };
    // straight ahead first, then turning out either side, no further than the edge of the view
    // (less a margin, so the whole hoop is in it: a phone held upright sees a narrow slice)
    const half = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect) - 0.12;
    for (let turn = 0; turn <= half; turn += 0.08) {
      for (const side of turn ? [1, -1] : [1]) {
        const d = fwd.clone().applyAxisAngle(up, turn * side);
        for (const dist of [5, 4.5, 6, 7]) {
          const dir = player.pos.clone().addScaledVector(d, dist).normalize();
          if (fits(dir)) return dir.multiplyScalar(surfaceRadius(dir));
        }
      }
    }
    return null;
  }
  function bringHoop() {
    const at = hoopSpot();
    if (!at) return false;
    hoopWanted = false; coconuts = 0;
    hoop.drop(at, player.pos);
    return true;
  }
  function grab(it) {
    used.add(it.label);
    if (it.label === 'Coconut' && hoop.state === 'off' && !hoopWanted && ++coconuts >= 2) hoopWanted = !bringHoop();
    if (carry) putDown();
    if (!physics.take(it)) return;
    carry = it;
    camera.add(it.object);
    it.object.position.copy(CARRY);
    it.object.quaternion.identity();
    showHint(coarse ? 'Press and hold "Hold to throw", then let go.' : 'Hold Space (or "Hold to throw"), then let go to throw it.', 'throw');
  }
  function goGrab(it) {
    clearHint('walk');
    const at = it.object.position;
    if (player.pos.distanceTo(at) < 1.6) return grab(it);
    player.walkTo(at, { via: routeTo(at), arrive: 0.85, onArrive: () => { if (!it.held && state === 'walk' && player.pos.distanceTo(it.object.position) < 1.8) grab(it); } });
    showDest(at);
  }
  function putDown() {
    if (!carry) return;
    const it = carry;
    carry = null; carryWind = -1;
    const up = player.pos.clone().normalize();
    const fwd = player.forward(new THREE.Vector3());
    fwd.addScaledVector(up, -fwd.dot(up)).normalize();
    physics.release(it, player.pos.clone().addScaledVector(fwd, 0.6).addScaledVector(up, it.radius + 0.15));
  }
  function windCarry() { if (carry && carryWind < 0) carryWind = 0; }
  function throwCarried() {
    if (!carry || carryWind < 0) { carryWind = -1; return; }
    const power = Math.min(1, carryWind / 1);
    const it = carry;
    carry = null; carryWind = -1;
    const up = camera.position.clone().normalize();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const from = camera.localToWorld(CARRY.clone().setY(-0.1));
    const vel = fwd.multiplyScalar(2.5 + 7.5 * power).addScaledVector(up, 1 + 1.5 * power);
    const spin = new THREE.Vector3().randomDirection().multiplyScalar(4 + 6 * power);
    physics.release(it, from, vel, spin);
    sound.play('toss');
    clearHint('throw');
    window.__lastToss = { power, label: it.label }; // for tests
  }
  carryDrop.addEventListener('click', putDown);
  carryThrow.addEventListener('pointerdown', (e) => { e.preventDefault(); windCarry(); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) carryThrow.addEventListener(ev, () => { if (carryWind >= 0) throwCarried(); });

  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
  const Y_AXIS = new THREE.Vector3(0, 1, 0), X_AXIS = new THREE.Vector3(1, 0, 0);
  const seatKeys = { x: 0, y: 0 };
  const seatArrow = (e, down) => {
    if (e.target.closest && e.target.closest('input, textarea')) return; // typing, not looking
    // where there's a ‹ ›, ← → are it: the board's drinks, a shelf's books (or the shelves), the telescope's sights
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && panel.hidden && menu.hidden) {
      const d = e.key === 'ArrowLeft' ? -1 : 1;
      const step = state === 'seat' && board.on ? () => stepRecipe(d)
        : state === 'hammock' && zoom.region ? () => (starOpen ? stepBook(d) : stepShelf(d))
          : state === 'scope' ? () => stepScope(d) : null;
      if (step) { if (down) { e.preventDefault(); step(); } return; }
    }
    if ((state !== 'seat' && state !== 'camp' && state !== 'hammock' && state !== 'shore' && state !== 'note') || !panel.hidden || !menu.hidden) { seatKeys.x = seatKeys.y = 0; return; }
    const v = down ? 1 : 0;
    if (e.key === 'ArrowLeft') seatKeys.x = -v;
    else if (e.key === 'ArrowRight') seatKeys.x = v;
    else if (e.key === 'ArrowUp') seatKeys.y = v;
    else if (e.key === 'ArrowDown') seatKeys.y = -v;
    else return;
    if (down) e.preventDefault();
  };
  addEventListener('keydown', (e) => seatArrow(e, true));
  addEventListener('keyup', (e) => seatArrow(e, false));
  let beckoned = false;
  let firstFrames = null, framesDrawn = 0; // the reveal waits for these
  // the bar and the landmarks: still meshes that look alike drawn as one, patch by patch
  const batcher = createBatcher();
  batcher.add(bar.group, places.group);
  for (const o of [bar.board && bar.board.group, bar.menu.card].filter(Boolean)) o.userData.noBatch = true; // they change as you use them

  function frame(now) {
    timer.update(now);
    // ?test: bigger steps so walks finish under slow software rendering; ambient time frozen
    const delta = timer.getDelta();
    const dt = Math.min(delta, TEST ? 0.25 : 0.05);
    const realDt = Math.min(delta, 0.1); // for things the guest does (the marshmallow), even under ?test
    if (!TEST) t += dt;

    if (state === 'walk') {
      // the bartender waves you over once as you walk up (again if you wander off and come back)
      const toBar = player.pos.distanceTo(barSpot.approach);
      if (!beckoned && toBar < 9 && toBar > 2.5) { beckoned = true; bar.beckon(player.pos); }
      else if (toBar > 13) beckoned = false;
      player.enabled = panel.hidden && menu.hidden;
      player.update(dt);
      if (!flight) player.applyToCamera(t, !reducedMotion);
      // the walk hint retires once they've actually moved a few metres
      if (!movedFrom) movedFrom = player.pos.clone();
      else if (!hint.hidden && hint.dataset.key === 'walk' && player.pos.distanceTo(movedFrom) > 3) clearHint('walk');
    }
    if (HM) {
      HM.update(realDt, reducedMotion);
      if (HM.load !== loadTo) HM.setLoad(reducedMotion ? loadTo : THREE.MathUtils.clamp(HM.load + Math.sign(loadTo - HM.load) * realDt * 2.2, 0, 1));
      if (bookTween) bookStep(performance.now());
    }
    skipper.update(realDt);
    ritual.update(realDt);
    // lying back with the sky to look at (from when the reading list first closes), the loose
    // stars drift into their shelves; getting up, they drift apart
    glints.update(realDt, camera, glintThings(), used.size);
    bookSky.update(t, camera, realDt, skyGather && state === 'hammock' && !!lying && !flight && !leaving);
    // "Aligning…" while the stars gather, then what to do with them
    if (!hint.hidden && !hint.dataset.key && hint.textContent === 'Aligning…' && (bookSky.settled || state !== 'hammock' || leaving)) {
      hint.hidden = true;
      if (bookSky.settled && state === 'hammock' && !leaving) starsHint();
    }
    // leaning in on a shelf of the book sky (or back out, wherever you are by then)
    if (zoom.k !== zoom.want) zoom.k = reducedMotion ? zoom.want : THREE.MathUtils.clamp(zoom.k + Math.sign(zoom.want - zoom.k) * realDt / 1.1, 0, 1);
    if (zoom.k > 0 || zoom.applied) {
      zoom.cur = reducedMotion ? zoom.fov : zoom.cur + (zoom.fov - zoom.cur) * (1 - Math.exp(-realDt * 5));
      const e = zoom.k * zoom.k * (3 - 2 * zoom.k);
      camera.fov = BASE_FOV + (zoom.cur - BASE_FOV) * e;
      camera.updateProjectionMatrix();
      zoom.applied = zoom.k > 0;
    }
    if (zoom.openFirst && (zoom.region !== zoom.openFirst || state !== 'hammock')) zoom.openFirst = null;
    else if (zoom.openFirst && zoom.k === 1 && !aimTween && Math.abs(zoom.cur - zoom.fov) < 0.5) { const r = zoom.openFirst; zoom.openFirst = null; openStar(r.books[0], { auto: true }); }
    physics.update(realDt, player.pos);
    hoop.update(realDt, t);
    // the hoop's waiting for clear ground in view: look again a few times a second while you carry
    if (hoopWanted && carry && state === 'walk' && (hoopLook -= realDt) <= 0) { hoopLook = 0.3; bringHoop(); }
    if (carry) {
      if (state !== 'walk') putDown(); // off to do something else: it goes down at your feet first
      else { // drawn back as you wind up
        if (carryWind >= 0) carryWind += realDt;
        const k = carryWind >= 0 ? Math.min(1, carryWind) : 0;
        carry.object.position.set(CARRY.x + 0.08 * k, CARRY.y - 0.03 * k, CARRY.z + 0.15 * k);
      }
    }
    if (fireflies) { fireflies.setSelf(camera.position); fireflies.update(clock += realDt, realDt, reducedMotion); }
    if (state === 'shore') {
      if (windUp >= 0) windUp += realDt;
      if (!inHand && !flight && !leaving && (reload -= realDt) <= 0) holdStone(true);
      if (inHand) { // drawn back as you wind up
        const k = windUp >= 0 ? Math.min(1, windUp / 1.1) : 0;
        inHand.position.set(HAND.x + 0.1 * k, HAND.y - 0.02 * k, HAND.z + 0.12 * k);
      }
    }
    if (state === 'scope') mountFrame(realDt); // the telescope swings round even as you step up to it
    if (flight) { flightStep(performance.now()); if (state === 'scope') eyeDark.style.setProperty('--dark', eyeNear().toFixed(3)); }
    else if (state === 'scope' && scope.eye) scopeFrame(realDt);
    else if ((state === 'shore' && shorePose) || (state === 'note' && notePose)) {
      const pose = state === 'shore' ? shorePose : notePose;
      camera.position.copy(pose.pos);
      camera.quaternion.copy(pose.quat)
        .multiply(_q.setFromAxisAngle(Y_AXIS, seatLook.yaw))
        .multiply(_q2.setFromAxisAngle(X_AXIS, seatLook.pitch));
      if (seatKeys.x || seatKeys.y) look(seatKeys.x * dt * 1.6, -seatKeys.y * dt * 1.2);
    } else if (state === 'hammock' && lying) {
      // lying in it: you swing with it (leaned in on the book sky, the swing stills under you)
      HM.swing.updateWorldMatrix(true, false);
      const p = poseLooking(HM.swing.localToWorld(lying.eye.clone()), HM.swing.localToWorld(lying.look.clone()));
      if (zoom.k > 0) {
        const still = poseLooking(HM.group.localToWorld(lying.eye.clone()), HM.group.localToWorld(lying.look.clone()));
        const e = zoom.k * zoom.k * (3 - 2 * zoom.k);
        p.pos.lerp(still.pos, e);
        p.quat.slerp(still.quat, e);
      }
      if (aimTween) stepAim(p.quat, realDt);
      camera.position.copy(p.pos);
      camera.quaternion.copy(p.quat)
        .multiply(_q.setFromAxisAngle(Y_AXIS, seatLook.yaw))
        .multiply(_q2.setFromAxisAngle(X_AXIS, seatLook.pitch));
      if (seatKeys.x || seatKeys.y) look(seatKeys.x * dt * 1.6, -seatKeys.y * dt * 1.2);
    } else if (state === 'camp' && campPose) {
      camera.position.copy(campPose.pos);
      camera.quaternion.copy(campPose.quat)
        .multiply(_q.setFromAxisAngle(Y_AXIS, seatLook.yaw))
        .multiply(_q2.setFromAxisAngle(X_AXIS, seatLook.pitch));
      if (seatKeys.x || seatKeys.y) look(seatKeys.x * dt * 1.6, -seatKeys.y * dt * 1.2);
    } else if (state === 'seat' && seatPose) {
      camera.position.copy(seatPose.pos);
      camera.quaternion.copy(seatPose.quat)
        .multiply(_q.setFromAxisAngle(Y_AXIS, seatLook.yaw))
        .multiply(_q2.setFromAxisAngle(X_AXIS, seatLook.pitch));
      // leaning in to watch a drink being made
      if (!making && view.hold > 0 && (view.hold -= realDt) <= 0) view.want = 0;
      const moving = view.k !== view.want || Math.abs(view.fovNow - view.fov) > 0.01;
      if (view.k !== view.want) view.k = reducedMotion ? view.want : THREE.MathUtils.clamp(view.k + Math.sign(view.want - view.k) * realDt / 1.1, 0, 1);
      if (moving) {
        const ease = reducedMotion ? 1 : 1 - Math.exp(-realDt * 3);
        view.fovNow += (view.fov - view.fovNow) * ease;
        const e = view.k * view.k * (3 - 2 * view.k);
        camera.fov = BASE_FOV + (view.fovNow - BASE_FOV) * e;
        camera.updateProjectionMatrix();
      }
      if (view.k > 0) {
        if (view.job) view.aim.copy(view.job.focus());
        if (reducedMotion) { view.look.copy(view.aim); view.eyeNow.copy(view.eye); } else { const ease = 1 - Math.exp(-realDt * 3); view.look.lerp(view.aim, ease); view.eyeNow.lerp(view.eye, ease); }
        const e = view.k * view.k * (3 - 2 * view.k);
        camera.position.lerpVectors(seatPose.pos, view.eyeNow, e);
        camera.quaternion.slerp(poseLooking(camera.position, view.look).quat, e);
      }
      // arrow keys look around too
      if (seatKeys.x || seatKeys.y) look(seatKeys.x * dt * 1.6, -seatKeys.y * dt * 1.2); // → turns right, ↑ looks up
    }

    layoutLabels();

    // destination ring: appears where you clicked, then fades
    if (destT >= 0) {
      destT += dt;
      const k = destT / 0.9;
      standOn(destRing, destAt, 0.6 + Math.min(1, k) * 0.5); // it spreads, but no further than the spot was cleared
      destRing.material.opacity = Math.max(0, 0.9 * (1 - k));
      if (k >= 1) destT = -1;
    }
    // a mug on its way to or from your hands
    for (let i = objFlights.length - 1; i >= 0; i--) {
      const f = objFlights[i];
      const k = Math.min(1, (performance.now() - f.t0) / f.ms);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      f.obj.position.lerpVectors(f.from.pos, f.to.pos, e);
      f.obj.position.addScaledVector(f.obj.position.clone().normalize(), Math.sin(e * Math.PI) * 0.05);
      f.obj.quaternion.copy(f.from.quat).slerp(f.to.quat, e);
      if (k === 1) { objFlights.splice(i, 1); f.then && f.then(); }
    }
    // the menu card flying to or from your hands
    if (cardFlight) {
      const k = Math.min(1, (performance.now() - cardFlight.t0) / cardFlight.ms);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      card.position.lerpVectors(cardFlight.from.pos, cardFlight.to.pos, e);
      card.position.addScaledVector(card.position.clone().normalize(), Math.sin(e * Math.PI) * 0.06); // a little lift on the way
      card.quaternion.copy(cardFlight.from.quat).slerp(cardFlight.to.quat, e);
      if (cardFlight.light) bar.menu.light(Math.max(1e-3, cardFlight.light[0] + (cardFlight.light[1] - cardFlight.light[0]) * e)); // never 0 in the overlay: no lights there
      if (k === 1) { const then = cardFlight.then; cardFlight = null; then && then(); }
    }
    // The bar needs no label: it's the lit, open thing at the end of the path, your stool sits in
    // a pool of light, and the bartender waves you over. The menu card gets one, until the first
    // time it's picked up.
    let label = null;
    if (state === 'seat' && !held && !cardFlight && !flight && !making && !board.on && !root.classList.contains('is-typing') && !done.get('menu')) label = [bar.menu.label, 'Pick up the menu'];
    if (label) {
      _v.copy(label[0]).project(camera);
      const onScreen = _v.z < 1 && Math.abs(_v.x) < 0.9 && Math.abs(_v.y) < 0.9;
      const show = onScreen && panel.hidden && menu.hidden && !hovered;
      beacon.hidden = !show;
      if (show) {
        if (beacon.textContent !== label[1]) beacon.textContent = label[1];
        beacon.style.transform = `translate(${((_v.x + 1) / 2 * root.clientWidth).toFixed(0)}px, ${((1 - _v.y) / 2 * root.clientHeight).toFixed(0)}px)`;
      }
    } else if (!beacon.hidden) beacon.hidden = true;
    seatLeave.hidden = !(state === 'seat' && !flight && panel.hidden && menu.hidden && !board.on);
    boardBackBtn.hidden = !(state === 'seat' && board.on && panel.hidden && menu.hidden);
    makeSkip.hidden = !(making && state === 'seat' && panel.hidden && menu.hidden);
    chat.hidden = !(state === 'seat' && !flight && !leaving && !making && !ordering && !board.on && panel.hidden && menu.hidden);
    chatAsk.hidden = chat.hidden || talked || !(data.ask || []).length;
    if (chat.hidden && !chatLog.hidden && !talking) chatLog.hidden = true; // the conversation goes when the box does
    else if (!chat.hidden && chatLog.hidden && chatLog.children.length) chatLog.hidden = false; // and comes back with it
    // at the fire: the stick toasts by how close it is to the flame (real frame time: it's yours)
    const atFire = state === 'camp' && !flight && panel.hidden && menu.hidden;
    if (state === 'camp' && !leaving) roaster.update(realDt, atFire && (roast.pointer || roast.key), campSpot.hotSpot);
    campLeave.hidden = !atFire;
    const inHammock = state === 'hammock' && !flight && !leaving && panel.hidden && menu.hidden;
    hmLeave.hidden = hmRead.hidden = !inHammock;
    const atShore = state === 'shore' && !flight && !leaving && panel.hidden && menu.hidden;
    shoreLeave.hidden = shoreThrow.hidden = !atShore;
    scopeLeaveBtn.hidden = !(state === 'scope' && !flight && !scope.leaving && panel.hidden && menu.hidden);
    shoreThrow.classList.toggle('is-winding', windUp >= 0);
    carryDrop.hidden = carryThrow.hidden = !(state === 'walk' && carry && !flight && panel.hidden && menu.hidden);
    carryThrow.classList.toggle('is-winding', carryWind >= 0);
    const atBottles = state === 'note' && !flight && !leaving && panel.hidden && menu.hidden;
    noteLeave.hidden = !atBottles || noteStep === 'writing';
    noteGo.hidden = !atBottles || !(noteStep === null || noteStep === 'ready' || noteStep === 'thrown');
    if (!noteGo.hidden) {
      const label = noteStep === 'ready' ? 'Throw it' : noteStep === 'thrown' ? 'Write another' : 'Write one';
      if (noteGo.textContent !== label) noteGo.textContent = label;
    }
    if (noteStep === 'writing' && !noteForm.hidden) placeNote(); // it rides on the camera: keep the page on the paper
    campEat.hidden = !(atFire && roaster.state.on && !roaster.state.eating);
    if (!campEat.hidden) {
      const label = roaster.state.burning ? 'Blow it out' : 'Eat it';
      if (campEat.textContent !== label) campEat.textContent = label;
      campEat.classList.toggle('is-burning', roaster.state.burning);
    }
    if (roaster.state.toast > 0.25 && hint.dataset.key === 'roast' && !hint.hidden) clearHint('roast');

    Fire.tick(t);
    updateLamps(t);
    sky.update(t, camera);
    planet.update(t, camera);
    bar.update(t, dt);
    places.update(t);
    // (the map must exist first: an unrendered shadow map is a sampler with no texture)
    for (const [l, p] of pointShadows) l.shadow.autoUpdate = !l.shadow.map || camera.position.distanceToSquared(p) < 28 * 28;
    pipeline.render(dt);
    batcher.watch();
    // the first frames: note where everything is, merge what hasn't moved (batch.js), then reveal
    if (firstFrames) {
      ++framesDrawn;
      if (framesDrawn === 1) batcher.note();
      if (framesDrawn === 4) window.__batched = batcher.bake();
      if (framesDrawn >= 5) { firstFrames(); firstFrames = null; }
    }
  }

  player.applyToCamera();
  await step(0.92, 'Almost there…');
  // compile in parallel where the GPU driver can; elsewhere the first frames compile instead
  if (renderer.extensions.has('KHR_parallel_shader_compile')) await renderer.compileAsync(scene, camera).catch(() => {});
  renderer.setAnimationLoop(frame);
  document.addEventListener('visibilitychange', () => {
    renderer.setAnimationLoop(document.hidden ? null : frame);
    timer.reset();
  });

  // Reveal only once real frames are on screen: shaders compile on the first frames, and a
  // launch screen fading over a frozen half-drawn scene looks broken.
  await new Promise((r) => { firstFrames = r; });
  setProgress(1);
  setState('walk');
  $('veil').classList.add('is-gone');
  setTimeout(() => { $('veil').hidden = true; }, reducedMotion ? 0 : 500);
  setTimeout(() => showHint(coarse ? 'Tap anywhere to walk. Drag to look around.' : 'Click anywhere to walk. Drag to look around.', 'walk'), 900);
  if (panel.hidden) canvas.focus({ preventScroll: true });

  window.__world = { get state() { return state; }, get menuHeld() { return held; }, get cardFlying() { return !!cardFlight; }, get cameraFlying() { return !!flight; }, get drinkUp() { return !!drink; }, get ordering() { return ordering; }, player, camera, renderer, pipeline, SPOTS, bar, interactables, sitDown, leaveBar: () => leaveBar(), pickUpMenu: () => pickUpMenu(), putDownMenu: () => putDownMenu(), pick, scene, surfaceRadius, sitAtFire: () => sitAtFire(), leaveFire: () => leaveFire(), eatIt: () => eatIt(), roaster, roast, lieInHammock: () => lieInHammock(), goToShore: () => goToShore(), leaveShore: () => leaveShore(), skipper, get stoneInHand() { return !!inHand; }, throwStone: (hold) => { startWind(); windUp = hold; releaseThrow(); }, getOutOfHammock: () => getOutOfHammock(), get lying() { return !!lying; }, make: (i) => startMaking(i), get making() { return !!making; }, board: { open: () => lookAtBoard(), pick: (i) => showRecipe(i), close: () => leaveBoard(), rowAt: boardRowAt, get on() { return board.on; }, get picked() { return board.pick; } }, get job() { return making; }, note: { go: () => goToBottles(), leave: () => leaveBottles(), ritual, get step() { return noteStep; }, write(text, signed = '') { noteText.value = text; noteSign.value = signed; noteForm.requestSubmit(); }, throwIt: () => throwBottle(), putBack: () => putNoteBack() }, get carrying() { return carry && carry.label; }, sky: bookSky, openStar: (i) => openStar(bookSky.books[i]), closeStar: () => closeStar(), zoom: (slug) => zoomTo(regionOf(slug)), zoomOut: () => zoomOut(), get zoomed() { return zoom.region && zoom.region.slug; }, get zoomK() { return zoom.k; }, stepShelf: (d) => stepShelf(d), stepBook: (d) => stepBook(d), get starCard() { return starOpen && starOpen.book.title; }, grab: (i) => grab(physics.items[i]), goGrab: (i) => goGrab(physics.items[i]), toss: (hold) => { windCarry(); carryWind = hold; throwCarried(); }, putDown: () => putDown(), hoop, batcher, earth: sky.earth, machine: places.machine, goUse: (id) => goUse(interactables.find((x) => x.id === id)), routeTo, glints, get faceK() { return view.job ? 0 : view.k; }, scope: { go: () => lookThroughScope(), leave: () => leaveScope(), step: (d) => stepScope(d), get k() { return scope.k; }, get target() { return state === 'scope' && scope.targets[scope.i] ? scope.targets[scope.i].name : null; }, get count() { return scope.targets.length; }, get targets() { return scope.targets.map((x) => x.id); }, get site() { return scope.site; }, openSite: (i) => openSite(i), get live() { return !!live.moon; } } };
  window.__sceneReady = true;

  // Steve's books, for the stars over the hammock (_data/library.json, from tools/library.mjs)
  fetch('/library.json').then((r) => (r.ok ? r.json() : null)).then((d) => { bookSky.setBooks(d); window.__world.stars = bookSky.count; }).catch(() => {});

  // What can wait for the browser to be idle, so none of it lands on your first steps: the
  // physics engine (a megabyte of WebAssembly and its ground), then the bottles' shaders
  const whenIdle = (fn, after = 0) => setTimeout(() => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 3000 }) : fn()), after);
  whenIdle(() => physics.load().then(() => {
    const m = places.machine; // the cutaway's floor, walls and catwalk, for what's thrown in
    physics.addFixed(m.group.position, m.group.quaternion, m.solids);
    window.__world.physics = physics;
  }).catch((e) => console.warn('physics', e)), 1200);

  // Everyone else here right now, as fireflies (Supabase Realtime presence).
  fireflies = createFireflies(scene, DB);
  window.__world.fireflies = fireflies;

  // Sound: off until asked for (the speaker in the top bar), then everything where it is.
  sound = createSound({ scene, camera, spots: {
    bar: bar.group.localToWorld(new THREE.Vector3(0, 1.5, -0.4)),
    fire: campSpot.point.clone(),
    lagoon: surfacePoint(POND.center),
    hammock: hmSpot ? hmSpot.point.clone() : surfacePoint(SPOTS.spawn),
  } });
  bar.setSfx((name, ...args) => sound.play(name, ...args));
  window.__world.sound = sound;

  // The real bottles the robot pours from: nobody needs them until they order, so they load
  // once the scene is up, and their shaders compile off to the side before they're shown.
  whenIdle(() => loadHeroes(loader, modelsUrl.replace(/props\.glb$/, 'hero/'), { lazy: true }).then(async (bottles) => {
    if (!bottles.size) return;
    // one at a time, each when the browser's idle (where shaders can't compile in parallel, each is a pause)
    const parallel = renderer.extensions.has('KHR_parallel_shader_compile');
    for (const b of bottles.values()) {
      const staging = new THREE.Group().add(b);
      try {
        if (parallel) await renderer.compileAsync(staging, camera, scene);
        else await new Promise((ok) => whenIdle(() => { renderer.compile(staging, camera, scene); ok(); }));
      } catch (e) {}
      staging.remove(b);
    }
    bar.setBottles(bottles);
    window.__world.bottles = bottles.size;
  }), 2500);
}

start().catch((err) => {
  console.error(err);
  fallback(err && err.message);
});
