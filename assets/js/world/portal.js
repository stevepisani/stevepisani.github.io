// Through the door: a real place, as a Gaussian splat. Its own bundle (dist/portal.js, Spark and a
// three.js of its own; tools/build-js.mjs), loaded by URL only when someone steps through, and its
// own canvas over the planet's, so the planet's post-processing never touches the splats and the
// planet's bundle stays one request. main.js does the rest: the door, the fade, the way back.
//
// Drag to look, tap the ground to walk there (a few steps from where you came in, never into
// the building); WASD and the arrows are extras. Nothing here runs until enter() is called.
//
// A place, once loaded, is kept: stepping back out fades it and stops drawing it, and stepping
// in again starts it from where you come in, at once. Never freed: Spark's sorting and reads
// run on after the last frame, and freeing what they use under them throws on the page (and
// the browser collecting a 1.2-million-splat context stalls the planet for seconds).
//
// Loading fast: main.js calls prefetch() as you near the door, which fetches the place's light copy
// (2 MB) and then the full splat (14 MB) in the background. Stepping in shows the light copy as
// soon as it's here, and the full one replaces it when it's ready, so you're never waiting on 14 MB.
const kept = new Map(); // place → its view, once loaded
const fetched = new Map(); // url → Promise<Uint8Array>
import * as THREE from 'three';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
import { REAL_PLACES } from './realplaces.js';
import { doorway } from './props.js';

const EYE = 1.6;
const LOOK = { mouse: 0.004, touch: 0.005 }; // radians per pixel dragged, as on the planet
const SPEED = 1.4; // m/s, an unhurried walk

