// A message in a bottle, written by you and thrown into space. Everything happens in your hands
// (camera space, so the camera never moves for it): you pick a bottle up, pull the cork, tip it
// and slide the letter out; it unrolls into a sheet of paper you write on (the page's
// `#note` form sits exactly over it); then it rolls back up with your words on it, goes back
// in, the cork goes back, and you throw it. It arcs out over the lagoon, and then the planet
// lets go of it and it drifts away into space, tumbling, until it's gone among the stars.
// Each stage is a timed step with an enter and a finish, so reduced motion (and `skip`)
// lands straight on the end of each.
import * as THREE from 'three';
import { RADIUS } from './planet.js';
import { messageBottle } from './props.js';

const W = 0.2, H = 0.26;                  // the letter, unrolled (metres)
const ROLL = 0.011;                       // its radius, rolled
const SEGS = 96;
const HAND = new THREE.Vector3(0.07, -0.24, -0.5);
const SCRIPT = '"Caveat", "Segoe Print", "Bradley Hand", cursive';
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

// The paper: parchment with faint ruled lines, and (once written) the message in ink.
function paintPaper(canvas, text = '', signed = '') {
  const g = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
  g.fillStyle = '#eadcbc';
  g.fillRect(0, 0, w, h);
  let s = 7;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 900; i++) { // fibres and foxing
    g.fillStyle = `rgba(${rand() < 0.5 ? '120,90,50' : '255,250,235'},${0.04 + rand() * 0.06})`;
    g.fillRect(rand() * w, rand() * h, 1 + rand() * 3, 1 + rand() * 2);
  }
  const edge = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.75);
  edge.addColorStop(0, 'rgba(90,60,30,0)');
  edge.addColorStop(1, 'rgba(90,60,30,0.35)');
  g.fillStyle = edge;
  g.fillRect(0, 0, w, h);
  const top = h * 0.12, gap = h * 0.085, left = w * 0.1, right = w * 0.9;
  g.strokeStyle = 'rgba(110,80,45,0.22)';
  g.lineWidth = 2;
  for (let y = top + gap; y < h * 0.9; y += gap) { g.beginPath(); g.moveTo(left, y); g.lineTo(right, y); g.stroke(); }
  if (!text) return;
  g.fillStyle = '#2b1d12';
  g.font = `500 ${Math.round(gap * 0.78)}px ${SCRIPT}`;
  g.textBaseline = 'alphabetic';
  let y = top + gap - gap * 0.18;
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const t = line ? `${line} ${word}` : word;
      if (g.measureText(t).width > right - left && line) { g.fillText(line, left, y); y += gap; line = word; }
      else line = t;
    }
    g.fillText(line, left, y);
    y += gap;
  }
  if (signed) { g.textAlign = 'right'; g.fillText(`– ${signed}`, right, Math.min(y + gap * 0.3, h * 0.92)); g.textAlign = 'left'; }
}

// The letter as a sheet that rolls up from the bottom: `u` is how much is unrolled (0 to 1).
// The unrolled part hangs flat from the top edge; the rest winds round a roll that bulges
// toward you, a little tighter each turn so the layers never touch.
function letterMesh() {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = Math.round(512 * H / W);
  paintPaper(canvas);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const geo = new THREE.PlaneGeometry(W, H, 1, SEGS);
  const flat = geo.attributes.position.array.slice();
  // Held close, it's out of reach of the lanterns: it glows a little of its own (as if held up
  // to the moonlight), enough to write on.
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.62, roughness: 0.9, side: THREE.DoubleSide }));
  const set = (u) => {
    const p = geo.attributes.position.array, L = u * H;
    for (let i = 0; i < p.length; i += 3) {
      const d = H / 2 - flat[i + 1]; // distance from the top edge
      if (d <= L) { p[i + 1] = H / 2 - d; p[i + 2] = 0; continue; }
      const sArc = d - L;
      const r = Math.max(ROLL * 0.35, ROLL * (1 - 0.09 * sArc / (2 * Math.PI * ROLL)));
      const th = sArc / r;
      p[i + 1] = H / 2 - L - r * Math.sin(th);
      p[i + 2] = ROLL - r * Math.cos(th);
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    mesh.position.y = -(H / 2) * (1 - u); // keep the roll centred while it's rolled
  };
  set(0);
  return { mesh, set, repaint(text, signed) { paintPaper(canvas, text, signed); map.needsUpdate = true; } };
}

