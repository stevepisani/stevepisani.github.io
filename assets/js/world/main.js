// Steve's asteroid: a walkable tiny planet with a tiki bar you can sit at and order from.
//
// States (on #world[data-state]):
//   loading  → assets streaming in, gate shows progress
//   gate     → orbiting view, "Land and explore" / "Take me straight to the bar"
//   flying   → camera swooping down from orbit
//   walk     → first-person on the surface
//   seat     → sitting at the bar with the order menu open
//   paused   → pointer lock released while walking
//   fallback → no WebGL: the gate becomes a plain page of links
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { buildPlanet, RADIUS } from './planet.js';
import { buildSky } from './sky.js';
import { buildBar } from './bar.js';
import { buildPlaces, SPOTS } from './places.js';
import { Player, bindInput } from './player.js';
import { toonify } from './stylize.js';
import { fontsReady } from './textures.js';

const $ = (id) => document.getElementById(id);
const root = $('world');
const canvas = $('world-canvas');
const data = JSON.parse($('world-data').textContent);
const params = new URLSearchParams(location.search);
const TEST = params.has('test');
const reducedMotion = TEST || matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;
const quality = { high: !coarse && innerWidth > 900 && (navigator.deviceMemory || 8) >= 4 };

const setState = (s) => { root.dataset.state = s; state = s; };
let state = 'loading';

/* ---------------- Panels & menu (plain DOM, no 3D needed) ---------------- */
const panel = $('panel'), panelBody = $('panel-body'), order = $('order'), bubble = $('bubble');
let onPanelClose = () => {};

function openPanel(id, { fromMenu } = {}) {
  const tpl = $('panel-' + id);
  if (!tpl) return false;
  panelBody.replaceChildren(tpl.content.cloneNode(true));
  panel.hidden = false;
  panel.dataset.fromMenu = fromMenu ? 'yes' : 'no';
  panelBody.querySelectorAll('[data-launch]').forEach(fillLaunch);
  panel.scrollTop = 0;
  (panelBody.querySelector('h2') || panel).focus?.();
  $('panel-close').focus({ preventScroll: true });
  return true;
}
function closePanel() {
  if (panel.hidden) return;
  panel.hidden = true;
  onPanelClose();
}
$('panel-close').addEventListener('click', closePanel);
$('panel-back').addEventListener('click', closePanel);

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
function say(text, ms = 5200) {
  bubble.textContent = text;
  bubble.hidden = false;
  bubble.classList.remove('is-in');
  void bubble.offsetWidth;
  bubble.classList.add('is-in');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => { bubble.hidden = true; }, ms);
}

/* ---------------- Fallback ---------------- */
function fallback(reason) {
  console.info('World: no 3D.', reason || '');
  setState('fallback');
  $('gate-status').textContent = "Your browser can't render the asteroid, so here's the menu instead.";
  order.hidden = false;
  $('stand').hidden = true;
}

function webgl2() {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch (e) { return false; }
}

