// The hoop: pick up a coconut a second time and a neon basketball hoop flickers into being a few
// steps ahead of you, somewhere clear (main.js picks the spot): it stutters on like a neon tube
// catching, with a flare of light and a crackle at each stutter, and settles with a shower of
// sparks off the rim, so you look. Throw a coconut through it (down through the rim) and it sets
// off fireworks, then flickers back out. Its neon is the sign's: pink tube for the rim, aqua round
// the backboard. Pole, backboard and rim are solid while it's there (physics.js `addFixed`), so a
// coconut can bank in off the board or rattle off the rim. The flicker keeps under three flashes a
// second; under reduced motion it just fades in and out, no flashing.
import * as THREE from 'three';
import { PALETTE, pbr, glow } from './materials.js';

const RIM_Y = 2.6, RIM_R = 0.38;
export const RIM_Z = 0.82; // the rim: height, radius, out from the pole (toward you; main.js keeps the spot under it clear too)
const BOARD = { w: 1.3, h: 0.85, y: 2.95, z: 0.38 };
// on/off and how long (s): three short stutters, then on for good; going, the same backwards
const FLICKER_IN = [[1, 0.07], [0, 0.28], [1, 0.1], [0, 0.34], [1, 0.06], [0, 0.2]];
const FLICKER_OUT = [[1, 0.5], [0, 0.18], [1, 0.08], [0, 0.3], [1, 0.05]];
const PINK = 0xff4fa3;        // the sign's tube
const SPARKS = [PINK, PALETTE.aqua, PALETTE.amber, 0xfff1d6];

function build() {
  const g = new THREE.Group();
  const steel = pbr({ color: PALETTE.rocketBlack, metalness: 0.7, roughness: 0.4 });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  add(new THREE.CylinderGeometry(0.34, 0.38, 0.1, 24), steel, 0, 0.05, 0);
  add(new THREE.CylinderGeometry(0.05, 0.06, BOARD.y + 0.2, 12), steel, 0, (BOARD.y + 0.2) / 2, 0);
  add(new THREE.BoxGeometry(0.08, 0.08, BOARD.z), steel, 0, BOARD.y, BOARD.z / 2);
  add(new THREE.BoxGeometry(BOARD.w, BOARD.h, 0.04), pbr({ color: 0x0b0a12, metalness: 0.3, roughness: 0.25 }), 0, BOARD.y, BOARD.z);
  // neon: a frame round the board and a small square over the rim, aqua; the rim itself pink
  const aqua = glow(PALETTE.aqua, 3), pink = glow(PINK, 3.2);
  const frame = (w, h, y) => {
    const s = new THREE.Shape();
    const r = 0.06, x0 = -w / 2, y0 = -h / 2;
    s.moveTo(x0 + r, y0); s.lineTo(-x0 - r, y0); s.quadraticCurveTo(-x0, y0, -x0, y0 + r);
    s.lineTo(-x0, -y0 - r); s.quadraticCurveTo(-x0, -y0, -x0 - r, -y0); s.lineTo(x0 + r, -y0);
    s.quadraticCurveTo(x0, -y0, x0, -y0 - r); s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
    const pts = s.getSpacedPoints(80).map((p) => new THREE.Vector3(p.x, p.y + y, BOARD.z + 0.035));
    return add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 160, 0.016, 6, true), aqua, 0, 0, 0);
  };
  frame(BOARD.w - 0.1, BOARD.h - 0.1, BOARD.y);
  frame(0.46, 0.34, RIM_Y + 0.27);
  const rim = add(new THREE.TorusGeometry(RIM_R, 0.024, 8, 48), pink, 0, RIM_Y, RIM_Z);
  rim.rotation.x = Math.PI / 2;
  add(new THREE.BoxGeometry(0.06, 0.03, RIM_Z - BOARD.z - RIM_R + 0.02), steel, 0, RIM_Y, (BOARD.z + RIM_Z - RIM_R) / 2 + 0.01);
  // the net: strands down to a narrower ring, tied across twice
  const net = [], N = 14;
  const ring = (r, y) => Array.from({ length: N }, (_, i) => { const a = (i / N) * Math.PI * 2; return new THREE.Vector3(Math.cos(a) * r, y, RIM_Z + Math.sin(a) * r); });
  const top = ring(RIM_R, RIM_Y), mid = ring(RIM_R * 0.8, RIM_Y - 0.22), low = ring(RIM_R * 0.62, RIM_Y - 0.44);
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    net.push(top[i], mid[j], top[j], mid[i], mid[i], low[j], mid[j], low[i]);
  }
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(net), new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.cream).multiplyScalar(0.9), transparent: true, opacity: 0.8 })));
  return { group: g, neon: [aqua, pink], bases: [aqua.color.clone(), pink.color.clone()] };
}

