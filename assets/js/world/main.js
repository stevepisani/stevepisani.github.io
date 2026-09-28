// Steve's asteroid: you're dropped onto a tiny planet with a tiki bar in view.
// Walk over, sit down, pick something from the menu.
//
// Design rules (Krug, "Don't Make Me Think"; Apple HIG): no start screen, no
// instructions to read, click/tap where you want to go, clickable things look
// clickable, one just-in-time hint at a time, every section is also one click away
// in the top bar, and every state has an obvious way back (Esc, ×, browser Back).
//
// #world[data-state] = loading | walk | seat | fallback
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { buildPlanet, surfacePoint } from './planet.js';
import { buildSky } from './sky.js';
import { buildBar } from './bar.js';
import { buildPlaces, SPOTS } from './places.js';
import { Player, bindInput } from './player.js';
import { toonify, glowMat } from './stylize.js';
import { fontsReady } from './textures.js';

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

function openPanel(id, { push = true } = {}) {
  const tpl = $('panel-' + id);
  if (!tpl) return false;
  panelBody.replaceChildren(tpl.content.cloneNode(true));
  panel.hidden = false;
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

// Where you land after closing a panel: back to the menu if you were at the bar.
function afterPanel() {
  if (state === 'seat') showMenu('seat');
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

$('panel-close').addEventListener('click', () => closePanel());
$('panel-back').addEventListener('click', () => { closePanel(); if (state !== 'seat') showMenu('nav'); });
$('menu-close').addEventListener('click', () => { if (state === 'seat') leaveBar(); else hideMenu(); });
menuBtn.addEventListener('click', () => (menu.hidden ? showMenu(state === 'seat' ? 'seat' : 'nav') : hideMenu()));

// Every [data-order] link (top bar and menu) opens its panel in place. Without JS it's a normal link.
let serve = () => {};
let leaveBar = () => hideMenu();
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-order]');
  if (!a || state === 'fallback' || e.metaKey || e.ctrlKey || e.shiftKey) return;
  const id = a.dataset.order;
  if (!$('panel-' + id)) return;
  e.preventDefault();
  if (state === 'seat') serve(id);
  openPanel(id);
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
  $('veil').hidden = true;
  showMenu('nav');
}

function webgl2() {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch (e) { return false; }
}