/** Fetch a file once (reporting `progress(0..1)` while it comes in); later asks get the same bytes. */
function bytes(url, progress = () => {}) {
  if (!fetched.has(url)) {
    fetched.set(url, (async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url}: ${res.status}`);
      const total = +res.headers.get('content-length') || 0, parts = [];
      let got = 0;
      for (const reader = res.body.getReader(); ;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
        got += value.length;
        if (total) progress(got / total);
      }
      const all = new Uint8Array(got);
      parts.reduce((at, part) => (all.set(part, at), at + part.length), 0);
      return all;
    })().catch((e) => { fetched.delete(url); throw e; }));
  }
  return fetched.get(url);
}

/** Start fetching `place` (the light copy, then the full splat) before anyone steps in. */
export function prefetch(place) {
  const p = REAL_PLACES[place];
  bytes(p.lite).then(() => bytes(p.splat)).catch(() => {});
}

/**
 * Get `place` ready: loads it (the first time) and draws it, unseen, from where you come in.
 * `progress(0..1)` while it loads; `yaw` and `pitch` (radians) turn you from the way you face
 * coming in; `fov` (degrees) is the planet's, so nothing jumps as it fades in; `onBack()` when you walk into the door back. Resolves with { show() (fades it in
 * over the planet), leave() (fades it out and stops drawing it), ... } once the first frames are
 * drawn.
 */
export async function enter(place, { parent = document.body, progress = () => {}, fadeMs = 600, reduce = false, yaw: turn = 0, pitch: tip = 0, fov = 68, onBack = () => {} } = {}) {
  if (!kept.has(place)) kept.set(place, load(place, parent, progress).catch((e) => { kept.delete(place); throw e; }));
  const view = await kept.get(place);
  progress(1);
  return view.start({ turn, tip, fadeMs, reduce, fov, onBack });
}

async function load(place, parent, progress) {
  const p = REAL_PLACES[place];
  const canvas = document.createElement('canvas');
  canvas.className = 'portal-view';
  canvas.tabIndex = -1;
  canvas.setAttribute('aria-label', 'A real place: drag to look around, tap the ground to walk');
  parent.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setClearColor(p.sky);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(68, 1, 0.05, 200);
  const spark = new SparkRenderer({ renderer });
  scene.add(spark);
  // the sky, round you wherever you walk: blue overhead, a pale haze at the horizon, and below
  // it a far lawn going into the haze, so where the scan ends reads as distance, not an edge
  {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 256;
    const g = c.getContext('2d'), hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
    const grad = g.createLinearGradient(0, 0, 0, 256); // top of the canvas is straight up
    grad.addColorStop(0, hex(p.zenith));
    grad.addColorStop(0.25, hex(p.zenith));
    grad.addColorStop(0.47, hex(p.sky));
    grad.addColorStop(0.5, hex(p.sky));
    grad.addColorStop(0.53, hex(p.lawn));
    grad.addColorStop(1, hex(p.lawn));
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = tex;
  }
  // daylight for the door back (the splats carry their own light)
  scene.add(new THREE.HemisphereLight(0xe4edf4, 0x7a7461, 1.4));
  const sun = new THREE.DirectionalLight(0xfff2de, 2.2);
  sun.position.set(4, 10, 6);
  scene.add(sun);

  // the scan, turned upright (y down → y up: half a turn about x) and moved so where you come
  // in is the origin, at ground level: the light copy first, the full one when it's in (it takes
  // the light one's place; that one is hidden, not freed: see the top)
  const up = (x, y, z) => new THREE.Vector3(x, -y, -z); // a scan point, upright
  const origin = up(...p.at);
  const mesh = (fileBytes, url) => {
    const m = new SplatMesh({ fileBytes, fileName: url });
    m.quaternion.set(1, 0, 0, 0);
    m.position.copy(origin).negate();
    return m;
  };
  let complete = false; // the full copy's showing
  const lite = mesh(await bytes(p.lite, progress), p.lite);
  scene.add(lite);
  bytes(p.splat).then(async (b) => {
    const full = mesh(b, p.splat);
    await full.initialized;
    full.opacity = 0.02; // all but unseen (not 0: Spark leaves out splats that can't be seen, and they'd never be sorted in)
    scene.add(full);
    // once Spark's sorted it in, it comes up over the light one (half a second), which goes
    const liteN = (lite.packedSplats && lite.packedSplats.numSplats) || 0, until = performance.now() + 8000;
    let t0 = 0;
    const swap = (now) => {
      if (!t0 && (spark.activeSplats > liteN || now > until)) t0 = now;
      if (t0) full.opacity = Math.max(0.02, Math.min(1, (now - t0) / 500));
      if (full.opacity < 1) requestAnimationFrame(swap); else { lite.visible = false; complete = true; }
    };
    requestAnimationFrame(swap);
  }).catch(() => {}); // no full copy: the light one stays
  const keepOut = p.keepOut.map(([x, z, r]) => ({ c: up(x, p.at[1], z).sub(origin).setY(0), r }));

  // you: a position on the ground and a yaw/pitch
  const pos = new THREE.Vector3();
  const facing = up(p.face[0], p.at[1], p.face[1]).sub(origin);
  const yaw0 = Math.atan2(-facing.x, -facing.z);
  let yaw = yaw0, pitch = 0;
  let goal = null, going = null, onBack = () => {}; // going: on your way out through the door back
  const keys = new Set();

  // the door back: the planet's own tiki door (props.js), lit by daylight, just behind where you
  // come in, its opening toward the pavilion. Turn round and there's the planet at night through
  // it (p.back, tools/portal-view.mjs --back). Tap it and you walk to it, turn square and go on
  // into the opening until it fills the view; then you're back on the planet, facing down its
  // trail as you saw through it.
  const ahead = new THREE.Vector3(-Math.sin(yaw0), 0, -Math.cos(yaw0));
  const back = doorway({ sky: 0x1a1530, eye: EYE, brightness: 1, spill: false });
  new THREE.TextureLoader().load(p.back, (tex) => { tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping; back.setView(tex); });
  const doorBack = back.group;
  doorBack.position.copy(ahead).multiplyScalar(-1.2);
  doorBack.rotation.y = yaw0 + Math.PI; // its +z (the side you walk in from) toward the pavilion
  scene.add(doorBack);
  keepOut.push({ c: doorBack.position.clone(), r: 0.75 });
  const doorStep = doorBack.position.clone().addScaledVector(ahead, 0.8); // in front of it
  const doorSill = doorBack.position.clone().addScaledVector(ahead, 0.16); // your eye just short of the opening, as on the planet
  const yawIn = yaw0 + Math.PI; // facing it
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  // Out through it: one move on the clock (not by frames), like the planet's flyPath: you walk to
  // its step turning square to it, then on into the opening until it fills the view, speeding up
  // over the first quarter, steady, slowing over the last; then onBack().
  function toDoorBack() {
    if (going) return;
    const d1 = pos.distanceTo(doorStep), d2 = doorStep.distanceTo(doorSill);
    // long enough to walk it unhurried, and to turn square (by the step) no faster than about
    // 100°/s on average, so the turn peaks near the planet's 140°/s
    const turnShare = Math.max(d1, 0.3) / (d1 + d2), turn = Math.abs(wrap(yawIn - yaw)) + Math.abs(pitch);
    going = { t0: performance.now(), from: pos.clone(), yaw, pitch, d1, d2, ms: reduce ? 0 : Math.max(1400, ((d1 + d2) / SPEED) * 1300, (turn / 1.75 / turnShare) * 1000) };
    goal = null;
    keys.clear();
  }
  function goOut(now) {
    const g = going, k = g.ms ? Math.min(1, (now - g.t0) / g.ms) : 1, A = 0.25;
    const e = k < A ? (k * k) / (2 * A * (1 - A)) : k < 1 - A ? (k - A / 2) / (1 - A) : 1 - ((1 - k) * (1 - k)) / (2 * A * (1 - A));
    const along = e * (g.d1 + g.d2);
    if (along < g.d1) pos.copy(allowed(g.from.clone().lerp(doorStep, g.d1 ? along / g.d1 : 1)));
    else pos.copy(doorStep).lerp(doorSill, (along - g.d1) / g.d2);
    const turn = Math.min(1, e * (g.d1 + g.d2) / Math.max(g.d1, 0.3)); // square to it by the step
    yaw = g.yaw + wrap(yawIn - g.yaw) * turn;
    pitch = g.pitch * (1 - turn);
    if (k >= 1) { going = null; onBack(); }
  }

  // the planet's markers: a faint ring where the pointer would take you, and one where you
  // tapped, spreading as it fades (drawn over the splats, which keep no depth)
  const ring = (color) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.38, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    m.renderOrder = 10;
    m.position.y = 0.03;
    scene.add(m);
    return m;
  };
  const hoverRing = ring(0xffffff), destRing = ring(0x3ff5e8);
  let destT = -1;
  const showDest = (v) => { destRing.position.set(v.x, 0.03, v.z); destT = 0; };

  function fit() {
    if (!alive) return;
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', fit);

  // drag to look; a tap (barely moved) walks to the ground under it
  let down = null;
  const onDown = (e) => { down = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId }; canvas.setPointerCapture(e.pointerId); };
  const onMove = (e) => {
    if (!down) { hover(e); return; }
    if (e.pointerId !== down.id) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    down.moved += Math.abs(dx) + Math.abs(dy);
    down.x = e.clientX; down.y = e.clientY;
    if (going) return; // going through: it has you
    // exactly as on the planet (player.look): drag right and you turn left, drag down and you
    // look up
    const k = e.pointerType === 'mouse' ? LOOK.mouse : LOOK.touch;
    yaw += dx * k;
    pitch = THREE.MathUtils.clamp(pitch + dy * k, -1.2, 1.2);
    goal = null;
  };
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const onUp = (e) => {
    if (!down || e.pointerId !== down.id) return;
    const tap = down.moved < 8;
    down = null;
    if (!tap) return;
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    // the door back: walk to it, then through
    if (ray.intersectObject(doorBack, true).length) { toDoorBack(); hoverRing.material.opacity = 0; return; }
    const hit = ray.ray.intersectPlane(ground, new THREE.Vector3());
    if (hit && hit.distanceTo(pos) < 30 && !going) { goal = allowed(hit); showDest(goal); }
  };
  // a mouse over the place: the door back is a thing to use; the ground, somewhere to go
  function hover(e) {
    if (e.pointerType !== 'mouse' || going) return;
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const onDoor = ray.intersectObject(doorBack, true).length > 0;
    const hit = !onDoor && ray.ray.intersectPlane(ground, new THREE.Vector3());
    const go = hit && hit.distanceTo(pos) < 30;
    canvas.style.cursor = onDoor || go ? 'pointer' : '';
    if (go) { const at = allowed(hit); hoverRing.position.set(at.x, 0.03, at.z); }
    hoverRing.material.opacity = go ? 0.35 : 0;
  }
  const onKey = (e) => {
    if (!alive) return;
    const k = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' }[e.code];
    if (!k) return;
    if (e.type === 'keydown') { if (!going) { keys.add(k); goal = null; } } else keys.delete(k);
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', () => { down = null; });
  canvas.addEventListener('pointerleave', () => { hoverRing.material.opacity = 0; });
  addEventListener('keydown', onKey);
  addEventListener('keyup', onKey);

  // keep within reach of where you came in, and out of the building
  function allowed(v) {
    v = v.clone().setY(0);
    if (v.length() > p.roam) v.setLength(p.roam);
    for (const k of keepOut) {
      const d = v.clone().sub(k.c);
      if (d.length() < k.r) v.copy(k.c).add(d.setLength(k.r));
    }
    return v;
  }

  let last = performance.now(), raf = 0, alive = false;
  const fwd = new THREE.Vector3(), side = new THREE.Vector3();
  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    side.set(Math.cos(yaw), 0, -Math.sin(yaw));
    const step = new THREE.Vector3();
    if (going) goOut(now);
    else if (keys.size) {
      if (keys.has('f')) step.add(fwd);
      if (keys.has('b')) step.sub(fwd);
      if (keys.has('r')) step.add(side);
      if (keys.has('l')) step.sub(side);
      if (step.lengthSq()) step.setLength(SPEED * dt);
    } else if (goal) {
      const to = goal.clone().sub(pos);
      const d = to.length();
      if (d < 0.05) goal = null;
      else step.copy(to).setLength(Math.min(d, SPEED * dt * Math.min(1, d / 0.8 + 0.3)));
    }
    if (destT >= 0) {
      destT += dt;
      const k = destT / 0.9;
      destRing.scale.setScalar(0.6 + Math.min(1, k) * 0.5);
      destRing.material.opacity = Math.max(0, 0.9 * (1 - k));
      if (k >= 1) destT = -1;
    }
    if (step.lengthSq()) pos.copy(allowed(pos.clone().add(step)));
    pose();
    renderer.render(scene, camera);
  }
  function pose() {
    camera.position.set(pos.x, EYE, pos.z);
    camera.rotation.set(0, 0, 0);
    camera.rotateY(yaw);
    camera.rotateX(pitch);
  }

  await lite.initialized;
  let fadeMs = 600, reduce = false, baseFov = 68;
  const fade = (to) => new Promise((r) => {
    canvas.style.transition = `opacity ${reduce ? 0 : fadeMs}ms ease`;
    canvas.style.opacity = to;
    setTimeout(r, reduce ? 0 : fadeMs);
  });

  const view = {
    canvas,
    /** From where you come in, drawing again (unseen until show()); resolves once the splats are sorted and drawn. */
    async start(o) {
      ({ fadeMs, reduce, onBack } = o);
      camera.fov = baseFov = o.fov; // the planet's, so the view doesn't jump as it fades in
      going = null;
      pos.set(0, 0, 0);
      yaw = yaw0 + o.turn;
      pitch = o.tip;
      goal = null;
      keys.clear();
      alive = true;
      canvas.style.display = '';
      fit();
      last = performance.now();
      raf = requestAnimationFrame(frame);
      // until Spark has sorted the splats and they're drawn (or a few seconds: never stuck at the step), and a frame more
      await new Promise((r) => {
        const until = performance.now() + 6000;
        let n = 0, after = 0;
        const tick = () => {
          n++;
          if (spark.orderingTexture && spark.activeSplats > 0 && n > 3) after++;
          if (after > 2 || performance.now() > until) r(); else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      return view;
    },
    show() { canvas.classList.add('is-on'); canvas.focus({ preventScroll: true }); return fade(1); },
    get position() { return pos.clone(); },
    /** The full copy's in and showing (until then, the light one). */
    get complete() { return complete; },
    get yaw() { return yaw; },
    get pitch() { return pitch; },
    get startYaw() { return yaw0; },
    /** Turn by (dyaw, dpitch) radians, as a drag would. */
    look(dyaw, dpitch = 0) { yaw += dyaw; pitch = THREE.MathUtils.clamp(pitch + dpitch, -1.2, 1.2); },
    /** Walk into the door back, as a tap on it would. */
    toDoorBack,
    /** Walk toward a point on the ground ([x, z] metres from where you came in), as a tap would. */
    walkTo(x, z) { goal = allowed(new THREE.Vector3(x, 0, z)); },
    /**
     * The view as a PNG data URL, for tests and for tools/portal-view.mjs (the door's panorama):
     * pauses the loop, gives the sort a few frames. `size` and `fov` render a square view instead.
     */
    async snapshot({ frames = 4, size = 0, fov = 0, dir = null } = {}) {
      cancelAnimationFrame(raf);
      const was = [yaw, pitch];
      if (dir) [yaw, pitch] = dir; // absolute, unclamped (straight up and down for the panorama)
      if (size) { renderer.setPixelRatio(1); renderer.setSize(size, size, false); camera.aspect = 1; }
      if (fov) camera.fov = fov;
      camera.updateProjectionMatrix();
      pose();
      for (let i = 0; i < frames; i++) { renderer.render(scene, camera); await new Promise((r) => setTimeout(r, 400)); }
      renderer.render(scene, camera);
      const url = canvas.toDataURL('image/png');
      if (dir) [yaw, pitch] = was;
      if (size || fov) { camera.fov = baseFov; renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); fit(); }
      if (alive) raf = requestAnimationFrame(frame);
      return url;
    },
    /** Fades it out and stops drawing it; it's kept for next time (see the top). */
    async leave() {
      canvas.classList.remove('is-on');
      alive = false; // the last frame fades; nothing more is drawn
      cancelAnimationFrame(raf);
      keys.clear();
      down = null;
      hoverRing.material.opacity = 0;
      await fade(0);
      if (!alive) canvas.style.display = 'none'; // not even composited while you're away
    },
  };
  return view;
}