/** The colliders, in the hoop's frame (physics.js addFixed). */
function solids() {
  const parts = [
    { cylinder: [(BOARD.y + 0.2) / 2, 0.06], at: [0, (BOARD.y + 0.2) / 2, 0] },
    { cuboid: [BOARD.w / 2, BOARD.h / 2, 0.03], at: [0, BOARD.y, BOARD.z] },
  ];
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; parts.push({ ball: 0.03, at: [Math.cos(a) * RIM_R, RIM_Y, RIM_Z + Math.sin(a) * RIM_R] }); }
  return parts;
}

let sparkTex;
function spark() { // a soft round dot, so the sparks aren't squares
  if (sparkTex) return sparkTex;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d'), r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.8)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 32, 32);
  return (sparkTex = new THREE.CanvasTexture(c));
}

let flareTex;
function flareTexture() { // light off a tube: bright at the heart, falling away fast, nothing at the edge
  if (flareTex) return flareTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.12, 'rgba(255,255,255,.55)'); r.addColorStop(0.35, 'rgba(255,255,255,.14)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  return (flareTex = new THREE.CanvasTexture(c));
}

export function createHoop({ scene, physics, colliders, sound, reducedMotion = false }) {
  const { group, neon, bases } = build();
  group.visible = false;
  scene.add(group);
  // the flare as it catches: a soft glow round the rim, bright for an instant
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: flareTexture(), color: new THREE.Color(PINK).multiplyScalar(2.5), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  halo.scale.setScalar(3.2);
  halo.visible = false;
  scene.add(halo);
  let state = 'off', t = 0, fixed = null, post = null, scores = 0;
  const ground = new THREE.Vector3(), up = new THREE.Vector3(), rimAt = new THREE.Vector3();
  const prev = new Map(); // item -> where it was last frame
  const bursts = [];

  function setNeon(k) { neon.forEach((m, i) => m.color.copy(bases[i]).multiplyScalar(k)); }
  // where in a flicker pattern `t` falls: on or off (and which step, for a crackle per stutter)
  let stutterIndex = 0, lit = -1;
  const total = (pattern) => pattern.reduce((a, [, d]) => a + d, 0);
  function stutter(pattern, time) {
    let acc = 0;
    for (let i = 0; i < pattern.length; i++) { acc += pattern[i][1]; if (time < acc) { stutterIndex = i; return pattern[i][0] === 1; } }
    stutterIndex = pattern.length;
    return true;
  }

  function firework(at, color, delay, { n = 90, speed = 3, rise = 0.55 } = {}) {
    const pos = new Float32Array(n * 3), vel = [];
    for (let i = 0; i < n; i++) vel.push(new THREE.Vector3().randomDirection().multiplyScalar(speed * (1 + Math.random() * 0.8)));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ map: spark(), color: new THREE.Color(color).multiplyScalar(3), size: 0.22, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.visible = false;
    scene.add(pts);
    bursts.push({ pts, vel, at: at.clone(), from: rimAt.clone(), t: -delay, n, rise, quiet: rise === 0 });
  }
  function updateBursts(dt) {
    for (let b = bursts.length - 1; b >= 0; b--) {
      const f = bursts[b];
      f.t += dt;
      if (f.t < 0) continue;
      const p = f.pts.geometry.attributes.position;
      const rise = f.rise; // the shell going up, then the burst
      f.pts.visible = true;
      if (f.t < rise) {
        const k = f.t / rise, e = 1 - (1 - k) * (1 - k);
        const c = f.from.clone().lerp(f.at, e);
        for (let i = 0; i < f.n; i++) p.setXYZ(i, c.x, c.y, c.z);
        f.pts.material.size = 0.18;
      } else {
        if (!f.burst) { f.burst = true; if (!f.quiet) sound.play('firework', f.at); }
        const s = f.t - rise, drag = (1 - Math.exp(-2.2 * s)) / 2.2, fall = 1.2 * s * s;
        for (let i = 0; i < f.n; i++) {
          const v = f.vel[i];
          p.setXYZ(i, f.at.x + v.x * drag - up.x * fall, f.at.y + v.y * drag - up.y * fall, f.at.z + v.z * drag - up.z * fall);
        }
        f.pts.material.size = 0.22;
        f.pts.material.opacity = Math.max(0, 1 - s / 1.7);
        if (s > 1.7) { scene.remove(f.pts); f.pts.geometry.dispose(); f.pts.material.dispose(); bursts.splice(b, 1); continue; }
      }
      p.needsUpdate = true;
    }
  }

  function score() {
    state = 'scored'; t = 0; scores++;
    window.__hoopScored = scores; // for tests
    const side = new THREE.Vector3(1, 0, 0).applyQuaternion(group.quaternion);
    SPARKS.forEach((c, i) => {
      const at = rimAt.clone().addScaledVector(up, 6 + i * 1.2).addScaledVector(side, (i - 1.5) * 1.8);
      firework(at, c, i * 0.35);
    });
  }

  return {
    get state() { return state; },
    get rim() { return state === 'off' ? null : rimAt.clone(); },
    get up() { return up.clone(); },
    /** Bring it into being at `spot` (on the ground), facing `toward` (a world point, you). */
    drop(spot, toward) {
      if (state !== 'off') return;
      ground.copy(spot); up.copy(spot).normalize();
      group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(group.quaternion);
      const to = toward.clone().sub(spot); to.addScaledVector(up, -to.dot(up)).normalize();
      const yaw = Math.atan2(new THREE.Vector3().crossVectors(fwd, to).dot(up), fwd.dot(to));
      group.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(up, yaw));
      group.position.copy(ground);
      group.updateMatrixWorld(true);
      rimAt.set(0, RIM_Y, RIM_Z).applyMatrix4(group.matrixWorld);
      halo.position.copy(rimAt);
      state = 'appearing'; t = 0; lit = -1;
      setNeon(1.6);
      prev.clear();
    },
    /** Each frame, after the physics: `dt` real seconds. */
    update(dt, clock) {
      updateBursts(dt);
      if (state === 'off') return;
      t += dt;
      if (state === 'appearing') {
        const on = reducedMotion ? true : stutter(FLICKER_IN, t);
        group.visible = on;
        if (on && !reducedMotion && lit !== stutterIndex) { lit = stutterIndex; sound.play('zap', rimAt, 0.6); }
        // the flare: at full on each stutter, fading between (reduced motion: one slow swell)
        const flare = reducedMotion ? Math.sin(Math.min(1, t / 1.2) * Math.PI) * 0.5 : on ? 1 : 0;
        halo.visible = flare > 0.01;
        halo.material.opacity = flare;
        if (t >= (reducedMotion ? 1.2 : total(FLICKER_IN))) {
          state = 'settling'; t = 0;
          group.visible = true;
          if (!reducedMotion) { sound.play('zap', rimAt, 1); firework(rimAt, PINK, 0, { n: 40, speed: 1.4, rise: 0 }); } // it catches, and sparks shower off the rim
          fixed = physics.addFixed(group.position, group.quaternion, solids());
          post = { center: ground.clone(), radius: 0.4 };
          colliders.push(post);
        }
        return;
      }
      if (state === 'settling') { // the flare dies away and the neon comes down to its glow
        const k = Math.min(1, t / 0.8);
        halo.material.opacity = reducedMotion ? 0 : 1 - k;
        halo.visible = halo.material.opacity > 0.01;
        setNeon(1.6 - 0.6 * k);
        if (k >= 1) { state = 'up'; setNeon(1); }
      }
      if (state === 'up' || state === 'settling') {
        if (state === 'up') setNeon(Math.sin(clock * 0.9) > 0.99 ? 0.3 : 1); // the odd flicker, as neon does
        for (const it of physics.items) {
          if (it.held || !it.body) { prev.delete(it); continue; }
          const p = it.object.position, was = prev.get(it);
          if (was) {
            const a = was.clone().sub(rimAt).dot(up), b = p.clone().sub(rimAt).dot(up);
            if (a > 0 && b <= 0) { // came down through the rim's plane: inside the ring?
              const cross = was.clone().lerp(p, a / (a - b)).sub(rimAt);
              cross.addScaledVector(up, -cross.dot(up));
              if (cross.length() < RIM_R - it.radius * 0.4) { score(); break; }
            }
            was.copy(p);
          } else prev.set(it, p.clone());
        }
        return;
      }
      if (state === 'scored') {
        setNeon(Math.sin(t * 14) > 0 ? 1.4 : 0.6); // flashing with the fireworks
        if (t > 3.2) {
          state = 'leaving'; t = 0;
          if (fixed) { fixed.remove(); fixed = null; }
          if (post) { colliders.splice(colliders.indexOf(post), 1); post = null; }
          setNeon(1);
        }
        return;
      }
      if (state === 'leaving') { // it stutters back out of being
        const on = !reducedMotion && stutter(FLICKER_OUT, t);
        if (on && !group.visible) sound.play('zap', rimAt, 0.4);
        group.visible = on;
        if (reducedMotion || t >= total(FLICKER_OUT)) { state = 'off'; group.visible = false; halo.visible = false; prev.clear(); }
      }
    },
  };
}