/* ---------------- The world ---------------- */
async function start() {
  if (!webgl2()) return fallback('no WebGL2');

  const progress = $('gate-progress');
  const setProgress = (k, text) => {
    progress.style.setProperty('--p', k);
    progress.setAttribute('aria-valuenow', Math.round(k * 100));
    if (text) $('gate-status').textContent = text;
  };

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !quality.high, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, quality.high ? 2 : 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(coarse ? 80 : 75, 1, 0.05, 2000);

  // Load the model pack (one GLB) while fonts settle.
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_, loaded, total) => setProgress(0.1 + 0.7 * (loaded / total), 'Loading the tiki bar…');
  const loader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
  const modelsUrl = document.querySelector('script[data-models]').dataset.models;
  setProgress(0.05, 'Plotting a course…');
  const [gltf] = await Promise.all([
    new Promise((res, rej) => loader.load(modelsUrl, res, (e) => e.total && setProgress(0.05 + 0.7 * (e.loaded / e.total), 'Loading the tiki bar…'), rej)),
    fontsReady(),
  ]);
  const library = new Map(gltf.scene.children.map((c) => [c.name, c]));
  toonify(gltf.scene);
  /** Clone a model from the pack by name, at a uniform scale. */
  const prop = (name, scale = 1) => {
    const src = library.get(name);
    if (!src) { console.warn('missing model', name); return new THREE.Group(); }
    const o = src.clone(true);
    o.position.set(0, 0, 0);
    o.rotation.set(0, 0, 0);
    o.scale.setScalar(scale);
    return o;
  };
  setProgress(0.85, 'Lighting the torches…');

  // Build the world.
  const sky = buildSky({ quality });
  const planet = buildPlanet({ quality });
  const bar = buildBar({ prop, quality, posts: data.posts });
  const places = buildPlaces({ prop, quality });
  scene.add(sky.group, planet.group, bar.group, places.group);

  scene.add(new THREE.HemisphereLight(0xa9c4ff, 0x6a4a3a, 1.35));
  const sun = new THREE.DirectionalLight(0xffe6c4, 2.3);
  sun.position.copy(sky.sunDir).multiplyScalar(60);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x8f7bff, 0.7);
  fill.position.copy(sky.sunDir).multiplyScalar(-60);
  scene.add(fill);

  const player = new Player(camera, { colliders: [...bar.colliders, ...places.colliders] });
  const interactables = [...bar.interactables, ...places.interactables];
  player.spawn(SPOTS.spawn, bar.group.position);

  // Post-processing: bloom on emissive things, then a gentle grade and vignette.
  let composer = null;
  if (quality.high) {
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0.4, 1.6)); // high threshold: only glowMat (HDR) lights bloom, not lit surfaces
    composer.addPass(new OutputPass());
    composer.addPass(new ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
        void main(){
          vec4 c = texture2D(tDiffuse, vUv);
          float l = dot(c.rgb, vec3(.299,.587,.114));
          c.rgb = mix(vec3(l), c.rgb, 1.12);                       // a touch more saturation
          c.rgb = mix(c.rgb, c.rgb * vec3(1.03, 1.0, 1.06), .5);   // cool-warm split
          float v = smoothstep(.95, .35, distance(vUv, vec2(.5)));
          c.rgb *= mix(.72, 1., v);                                // vignette
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

  /* ---------- Camera choreography ---------- */
  const orbit = { angle: 0.6 };
  function orbitPose(t) {
    const a = orbit.angle + (reducedMotion ? 0 : t * 0.05);
    const d = RADIUS * 3.1;
    const pos = new THREE.Vector3(Math.sin(a) * d, RADIUS * 1.25, Math.cos(a) * d);
    const m = new THREE.Matrix4().lookAt(pos, new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(0, 1, 0));
    return { pos, quat: new THREE.Quaternion().setFromRotationMatrix(m) };
  }
  function poseLooking(eye, target) {
    const up = eye.clone().normalize();
    const m = new THREE.Matrix4().lookAt(eye, target, up);
    return { pos: eye.clone(), quat: new THREE.Quaternion().setFromRotationMatrix(m) };
  }
  function playerPose() {
    player.applyToCamera();
    return { pos: camera.position.clone(), quat: camera.quaternion.clone() };
  }

  let flight = null;
  /** Swoop the camera to `to` (a pose or a function returning one), travelling around the planet, not through it. */
  function fly(to, ms, then) {
    const target = typeof to === 'function' ? to : () => to;
    if (reducedMotion) {
      const p = target();
      camera.position.copy(p.pos);
      camera.quaternion.copy(p.quat);
      then && then();
      return;
    }
    flight = { start: performance.now(), ms, from: { pos: camera.position.clone(), quat: camera.quaternion.clone() }, target, then };
  }
  const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  const _d0 = new THREE.Vector3(), _d1 = new THREE.Vector3(), _q = new THREE.Quaternion();
  function stepFlight() {
    const k = Math.min(1, (performance.now() - flight.start) / flight.ms);
    const e = ease(k);
    const to = flight.target();
    // slerp the direction from the planet's centre so the path arcs over the surface
    const r0 = flight.from.pos.length(), r1 = to.pos.length();
    _d0.copy(flight.from.pos).normalize();
    _d1.copy(to.pos).normalize();
    _q.setFromUnitVectors(_d0, _d1);
    const dir = _d0.clone().applyQuaternion(new THREE.Quaternion().slerp(_q, e));
    const lift = Math.sin(e * Math.PI) * Math.min(4, _d0.angleTo(_d1) * 6);
    camera.position.copy(dir).multiplyScalar(THREE.MathUtils.lerp(r0, r1, e) + lift);
    camera.quaternion.copy(flight.from.quat).slerp(to.quat, e);
    if (k === 1) { const then = flight.then; flight = null; then && then(); }
  }

  /* ---------- Modes ---------- */
  function lockPointer() {
    if (coarse || TEST) return;
    const req = canvas.requestPointerLock?.({ unadjustedMovement: true });
    if (req && req.catch) req.catch(() => canvas.requestPointerLock?.());
  }
  function unlockPointer() { if (document.pointerLockElement) document.exitPointerLock(); }

  function goWalk({ from } = {}) {
    lockPointer(); // must happen inside the click that called us, not after the flight
    closePanel();
    order.hidden = true;
    bubble.hidden = true;
    if (from === 'seat') {
      // stand up a step back from the stool, facing the bar
      const back = bar.seat.eye.clone().normalize();
      const dirAway = bar.seat.eye.clone().sub(bar.seat.look);
      dirAway.addScaledVector(back, -dirAway.dot(back)).normalize();
      const standDir = bar.seat.eye.clone().addScaledVector(dirAway, 1.1).normalize();
      player.spawn(standDir, bar.seat.look);
    }
    setState('flying');
    fly(playerPose, from === 'seat' ? 700 : 2600, () => {
      setState('walk');
      player.enabled = true;
      canvas.focus({ preventScroll: true });
    });
  }

  let chatter;
  function goSeat() {
    const fromOrbit = state === 'gate' || state === 'loading';
    player.enabled = false;
    input.clear();
    unlockPointer();
    closePanel();
    setState('flying');
    fly(poseLooking(bar.seat.eye, bar.seat.look), fromOrbit ? 2600 : 1200, () => {
      setState('seat');
      order.hidden = false;
      order.querySelector('a').focus({ preventScroll: true });
      say(data.bartender[0]);
      let i = 1;
      clearInterval(chatter);
      chatter = setInterval(() => { if (state === 'seat' && panel.hidden) say(data.bartender[i++ % data.bartender.length]); }, 11000);
    });
  }

  // Ordering from the menu: the robot shakes one up, sets it down, and the panel opens.
  order.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-order]');
    if (!a || state !== 'seat') return;
    const id = a.dataset.order;
    if (!$('panel-' + id)) return; // no panel: let the link work normally
    e.preventDefault();
    bar.serve(id);
    say('Coming right up.', 1400);
    order.hidden = true;
    setTimeout(() => {
      openPanel(id, { fromMenu: true });
      onPanelClose = () => { order.hidden = false; a.focus({ preventScroll: true }); };
    }, reducedMotion ? 0 : 1100);
  });
  $('stand').addEventListener('click', () => goWalk({ from: 'seat' }));

  // Standing interactions (telescope, chalkboard, campfire, rocket, the stool itself)
  let focus = null;
  const promptEl = $('prompt'), promptText = $('prompt-text');
  function nearestInteractable() {
    const fwd = player.forward(new THREE.Vector3());
    const up = player.up;
    let best = null, bestD = Infinity;
    for (const it of interactables) {
      const to = it.point.clone().sub(camera.position);
      const d = player.pos.distanceTo(it.point);
      if (d > it.radius) continue;
      to.addScaledVector(up, -to.dot(up));
      const f = fwd.clone().addScaledVector(up, -fwd.dot(up));
      const facing = to.lengthSq() < 0.5 ? 1 : f.normalize().dot(to.normalize());
      if (facing < 0.35) continue;
      if (d < bestD) { best = it; bestD = d; }
    }
    return best;
  }
  function act() {
    if (state !== 'walk' || !focus) return;
    if (focus.id === 'seat') return goSeat();
    if (focus.id === 'rocket') { location.href = document.querySelector('.hud__brand').href; return; }
    player.enabled = false;
    input.clear();
    unlockPointer();
    setState('reading');
    openPanel(focus.id);
    onPanelClose = () => { setState('walk'); player.enabled = true; lockPointer(); canvas.focus({ preventScroll: true }); };
  }
  promptEl.addEventListener('click', act);

  const input = bindInput(player, canvas, {
    onAction: act,
    onMenu: () => { unlockPointer(); },
    onBar: () => goSeat(),
    joystickEl: $('stick'),
  });

  // Pointer lock lost while walking → pause.
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && state === 'walk' && !coarse) pause();
  });
  function pause() {
    player.enabled = false;
    input.clear();
    setState('paused');
    $('enter-walk').textContent = 'Resume';
    $('enter-walk').focus({ preventScroll: true });
  }
  $('pause-btn').addEventListener('click', () => { if (state === 'walk') { unlockPointer(); pause(); } });
  $('to-bar').addEventListener('click', goSeat);
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!panel.hidden) closePanel();
    else if (state === 'seat') goWalk({ from: 'seat' });
  });

  $('enter-walk').addEventListener('click', () => {
    if (state === 'paused') { setState('walk'); player.enabled = true; lockPointer(); canvas.focus({ preventScroll: true }); return; }
    goWalk();
  });
  $('enter-bar').addEventListener('click', goSeat);

  /* ---------- Loop ---------- */
  const timer = new THREE.Timer();
  let t = 0;
  function frame(now) {
    timer.update(now);
    const dt = Math.min(timer.getDelta(), 0.05);
    t += TEST ? 0 : dt;

    if (state === 'walk' || state === 'reading' || state === 'paused') {
      player.update(dt);
      player.applyToCamera();
    } else if (state === 'seat') {
      const p = poseLooking(bar.seat.eye, bar.seat.look);
      camera.position.copy(p.pos);
      camera.quaternion.copy(p.quat);
      if (!reducedMotion) camera.rotateY(Math.sin(t * 0.3) * 0.02);
    } else if (state === 'gate' || state === 'loading') {
      const p = orbitPose(t);
      camera.position.copy(p.pos);
      camera.quaternion.copy(p.quat);
    }
    if (flight) stepFlight();

    if (state === 'walk') {
      const next = nearestInteractable();
      if (next !== focus) {
        focus = next;
        promptEl.hidden = !focus;
        if (focus) promptText.textContent = focus.prompt;
      }
    } else if (!promptEl.hidden) { promptEl.hidden = true; focus = null; }

    sky.update(t, camera);
    planet.update(t, camera);
    bar.update(t);
    places.update(t);
    composer ? composer.render() : renderer.render(scene, camera);
  }
  renderer.setAnimationLoop(frame);
  document.addEventListener('visibilitychange', () => {
    renderer.setAnimationLoop(document.hidden ? null : frame);
    timer.reset();
  });

  // Ready.
  setProgress(1, 'Cleared for landing.');
  setState('gate');
  $('enter-walk').disabled = false;
  $('enter-bar').disabled = false;
  window.__world = { get state() { return state; }, player, camera, goSeat, goWalk, openPanel, renderer, SPOTS, bar };
  window.__sceneReady = true;

  // Deep links: /#bar sits you down, /#about etc. sits you down and orders it.
  const hash = location.hash.slice(1);
  if (hash === 'bar' || $('panel-' + hash)) {
    goSeat();
    if (hash !== 'bar') {
      const wait = setInterval(() => {
        if (state !== 'seat') return;
        clearInterval(wait);
        order.querySelector(`[data-order="${hash}"]`)?.click();
      }, 100);
    }
  }
}

start().catch((err) => {
  console.error(err);
  fallback(err && err.message);
});
