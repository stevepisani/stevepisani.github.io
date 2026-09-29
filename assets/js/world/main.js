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
import { buildPlanet, surfacePoint, surfaceRadius } from './planet.js';
import { buildSky } from './sky.js';
import { buildBar } from './bar.js';
import { buildPlaces, SPOTS, trailEdge, keepClear } from './places.js';
import { Player, bindInput } from './player.js';
import { fontsReady } from './textures.js';
import { loadHeroes } from './hero.js';
import { createRoaster, verdict } from './camp.js';

const $ = (id) => document.getElementById(id);
const root = $('world');
const canvas = $('world-canvas');
const data = JSON.parse($('world-data').textContent);
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
  if (state === 'seat' && drinkUp()) putDownDrink();
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

$('panel-close').addEventListener('click', () => closePanel());
$('panel-back').addEventListener('click', () => {
  closePanel();
  if (state !== 'seat') showMenu('nav');
  else if (!seatMenuHeld() && !drinkUp()) pickUpMenu();
});
$('menu-close').addEventListener('click', () => { if (state === 'seat') putDownMenu(); else hideMenu(); });
menuBtn.addEventListener('click', () => {
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
  // the card on the bar lists the same items as the HTML menu
  const menuItems = [...menu.querySelectorAll('.menu__list a')].map((a) => ({
    label: a.querySelector('.menu__label').textContent.trim(),
    note: a.querySelector('.menu__note').textContent.trim(),
  }));
  const bar = buildBar({ prop, quality, favorites: data.drinks || [], heroes, menuItems, reducedMotion });
  // the site's logo (the favicon) goes on the rocket
  const badge = document.querySelector('link[rel="icon"]')?.href || null;
  await step(0.82, 'Lighting the torches…');
  const places = buildPlaces({ prop, quality, heroes, badge });
  scene.add(sky.group, planet.group, bar.group, places.group);
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
  for (const it of byGenerality) it.object && it.object.traverse((o) => { if (o.isMesh) interactMeshes.set(o, it); });
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
    if (it.id === 'rocket') { location.href = menu.querySelector('.menu__foot a').href; return; }
    if (it.id === 'campfire') return sitAtFire();
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
    if (state === 'seat' || state === 'camp') {
      if (flight || leaving || drink) return;
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
    onPress: () => { if (state === 'camp') { clearTimeout(roast.timer); roast.timer = setTimeout(() => { roast.pointer = true; }, 120); } },
    onDragStart: () => { clearTimeout(roast.timer); roast.pointer = false; },
    onRelease: () => { clearTimeout(roast.timer); roast.pointer = false; },
    // Keyboard: E / Enter uses whatever you're next to, otherwise heads for the bar.
    onKeyAction: () => {
      if (state === 'seat' && panel.hidden && menu.hidden) { pickUpMenu(); return; }
      if (state === 'camp' && panel.hidden && menu.hidden) { eatIt(); return; }
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
    const dist = (bar.menu.height * 1.08 * c.height) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * r.height);
    const dir = ndc.unproject(camera).sub(camera.position).normalize();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const quat = camera.quaternion.clone();
    // the card's origin is its bottom edge: drop it by half its height along the camera's up
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const pos = camera.position.clone().addScaledVector(dir, dist / dir.dot(fwd)).addScaledVector(up, -bar.menu.height / 2);
    return { pos, quat };
  }
  function flyCard(from, to, ms, then) {
    scene.attach(card);
    card.position.copy(from.pos);
    card.quaternion.copy(from.quat);
    card.visible = true;
    cardFlight = { t0: performance.now(), ms, from, to, then };
  }
  function cardBackOnBar() {
    cardFlight = null;
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
    flyCard(cardWorldHome(), cardInHand(), 520, () => {
      menu.classList.remove('is-arriving');
      setTimeout(() => { if (held) card.visible = false; }, 180);
    });
  };
  putDownMenu = () => {
    if (!held) { hideMenu(); return; }
    const from = menu.hidden || reducedMotion ? null : cardInHand();
    held = false;
    hideMenu();
    menu.classList.remove('is-arriving');
    canvas.focus({ preventScroll: true });
    if (!from) return cardBackOnBar();
    flyCard(from, cardWorldHome(), 420, cardBackOnBar);
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

  let chatter;
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
      chatter = setInterval(() => { if (state === 'seat' && panel.hidden) say(data.bartender[i++ % data.bartender.length]); }, 12000);
    });
  }

  leaveBar = () => {
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
    if (!panel.hidden) closePanel();
    else if (!menu.hidden && menuMode === 'nav') hideMenu();
    else if (state === 'seat' && held) putDownMenu(); // first Esc puts the menu down, the next one leaves
    else if (state === 'seat') leaveBar();
    else if (state === 'camp') leaveFire();
  });
  addEventListener('keydown', (e) => { if (e.code === 'Space' && state === 'camp' && !e.target.closest('button, a, input, textarea')) { roast.key = true; e.preventDefault(); } });
  addEventListener('keyup', (e) => { if (e.code === 'Space') roast.key = false; });

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
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
  const Y_AXIS = new THREE.Vector3(0, 1, 0), X_AXIS = new THREE.Vector3(1, 0, 0);
  const seatKeys = { x: 0, y: 0 };
  const seatArrow = (e, down) => {
    if ((state !== 'seat' && state !== 'camp') || !panel.hidden || !menu.hidden) { seatKeys.x = seatKeys.y = 0; return; }
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
    if (flight) flightStep(performance.now());
    else if (state === 'camp' && campPose) {
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
      if (k === 1) { const then = cardFlight.then; cardFlight = null; then && then(); }
    }
    // The bar needs no label: it's the lit, open thing at the end of the path, your stool sits in
    // a pool of light, and the bartender waves you over. The menu card gets one, until the first
    // time it's picked up.
    let label = null;
    if (state === 'seat' && !held && !cardFlight && !flight && !done.get('menu')) label = [bar.menu.label, 'Pick up the menu'];
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
    // at the fire: the stick toasts by how close it is to the flame (real frame time: it's yours)
    const atFire = state === 'camp' && !flight && panel.hidden && menu.hidden;
    if (state === 'camp' && !leaving) roaster.update(realDt, atFire && (roast.pointer || roast.key), campSpot.hotSpot);
    campLeave.hidden = !atFire;
    campEat.hidden = !(atFire && roaster.state.on && !roaster.state.eating);
    if (!campEat.hidden) {
      const label = roaster.state.burning ? 'Blow it out' : 'Eat it';
      if (campEat.textContent !== label) campEat.textContent = label;
      campEat.classList.toggle('is-burning', roaster.state.burning);
    }
    if (roaster.state.toast > 0.25 && hint.dataset.key === 'roast' && !hint.hidden) clearHint('roast');

    Fire.tick(t);
    sky.update(t, camera);
    planet.update(t, camera);
    bar.update(t, dt);
    places.update(t);
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

  window.__world = { get state() { return state; }, get menuHeld() { return held; }, get cardFlying() { return !!cardFlight; }, get cameraFlying() { return !!flight; }, get drinkUp() { return !!drink; }, get ordering() { return ordering; }, player, camera, renderer, SPOTS, bar, interactables, sitDown, leaveBar: () => leaveBar(), pickUpMenu: () => pickUpMenu(), putDownMenu: () => putDownMenu(), pick, scene, surfaceRadius, sitAtFire: () => sitAtFire(), leaveFire: () => leaveFire(), eatIt: () => eatIt(), roaster, roast };
  window.__sceneReady = true;
}

start().catch((err) => {
  console.error(err);
  fallback(err && err.message);
});
