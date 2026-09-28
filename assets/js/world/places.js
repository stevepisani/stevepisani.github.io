// Everything on the asteroid that isn't the bar: your rocket, the lantern-lit path,
// the telescope, the campfire and moai on the far side, and scattered lava rock and palms.
import * as THREE from 'three';
import { PALETTE, pbr, surface, lavaSet, woodSet, glow } from './materials.js';
import { createFire } from './fire.js';
import { palm, lavaRock, moai, tikiTorch } from './props.js';
import { heroOr } from './hero.js';
import { place, dirFrom, headingToward, surfacePoint, BAR_DIR, RADIUS } from './planet.js';

// Where things are, as (polar angle from the bar, longitude). The bar is at polar 0.
export const SPOTS = {
  spawn: dirFrom(0.62, Math.PI / 2), // ~12 m out, straight in front of the bar (it faces longitude π/2)
  rocket: dirFrom(0.72, 1.3),
  telescope: dirFrom(0.5, 2.85),
  campfire: dirFrom(2.55, -1.6),     // around the back
  dish: dirFrom(1.1, -0.2),
  boat: dirFrom(0.5, -0.6),
};

function mesh(geo, material, [x, y, z] = [0, 0, 0], parent) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  parent && parent.add(m);
  return m;
}

export function buildPlaces({ prop, quality, heroes }) {
  const group = new THREE.Group();
  const animated = [];
  const colliders = [];
  const interactables = [];
  const occupied = []; // directions + radii kept clear of scatter

  const put = (obj, dir, opts = {}, clear = 1.5) => {
    place(obj, dir, opts);
    group.add(obj);
    occupied.push([dir.clone().normalize(), clear]);
    return obj;
  };

  // Your rocket: how you got here. "Fly home" leaves for the classic site.
  {
    const rocket = new THREE.Group();
    const parts = [['space-kit_rocket-basea', 0], ['space-kit_rocket-fuela', 1.6], ['space-kit_rocket-sidesa', 2.4], ['space-kit_rocket-topa', 4.0]];
    for (const [name, y] of parts) {
      const p = prop(name, 1.6);
      p.position.y = y;
      rocket.add(p);
    }
    const flame = mesh(new THREE.ConeGeometry(0.4, 1.0, 12), glow(0x7fd8ff, 2.2), [0, -0.3, 0], rocket);
    flame.rotation.x = Math.PI;
    animated.push((t) => { flame.scale.y = 0.5 + Math.sin(t * 20) * 0.1; });
    put(rocket, SPOTS.rocket, { heading: 0.4, sink: 0.1 }, 2.2);
    colliders.push({ center: rocket.position.clone(), radius: 1.2 });
    interactables.push({ id: 'rocket', label: 'Your rocket', verb: 'Fly to the classic site', object: rocket, point: rocket.position.clone(), approach: surfacePoint(dirFrom(0.66, 1.42)), radius: 2.6 });
  }

  // A stepping-stone path from where you land to the bar, lined with little lanterns.
  // Paths lead somewhere; nobody needs to be told to follow one.
  {
    const from = SPOTS.spawn.clone(), to = BAR_DIR.clone();
    const total = from.angleTo(to) * RADIUS - 3.9;           // stop at the deck's edge
    const n = Math.floor(total / 0.85);
    const stones = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.34, 0.38, 0.12, 7), pbr({ color: 0x6f665d, bumpMap: lavaSet().bump, bumpScale: 1.5, roughness: 0.9 }), n);
    stones.receiveShadow = true;
    const axis = new THREE.Vector3().crossVectors(from, to).normalize();
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
    const tmp = new THREE.Object3D();
    for (let i = 0; i < n; i++) {
      const a = (0.6 + i * 0.85) / RADIUS;
      const d = from.clone().applyAxisAngle(axis, a);
      const wobble = Math.sin(i * 2.3) * 0.18 / RADIUS;       // not perfectly straight
      d.applyAxisAngle(d.clone().cross(axis).normalize(), wobble);
      place(tmp, d, { heading: i * 0.9, sink: 0.03 });
      stones.setMatrixAt(i, m.compose(tmp.position, tmp.quaternion, sc.set(0.9 + (i % 3) * 0.08, 1, 0.8 + (i % 2) * 0.12)));
      occupied.push([d.clone(), 0.5]);
      if (i === 4) { // a pair of tiki torches marks the way, a few steps in so they don't loom at your feet
        for (const side of [-1, 1]) {
          const torch = tikiTorch({ height: 1.7, light: quality.high ? 2.0 : 0 });
          const side2 = d.clone().applyAxisAngle(d.clone().cross(axis).normalize(), side * 1.1 / RADIUS);
          put(torch, side2, {}, 0.3);
          animated.push((t) => torch.userData.update(t));
        }
      }
    }
    group.add(stones);
  }

  // Telescope: aimed at the next launch.
  {
    const scope = new THREE.Group();
    const brass = pbr({ color: 0xc9953a, metalness: 1, roughness: 0.3 });
    const dark = pbr({ color: 0x1c1e24, metalness: 0.6, roughness: 0.45 });
    [0, 1, 2].forEach((i) => {
      const a = (i / 3) * Math.PI * 2;
      const leg = mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.5, 6), dark, [Math.cos(a) * 0.3, 0.7, Math.sin(a) * 0.3], scope);
      leg.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3);
    });
    const tube = new THREE.Group();
    tube.position.set(0, 1.45, 0);
    tube.rotation.set(0.9, 0, 0.5);
    scope.add(tube);
    mesh(new THREE.CylinderGeometry(0.12, 0.17, 1.4, 16), brass, [0, 0.2, 0], tube);
    mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.1, 16), dark, [0, 0.9, 0], tube);
    animated.push((t) => { tube.rotation.y = Math.sin(t * 0.2) * 0.3; });
    put(scope, SPOTS.telescope, { heading: 2.0 }, 1.5);
    colliders.push({ center: scope.position.clone(), radius: 0.45 });
    interactables.push({ id: 'launch', label: 'Telescope', verb: 'See the next rocket launch', object: scope, point: scope.position.clone(), approach: surfacePoint(dirFrom(0.54, 2.73)), radius: 2.2 });
  }

  // Campfire on the far side, with log benches. An Outer Wilds nod.
  {
    const camp = new THREE.Group();
    camp.add(prop('nature-kit_campfire-stones', 2.2));
    const fire = createFire({ width: 0.7, height: 1.2, light: 7, distance: 10, shadow: quality.high });
    fire.group.position.y = 0.05;
    camp.add(fire.group);
    [[1.4, 0.3, 0.3], [-1.2, 0.8, 2.2], [0.2, -1.5, 1.4]].forEach(([x, z, ry]) => {
      const l = prop('nature-kit_log', 2.4);
      l.position.set(x, 0, z);
      l.rotation.y = ry;
      camp.add(l);
    });
    const marsh = mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.1, 4), pbr({ color: 0x8a5634 }), [0.7, 0.55, 0.2], camp);
    marsh.rotation.z = 1.0;
    mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 10), pbr({ color: 0xfff4e0, emissive: 0x442200, roughness: 0.6 }), [0.25, 0.83, 0.2], camp).rotation.z = 1.0;
    animated.push((t) => fire.update(t));
    // two moai keep watch over the fire
    [[-2.6, -2.2, 0.9], [2.4, -2.6, -0.8]].forEach(([x, z, ry], i) => {
      const m = heroOr(heroes, 'moai', () => moai({ height: 2.2 + i * 0.4 }));
      m.position.set(x, -0.1, z);
      m.rotation.y = ry;
      camp.add(m);
    });
    put(camp, SPOTS.campfire, { heading: 0.8 }, 3);
    colliders.push({ center: camp.position.clone(), radius: 0.6 });
    for (const [x, z] of [[-2.6, -2.2], [2.4, -2.6]]) colliders.push({ center: camp.localToWorld(new THREE.Vector3(x, 0, z)), radius: 0.6 });
    interactables.push({ id: 'campfire', label: 'Campfire', verb: 'Sit by the fire', object: camp, point: camp.position.clone(), approach: surfacePoint(dirFrom(2.47, -1.6)), radius: 2.8 });
  }

  // Satellite dish, pointed at the sky.
  {
    const dish = prop('space-kit_satellitedish', 2.8);
    put(dish, SPOTS.dish, { heading: 1.2 }, 2);
    colliders.push({ center: dish.position.clone(), radius: 0.8 });
  }

  // A rowboat, beached, for reasons nobody can explain.
  {
    const boat = prop('pirate-kit_boat-row-small', 0.85);
    put(boat, SPOTS.boat, { heading: 2.2, sink: 0.12 }, 2);
    colliders.push({ center: boat.position.clone(), radius: 1.0 });
  }

  // Scatter: lava rock, palms, dark greenery, and a few softly glowing space crystals.
  {
    let s = 42;
    const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const spot = (r, minPolar) => {
      for (let tries = 0; tries < 200; tries++) {
        const dir = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();
        if (Math.acos(dir.dot(BAR_DIR)) < minPolar) continue;
        if (occupied.some(([d, rad]) => d.angleTo(dir) * RADIUS < rad + r + 0.4)) continue;
        return dir;
      }
      return null;
    };
    const scale = quality.high ? 1 : 0.6;
    // lava rocks
    for (let i = 0; i < 16; i++) {
      const size = 0.4 + rand() * 0.9, dir = spot(size, 0.6);
      if (!dir) continue;
      put(lavaRock({ size, seed: 100 + i }), dir, { heading: rand() * 6.28, sink: size * 0.25 }, size);
      colliders.push({ center: surfacePoint(dir), radius: size * 0.85 });
    }
    // palms
    for (let i = 0; i < 9; i++) {
      const dir = spot(0.6, 0.5);
      if (!dir) continue;
      const p = palm({ height: 4 + rand() * 2.5, lean: 0.2 + rand() * 0.35, seed: 200 + i });
      put(p, dir, { heading: rand() * 6.28 }, 0.6);
      colliders.push({ center: surfacePoint(dir), radius: 0.3 });
      const crown = p.userData.crown;
      animated.push((t) => { crown.rotation.z = Math.sin(t * 0.8 + i) * 0.035; });
    }
    // crystals: a sci-fi accent, glowing faintly teal
    for (let i = 0; i < 7; i++) {
      const dir = spot(0.4, 0.9);
      if (!dir) continue;
      const c = prop(i % 2 ? 'space-kit_rock-crystalslargea' : 'space-kit_rock-crystals', 1.6 + rand() * 0.6);
      c.traverse((o) => { if (o.isMesh) o.material = pbr({ color: 0x1c3440, emissive: PALETTE.aqua, emissiveIntensity: 0.35, roughness: 0.2, metalness: 0.3 }); });
      put(c, dir, { heading: rand() * 6.28, sink: 0.05 }, 0.4);
    }
    // dark greenery
    for (let i = 0; i < Math.round(40 * scale); i++) {
      const dir = spot(0.2, 0.5);
      if (!dir) continue;
      const b = prop(i % 2 ? 'nature-kit_plant-bush' : 'nature-kit_plant-bushsmall', 2 + rand());
      b.traverse((o) => { if (o.isMesh) o.material = pbr({ color: 0x24402a, roughness: 0.9 }); });
      put(b, dir, { heading: rand() * 6.28, sink: 0.02 }, 0.2);
    }
  }

  return {
    group,
    colliders,
    interactables,
    update(t) { for (const f of animated) f(t); },
  };
}
