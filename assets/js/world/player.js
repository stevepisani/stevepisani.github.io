// First-person walking on a tiny planet.
//
// The player's orientation is a quaternion whose local +Y is "up" (away from the
// planet's centre). Each step we move along the surface, then parallel-transport
// the orientation to the new up vector. Never lookAt() with a fixed world up:
// that flips at the poles. Yaw turns about local up; pitch lives on the camera only.
//
// Two ways to move, both with nothing to learn:
//   - click or tap a spot (or a thing) and you walk there, turning to face your path
//   - WASD / arrow keys, for people who expect them
import * as THREE from 'three';
import { surfaceRadius } from './planet.js';

const EYE = 1.6;
const SPEED = 3.6;        // m/s
const RUN = 1.7;          // shift multiplier
const ACCEL = 8;          // how quickly velocity catches up with input
const BODY = 0.32;        // player radius for collisions
const PITCH_LIMIT = 1.3;
const TURN = 3.5;         // how quickly auto-walk turns you toward your path

const Y = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);

export class Player {
  constructor(camera, { colliders }) {
    this.camera = camera;
    this.colliders = colliders;
    this.pos = new THREE.Vector3();     // feet, on the surface
    this.quat = new THREE.Quaternion(); // body orientation (local +Y = up, -Z = forward)
    this.pitch = 0;
    this.vel = new THREE.Vector3();     // tangent velocity, world space
    this.enabled = false;
    this.keys = { x: 0, z: 0, run: false };
    this.target = null;                 // { point, arrive, onArrive }
    this.lookedAt = 0;                  // last time the person dragged to look
    this.eye = EYE;
    this._up = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._stuck = { t: 0, d: Infinity };
    this.clock = 0;                     // simulation time, so slow frames don't look like being stuck
  }

  get up() { return this._up.copy(this.pos).normalize(); }
  get moving() { return this.vel.lengthSq() > 0.05; }

  /** Stand at `dir` on the surface, facing toward the point `lookAt` (world). */
  spawn(dir, lookAt, pitch = -0.04) {
    const up = dir.clone().normalize();
    this.pos.copy(up).multiplyScalar(surfaceRadius(up));
    this.quat.setFromUnitVectors(Y, up);
    this.quat.multiply(this._q.setFromAxisAngle(Y, this.yawToward(lookAt)));
    this.pitch = pitch;
    this.vel.set(0, 0, 0);
    this.target = null;
  }

  /** Yaw (about local up) that would face `point`. */
  yawToward(point) {
    const up = this.up;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.quat);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.quat);
    const to = point.clone().sub(this.pos);
    to.addScaledVector(up, -to.dot(up));
    return Math.atan2(-to.dot(right), to.dot(fwd));
  }

  look(dx, dy) {
    this.quat.multiply(this._q.setFromAxisAngle(Y, -dx));
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy, -PITCH_LIMIT, PITCH_LIMIT);
    this.lookedAt = this.clock;
  }

  /** Walk to a world point; stop within `arrive` metres and call onArrive. */
  walkTo(point, { arrive = 0.35, onArrive } = {}) {
    this.target = { point: point.clone(), arrive, onArrive };
    this._stuck = { t: this.clock, d: Infinity };
  }

  stop() { this.target = null; }

  update(dt) {
    this.clock += dt;
    const up = this.up.clone();
    const want = this._v.set(0, 0, 0);

    if (this.enabled && (this.keys.x || this.keys.z)) {
      this.target = null; // keys take over
      want.set(this.keys.x, 0, -this.keys.z);
      if (want.lengthSq() > 1) want.normalize();
      want.multiplyScalar(SPEED * (this.keys.run ? RUN : 1)).applyQuaternion(this.quat);
    } else if (this.enabled && this.target) {
      const to = this.target.point.clone().sub(this.pos);
      to.addScaledVector(up, -to.dot(up));
      const dist = to.length();
      if (dist < this.target.arrive) {
        const done = this.target.onArrive;
        this.target = null;
        done && done();
      } else {
        want.copy(to).normalize().multiplyScalar(SPEED * Math.min(1, dist / 1.4 + 0.25));
        // turn to face the path, unless they're looking around right now
        if (this.clock - this.lookedAt > 0.9) {
          const yaw = this.yawToward(this.target.point);
          this.quat.multiply(this._q.setFromAxisAngle(Y, yaw * Math.min(1, TURN * dt)));
          this.pitch += (-0.06 - this.pitch) * Math.min(1, 2 * dt);
        }
        // give up if we stop making progress (walked into something)
        const now = this.clock;
        if (now - this._stuck.t > 0.9) {
          if (this._stuck.d - dist < 0.15) this.target = null;
          this._stuck = { t: now, d: dist };
        }
      }
    }
    this.vel.lerp(want, 1 - Math.exp(-ACCEL * dt));

    // keep velocity tangent to the surface, then move
    this.vel.addScaledVector(up, -this.vel.dot(up));
    this.pos.addScaledVector(this.vel, dt);

    // collisions: circles on the surface; push out along the tangent plane
    for (const c of this.colliders) {
      const d = this._v.copy(this.pos).sub(c.center);
      d.addScaledVector(up, -d.dot(up));
      const min = c.radius + BODY;
      const len = d.length();
      if (len < min && len > 1e-5) this.pos.addScaledVector(d, (min - len) / len);
    }

    // snap to the ground and parallel-transport orientation to the new up
    const newUp = this._up.copy(this.pos).normalize();
    this.pos.copy(newUp).multiplyScalar(surfaceRadius(newUp));
    this.quat.premultiply(this._q.setFromUnitVectors(up, newUp)).normalize();
  }

  /** Put the camera at the player's eyes, with a very small walking bob. */
  applyToCamera(t = 0, bob = true) {
    const speed = Math.min(1, this.vel.length() / SPEED);
    const h = this.eye + (bob ? Math.sin(t * 9) * 0.025 * speed : 0);
    this.camera.position.copy(this.pos).addScaledVector(this._up.copy(this.pos).normalize(), h);
    this.camera.quaternion.copy(this.quat).multiply(this._q.setFromAxisAngle(X, this.pitch));
  }

  forward(target = new THREE.Vector3()) {
    return target.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
  }
}

