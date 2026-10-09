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
import { windowVertex, windowFragment } from './doorwindow.js';

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
 * coming in; `onBack()` when you walk into the door back. Resolves with { show() (fades it in
 * over the planet), leave() (fades it out and stops drawing it), ... } once the first frames are
 * drawn.
 */
export async function enter(place, { parent = document.body, progress = () => {}, fadeMs = 600, reduce = false, yaw: turn = 0, pitch: tip = 0, onBack = () => {} } = {}) {
  if (!kept.has(place)) kept.set(place, load(place, parent, progress).catch((e) => { kept.delete(place); throw e; }));
  const view = await kept.get(place);
  progress(1);
  return view.start({ turn, tip, fadeMs, reduce, onBack });
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
  const lite = mesh(await bytes(p.lite, progress), p.lite);
  scene.add(lite);
  bytes(p.splat).then(async (b) => {
    const full = mesh(b, p.splat);
    await full.initialized;
    scene.add(full);
    // a few frames for its first sort, then the light one goes
    let n = 0;
    const swap = () => { if (++n < 12 && alive) requestAnimationFrame(swap); else lite.visible = false; };
    requestAnimationFrame(swap);
  }).catch(() => {}); // no full copy: the light one stays
  const keepOut = p.keepOut.map(([x, z, r]) => ({ c: up(x, p.at[1], z).sub(origin).setY(0), r }));

  // you: a position on the ground and a yaw/pitch
  const pos = new THREE.Vector3();
  const facing = up(p.face[0], p.at[1], p.face[1]).sub(origin);
  const yaw0 = Math.atan2(-facing.x, -facing.z);
  let yaw = yaw0, pitch = 0;
  let goal = null, toDoor = false, onBack = () => {};
  const keys = new Set();

  // the door back, just behind where you come in, its opening toward the pavilion: turn round
  // and there's the planet at night through it (p.back, tools/portal-view.mjs --back). Walk into
  // it (a tap) and you're back on the planet, facing down its trail as you saw through it.
  const ahead = new THREE.Vector3(-Math.sin(yaw0), 0, -Math.cos(yaw0));
  const doorBack = backDoor(p.back, p.sky);
  doorBack.position.copy(ahead).multiplyScalar(-0.9);
  doorBack.rotation.y = yaw0 + Math.PI; // its +z (the side you walk in from) toward the pavilion
  scene.add(doorBack);
  keepOut.push({ c: doorBack.position.clone(), r: 0.75 });
  const doorStep = doorBack.position.clone().addScaledVector(ahead, 0.8); // where you stop, in front of it

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
    if (!down || e.pointerId !== down.id) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    down.moved += Math.abs(dx) + Math.abs(dy);
    down.x = e.clientX; down.y = e.clientY;
    // exactly as on the planet (player.look): drag right and you turn left, drag down and you
    // look up
    const k = e.pointerType === 'mouse' ? LOOK.mouse : LOOK.touch;
    yaw += dx * k;
    pitch = THREE.MathUtils.clamp(pitch + dy * k, -1.2, 1.2);
    goal = null;
    toDoor = false;
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
    if (ray.intersectObject(doorBack, true).length) { goal = allowed(doorStep); toDoor = true; return; }
    const hit = ray.ray.intersectPlane(ground, new THREE.Vector3());
    if (hit && hit.distanceTo(pos) < 30) { goal = allowed(hit); toDoor = false; }
  };
  const onKey = (e) => {
    if (!alive) return;
    const k = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' }[e.code];
    if (!k) return;
    if (e.type === 'keydown') { keys.add(k); goal = null; toDoor = false; } else keys.delete(k);
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', () => { down = null; });
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
    if (keys.size) {
      if (keys.has('f')) step.add(fwd);
      if (keys.has('b')) step.sub(fwd);
      if (keys.has('r')) step.add(side);
      if (keys.has('l')) step.sub(side);
      if (step.lengthSq()) step.setLength(SPEED * dt);
    } else if (goal) {
      const to = goal.clone().sub(pos);
      const d = to.length();
      if (d < 0.05) { goal = null; if (toDoor) { toDoor = false; onBack(); } }
      else step.copy(to).setLength(Math.min(d, SPEED * dt * Math.min(1, d / 0.8 + 0.3)));
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
  let fadeMs = 600, reduce = false;
  const fade = (to) => new Promise((r) => {
    canvas.style.transition = `opacity ${reduce ? 0 : fadeMs}ms ease`;
    canvas.style.opacity = to;
    setTimeout(r, reduce ? 0 : fadeMs);
  });

  const view = {
    canvas,
    /** From where you come in, drawing again (unseen until show()); resolves after a few frames. */
    async start(o) {
      ({ fadeMs, reduce, onBack } = o);
      toDoor = false;
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
      // a few frames for the sort before it shows
      await new Promise((r) => { let n = 0; const tick = () => (++n > 12 ? r() : requestAnimationFrame(tick)); requestAnimationFrame(tick); });
      return view;
    },
    show() { canvas.classList.add('is-on'); canvas.focus({ preventScroll: true }); return fade(1); },
    get position() { return pos.clone(); },
    get yaw() { return yaw; },
    get pitch() { return pitch; },
    get startYaw() { return yaw0; },
    /** Turn by (dyaw, dpitch) radians, as a drag would. */
    look(dyaw, dpitch = 0) { yaw += dyaw; pitch = THREE.MathUtils.clamp(pitch + dpitch, -1.2, 1.2); },
    /** Walk into the door back, as a tap on it would. */
    toDoorBack() { goal = allowed(doorStep); toDoor = true; },
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
      if (size || fov) { camera.fov = 68; renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); fit(); }
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
      await fade(0);
      if (!alive) canvas.style.display = 'none'; // not even composited while you're away
    },
  };
  return view;
}

