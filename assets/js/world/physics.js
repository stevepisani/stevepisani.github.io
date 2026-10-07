// The physics engine: Rapier (WebAssembly), for the loose things on the planet: fallen coconuts,
// glass floats washed up by the lagoon. You knock them about by walking into them (your body is a
// kinematic capsule), pick them up and throw them; they roll down slopes, bounce off the
// landmarks, and float in the lagoon, where a slow current washes them back to the sand.
//
// Rapier has one gravity vector; a planet needs one per body, so world gravity is zero and each
// body is pulled toward the centre every step. The ground is a trimesh of the analytic surface
// (heightAt, lagoon bowl included) at about half a metre between vertices; the landmarks are the
// player's collider circles stood up as posts, plus the bar's plinth. The engine (about 1 MB)
// loads once the planet is up (`load()`); until then everything just lies where it was put.
// You and the skipping stones stay hand-written (player.js, stones.js): you walk on the analytic
// surface, and Rapier has no water to skip on.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RADIUS, POND, surfaceRadius, pondK } from './planet.js';

const G = 9.8;                         // same pull as the stones
const WATER = RADIUS + POND.level;     // the lagoon's surface, as a distance from the centre
const MAX_STEP = 1 / 30;
const POND_UP = POND.center.clone().normalize();
const _up = new THREE.Vector3(0, 1, 0), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();

/**
 * `loose`: [{ object, radius, buoyancy }] (buoyancy: how many times its weight it would displace
 * fully under; over 1 floats). `posts`: the player's colliders, [{ center, radius, height?, walkOnly? }]. `solids`:
 * [{ center, up, radius, half }] upright cylinders. `on(kind, at, strength)`: 'thud' when something
 * lands hard, 'splash' when it goes into the water.
 */
