// Through the door: a real place, as a Gaussian splat. Its own bundle (dist/portal.js, Spark and a
// three.js of its own; tools/build-js.mjs), loaded by URL only when someone steps through, and its
// own canvas over the planet's, so the planet's post-processing never touches the splats and the
// planet's bundle stays one request. main.js does the rest: the door, the fade, the way back.
//
// Drag to look, tap the ground to walk there (a few steps from where you came in, never into
// the building); WASD and the arrows are extras. Nothing here runs until enter() is called.
import * as THREE from 'three';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
import { REAL_PLACES } from './realplaces.js';

const EYE = 1.6;
const LOOK = { mouse: 0.004, touch: 0.005 }; // radians per pixel dragged, as on the planet
const SPEED = 1.4; // m/s, an unhurried walk

/**
 * Get `place` ready: loads it and draws it, unseen. `progress(0..1)` while it loads; `yaw` and
 * `pitch` (radians) turn you from the way you face coming in. Resolves with { show() (fades it in
 * over the planet), leave() (fades it out, then frees everything), ... } once the first frames are
 * drawn.
 */
export async function enter(place, { parent = document.body, progress = () => {}, fadeMs = 600, reduce = false, yaw: turn = 0, pitch: tip = 0 } = {}) {
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
  // in is the origin, at ground level
  const splat = new SplatMesh({ url: p.splat, onProgress: (e) => e.total && progress(e.loaded / e.total) });
  splat.quaternion.set(1, 0, 0, 0);
  const up = (x, y, z) => new THREE.Vector3(x, -y, -z); // a scan point, upright
  const origin = up(...p.at);
  splat.position.copy(origin).negate();
  scene.add(splat);
  const keepOut = p.keepOut.map(([x, z, r]) => ({ c: up(x, p.at[1], z).sub(origin).setY(0), r }));

  // you: a position on the ground and a yaw/pitch
  const pos = new THREE.Vector3();
  const facing = up(p.face[0], p.at[1], p.face[1]).sub(origin);
  const yaw0 = Math.atan2(-facing.x, -facing.z);
  let yaw = yaw0 + turn, pitch = tip;
  let goal = null;
  const keys = new Set();

  function fit() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  fit();
  addEventListener('resize', fit);

  // drag to look; a tap (barely moved) walks to the ground under it
  let down = null;
  const onDown = (e) => { down = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId }; canvas.setPointerCapture(e.pointerId); };
  const onMove = (e) => {
    if (!down || e.pointerId !== down.id) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    down.moved += Math.abs(dx) + Math.abs(dy);
    down.x = e.clientX; down.y = e.clientY;
    // drag the world, as on the planet: right turns you left, down tips you up
    const k = e.pointerType === 'mouse' ? LOOK.mouse : LOOK.touch;
    yaw += dx * k;
    pitch = THREE.MathUtils.clamp(pitch - dy * k, -1.2, 1.2);
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
    const hit = ray.ray.intersectPlane(ground, new THREE.Vector3());
    if (hit && hit.distanceTo(pos) < 30) goal = allowed(hit);
  };
  const onKey = (e) => {
    const k = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' }[e.code];
    if (!k) return;
    if (e.type === 'keydown') { keys.add(k); goal = null; } else keys.delete(k);
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

  let last = performance.now(), raf = 0, alive = true;
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
      if (d < 0.05) goal = null;
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

  await splat.initialized;
  progress(1);
  raf = requestAnimationFrame(frame);
  // a few frames for the first sort before it shows
  await new Promise((r) => { let n = 0; const tick = () => (++n > 12 ? r() : requestAnimationFrame(tick)); requestAnimationFrame(tick); });
  const fade = (to) => new Promise((r) => {
    canvas.style.transition = `opacity ${reduce ? 0 : fadeMs}ms ease`;
    canvas.style.opacity = to;
    setTimeout(r, reduce ? 0 : fadeMs);
  });

  return {
    canvas,
    show() { canvas.classList.add('is-on'); canvas.focus({ preventScroll: true }); return fade(1); },
    get position() { return pos.clone(); },
    get yaw() { return yaw; },
    get startYaw() { return yaw0; },
    /** Turn by (dyaw, dpitch) radians, as a drag would. */
    look(dyaw, dpitch = 0) { yaw += dyaw; pitch = THREE.MathUtils.clamp(pitch + dpitch, -1.2, 1.2); },
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
    async leave() {
      canvas.classList.remove('is-on');
      alive = false; // the last frame fades; nothing more is drawn
      cancelAnimationFrame(raf);
      await fade(0);
      removeEventListener('resize', fit);
      removeEventListener('keydown', onKey);
      removeEventListener('keyup', onKey);
      splat.dispose();
      spark.dispose(); // its sort worker too, before the context goes
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