export function createNoteRitual({ camera, scene, reducedMotion, sound = { play() {} } }) {
  const hands = new THREE.Group(); // everything you hold, in camera space
  hands.visible = false;
  camera.add(hands);
  let bottle = null, letter = null, holder = null;
  let job = null; // { steps, i, t0, done }
  const flying = [];

  function run(steps, done) {
    job = { steps, i: -1, t0: 0, done };
    next();
  }
  function next() {
    const j = job;
    j.i++;
    if (j.i >= j.steps.length) { job = null; j.done && j.done(); return; }
    const s = j.steps[j.i];
    s.enter && s.enter();
    j.t0 = performance.now();
    if (reducedMotion || !s.ms) { s.at && s.at(1); next(); }
  }
  // tween helpers, all in camera space
  const lerpTo = (obj, pos, rot, from = { p: obj.position.clone(), r: obj.quaternion.clone() }) => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot));
    return (k) => { obj.position.lerpVectors(from.p, pos, k); obj.quaternion.slerpQuaternions(from.r, q, k); };
  };
  let pending = null;
  const step = (ms, make) => ({ ms, enter() { pending = make(); }, at: (k) => pending && pending(k) });

  // Where the letter sits to be written on: as large as fits, centred a little high.
  function writingSpot() {
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const d = Math.max(H / (0.6 * 2 * t), W / (0.82 * 2 * t * camera.aspect));
    return new THREE.Vector3(0, 0.05 * d, -d);
  }

  return {
    get busy() { return !!job; },
    get stage() { return job ? job.i : -1; }, // for tests
    get flying() { return flying.length > 0; },
    get letter() { return letter && letter.mesh; },
    /** Pick one up, uncork it, slide the letter out and unroll it. */
    open(done) {
      bottle = messageBottle();
      bottle.userData.letter.visible = false; // the real letter replaces the stand-in
      letter = letterMesh();
      holder = new THREE.Group(); // the letter's frame inside the bottle: rolled axis along the bottle
      holder.add(letter.mesh);
      holder.position.set(0, 0.1, 0);
      holder.rotation.z = Math.PI / 2;
      holder.scale.setScalar(0.5);
      bottle.add(holder);
      bottle.position.set(0.05, -0.5, -0.5);
      bottle.rotation.set(0.5, 0, 0.2);
      hands.add(bottle);
      hands.visible = true;
      const cork = bottle.userData.cork;
      run([
        step(700, () => lerpTo(bottle, HAND, [0.15, 0, -0.05])),                                   // up into your hands
        step(420, () => { const y0 = cork.position.y; return (k) => { cork.position.y = y0 + 0.05 * k; cork.rotation.y = k * 4; }; }),
        { ms: 0, enter() { sound.play('clack'); } },                                                // pop
        step(320, () => { const p0 = cork.position.clone(); return (k) => { cork.position.set(p0.x + 0.09 * k, p0.y + 0.03 * Math.sin(k * Math.PI), p0.z); if (k === 1) cork.visible = false; }; }),
        step(600, () => lerpTo(bottle, new THREE.Vector3(-0.02, -0.12, -0.42), [0, 0, -1.25])),    // tip it
        step(650, () => (k) => { holder.position.y = 0.1 + 0.32 * k; }),                            // slide it out of the neck
        { ms: 0, enter() { // let go of the bottle's frame: the letter is in your hand now
          holder.updateMatrixWorld(true);
          hands.attach(holder);
        } },
        step(800, () => {
          const to = writingSpot();
          const b = lerpTo(bottle, new THREE.Vector3(0.26, -0.42, -0.5), [0.3, 0, -0.4]);          // set the bottle down
          const from = { p: holder.position.clone(), r: holder.quaternion.clone(), s: holder.scale.x };
          const q = new THREE.Quaternion();
          return (k) => {
            b(k);
            holder.position.lerpVectors(from.p, to, k);
            holder.quaternion.slerpQuaternions(from.r, q, k);
            holder.scale.setScalar(from.s + (1 - from.s) * k);
          };
        }),
        step(1100, () => (k) => letter.set(ease(k))),                                             // it unrolls
      ], done);
    },
    /** Where the letter is on screen (CSS px), for the writing surface to sit on. */
    rect() {
      if (!letter) return null;
      camera.updateMatrixWorld(true); // mid-frame: bring the camera and everything in your hands up to date
      const pts = [[-W / 2, H / 2], [W / 2, H / 2], [W / 2, -H / 2], [-W / 2, -H / 2]].map(([x, y]) => new THREE.Vector3(x, y, 0).applyMatrix4(letter.mesh.matrixWorld).project(camera));
      const xs = pts.map((p) => (p.x + 1) / 2), ys = pts.map((p) => (1 - p.y) / 2);
      return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
    },
    /** Put what they wrote on the paper, roll it back up and put it back in, cork and all. */
    close(text, signed, done) {
      letter.repaint(text, signed);
      const cork = bottle.userData.cork;
      run([
        step(1000, () => (k) => letter.set(1 - ease(k))),                                          // roll it up
        step(700, () => {
          bottle.updateMatrixWorld(true);
          const mouth = new THREE.Vector3(0, 0.42, 0);
          const b = lerpTo(bottle, new THREE.Vector3(-0.02, -0.12, -0.42), [0, 0, -1.25]);         // pick the bottle back up
          const from = { p: holder.position.clone(), r: holder.quaternion.clone(), s: holder.scale.x };
          return (k) => {
            b(k);
            bottle.updateMatrixWorld(true);
            const to = mouth.clone().applyMatrix4(bottle.matrix);
            const q = bottle.quaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2));
            holder.position.lerpVectors(from.p, to, k);
            holder.quaternion.slerpQuaternions(from.r, q, k);
            holder.scale.setScalar(from.s + (0.5 - from.s) * k);
          };
        }),
        { ms: 0, enter() { bottle.attach(holder); } },
        step(600, () => (k) => { holder.position.y = 0.42 - 0.32 * k; }),                          // in it goes
        step(550, () => lerpTo(bottle, HAND, [0.15, 0, -0.05])),                                  // upright
        { ms: 0, enter() { cork.visible = true; cork.position.set(0.09, 0.3, 0); cork.rotation.y = 0; } },
        step(420, () => (k) => { cork.position.set(0.09 * (1 - k), 0.3 - 0.035 * k, 0); cork.rotation.y = -4 * k; }),
        { ms: 0, enter() { sound.play('clack'); } },
      ], done);
    },
    /** Put it all back without writing (or after a failed send). */
    putBack() {
      job = null;
      hands.remove(bottle);
      if (holder && holder.parent) holder.parent.remove(holder);
      hands.visible = false;
      bottle = letter = holder = null;
    },
    /** Throw it: an arc out over the lagoon, then it drifts away into space. */
    throwIt() {
      if (!bottle) return;
      scene.attach(bottle); // keeps where it is in the world
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const up = camera.position.clone().normalize();
      const vel = fwd.multiplyScalar(4.2).addScaledVector(up, 4.2);
      const spin = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      flying.push({ mesh: bottle, vel, spin, t: 0 });
      sound.play('whoosh');
      hands.visible = false;
      bottle = letter = holder = null;
    },
    update(dt) {
      if (job) {
        const s = job.steps[job.i];
        const k = Math.min(1, (performance.now() - job.t0) / s.ms);
        s.at && s.at(k);
        if (k >= 1) next();
      }
      for (let i = flying.length - 1; i >= 0; i--) {
        const f = flying[i];
        f.t += dt;
        const out = f.mesh.position.clone().normalize();
        // up to the top of the arc the planet has it; then it lets go and space takes it
        if (f.t < 0.45) f.vel.addScaledVector(out, -9.8 * dt);
        else f.vel.addScaledVector(out, 3.5 * dt).multiplyScalar(1 - 0.05 * dt);
        f.mesh.position.addScaledVector(f.vel, dt);
        f.mesh.rotateOnAxis(f.spin, dt * (reducedMotion ? 0 : 1.4));
        if (f.t > 14 || f.mesh.position.length() > RADIUS * 6) { scene.remove(f.mesh); flying.splice(i, 1); }
      }
    },
    /** For tests: finish whatever's running now. */
    skip() { while (job) { const s = job.steps[job.i]; s.at && s.at(1); next(); } },
  };
}

