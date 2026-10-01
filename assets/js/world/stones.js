// Skipping stones on the lagoon. A little pile of flat stones at the waterline; crouch there,
// press and hold to wind up, let go to throw (sidearm and low, the way stones skip). No physics
// engine: a stone is a point under the planet's gravity (toward its centre), and when it meets
// the water it skips if it's coming in flat and fast (under about 25°, over 2.2 m/s across),
// losing some of its speed each time, until it sinks with a plop or makes the far shore. Each
// skip leaves a ripple on the water.
import * as THREE from 'three';
import { RADIUS, POND, pondDist, pondAzimuth, shoreAt, surfaceRadius } from './planet.js';
import { PALETTE, pbr } from './materials.js';

const G = 9.8;
const WATER = RADIUS + POND.level;            // the water's surface: a sphere this far from the centre
const MAX_ANGLE = 0.44, MIN_SPEED = 2.2;      // what skips
const KEEP_ACROSS = 0.78, KEEP_UP = 0.55;     // what a skip keeps of the stone's speed

const stoneGeo = new THREE.SphereGeometry(0.035, 12, 8).scale(1, 0.32, 0.8);
const stoneMat = pbr({ color: PALETTE.stone, roughness: 0.6 });
const flat = () => { const m = new THREE.Mesh(stoneGeo, stoneMat); m.castShadow = true; return m; };

/** The pile at the waterline (stands on y = 0). */
export function stonePile() {
  const g = new THREE.Group();
  [[0, 0, 0, 0.2], [0.05, 0.012, 0.02, 1.4], [-0.04, 0.008, 0.04, 2.6], [0.02, 0.022, -0.035, 0.7], [-0.06, 0, -0.03, 2.0]].forEach(([x, y, z, r]) => {
    const s = flat();
    s.position.set(x, 0.01 + y, z);
    s.rotation.set(0.1 * Math.sin(r * 3), r, 0.08 * Math.cos(r * 5));
    g.add(s);
  });
  return g;
}

export function createSkipper(scene) {
  const stones = [], landed = [];  // in flight; lying on the far sand
  // ripples: a pool of rings laid on the water
  const rings = Array.from({ length: 14 }, () => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: PALETTE.moon, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.visible = false;
    m.userData = { t: 0, life: 1, size: 1 };
    scene.add(m);
    return m;
  });
  let nextRing = 0;
  function ripple(at, size = 0.5, life = 1.3) {
    const m = rings[nextRing++ % rings.length];
    const up = at.clone().normalize();
    m.position.copy(up).multiplyScalar(WATER + 0.005);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    Object.assign(m.userData, { t: 0, life, size });
    m.visible = true;
  }
  const overWater = (dir) => pondDist(dir) < shoreAt(pondAzimuth(dir));

  return {
    /** A stone for your hand. */
    stone: flat,
    /**
     * Throw one from `pos` at `vel` (world). `on(event, point, info)`: 'skip' (info.n), then
     * 'plop' (sank) or 'shore' (landed on the sand; info.across if it's the far side), with
     * info.skips, the total.
     */
    throw(pos, vel, on, from) {
      const mesh = flat();
      mesh.position.copy(pos);
      scene.add(mesh);
      stones.push({ mesh, pos: pos.clone(), vel: vel.clone(), skips: 0, t: 0, on, from: from.clone() });
    },
    update(dt) {
      for (let i = stones.length - 1; i >= 0; i--) {
        const s = stones[i];
        let done = null;
        for (let h = 0; h < dt && !done; h += 1 / 240) { // small steps: a skip is a matter of centimetres
          const step = Math.min(1 / 240, dt - h);
          const up = s.pos.clone().normalize();
          s.vel.addScaledVector(up, -G * step);
          s.pos.addScaledVector(s.vel, step);
          s.t += step;
          const r = s.pos.length(), dir = s.pos.clone().divideScalar(r);
          if (overWater(dir) && r <= WATER) {
            const vN = s.vel.dot(dir), across = s.vel.clone().addScaledVector(dir, -vN), speed = across.length();
            const angle = Math.atan2(-vN, speed);
            s.pos.copy(dir).multiplyScalar(WATER + 0.001);
            if (angle < MAX_ANGLE && speed > MIN_SPEED) {
              s.skips++;
              s.vel.copy(across).multiplyScalar(KEEP_ACROSS).addScaledVector(dir, -vN * KEEP_UP);
              ripple(s.pos, 0.35 + Math.min(0.4, speed * 0.05));
              s.on('skip', s.pos.clone(), { n: s.skips, speed });
            } else {
              ripple(s.pos, 0.8, 1.8); ripple(s.pos, 0.45, 1.4);
              done = ['plop', { angle, speed }]; // (why: for tests)
            }
          } else if (!overWater(dir) && r <= surfaceRadius(dir)) {
            // on the sand: the far side if it's further from where you threw than the lagoon's middle
            done = ['shore', { across: s.from.distanceTo(s.pos) > s.from.distanceTo(POND.center.clone().multiplyScalar(WATER)) }];
          } else if (s.t > 8) done = ['plop', {}];
        }
        s.mesh.position.copy(s.pos);
        s.mesh.rotation.y += dt * 30; // spinning, as a skipped stone does
        if (done) {
          s.on(done[0], s.pos.clone(), { ...done[1], skips: s.skips });
          if (done[0] === 'plop') scene.remove(s.mesh);
          else { landed.push(s.mesh); if (landed.length > 6) scene.remove(landed.shift()); } // a few stay on the sand
          stones.splice(i, 1);
        }
      }
      for (const m of rings) {
        if (!m.visible) continue;
        const u = m.userData;
        u.t += dt;
        const k = u.t / u.life;
        if (k >= 1) { m.visible = false; continue; }
        m.scale.setScalar(0.05 + u.size * Math.sqrt(k));
        m.material.opacity = 0.55 * (1 - k);
      }
    },
    get flying() { return stones.length > 0; },
    /** The water's surface: this far from the planet's centre. */
    water: WATER,
    /** A ring spreading on the water at `at` (anything that lands in it: physics.js too). */
    ripple,
  };
}
