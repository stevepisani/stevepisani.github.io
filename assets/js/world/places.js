// Everything on the asteroid that isn't the bar: your rocket, the lantern-lit path,
// the telescope, the campfire and moai on the far side, and scattered lava rock and palms.
import * as THREE from 'three';
import { PALETTE, pbr, surface, lavaSet, woodSet, glow } from './materials.js';
import { createFire } from './fire.js';
import * as T from './textures.js';
import { palm, lavaRock, moai, tikiTorch } from './props.js';
import { heroOr } from './hero.js';
import { place, dirFrom, headingToward, surfacePoint, surfaceRadius, BAR_DIR, RADIUS } from './planet.js';

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

export function buildPlaces({ prop, quality, heroes, badge = null }) {
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
  // A bamboo post with a glowing glass lantern: the practical light for a landmark out in the
  // dark, so everything on the planet can be seen (warm light only ever comes from practicals).
  // Phones get the glow only: every light costs every lit surface, and the raised night
  // ambient already shows the shape.
  const lantern = (dir, { height = 1.5, light = quality.high ? 3.2 : 0 } = {}) => {
    const g = new THREE.Group();
    mesh(new THREE.CylinderGeometry(0.035, 0.045, height, 6), surface(woodSet(PALETTE.stain), { roughness: 0.8 }), [0, height / 2, 0], g);
    mesh(new THREE.SphereGeometry(0.11, 14, 10), glow(PALETTE.amber, 3), [0, height + 0.08, 0], g).castShadow = false;
    if (light) {
      const l = new THREE.PointLight(PALETTE.amber, light, 7, 1.4);
      l.position.y = height + 0.1;
      g.add(l);
    }
    return put(g, dir, {}, 0.3);
  };
  const beside = (dir, metres, turn = 0) => {
    const up = dir.clone().normalize();
    const side = new THREE.Vector3(0, 1, 0).cross(up).normalize().applyAxisAngle(up, turn);
    return up.multiplyScalar(RADIUS).addScaledVector(side, metres).normalize();
  };

  // Stand a model firmly on the ground: centre it on its own base (Kenney models often sit off
  // their origin), then sink it by however far the ground falls away under its footprint (the
  // planet curves, and the terrain rolls), so no edge of it hangs in the air.
  const ground = (obj, dir, opts = {}, clear = 1.5) => {
    const box = new THREE.Box3().setFromObject(obj);
    const mid = box.getCenter(new THREE.Vector3());
    const holder = new THREE.Group();
    holder.add(obj);
    obj.position.x -= mid.x; obj.position.y -= box.min.y; obj.position.z -= mid.z;
    const r = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2;
    const up = dir.clone().normalize();
    const t1 = new THREE.Vector3(0, 1, 0).cross(up);
    if (t1.lengthSq() < 1e-6) t1.set(1, 0, 0);
    t1.normalize();
    const t2 = up.clone().cross(t1);
    const h0 = surfaceRadius(up);
    let drop = 0;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const d = up.clone().multiplyScalar(h0).addScaledVector(t1, Math.cos(a) * r).addScaledVector(t2, Math.sin(a) * r).normalize();
      drop = Math.max(drop, h0 - d.multiplyScalar(surfaceRadius(d)).dot(up));
    }
    return put(holder, dir, { ...opts, sink: (opts.sink || 0) + drop + 0.02 }, clear);
  };

  // Your rocket: how you got here, parked on a landing pad. "Fly home" leaves for the classic
  // site. At night it has to be findable: floodlights wash up the hull, the pad's edge lights
  // blink in turn, and a beacon on the nose blinks like an aircraft's.
  {
    const pad = new THREE.Group();
    const PAD_TOP = 0.2;
    // an octagonal lava-rock slab, deep enough that its edge stays buried where the planet curves away
    const slab = mesh(new THREE.CylinderGeometry(2.4, 2.55, 0.8, 8), surface(lavaSet(), { bumpScale: 3, roughness: 0.95 }), [0, PAD_TOP - 0.4, 0], pad);
    slab.rotation.y = Math.PI / 8;
    const deck = mesh(new THREE.CircleGeometry(2.3, 8).rotateX(-Math.PI / 2), pbr({ map: T.landingPad(), roughness: 0.85 }), [0, PAD_TOP + 0.005, 0], pad);
    deck.rotation.y = Math.PI / 8;
    deck.castShadow = false;

    const rocket = new THREE.Group();
    rocket.position.y = PAD_TOP;
    pad.add(rocket);
    const parts = [['space-kit_rocket-basea', 0], ['space-kit_rocket-fuela', 1.6], ['space-kit_rocket-sidesa', 2.4], ['space-kit_rocket-topa', 4.0]];
    for (const [name, y] of parts) {
      const p = prop(name, 1.6);
      p.position.y = y;
      rocket.add(p);
    }
    // the kit's parts sit off to one side of their origin: centre the rocket on the pad (and so on
    // its collider, click target, floodlights and beacon)
    rocket.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(rocket);
    const mid = box.getCenter(new THREE.Vector3());
    for (const c of rocket.children) { c.position.x -= mid.x; c.position.z -= mid.z; }
    const top = box.max.y - PAD_TOP;

    // blinking beacon on a short mast above the nose
    mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 6), pbr({ color: PALETTE.chrome, metalness: 1, roughness: 0.3 }), [0, top + 0.18, 0], rocket);
    const beacon = mesh(new THREE.SphereGeometry(0.09, 12, 8), glow(PALETTE.coral, 8), [0, top + 0.42, 0], rocket);
    beacon.castShadow = false;
    // edge lights round the pad, chasing
    const edge = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const l = mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.07, 10), glow(i % 2 ? PALETTE.aqua : PALETTE.amber, 3.5), [Math.cos(a) * 2.25, PAD_TOP + 0.035, Math.sin(a) * 2.25], pad);
      l.castShadow = false;
      edge.push(l);
    }
    animated.push((t) => {
      beacon.visible = (t % 1.6) < 0.18;
      const k = Math.floor(t * 4) % 8;
      edge.forEach((l, i) => { l.visible = i !== k; });
    });

    put(pad, SPOTS.rocket, { heading: 0.4 }, 2.8);
    pad.updateMatrixWorld(true);
    // Floodlights at the pad's edge, cool like the moonlight, aimed up the hull. The first one
    // stands on the side you walk up from (phones only get that one).
    const fromPath = pad.worldToLocal(surfacePoint(SPOTS.spawn));
    const a0 = Math.atan2(fromPath.z, fromPath.x) + 0.45; // a little off-axis, so it models the hull
    const aim = pad.localToWorld(new THREE.Vector3(0, top * 0.5, 0));
    for (const a of quality.high ? [a0, a0 + Math.PI] : [a0]) {
      const x = Math.cos(a) * 2.0, z = Math.sin(a) * 2.0;
      const housing = mesh(new THREE.BoxGeometry(0.22, 0.14, 0.14), pbr({ color: PALETTE.lava, roughness: 0.6 }), [x, PAD_TOP + 0.09, z], pad);
      housing.lookAt(aim);
      const lens = mesh(new THREE.CircleGeometry(0.05, 12), glow(PALETTE.moon, 3), [x * 0.96, PAD_TOP + 0.12, z * 0.96], pad);
      lens.lookAt(aim);
      lens.castShadow = false;
      // wide and soft-edged, so it washes the hull instead of drawing a hot oval on it
      const flood = new THREE.SpotLight(PALETTE.moon, quality.high ? 9 : 12, 10, 0.62, 1, 1.2);
      flood.position.set(x, PAD_TOP + 0.15, z);
      flood.target.position.set(0, top * 0.55, 0);
      pad.add(flood, flood.target);
    }
    // Steve's SJPJr badge (the site's logo, NASA-meatball style) on the hull: one on the side
    // you walk up from, one opposite. Each lies flat on the hull facet it lands on.
    if (badge) {
      new THREE.TextureLoader().load(badge, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        const mat = pbr({ map: tex, transparent: true, alphaTest: 0.4, roughness: 0.45, polygonOffset: true, polygonOffsetFactor: -2 });
        const ray = new THREE.Raycaster();
        const h = 3.3; // mid-body, above the orange band
        for (const a of [a0 - 0.45, a0 - 0.45 + Math.PI]) {
          const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
          const from = pad.localToWorld(out.clone().multiplyScalar(4).setY(PAD_TOP + h));
          const to = pad.localToWorld(new THREE.Vector3(0, PAD_TOP + h, 0));
          ray.set(from, to.sub(from).normalize());
          const hit = ray.intersectObject(rocket, true).find((i) => i.face);
          if (!hit) continue;
          const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
          const decal = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), mat);
          decal.position.copy(rocket.worldToLocal(hit.point.clone().addScaledVector(n, 0.015)));
          rocket.add(decal);
          decal.lookAt(hit.point.clone().addScaledVector(n, 1)); // face outward, square to the facet
        }
      });
    }
    colliders.push({ center: pad.position.clone(), radius: 1.2 });
    interactables.push({ id: 'rocket', label: 'Your rocket', verb: 'Fly to the classic site', object: rocket, point: pad.position.clone(), approach: surfacePoint(dirFrom(0.66, 1.42)), radius: 2.6 });
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
    // (not fully metallic: with no sky reflections to pick up, pure metal renders black at night)
    const brass = pbr({ color: 0xc9953a, metalness: 0.55, roughness: 0.35 });
    const dark = pbr({ color: 0x1c1e24, metalness: 0.3, roughness: 0.5 });
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
    // its lantern stands on the side you walk up from (towards the bar)
    {
      const up = SPOTS.telescope.clone().normalize();
      const towardBar = BAR_DIR.clone().sub(up.clone().multiplyScalar(up.dot(BAR_DIR))).normalize();
      const side = towardBar.clone().cross(up).normalize();
      lantern(up.clone().multiplyScalar(RADIUS).addScaledVector(towardBar, 0.9).addScaledVector(side, 0.8).normalize());
    }
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
    const dish = ground(prop('space-kit_satellitedish', 2.8), SPOTS.dish, { heading: 1.2 }, 2);
    colliders.push({ center: dish.position.clone(), radius: 0.8 });
    // a floodlight at its foot and a blinking beacon on top, like a real ground station
    dish.updateMatrixWorld(true);
    const up = dish.position.clone().normalize();
    const flood = new THREE.SpotLight(PALETTE.moon, quality.high ? 10 : 12, 9, 0.7, 1, 1.2);
    flood.position.copy(dish.position).addScaledVector(up, 0.2).add(new THREE.Vector3().subVectors(dish.position, SPOTS.spawn.clone().multiplyScalar(RADIUS)).normalize().multiplyScalar(-1.8));
    flood.target.position.copy(dish.position).addScaledVector(up, 1.2);
    group.add(flood, flood.target);
    const beacon = mesh(new THREE.SphereGeometry(0.07, 10, 8), glow(PALETTE.coral, 8), [0, 0, 0], group);
    beacon.castShadow = false;
    { // the highest point of the dish, along its up
      let hi = -Infinity; const v = new THREE.Vector3();
      dish.traverse((m) => { if (!m.isMesh) return; const pos = m.geometry.attributes.position; for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); const h = v.clone().sub(dish.position).dot(up); if (h > hi) { hi = h; beacon.position.copy(v); } } });
      beacon.position.addScaledVector(up, 0.1);
    }
    animated.push((t) => { beacon.visible = ((t + 0.7) % 1.9) < 0.2; });
    lantern(beside(SPOTS.dish, 1.6, 0.5), { height: 1.2 });
  }

  // A rowboat, beached, for reasons nobody can explain.
  {
    const boat = prop('pirate-kit_boat-row-small', 0.85);
    put(boat, SPOTS.boat, { heading: 2.2, sink: 0.12 }, 2);
    lantern(beside(SPOTS.boat, 1.5, 1.2), { height: 1.3 });
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
      ground(c, dir, { heading: rand() * 6.28, sink: 0.05 }, 0.4);
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
