// Everything on the asteroid that isn't the bar: your rocket, the telescope,
// the campfire on the far side, a satellite dish, and scattered nature.
import * as THREE from 'three';
import * as T from './textures.js';
import { toon, glowMat } from './stylize.js';
import { place, dirFrom, headingToward, BAR_DIR, RADIUS } from './planet.js';

// Where things are, as (polar angle from the bar, longitude). The bar is at polar 0.
export const SPOTS = {
  spawn: dirFrom(0.44, 1.5),      // in front of the counter (the bar faces longitude π/2)
  rocket: dirFrom(0.62, 1.1),
  sign: dirFrom(0.33, 1.95),
  telescope: dirFrom(0.44, 2.35),
  campfire: dirFrom(2.55, -1.6),  // around the back
  dish: dirFrom(1.2, -0.2),
  boat: dirFrom(0.46, -0.6),
};

function mesh(geo, material, [x, y, z] = [0, 0, 0], parent) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  parent && parent.add(m);
  return m;
}

export function buildPlaces({ prop, quality }) {
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
    const flame = mesh(new THREE.ConeGeometry(0.4, 1.0, 12), glowMat(0x7fd8ff, 1.6), [0, -0.3, 0], rocket);
    flame.rotation.x = Math.PI;
    animated.push((t) => { flame.scale.y = 0.5 + Math.sin(t * 20) * 0.1; });
    put(rocket, SPOTS.rocket, { heading: 0.4, sink: 0.1 }, 2.2);
    colliders.push({ center: rocket.position.clone(), radius: 1.2 });
    interactables.push({ id: 'rocket', point: rocket.position.clone().addScaledVector(SPOTS.rocket, 1.2), radius: 3.0, prompt: 'Fly home (classic site)' });
  }

  // Signpost near the landing spot pointing at the bar.
  {
    const sign = new THREE.Group();
    mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.8, 6), toon({ color: 0x8a5634 }), [0, 0.9, 0], sign);
    const board = mesh(new THREE.BoxGeometry(1.5, 0.45, 0.06), toon({ color: 0xb27a46 }), [0.35, 1.5, 0], sign);
    const label = mesh(new THREE.PlaneGeometry(1.4, 0.4), toon({ map: T.label("STEVE'S · OPEN", { bg: '#b27a46', fg: '#2a160a', w: 512, h: 144 }), rim: 0 }), [0.35, 1.5, 0.035], sign);
    label.renderOrder = 1;
    board.renderOrder = 0;
    put(sign, SPOTS.sign, { heading: headingToward(SPOTS.sign, SPOTS.spawn) }, 1);
    colliders.push({ center: sign.position.clone(), radius: 0.2 });
  }

  // Telescope: aimed at the next launch.
  {
    const scope = new THREE.Group();
    const brass = toon({ color: 0xd9ad52, rim: 0.7 });
    const dark = toon({ color: 0x2a2d36 });
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
    interactables.push({ id: 'launch', point: scope.position.clone(), radius: 2.2, prompt: 'Look through the telescope' });
  }

  // Campfire on the far side, with log benches. An Outer Wilds nod.
  {
    const camp = new THREE.Group();
    camp.add(prop('nature-kit_campfire-stones', 2.2));
    const flame = new THREE.Group();
    flame.position.y = 0.1;
    camp.add(flame);
    // a cluster of small flames plus a soft glow
    const tongues = [[0, 0, 0.7, 0.2, 0xff7a2a], [0.12, 0.06, 0.5, 0.13, 0xffb347], [-0.1, 0.08, 0.55, 0.14, 0xff9a3d], [0.02, -0.12, 0.45, 0.12, 0xffd36e]]
      .map(([x, z, h, r, c]) => mesh(new THREE.ConeGeometry(r, h, 6), glowMat(c, 2.4), [x, h / 2, z], flame));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow('rgba(255,150,60,.9)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 }));
    halo.position.y = 0.45;
    halo.scale.setScalar(2.2);
    flame.add(halo);
    const light = new THREE.PointLight(0xff8a2a, 6, 9, 1.4);
    light.position.y = 1;
    camp.add(light);
    [[1.4, 0.3, 0.3], [-1.2, 0.8, 2.2], [0.2, -1.5, 1.4]].forEach(([x, z, ry]) => {
      const l = prop('nature-kit_log', 2.4);
      l.position.set(x, 0, z);
      l.rotation.y = ry;
      camp.add(l);
    });
    const marsh = mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.1, 4), toon({ color: 0x8a5634 }), [0.7, 0.55, 0.2], camp);
    marsh.rotation.z = 1.0;
    mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 10), toon({ color: 0xfff4e0, emissive: 0x442200 }), [0.25, 0.83, 0.2], camp).rotation.z = 1.0;
    animated.push((t) => {
      const k = 0.85 + Math.sin(t * 11) * 0.1 + Math.sin(t * 6.3) * 0.08;
      tongues.forEach((f, i) => f.scale.set(1, k + Math.sin(t * (9 + i * 2.7) + i) * 0.15, 1));
      halo.material.opacity = 0.45 + k * 0.2;
      light.intensity = 6 * k;
    });
    put(camp, SPOTS.campfire, { heading: 0.8 }, 3);
    colliders.push({ center: camp.position.clone(), radius: 0.6 });
    interactables.push({ id: 'campfire', point: camp.position.clone(), radius: 2.8, prompt: 'Sit by the campfire' });
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

  // Scatter: rocks, crystals, meteors, bushes, flowers, mushrooms.
  {
    let s = 42;
    const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const kinds = [
      // name, scale, count, collider radius (0 = walk-through), min polar from bar
      ['pirate-kit_rocks-a', 0.42, 7, 0.9, 0.8],
      ['pirate-kit_rocks-c', 0.4, 7, 0.7, 0.7],
      ['nature-kit_stone-talla', 1.5, 5, 0.5, 0.7],
      ['space-kit_rock-crystalslargea', 1.8, 8, 0.4, 0.9],
      ['space-kit_rock-crystals', 1.7, 8, 0, 0.75],
      ['space-kit_meteor-detailed', 1.3, 5, 0.5, 1.0],
      ['nature-kit_plant-bush', 2.2, 22, 0, 0.5],
      ['nature-kit_plant-bushsmall', 2.2, 18, 0, 0.5],
      ['nature-kit_flower-reda', 1.6, 28, 0, 0.45],
      ['nature-kit_flower-yellowa', 1.6, 28, 0, 0.45],
      ['nature-kit_flower-purplea', 1.6, 28, 0, 0.45],
      ['nature-kit_mushroom-redgroup', 1.6, 10, 0, 1.1],
      ['pirate-kit_palm-detailed-straight', 1.1, 6, 0.4, 0.55],
    ];
    const scale = quality.high ? 1 : 0.6;
    for (const [name, sc, count, r, minPolar] of kinds) {
      const n = r ? count : Math.round(count * scale);
      for (let i = 0, tries = 0; i < n && tries < 200; tries++) {
        const dir = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();
        if (Math.acos(dir.dot(BAR_DIR)) < minPolar) continue;
        if (occupied.some(([d, rad]) => d.angleTo(dir) * RADIUS < rad + (r || 0.2) + 0.4)) continue;
        const o = prop(name, sc * (0.8 + rand() * 0.45));
        put(o, dir, { heading: rand() * 6.28, sink: r ? 0.15 : 0.02 }, r || 0.2);
        if (r) colliders.push({ center: o.position.clone(), radius: r * (o.scale.x / sc) });
        i++;
      }
    }
  }

  return {
    group,
    colliders,
    interactables,
    update(t) { for (const f of animated) f(t); },
  };
}
