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
import { buildPlanet, surfacePoint, surfaceRadius, POND } from './planet.js';
import { buildSky } from './sky.js';
import { buildBar } from './bar.js';
import { buildPlaces, SPOTS, trailEdge, keepClear } from './places.js';
import { Player, bindInput } from './player.js';
import { fontsReady, paintMenuCard } from './textures.js';
import { lampLitTree, finishLamps, updateLamps } from './lamps.js';
import { loadHeroes } from './hero.js';
import { createRoaster, verdict } from './camp.js';
import { createSound } from './sound.js';
import { createSkipper } from './stones.js';
import { createNoteRitual } from './note.js';
import { createFireflies } from './fireflies.js';

const $ = (id) => document.getElementById(id);
const root = $('world');
const canvas = $('world-canvas');
const data = JSON.parse($('world-data').textContent);
// The one Supabase project (url and public key from _config.yml, in the page head)
const DB = { url: document.querySelector('meta[name="supabase-url"]').content, key: document.querySelector('meta[name="supabase-key"]').content };
const TEST = new URLSearchParams(location.search).has('test');
const reducedMotion = TEST || matchMedia('(prefers-reduced-motion: reduce)').matches;
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
  else { pushed = false; closePanel({ fromHistory: true }); }
});

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
  const camera = new THREE.PerspectiveCamera(coarse ? 72 : 68, 1, 0.05, 2000);

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
  scene.add(sky.group, planet.group, bar.group, places.group);
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

  /* ---------- Markers: where you're going, and where you could go ---------- */
  const ringGeo = new THREE.RingGeometry(0.28, 0.38, 32).rotateX(-Math.PI / 2);
  const marker = (color) => {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    m.renderOrder = 2;
    scene.add(m);
    return m;
  };
  const hoverRing = marker(0xffffff);
  const destRing = marker(0x3ff5e8);
  const standOn = (obj, point, lift = 0.04) => {
    const up = point.clone().normalize();
    obj.position.copy(surfacePoint(up, lift));
    obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
  };

  /* ---------- Picking ---------- */
  const raycaster = new THREE.Raycaster();
  raycaster.far = 60;
  const ndc = new THREE.Vector2();
  const ground = planet.group.getObjectByName('ground');
  // mesh -> interactable. The bar group contains the chalkboard, so register the bar first
  // and let more specific things overwrite their own meshes.
  const interactMeshes = new Map();
  const byGenerality = [...interactables].sort((a, b) => (a.id === 'seat' ? -1 : b.id === 'seat' ? 1 : 0));
  for (const it of byGenerality) for (const obj of [it.object, ...(it.extra || [])]) obj && obj.traverse((o) => { if (o.isMesh) interactMeshes.set(o, it); });
  const pickList = [...interactMeshes.keys(), ground];

  function pick(x, y) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(pickList, false)[0];
    if (!hit) return null;
    if (hit.object === ground) return { ground: hit.point };
    return { thing: interactMeshes.get(hit.object), point: hit.point };
  }

  /* ---------- Doing things ---------- */
  function use(it) {
    player.stop();
    if (it.id === 'seat') return sitDown();
    if (it.id === 'menu') return sitDown({ pickUp: true });
    if (it.id === 'drinks') return sitDown({ then: () => openPanel('drinks') });
    if (it.id === 'make') return sitDown({ then: () => startMaking(it.make) });
    if (it.id === 'rocket') { location.href = menu.querySelector('.menu__foot a').href; return; }
    if (it.id === 'campfire') return sitAtFire();
    if (it.id === 'hammock') return lieInHammock();
    if (it.id === 'stones') return goToShore();
    if (it.id === 'bottles') return goToBottles();
    openPanel(it.id);
  }
  let destT = -1;
  function showDest(point) { standOn(destRing, point); destT = 0; }
  function goUse(it) {
    clearHint('walk');
    if (player.pos.distanceTo(it.approach) < 0.6 || player.pos.distanceTo(it.point) < it.radius * 0.7) return use(it);
    player.walkTo(it.approach, { arrive: 0.45, onArrive: () => use(it) });
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
    if (state === 'seat' && panel.hidden && menu.hidden) {
      if (making) return; // it's making you a drink
      const p = pick(x, y);
      if (p && p.thing && p.thing.id === 'menu') { swallowNextClick(); pickUpMenu(); }
      else if (p && p.thing && p.thing.id === 'drinks') { swallowNextClick(); openPanel('drinks'); }
      return;
    }
    if (state !== 'walk' || !panel.hidden || !menu.hidden) return;
    const p = pick(x, y);
    if (!p) return;
    if (p.thing) return goUse(p.thing);
    clearHint('walk');
    player.walkTo(p.ground);
    showDest(p.ground);
  }

  const tip = $('tip');
  let hovered = null;
  function onHover(x, y) {
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
    hovered = p && p.thing;
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
      if (p) { standOn(hoverRing, p.ground); hoverRing.material.opacity = 0.35; } else hoverRing.material.opacity = 0;
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
    if (state === 'seat' || state === 'camp' || state === 'hammock' || state === 'shore' || state === 'note') {
      if (flight || leaving || drink || view.k > 0) return;
      // same feel as walking (player.look): drag the world, so dragging right turns you left
      seatLook.yaw = THREE.MathUtils.clamp(seatLook.yaw - dx, -1.9, 1.9);
      seatLook.pitch = THREE.MathUtils.clamp(seatLook.pitch - dy, -0.95, 0.95);
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
    const t = (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2) * f.total; // eased time along the path
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
  const makingCard = $('making'), makingCount = $('making-count'), makingText = $('making-text'), makingDots = $('making-dots'), makeSkip = $('make-skip');
  let making = null, makingDone;
  // The view while it's made: you lean in over the counter and your eyes follow the work, one
  // step at a time (bar.make's focus()), with the view narrowed like leaning in to watch closely.
  // Something you asked for, so the camera moves; eased like a head turn, snapped under
  // reduced motion. You sit back once the drink's in front of you.
  const BASE_FOV = camera.fov, LEAN_FOV = BASE_FOV * (coarse ? 0.66 : 0.52);
  const view = { k: 0, want: 0, eye: new THREE.Vector3(), look: new THREE.Vector3(), aim: new THREE.Vector3(), hold: 0, job: null };
  function leanIn(job) {
    view.job = job;
    view.want = 1;
    view.hold = 0;
    // lean toward the work: a head's worth forward over the counter, a little lower
    const S = bar.seat, toward = job.center.clone().sub(S.eye);
    const up = S.eye.clone().normalize();
    toward.addScaledVector(up, -toward.dot(up)).normalize();
    view.eye.copy(S.eye).addScaledVector(toward, 0.32).addScaledVector(up, -0.06);
    view.aim.copy(job.focus());
    if (view.k === 0 || reducedMotion) view.look.copy(view.aim);
    seatLook.yaw = seatLook.pitch = 0;
  }
  function startMaking(idx) {
    const recipe = (data.drinks || [])[idx];
    if (!recipe) return;
    if (state === 'walk') return goUse({ ...interactables.find((x) => x.id === 'seat'), id: 'make', make: idx });
    if (state !== 'seat' || ordering) return;
    stopMaking();
    drinkBackOnBar();
    if (held) putDownMenu(); else hideMenu();
    bubble.hidden = true;
    clearTimeout(makingDone);
    makingDots.replaceChildren();
    const job = (making = bar.make(recipe, {
      onStep(i, n, text) {
        if (makingDots.children.length !== n) makingDots.replaceChildren(...Array.from({ length: n }, () => document.createElement('li')));
        [...makingDots.children].forEach((li, k) => li.classList.toggle('is-done', k <= i));
        makingCount.textContent = `${recipe.name} · ${i + 1} of ${n}`;
        makingText.textContent = text;
        makingCard.hidden = false;
      },
      onDone() {
        making = null;
        [...makingDots.children].forEach((li) => li.classList.add('is-done'));
        makingCount.textContent = recipe.name;
        makingText.textContent = 'There you go. Cheers!';
        makingDone = setTimeout(() => { if (!making) makingCard.hidden = true; }, 4000);
        view.hold = 1.4; // watch it arrive, then sit back
      },
    }));
    leanIn(job);
  }
  function stopMaking() {
    if (making) making.cancel();
    making = null;
    makingCard.hidden = true;
    view.want = 0; view.hold = 0;
    if (view.k) { view.k = 0; camera.fov = BASE_FOV; camera.updateProjectionMatrix(); }
  }
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
  // knows the site from /bartender.json). Its answer shows above the question box, on phones
  // too; the rotating chatter stops once you've said something.
  const chat = $('chat'), chatInput = $('chat-input'), chatReply = $('chat-reply');
  const talk = [];
  let talking = false, talked = false;
  chat.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = chatInput.value.trim();
    if (!q || talking) return;
    talked = true;
    clearInterval(chatter);
    bubble.hidden = true;
    talking = true;
    chatReply.classList.add('is-thinking');
    chatReply.hidden = false;
    chatReply.textContent = '…';
    chatInput.value = '';
    talk.push({ role: 'user', content: q });
    let answer = null;
    try {
      const res = await fetch(`${DB.url}/functions/v1/bartender`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: DB.key, authorization: `Bearer ${DB.key}` },
        body: JSON.stringify({ messages: talk.slice(-12) }),
      });
      answer = (await res.json()).reply || null;
    } catch (err) { /* offline, or the function isn't there: say so below */ }
    if (answer) talk.push({ role: 'assistant', content: answer });
    else talk.pop(); // keep the conversation taking turns
    chatReply.textContent = answer || "The bar's closed for a moment. The menu's right in front of you.";
    talking = false;
    chatReply.classList.remove('is-thinking');
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
      if (!talked) chatter = setInterval(() => { if (state === 'seat' && panel.hidden && !making) say(data.bartender[i++ % data.bartender.length]); }, 12000);
    });
  }

  leaveBar = () => {
    stopMaking();
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
    if (!panel.hidden) closePanel();
    else if (making && menu.hidden) skipMaking(); // Esc while it's making one: straight to the drink
    else if (!menu.hidden && menuMode === 'nav') hideMenu();
    else if (state === 'seat' && held) putDownMenu(); // first Esc puts the menu down, the next one leaves
    else if (state === 'seat') leaveBar();
    else if (state === 'camp') leaveFire();
    else if (state === 'hammock') getOutOfHammock();
    else if (state === 'shore') leaveShore();
    else if (state === 'note') { if (noteStep === 'writing') putNoteBack(); else leaveBottles(); } // first Esc puts the letter back
  });
  addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || e.target.closest('button, a, input, textarea')) return;
    if (state === 'camp') { roast.key = true; e.preventDefault(); }
    if (state === 'shore') { if (!e.repeat) startWind(); e.preventDefault(); }
  });
  addEventListener('keyup', (e) => { if (e.code !== 'Space') return; roast.key = false; if (state === 'shore' && windUp >= 0) releaseThrow(); });

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
      back: poseLooking(w(P(0.42, 0.42, side * 0.06)), w(new THREE.Vector3(L * 0.72, 0.4, -side * 0.6))),       // legs up, leaning back
      lie: { eye: P(0.3, 0.19, 0), look: new THREE.Vector3(L * 0.9, 1.15, 0) },                                  // lying back, looking up over your feet
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
    const P = hammockPoses();
    lying = P.lie;
    const step = Math.min(900, Math.max(300, camera.position.distanceTo(P.stand.pos) * 420));
    clearTimeout(hmTimer);
    hmTimer = setTimeout(() => { loadTo = 1; sound.play('creak'); }, reducedMotion ? 0 : step + 1300); // it takes your weight as you sit
    flyPath([
      { ...P.stand, ms: step },
      { ...P.sit, ms: 1600 },  // turn round and sit on the edge: an unhurried half turn
      { ...P.back, ms: 850 },  // swing your legs up, lean back
      { ...P.lie, ms: 750 },
    ], () => {
      if (state !== 'hammock') return;
      loadTo = 1;
      if (!reducedMotion) HM.kick(0.32); // and you set it swinging
      readBook();
    });
  }
  function getOutOfHammock() {
    if (state !== 'hammock' || leaving) return;
    leaving = true;
    closePanel();
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
      { ...P.back, ms: 700 },  // sit up
      { ...P.sit, ms: 800 },   // legs over the side
      { ...P.stand, ms: 1600 }, // stand, turning back round to it
      { pos: endPos, quat: endQuat, ms: 700 },
    ], finish);
  }
  hmLeave.addEventListener('click', getOutOfHammock);
  hmRead.addEventListener('click', readBook);
  // closing the list: the book comes down to your chest, and you're lying looking at the sky
  afterHammockPanel = () => { if (state === 'hammock' && !leaving && HM.book.parent === camera) tweenBook(CHEST, 0.1, 600); };

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

  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
  const Y_AXIS = new THREE.Vector3(0, 1, 0), X_AXIS = new THREE.Vector3(1, 0, 0);
  const seatKeys = { x: 0, y: 0 };
  const seatArrow = (e, down) => {
    if (e.target.closest && e.target.closest('input, textarea')) return; // typing, not looking
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
    if (fireflies) { fireflies.setSelf(camera.position); fireflies.update(clock += realDt, realDt, reducedMotion); }
    if (state === 'shore') {
      if (windUp >= 0) windUp += realDt;
      if (!inHand && !flight && !leaving && (reload -= realDt) <= 0) holdStone(true);
      if (inHand) { // drawn back as you wind up
        const k = windUp >= 0 ? Math.min(1, windUp / 1.1) : 0;
        inHand.position.set(HAND.x + 0.1 * k, HAND.y - 0.02 * k, HAND.z + 0.12 * k);
      }
    }
    if (flight) flightStep(performance.now());
    else if ((state === 'shore' && shorePose) || (state === 'note' && notePose)) {
      const pose = state === 'shore' ? shorePose : notePose;
      camera.position.copy(pose.pos);
      camera.quaternion.copy(pose.quat)
        .multiply(_q.setFromAxisAngle(Y_AXIS, seatLook.yaw))
        .multiply(_q2.setFromAxisAngle(X_AXIS, seatLook.pitch));
      if (seatKeys.x || seatKeys.y) look(seatKeys.x * dt * 1.6, -seatKeys.y * dt * 1.2);
    } else if (state === 'hammock' && lying) {
      // lying in it: you swing with it
      HM.swing.updateWorldMatrix(true, false);
      const p = poseLooking(HM.swing.localToWorld(lying.eye.clone()), HM.swing.localToWorld(lying.look.clone()));
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
      if (view.k !== view.want) {
        view.k = reducedMotion ? view.want : THREE.MathUtils.clamp(view.k + Math.sign(view.want - view.k) * realDt / 1.1, 0, 1);
        const e = view.k * view.k * (3 - 2 * view.k);
        camera.fov = BASE_FOV + (LEAN_FOV - BASE_FOV) * e;
        camera.updateProjectionMatrix();
      }
      if (view.k > 0) {
        if (view.job) view.aim.copy(view.job.focus());
        if (reducedMotion) view.look.copy(view.aim); else view.look.lerp(view.aim, 1 - Math.exp(-realDt * 3));
        const e = view.k * view.k * (3 - 2 * view.k);
        camera.position.lerpVectors(seatPose.pos, view.eye, e);
        camera.quaternion.slerp(poseLooking(camera.position, view.look).quat, e);
      }
      // arrow keys look around too
      if (seatKeys.x || seatKeys.y) look(seatKeys.x * dt * 1.6, -seatKeys.y * dt * 1.2); // → turns right, ↑ looks up
    }

    // destination ring: appears where you clicked, then fades
    if (destT >= 0) {
      destT += dt;
      const k = destT / 0.9;
      destRing.scale.setScalar(0.6 + k * 0.8);
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
    if (state === 'seat' && !held && !cardFlight && !flight && !making && !done.get('menu')) label = [bar.menu.label, 'Pick up the menu'];
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
    seatLeave.hidden = !(state === 'seat' && !flight && panel.hidden && menu.hidden);
    makeSkip.hidden = !(making && state === 'seat' && panel.hidden && menu.hidden);
    chat.hidden = !(state === 'seat' && !flight && !leaving && !making && !ordering && panel.hidden && menu.hidden);
    if (chat.hidden && !chatReply.hidden && !talking) chatReply.hidden = true; // the answer goes when the box does
    // at the fire: the stick toasts by how close it is to the flame (real frame time: it's yours)
    const atFire = state === 'camp' && !flight && panel.hidden && menu.hidden;
    if (state === 'camp' && !leaving) roaster.update(realDt, atFire && (roast.pointer || roast.key), campSpot.hotSpot);
    campLeave.hidden = !atFire;
    const inHammock = state === 'hammock' && !flight && !leaving && panel.hidden && menu.hidden;
    hmLeave.hidden = hmRead.hidden = !inHammock;
    const atShore = state === 'shore' && !flight && !leaving && panel.hidden && menu.hidden;
    shoreLeave.hidden = shoreThrow.hidden = !atShore;
    shoreThrow.classList.toggle('is-winding', windUp >= 0);
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
    if (firstFrames && ++framesDrawn >= 3) { firstFrames(); firstFrames = null; }
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

  window.__world = { get state() { return state; }, get menuHeld() { return held; }, get cardFlying() { return !!cardFlight; }, get cameraFlying() { return !!flight; }, get drinkUp() { return !!drink; }, get ordering() { return ordering; }, player, camera, renderer, pipeline, SPOTS, bar, interactables, sitDown, leaveBar: () => leaveBar(), pickUpMenu: () => pickUpMenu(), putDownMenu: () => putDownMenu(), pick, scene, surfaceRadius, sitAtFire: () => sitAtFire(), leaveFire: () => leaveFire(), eatIt: () => eatIt(), roaster, roast, lieInHammock: () => lieInHammock(), goToShore: () => goToShore(), leaveShore: () => leaveShore(), skipper, get stoneInHand() { return !!inHand; }, throwStone: (hold) => { startWind(); windUp = hold; releaseThrow(); }, getOutOfHammock: () => getOutOfHammock(), get lying() { return !!lying; }, make: (i) => startMaking(i), get making() { return !!making; }, get job() { return making; }, note: { go: () => goToBottles(), leave: () => leaveBottles(), ritual, get step() { return noteStep; }, write(text, signed = '') { noteText.value = text; noteSign.value = signed; noteForm.requestSubmit(); }, throwIt: () => throwBottle(), putBack: () => putNoteBack() } };
  window.__sceneReady = true;

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
  loadHeroes(loader, modelsUrl.replace(/props\.glb$/, 'hero/'), { lazy: true }).then(async (bottles) => {
    if (!bottles.size) return;
    const staging = new THREE.Group();
    for (const b of bottles.values()) staging.add(b);
    try {
      if (renderer.extensions.has('KHR_parallel_shader_compile')) await renderer.compileAsync(staging, camera, scene);
      else renderer.compile(staging, camera, scene);
    } catch (e) {}
    for (const b of [...staging.children]) staging.remove(b);
    bar.setBottles(bottles);
    window.__world.bottles = bottles.size;
  });
}

start().catch((err) => {
  console.error(err);
  fallback(err && err.message);
});