async function start() {
  if (!webgl2()) return fallback('no WebGL2');
  const progress = $('veil-progress');
  const setProgress = (k) => progress.style.setProperty('--p', k);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !quality.high, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, quality.high ? 2 : 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(coarse ? 72 : 68, 1, 0.05, 2000);

  // Models: one GLB, plus fonts for the canvas textures.
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const modelsUrl = document.querySelector('script[data-models]').dataset.models;
  setProgress(0.1);
  const [gltf] = await Promise.all([
    new Promise((res, rej) => loader.load(modelsUrl, res, (e) => e.total && setProgress(0.1 + 0.8 * (e.loaded / e.total)), rej)),
    fontsReady(),
  ]);
  const library = new Map(gltf.scene.children.map((c) => [c.name, c]));
  toonify(gltf.scene);
  const prop = (name, scale = 1) => {
    const src = library.get(name);
    if (!src) { console.warn('missing model', name); return new THREE.Group(); }
    const o = src.clone(true);
    o.position.set(0, 0, 0);
    o.rotation.set(0, 0, 0);
    o.scale.setScalar(scale);
    return o;
  };

  const sky = buildSky({ quality });
  const planet = buildPlanet({ quality });
  const bar = buildBar({ prop, quality, posts: data.posts });
  const places = buildPlaces({ prop, quality });
  scene.add(sky.group, planet.group, bar.group, places.group);
  serve = (id) => bar.serve(id);

  scene.add(new THREE.HemisphereLight(0xa9c4ff, 0x6a4a3a, 1.35));
  const sun = new THREE.DirectionalLight(0xffe6c4, 2.3);
  sun.position.copy(sky.sunDir).multiplyScalar(60);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x8f7bff, 0.7);
  fill.position.copy(sky.sunDir).multiplyScalar(-60);
  scene.add(fill);

  const player = new Player(camera, { colliders: [...bar.colliders, ...places.colliders] });
  const interactables = [...bar.interactables, ...places.interactables];
  const barSpot = interactables.find((i) => i.id === 'seat');
  const signPoint = bar.group.localToWorld(new THREE.Vector3(0, 2.6, 0));
  player.spawn(SPOTS.spawn, signPoint);
  // tilt the view so the bar and its sign sit comfortably in frame
  {
    const eye = player.pos.clone().addScaledVector(player.up, player.eye);
    const to = signPoint.clone().sub(eye);
    const upAmt = to.dot(player.up);
    player.pitch = Math.atan2(upAmt, Math.sqrt(Math.max(0, to.lengthSq() - upAmt * upAmt)));
  }

  // Post-processing on capable devices: HDR-only bloom, then a light grade and vignette.
  let composer = null;
  if (quality.high) {
    composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.65, 0.4, 1.6));
    composer.addPass(new OutputPass());
    composer.addPass(new ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
        void main(){
          vec4 c = texture2D(tDiffuse, vUv);
          float l = dot(c.rgb, vec3(.299,.587,.114));
          c.rgb = mix(vec3(l), c.rgb, 1.1);
          float v = smoothstep(.95, .35, distance(vUv, vec2(.5)));
          c.rgb *= mix(.75, 1., v);
          gl_FragColor = c;
        }`,
    }));
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
  const barRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 40).rotateX(-Math.PI / 2), glowMat(0x3ff5e8, 2));
  const standOn = (obj, point, lift = 0.04) => {
    const up = point.clone().normalize();
    obj.position.copy(surfacePoint(up, lift));
    obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
  };
  standOn(barRing, barSpot.approach, 0.26); // on the deck
  barRing.visible = !done.get('sat');
  scene.add(barRing);

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
    if (it.id === 'rocket') { location.href = menu.querySelector('.menu__foot a').href; return; }
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

  function onTap(x, y) {
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

  const input = bindInput(player, canvas, {
    onTap,
    onHover,
    // Keyboard: E / Enter uses whatever you're next to, otherwise heads for the bar.
    onKeyAction: () => {
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
  function flyTo(pose, ms, then) {
    if (reducedMotion) { camera.position.copy(pose.pos); camera.quaternion.copy(pose.quat); then && then(); return; }
    flight = { t0: performance.now(), ms, from: { pos: camera.position.clone(), quat: camera.quaternion.clone() }, to: pose, then };
  }

  let chatter;
  function sitDown() {
    input.clear();
    player.stop();
    clearHint('walk');
    done.set('sat');
    barRing.visible = false;
    tip.hidden = true;
    setState('seat');
    seatPose = poseLooking(bar.seat.eye, bar.seat.look);
    flyTo(seatPose, 800, () => {
      if (state !== 'seat') return;
      if (panel.hidden) showMenu('seat');
      say(data.bartender[0]);
      let i = 1;
      clearInterval(chatter);
      chatter = setInterval(() => { if (state === 'seat' && panel.hidden) say(data.bartender[i++ % data.bartender.length]); }, 12000);
    });
  }

  leaveBar = () => {
    hideMenu();
    closePanel();
    clearInterval(chatter);
    bubble.hidden = true;
    flight = null;
    // stand up where you walked in, facing back down the path
    player.spawn(barSpot.approach.clone().normalize(), surfacePoint(SPOTS.spawn), -0.05);
    setState('walk');
    player.applyToCamera();
    canvas.focus({ preventScroll: true });
  };
  $('leave').addEventListener('click', () => leaveBar());

  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!panel.hidden) closePanel();
    else if (!menu.hidden && menuMode === 'nav') hideMenu();
    else if (state === 'seat') leaveBar();
  });

  /* ---------- Loop ---------- */
  const timer = new THREE.Timer();
  let t = 0;
  const _v = new THREE.Vector3();
  const beacon = $('beacon');
  const beaconAt = bar.group.localToWorld(new THREE.Vector3(0, 1.9, 1.6)); // just above the stools
  let movedFrom = null;

  function frame(now) {
    timer.update(now);
    // ?test: bigger steps so walks finish under slow software rendering; ambient time frozen
    const dt = Math.min(timer.getDelta(), TEST ? 0.25 : 0.05);
    if (!TEST) t += dt;

    if (state === 'walk') {
      player.enabled = panel.hidden && menu.hidden;
      player.update(dt);
      if (!flight) player.applyToCamera(t, !reducedMotion);
      // the walk hint retires once they've actually moved a few metres
      if (!movedFrom) movedFrom = player.pos.clone();
      else if (!hint.hidden && hint.dataset.key === 'walk' && player.pos.distanceTo(movedFrom) > 3) clearHint('walk');
    }
    if (flight) {
      const k = Math.min(1, (performance.now() - flight.t0) / flight.ms);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      camera.position.lerpVectors(flight.from.pos, flight.to.pos, e);
      camera.quaternion.copy(flight.from.quat).slerp(flight.to.quat, e);
      if (k === 1) { const then = flight.then; flight = null; then && then(); }
    } else if (state === 'seat' && seatPose) {
      camera.position.copy(seatPose.pos);
      camera.quaternion.copy(seatPose.quat);
    }

    // destination ring: appears where you clicked, then fades
    if (destT >= 0) {
      destT += dt;
      const k = destT / 0.9;
      destRing.scale.setScalar(0.6 + k * 0.8);
      destRing.material.opacity = Math.max(0, 0.9 * (1 - k));
      if (k >= 1) destT = -1;
    }
    // the bar's ring and its floating label, until they've sat down once
    if (barRing.visible) {
      if (!reducedMotion) barRing.scale.setScalar(1 + Math.sin(t * 3) * 0.08);
      _v.copy(beaconAt).project(camera);
      const onScreen = _v.z < 1 && Math.abs(_v.x) < 0.9 && Math.abs(_v.y) < 0.9;
      const show = state === 'walk' && onScreen && panel.hidden && menu.hidden && !hovered;
      beacon.hidden = !show;
      if (show) beacon.style.transform = `translate(${((_v.x + 1) / 2 * root.clientWidth).toFixed(0)}px, ${((1 - _v.y) / 2 * root.clientHeight).toFixed(0)}px)`;
    } else if (!beacon.hidden) beacon.hidden = true;

    sky.update(t, camera);
    planet.update(t, camera);
    bar.update(t);
    places.update(t);
    composer ? composer.render() : renderer.render(scene, camera);
  }

  player.applyToCamera();
  renderer.setAnimationLoop(frame);
  document.addEventListener('visibilitychange', () => {
    renderer.setAnimationLoop(document.hidden ? null : frame);
    timer.reset();
  });

  // Reveal. The first thing you see is the bar.
  setProgress(1);
  setState('walk');
  $('veil').classList.add('is-gone');
  setTimeout(() => { $('veil').hidden = true; }, reducedMotion ? 0 : 700);
  setTimeout(() => showHint(coarse ? 'Tap anywhere to walk. Drag to look around.' : 'Click anywhere to walk. Drag to look around.', 'walk'), 900);
  if (panel.hidden) canvas.focus({ preventScroll: true });

  window.__world = { get state() { return state; }, player, camera, renderer, SPOTS, bar, interactables, sitDown, leaveBar: () => leaveBar(), pick };
  window.__sceneReady = true;
}

start().catch((err) => {
  console.error(err);
  fallback(err && err.message);
});