/**
 * Pointer + keyboard. One gesture vocabulary for mouse, pen, and touch:
 * a press that doesn't move is a tap (onTap), a press that moves is a look.
 */
export function bindInput(player, canvas, { onTap, onHover, onKeyAction }) {
  const keys = new Set();
  const recompute = () => {
    const k = player.keys;
    k.x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    k.z = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    k.run = keys.has('ShiftLeft') || keys.has('ShiftRight');
  };
  const inField = (e) => e.target.closest && e.target.closest('input, textarea, select, button, a, [contenteditable]');
  addEventListener('keydown', (e) => {
    if (inField(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'KeyE' || e.code === 'Enter') { onKeyAction(); return; }
    if (/^(Key[WASD]|Arrow(Up|Down|Left|Right)|Shift(Left|Right))$/.test(e.code) && player.enabled) {
      keys.add(e.code);
      recompute();
      if (e.code.startsWith('Arrow')) e.preventDefault();
    }
  });
  addEventListener('keyup', (e) => { keys.delete(e.code); recompute(); });
  addEventListener('blur', () => { keys.clear(); recompute(); });

  const press = { id: null, x: 0, y: 0, lx: 0, ly: 0, dragged: false };
  const touchSens = 0.005, mouseSens = 0.004;
  canvas.addEventListener('pointerdown', (e) => {
    if (press.id !== null) return;
    press.id = e.pointerId; press.x = press.lx = e.clientX; press.y = press.ly = e.clientY; press.dragged = false;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* not capturable; drags still work inside the canvas */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== press.id) { if (e.pointerType === 'mouse' && press.id === null) onHover(e.clientX, e.clientY); return; }
    if (!press.dragged && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6) {
      press.dragged = true;
      canvas.classList.add('is-dragging');
    }
    if (press.dragged && player.enabled) {
      const s = e.pointerType === 'mouse' ? mouseSens : touchSens;
      // drag the world: moving the pointer right turns you left, like grabbing the scene
      player.look(-(e.clientX - press.lx) * s, -(e.clientY - press.ly) * s);
    }
    press.lx = e.clientX; press.ly = e.clientY;
  });
  const release = (e) => {
    if (e.pointerId !== press.id) return;
    if (!press.dragged && e.type === 'pointerup') onTap(e.clientX, e.clientY);
    press.id = null;
    canvas.classList.remove('is-dragging');
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => onHover(null, null));

  return { clear() { keys.clear(); recompute(); } };
}
