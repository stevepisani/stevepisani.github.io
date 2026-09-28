// First-person walking on a tiny planet.
//
// The player's orientation is a quaternion whose local +Y is "up" (away from the
// planet's centre). Each step we move along the surface, then parallel-transport
// the orientation to the new up vector. Never lookAt() with a fixed world up:
// that flips at the poles. Yaw turns about local up; pitch lives on the camera only.
import * as THREE from 'three';
import { surfaceRadius } from './planet.js';

const EYE = 1.6;
const SPEED = 3.4;        // m/s
const RUN = 1.7;          // shift multiplier
const ACCEL = 10;         // how quickly velocity catches up with input
const BODY = 0.32;        // player radius for collisions
const GRAVITY = 14;
const JUMP = 5.2;
const PITCH_LIMIT = 1.45;

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
    this.hop = 0;                       // height above ground while jumping
    this.hopVel = 0;
    this.enabled = false;
    this.input = { x: 0, z: 0, run: false, jump: false };
    this.eye = EYE;
    this._up = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
  }

  get up() { return this._up.copy(this.pos).normalize(); }

  /** Stand at `dir` on the surface, facing toward the point `lookAt` (world). */
  spawn(dir, lookAt) {
    const up = dir.clone().normalize();
    this.pos.copy(up).multiplyScalar(surfaceRadius(up));
    this.quat.setFromUnitVectors(Y, up);
    // yaw so that local -Z points at the target, projected onto the tangent plane
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.quat);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.quat);
    const to = lookAt.clone().sub(this.pos);
    to.addScaledVector(up, -to.dot(up));
    const yaw = Math.atan2(-to.dot(right), to.dot(fwd));
    this.quat.multiply(this._q.setFromAxisAngle(Y, yaw));
    this.pitch = -0.05;
    this.vel.set(0, 0, 0);
    this.hop = this.hopVel = 0;
  }

  look(dx, dy) {
    this.quat.multiply(this._q.setFromAxisAngle(Y, -dx));
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy, -PITCH_LIMIT, PITCH_LIMIT);
  }

  update(dt) {
    const up = this.up.clone();
    if (this.enabled) {
      // desired velocity in world space from input in local space
      const want = this._v.set(this.input.x, 0, -this.input.z);
      if (want.lengthSq() > 1) want.normalize();
      want.multiplyScalar(SPEED * (this.input.run ? RUN : 1)).applyQuaternion(this.quat);
      this.vel.lerp(want, 1 - Math.exp(-ACCEL * dt));
      if (this.input.jump && this.hop === 0) this.hopVel = JUMP;
    } else {
      this.vel.multiplyScalar(Math.exp(-ACCEL * dt));
    }
    this.input.jump = false;

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

    // jumping (little planet, floaty gravity)
    if (this.hop > 0 || this.hopVel > 0) {
      this.hopVel -= GRAVITY * dt;
      this.hop = Math.max(0, this.hop + this.hopVel * dt);
      if (this.hop === 0) this.hopVel = 0;
    }
  }

  /** Put the camera at the player's eyes. */
  applyToCamera() {
    this.camera.position.copy(this.pos).addScaledVector(this._up.copy(this.pos).normalize(), this.eye + this.hop);
    this.camera.quaternion.copy(this.quat).multiply(this._q.setFromAxisAngle(X, this.pitch));
  }

  /** Forward direction (world) the player is looking, for interaction checks. */
  forward(target = new THREE.Vector3()) {
    return target.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
  }
}

/**
 * Keyboard, mouse (pointer lock or drag), and touch (left-half joystick, right-half look).
 * Calls onAction() for E / Enter / the on-screen action button.
 */
export function bindInput(player, canvas, { onAction, onMenu, onBar, joystickEl }) {
  const keys = new Set();
  const sens = 0.0024;
  const recompute = () => {
    const i = player.input;
    if (touch.active) return;
    i.x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    i.z = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    i.run = keys.has('ShiftLeft') || keys.has('ShiftRight');
  };
  const typing = (e) => e.target.closest && e.target.closest('input, textarea, select, [contenteditable]');
  addEventListener('keydown', (e) => {
    if (typing(e)) return;
    if (e.code === 'KeyE' || (e.code === 'Enter' && document.activeElement === canvas)) { onAction(); e.preventDefault(); return; }
    if (e.code === 'Tab' && document.pointerLockElement) { onMenu(); e.preventDefault(); return; }
    if (e.code === 'KeyB' && player.enabled) { onBar(); e.preventDefault(); return; }
    if (e.code === 'Space' && player.enabled) { player.input.jump = true; e.preventDefault(); }
    keys.add(e.code);
    recompute();
  });
  addEventListener('keyup', (e) => { keys.delete(e.code); recompute(); });
  addEventListener('blur', () => { keys.clear(); recompute(); });

  // Mouse: pointer-locked movement, or click-drag to look when not locked.
  let dragging = false;
  canvas.addEventListener('mousedown', () => { if (!document.pointerLockElement) dragging = true; });
  addEventListener('mouseup', () => { dragging = false; });
  addEventListener('mousemove', (e) => {
    if (!player.enabled) return;
    if (document.pointerLockElement === canvas || dragging) player.look(e.movementX * sens, e.movementY * sens);
  });

  // Touch: joystick on the left half, look by dragging on the right half.
  const touch = { active: false, stickId: null, lookId: null, ox: 0, oy: 0, lx: 0, ly: 0 };
  const knob = joystickEl && joystickEl.querySelector('span');
  canvas.addEventListener('touchstart', (e) => {
    if (!player.enabled) return;
    for (const t of e.changedTouches) {
      if (t.clientX < innerWidth * 0.45 && touch.stickId === null) {
        touch.stickId = t.identifier; touch.ox = t.clientX; touch.oy = t.clientY; touch.active = true;
        if (joystickEl) { joystickEl.hidden = false; joystickEl.style.left = t.clientX + 'px'; joystickEl.style.top = t.clientY + 'px'; }
      } else if (touch.lookId === null) {
        touch.lookId = t.identifier; touch.lx = t.clientX; touch.ly = t.clientY;
      }
    }
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === touch.stickId) {
        const dx = t.clientX - touch.ox, dy = t.clientY - touch.oy;
        const len = Math.min(1, Math.hypot(dx, dy) / 50);
        const a = Math.atan2(dy, dx);
        player.input.x = Math.cos(a) * len;
        player.input.z = -Math.sin(a) * len;
        if (knob) knob.style.transform = `translate(${Math.cos(a) * len * 36}px, ${Math.sin(a) * len * 36}px)`;
      } else if (t.identifier === touch.lookId) {
        player.look((t.clientX - touch.lx) * sens * 1.6, (t.clientY - touch.ly) * sens * 1.6);
        touch.lx = t.clientX; touch.ly = t.clientY;
      }
    }
    e.preventDefault();
  }, { passive: false });
  const end = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === touch.stickId) {
        touch.stickId = null; touch.active = false; player.input.x = player.input.z = 0;
        if (joystickEl) joystickEl.hidden = true;
        if (knob) knob.style.transform = '';
      }
      if (t.identifier === touch.lookId) touch.lookId = null;
    }
  };
  canvas.addEventListener('touchend', end);
  canvas.addEventListener('touchcancel', end);

  return { clear() { keys.clear(); recompute(); player.input.x = player.input.z = 0; } };
}