export function createPhysics({ scene, loose, posts, solids = [], on = () => {} }) {
  let R = null, world = null, you = null;
  const items = loose.map((l) => ({ ...l, label: l.object.userData.label, home: l.object.position.clone(), body: null, held: false, wet: false, lastV: 0, quiet: 0, still: 0 }));
  for (const it of items) it.object.userData.loose = it;

  const vec = (v) => ({ x: v.x, y: v.y, z: v.z });
  const uprightAt = (up) => _q.setFromUnitVectors(_up, _v.copy(up).normalize());

  async function load() {
    R = await import('@dimforge/rapier3d-compat');
    await R.init();
    world = new R.World({ x: 0, y: 0, z: 0 });

    // The ground: an icosphere on the analytic surface (welded, so it's one closed mesh)
    let geo = new THREE.IcosahedronGeometry(1, 40);
    geo.deleteAttribute('normal'); geo.deleteAttribute('uv');
    geo = mergeVertices(geo, 1e-4);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { _v.fromBufferAttribute(p, i).normalize(); _v.multiplyScalar(surfaceRadius(_v)); p.setXYZ(i, _v.x, _v.y, _v.z); }
    const ground = world.createRigidBody(R.RigidBodyDesc.fixed());
    world.createCollider(R.ColliderDesc.trimesh(new Float32Array(p.array), new Uint32Array(geo.index.array)).setFriction(0.8), ground);
    geo.dispose();

    // The landmarks: posts (3 m tall unless they say, from half a metre underground); and any solids
    const fixed = world.createRigidBody(R.RigidBodyDesc.fixed());
    const cylinder = (center, up, radius, half) => {
      const q = uprightAt(up);
      world.createCollider(R.ColliderDesc.cylinder(half, radius).setTranslation(center.x, center.y, center.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setFriction(0.6).setRestitution(0.3), fixed);
    };
    for (const c of posts) {
      if (c.walkOnly) continue;
      const up = c.center.clone().normalize(), h = c.height || 3;
      cylinder(c.center.clone().addScaledVector(up, (h - 0.5) / 2), up, c.radius, (h + 0.5) / 2);
    }
    for (const s of solids) cylinder(s.center, s.up, s.radius, s.half);

    // You: a capsule that follows your feet and shoves whatever it walks into
    const q = uprightAt(_up);
    you = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased());
    world.createCollider(R.ColliderDesc.capsule(0.55, 0.3), you);
    you.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, false);

    // they lie where they fell until something disturbs them
    for (const it of items) if (!it.held) spawnBody(it, it.object.position, null, null, true);
  }

  function spawnBody(it, at, vel, spin, asleep = false) {
    const q = it.object.getWorldQuaternion(new THREE.Quaternion());
    const desc = R.RigidBodyDesc.dynamic().setTranslation(at.x, at.y, at.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      // a husk is lumpy, so a coconut doesn't roll far; a glass float rolls on
      .setLinearDamping(0.15).setAngularDamping(it.buoyancy > 2 ? 0.8 : 2.5).setCcdEnabled(true).setCanSleep(true).setSleeping(asleep);
    it.body = world.createRigidBody(desc);
    // a coconut is about 1.4 kg in 22 cm; a glass float lighter and bouncier
    const density = it.buoyancy > 2 ? 250 : 450;
    world.createCollider(R.ColliderDesc.ball(it.radius).setDensity(density).setFriction(0.7).setRestitution(it.buoyancy > 2 ? 0.45 : 0.25), it.body);
    if (vel) it.body.setLinvel(vec(vel), true);
    if (spin) it.body.setAngvel(vec(spin), true);
    it.lastV = vel ? vel.length() : 0;
  }

  function substep(step) {
    for (const it of items) {
      const b = it.body;
      if (!b || b.isSleeping()) continue;
      const t = b.translation();
      _v.set(t.x, t.y, t.z);
      const r = _v.length();
      const up = _w.copy(_v).divideScalar(r);
      const m = b.mass();
      const f = up.clone().multiplyScalar(-G * m);
      // the lagoon: buoyancy by how deep it's in, drag, and a slow current back to the sand
      const overWater = pondK(up) < 1 && surfaceRadius(up) < WATER - 0.02;
      const depth = overWater ? THREE.MathUtils.clamp((WATER - (r - it.radius)) / (2 * it.radius), 0, 1) : 0;
      if (depth > 0) {
        f.addScaledVector(up, G * m * it.buoyancy * depth);
        const lv = b.linvel();
        f.addScaledVector(_v.set(lv.x, lv.y, lv.z), -m * 4 * depth);
        const out = _v.copy(up).sub(POND_UP);
        out.addScaledVector(up, -out.dot(up)).normalize(); // away from the middle, along the water
        f.addScaledVector(out, m * 0.25 * depth);
      }
      // in the grass and slow: it drags to a stop (on a gentle slope; a steep one still rolls it)
      if (!depth && r - surfaceRadius(up) - it.radius < 0.04) {
        const lv = b.linvel(), sp = Math.hypot(lv.x, lv.y, lv.z);
        if (sp < 0.4) f.addScaledVector(_v.set(lv.x, lv.y, lv.z), -m * (it.buoyancy > 2 ? 3 : 7));
      }
      b.resetForces(false);
      b.addForce(vec(f), false);
      if (depth > 0 && !it.wet) { const s = b.linvel(); on('splash', up.clone().multiplyScalar(WATER), Math.min(1, Math.hypot(s.x, s.y, s.z) / 6)); }
      it.wet = depth > 0;
      // lost (through the ground, or far away): back where it started
      if (r < RADIUS - 2 || r > RADIUS + 60) { world.removeRigidBody(b); spawnBody(it, it.home, null); }
    }
    world.step();
    for (const it of items) {
      const b = it.body;
      if (!b || it.held) continue;
      const t = b.translation(), q = b.rotation();
      it.object.position.set(t.x, t.y, t.z);
      it.object.quaternion.set(q.x, q.y, q.z, q.w);
      // a hard landing: a thud (the speed it lost this step)
      const lv = b.linvel(), v = Math.hypot(lv.x, lv.y, lv.z);
      it.quiet -= step;
      if (it.lastV - v > 2.2 && !it.wet && it.quiet <= 0) { on('thud', it.object.position, Math.min(1, (it.lastV - v) / 8)); it.quiet = 0.15; }
      it.lastV = v;
      // nearly still on dry ground for a moment: let it rest (Rapier won't, on a slope)
      const av = b.angvel();
      it.still = v < 0.12 && Math.hypot(av.x, av.y, av.z) < 1.2 && !it.wet ? it.still + step : 0;
      if (it.still > 0.8) { b.sleep(); it.still = 0; }
    }
  }

  return {
    load,
    get ready() { return !!world; },
    items,
    /** One frame: `dt` real seconds, `feet` where you stand. */
    update(dt, feet) {
      if (!world) return;
      if (feet) {
        const up = _w.copy(feet).normalize();
        const c = _v.copy(feet).addScaledVector(up, 0.85);
        you.setNextKinematicTranslation(vec(c));
        const q = uprightAt(up);
        you.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
      }
      if (!(dt > 0)) return;
      // a long frame is a few short steps, not one big one (or slow motion)
      const n = Math.min(4, Math.ceil(dt / MAX_STEP)), step = dt / n;
      world.timestep = step;
      for (let k = 0; k < n; k++) substep(step);
    },
    /**
     * Something solid that comes and goes (the hoop): one fixed body at `at` turned by `quat`, its
     * parts in that frame ({ ball: r | cuboid: [hx, hy, hz] | cylinder: [half, r], at: [x, y, z] }).
     * Wakes anything resting nearby. Returns { remove() }.
     */
    addFixed(at, quat, parts) {
      if (!world) return null;
      const body = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(at.x, at.y, at.z).setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w }));
      for (const p of parts) {
        const d = p.ball ? R.ColliderDesc.ball(p.ball) : p.cuboid ? R.ColliderDesc.cuboid(...p.cuboid) : R.ColliderDesc.cylinder(...p.cylinder);
        world.createCollider(d.setTranslation(...p.at).setFriction(0.5).setRestitution(0.45), body);
      }
      for (const it of items) if (it.body && it.object.position.distanceTo(at) < 4) it.body.wakeUp();
      return { remove() { if (world) { world.removeRigidBody(body); for (const it of items) if (it.body) it.body.wakeUp(); } } };
    },
    /** Take it out of the world and into your hands (the caller parents the object). */
    take(it) {
      if (!world || it.held) return false;
      it.held = true;
      if (it.body) { world.removeRigidBody(it.body); it.body = null; }
      return true;
    },
    /** Let go of it at `at` (world), moving at `vel`, spinning at `spin`. */
    release(it, at, vel = null, spin = null) {
      if (!world || !it.held) return;
      it.held = false;
      scene.attach(it.object);
      spawnBody(it, at, vel, spin);
      it.wet = false;
    },
  };
}