// The door back: a plain wooden frame (this side of it is the place's, not the planet's tikis)
// with the planet in its opening, the same window as the planet's door (doorwindow.js), from its
// step looking back down the trail. Faces +z; base at y = 0.
function backDoor(url, sky) {
  const g = new THREE.Group();
  const OW = 1.0, OH = 2.1, STEP = 0.14, EYE_AT_SILL = 0.16;
  const wood = new THREE.MeshBasicMaterial({ color: 0x4a2f1d }), dark = new THREE.MeshBasicMaterial({ color: 0x2c1b10 });
  const box = (w, h, d, m, x, y, z, rz = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.rotation.z = rz; g.add(b); return b; };
  box(1.5, STEP, 0.7, dark, 0, STEP / 2, 0.05); // the step
  for (const x of [-1, 1]) {
    box(0.22, 2.55, 0.24, wood, x * (OW / 2 + 0.11), STEP + 1.275, 0); // posts
    box(0.32, 0.12, 0.26, wood, x * 1.0, STEP + 2.75, 0, x * 0.55); // the lintel's swept-up ends
  }
  box(1.9, 0.2, 0.3, wood, 0, STEP + 2.65, 0); // the lintel
  box(OW + 0.14, 0.08, 0.2, dark, 0, STEP + OH + 0.04, 0);
  const uniforms = { view: { value: null }, ready: { value: 0 }, sky: { value: new THREE.Color(0x1a1530) }, brightness: { value: 1 }, far: { value: 9 }, centre: { value: new THREE.Vector3(0, EYE - STEP - OH / 2, EYE_AT_SILL) } };
  const opening = new THREE.Mesh(new THREE.PlaneGeometry(OW, OH), new THREE.ShaderMaterial({ uniforms, vertexShader: windowVertex, fragmentShader: windowFragment }));
  opening.position.set(0, STEP + OH / 2, 0);
  g.add(opening);
  new THREE.TextureLoader().load(url, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    uniforms.view.value = tex;
    uniforms.ready.value = 1;
  });
  return g;
}
