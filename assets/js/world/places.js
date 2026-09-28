// Everything on the asteroid that isn't the bar: your rocket, the lantern-lit path,
// the telescope, the campfire and moai on the far side, and scattered lava rock and palms.
import * as THREE from 'three';
import { PALETTE, pbr, surface, lavaSet, woodSet, bambooSet, glow } from './materials.js';
import { buildTrails, sampleTrail, trailEdgeFn, offset } from './paths.js';
import { saturnV, launcher } from './rocket.js';
import { buildCampfire } from './camp.js';
import * as T from './textures.js';
import { palm, lavaRock, tikiTorch } from './props.js';
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

// The trail network. The flagstone walk runs from where you land to the bar; gravel trails
// branch off it to everything else, so every landmark is somewhere a path goes. Waypoints are
// (polar, longitude) like SPOTS; they swing wide of the bar's palms and planting.
const FORK = dirFrom(0.33, Math.PI / 2); // where the trails leave the walk
export const TRAILS = [
  { id: 'bar', points: [dirFrom(0.68, Math.PI / 2), dirFrom(0.5, Math.PI / 2 + 0.03), FORK, dirFrom(0.2, Math.PI / 2)], width: 1.5, flags: 'walk', seed: 1, openEnd: true },
  { id: 'rocket', points: [dirFrom(0.6, Math.PI / 2), dirFrom(0.625, 1.48), dirFrom(0.66, 1.4)], width: 1.0, flags: 'steps', seed: 2, openStart: true, openEnd: true },
  { id: 'telescope', points: [FORK, dirFrom(0.35, 2.05), dirFrom(0.44, 2.48), dirFrom(0.525, 2.7)], width: 1.05, flags: 'steps', seed: 3, meander: 0.3, lanterns: 7, openStart: true },
  { id: 'dish', points: [FORK, dirFrom(0.35, 1.0), dirFrom(0.38, 0.3), dirFrom(0.45, -0.3), dirFrom(0.7, -0.32), dirFrom(0.97, -0.24)], width: 1.05, flags: 'steps', seed: 4, meander: 0.35, lanterns: 7, openStart: true },
  { id: 'campfire', points: [dirFrom(0.97, -0.24), dirFrom(1.4, -0.66), dirFrom(1.85, -1.06), dirFrom(2.2, -1.4), dirFrom(2.43, -1.58)], width: 0.95, flags: 'steps', seed: 5, meander: 0.5, lanterns: 8, openStart: true },
];
for (const t of TRAILS) t.sampled = sampleTrail(t.points, t);
/** Metres from a direction to the nearest trail's edge (negative on a trail). */
export const trailEdge = trailEdgeFn(TRAILS);
// Footprints the planet's grass and pebbles keep out of: the landing pad, the camp, the dish,
// the boat and the telescope (they're placed before any of these exist).
const FOOTPRINTS = [[SPOTS.rocket, 2.7], [SPOTS.campfire, 2.2], [SPOTS.dish, 1.3], [SPOTS.boat, 1.2], [SPOTS.telescope, 0.7]].map(([d, r]) => [d.clone().normalize(), r]);
/** True where nothing should grow: on a trail or under a landmark. */
export const keepClear = (dir, margin = 0) => trailEdge(dir) < margin || FOOTPRINTS.some(([d, r]) => d.angleTo(dir) * RADIUS < r + margin);

// How far the ground falls away (along `dir`'s up) within `r` metres of it: sink something by
// this and no edge of its footprint hangs in the air.
function footDrop(dir, r) {
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
  return drop;
}

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
  // A bamboo post with a crook arm and a hooded glass lantern hanging from it: the practical
  // light for a landmark out in the dark, and the way-markers along the trails. Phones (and the
  // trail lanterns) get the glow only: every light costs every lit surface.
  const lanternMats = { bamboo: surface(bambooSet(), { roughness: 0.7 }), cap: pbr({ color: PALETTE.lava, roughness: 0.5, metalness: 0.4 }), glass: glow(PALETTE.amber, 3), cord: pbr({ color: PALETTE.lava }) };
  const lantern = (dir, { height = 1.5, light = quality.high ? 3.2 : 0 } = {}) => {
    const g = new THREE.Group();
    const M = lanternMats;
    mesh(new THREE.CylinderGeometry(0.035, 0.045, height, 8), M.bamboo, [0, height / 2, 0], g);
    const arm = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.32, 6), M.bamboo, [0.13, height - 0.06, 0], g);
    arm.rotation.z = Math.PI / 2;
    const hang = new THREE.Group();
    hang.position.set(0.25, height - 0.08, 0);
    g.add(hang);
    mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.1, 4), M.cord, [0, -0.05, 0], hang);
    mesh(new THREE.ConeGeometry(0.075, 0.07, 6), M.cap, [0, -0.13, 0], hang);
    const glass = mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.13, 6), M.glass, [0, -0.23, 0], hang);
    glass.castShadow = false;
    mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.02, 6), M.cap, [0, -0.305, 0], hang);
    if (light) {
      const l = new THREE.PointLight(PALETTE.amber, light, 7, 1.4);
      l.position.set(0.25, height - 0.3, 0);
      g.add(l);
    }
    return put(g, dir, { heading: (dir.x * 13.7 + dir.z * 7.1) % 6.28 }, 0.3);
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
    return put(holder, dir, { ...opts, sink: (opts.sink || 0) + footDrop(dir, r) + 0.02 }, clear);
  };

  // Your rocket, a Saturn V (rocket.js): how you got here, parked on its launcher on a landing
  // pad, beside its red umbilical tower. "Fly home" leaves for the classic site. At night it has
  // to be findable: floodlights wash up the hull, the pad's edge lights blink in turn, and
  // beacons on the escape tower and the umbilical tower blink like an aircraft's.
  {
    const pad = new THREE.Group();
    const PAD_TOP = 0.2;
    // an octagonal lava-rock slab, deep enough that its edge stays buried where the planet curves away
    const slab = mesh(new THREE.CylinderGeometry(2.4, 2.55, 0.8, 8), surface(lavaSet(), { bumpScale: 3, roughness: 0.95 }), [0, PAD_TOP - 0.4, 0], pad);
    slab.rotation.y = Math.PI / 8;
    const deck = mesh(new THREE.CircleGeometry(2.3, 8).rotateX(-Math.PI / 2), pbr({ map: T.landingPad(), roughness: 0.85 }), [0, PAD_TOP + 0.005, 0], pad);
    deck.rotation.y = Math.PI / 8;
    deck.castShadow = false;

    // place the pad first: the rocket turns its badge, and the tower stands, relative to the path
    put(pad, SPOTS.rocket, { heading: 0.4 }, 2.8);
    pad.updateMatrixWorld(true);
    const fromPath = pad.worldToLocal(surfacePoint(SPOTS.spawn)).setY(0).normalize();

    // the Saturn V on its launcher, badge towards the path, the umbilical tower off to one side
    // behind it (so from the path it stands beside the rocket, not in front of it)
    const saturn = saturnV({ height: 8, badge });
    saturn.faceBadge(fromPath.x, fromPath.z);
    const tSide = fromPath.clone().negate().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.75);
    const base = launcher(saturn, { side: [tSide.x, tSide.z] });
    const rocket = new THREE.Group();
    rocket.position.y = PAD_TOP;
    rocket.add(base.group);
    saturn.group.position.y = 0.12;
    rocket.add(saturn.group);
    pad.add(rocket);
    const top = saturn.top + 0.12;

    // blinking beacon on the escape tower's nose
    const beacon = mesh(new THREE.SphereGeometry(0.07, 12, 8), glow(PALETTE.coral, 8), [0, top + 0.07, 0], rocket);
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
      base.beacon.visible = ((t + 0.8) % 1.6) < 0.18;
      const k = Math.floor(t * 4) % 8;
      edge.forEach((l, i) => { l.visible = i !== k; });
    });

    // Floodlights at the pad's edge, cool like the moonlight, aimed up the hull. The first one
    // stands on the side you walk up from (phones only get that one).
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
      const flood = new THREE.SpotLight(PALETTE.moon, quality.high ? 11 : 14, 13, 0.55, 1, 1.1);
      flood.position.set(x, PAD_TOP + 0.15, z);
      flood.target.position.set(0, top * 0.55, 0);
      pad.add(flood, flood.target);
    }
    // the tower is solid too
    colliders.push({ center: pad.localToWorld(base.tower.position.clone()), radius: 0.55 });
    colliders.push({ center: pad.position.clone(), radius: 1.2 });
    interactables.push({ id: 'rocket', label: 'Your rocket', verb: 'Fly to the classic site', object: rocket, point: pad.position.clone(), approach: surfacePoint(dirFrom(0.66, 1.42)), radius: 2.6 });
  }

  // The trails: a flagstone walk from where you land to the bar, and gravel trails from it to
  // everything else, with lanterns along the long ones. Paths lead somewhere; nobody needs to
  // be told to follow one.
  {
    const trails = buildTrails(TRAILS, { quality });
    group.add(trails.group);
    for (const dir of trails.lanterns) lantern(dir, { height: 1.1, light: 0 });
    // a pair of tiki torches marks the walk a few steps in, so they don't loom at your feet
    const walk = TRAILS[0].sampled;
    const mark = walk.samples.find((x) => Math.acos(x.up.dot(BAR_DIR)) < 0.43);
    for (const side of [-1, 1]) {
      const torch = tikiTorch({ height: 1.7, light: quality.high ? 2.0 : 0 });
      put(torch, offset(mark.up, mark.side, side * 1.15), {}, 0.3);
      animated.push((t) => torch.userData.update(t));
    }
  }

  // Telescope: a brass refractor on a wooden surveyor's tripod, slowly tracking the sky
  // (aimed at the next launch).
  {
    const scope = brassTelescope();
    put(scope, SPOTS.telescope, { heading: 2.0, sink: footDrop(SPOTS.telescope, 0.58) + 0.01 }, 1.5);
    const az = scope.userData.az, az0 = az.rotation.y;
    animated.push((t) => { az.rotation.y = az0 + Math.sin(t * 0.2) * 0.3; });
    // its lantern stands on the side you walk up from (towards the bar)
    {
      const up = SPOTS.telescope.clone().normalize();
      const towardBar = BAR_DIR.clone().sub(up.clone().multiplyScalar(up.dot(BAR_DIR))).normalize();
      const side = towardBar.clone().cross(up).normalize();
      lantern(up.clone().multiplyScalar(RADIUS).addScaledVector(towardBar, 0.9).addScaledVector(side, 0.8).normalize());
    }
    colliders.push({ center: scope.position.clone(), radius: 0.6 });
    interactables.push({ id: 'launch', label: 'Telescope', verb: 'See the next rocket launch', object: scope, point: scope.position.clone(), approach: surfacePoint(dirFrom(0.54, 2.73)), radius: 2.2 });
  }

  // The campfire on the far side (camp.js), Outer Wilds style: you sit on the log facing the way
  // the trail comes in, and roast marshmallows.
  {
    const cf = buildCampfire({ quality, heroes });
    const camp = cf.group;
    put(camp, SPOTS.campfire, { heading: 0.8 }, 3);
    camp.updateMatrixWorld(true);
    const trailEnd = camp.worldToLocal(surfacePoint(dirFrom(2.43, -1.58)));
    const local = cf.seatToward(trailEnd.x, trailEnd.z);
    camp.updateMatrixWorld(true);
    const toWorld = (v) => camp.localToWorld(v.clone());
    const seat = { eye: toWorld(local.eye), look: toWorld(local.look), stand: toWorld(local.stand), dip: toWorld(local.dip), rise: toWorld(local.rise) };
    animated.push((t) => cf.update(t));
    colliders.push({ center: camp.position.clone(), radius: 0.8 });
    for (const [x, z] of [[-2.6, -2.2], [2.4, -2.6]]) colliders.push({ center: camp.localToWorld(new THREE.Vector3(x, 0, z)), radius: 0.6 });
    interactables.push({
      id: 'campfire', label: 'Campfire', verb: 'Sit and roast a marshmallow', object: camp, point: camp.position.clone(),
      approach: surfacePoint(toWorld(local.approach).normalize()), radius: 2.8, seat, hotSpot: toWorld(cf.hotSpot),
    });
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
        if (trailEdge(dir) < r + 0.35) continue;
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

/**
 * A brass refractor on a wooden surveyor's tripod: tapered square legs with brass ferrules and
 * a spreader tray, an alt-azimuth yoke, and a lathe-turned tube (dew shield, lens cell,
 * leather grip, focuser, eyepiece) with a finder scope. `userData.az` turns on the tripod head.
 */
function brassTelescope() {
  const g = new THREE.Group();
  const brass = pbr({ color: PALETTE.brass, metalness: 0.55, roughness: 0.3 });
  const dark = pbr({ color: PALETTE.lava, roughness: 0.55, metalness: 0.2 });
  const leather = pbr({ color: PALETTE.stain, roughness: 0.7 });
  const wood = surface(woodSet(PALETTE.wood), { roughness: 0.6 });
  const lens = pbr({ color: PALETTE.teal, roughness: 0.04, metalness: 0.3, emissive: PALETTE.moon, emissiveIntensity: 0.35 });
  const HEAD = 1.22, SPREAD = 0.55;
  const Y = new THREE.Vector3(0, 1, 0);
  const strut = (from, to, radius0, radius1, material, segments = 4) => {
    const axis = new THREE.Vector3().subVectors(to, from);
    const m = mesh(new THREE.CylinderGeometry(radius1, radius0, axis.length(), segments), material, [0, 0, 0], g);
    m.position.copy(from).addScaledVector(axis, 0.5);
    m.quaternion.setFromUnitVectors(Y, axis.normalize());
    return m;
  };
  const legAt = (a, y) => { const k = y / HEAD; return new THREE.Vector3(Math.cos(a) * (SPREAD + (0.1 - SPREAD) * k), y, Math.sin(a) * (SPREAD + (0.1 - SPREAD) * k)); };
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    const foot = legAt(a, 0), top = legAt(a, HEAD - 0.03);
    strut(foot.clone().setY(0.07), top, 0.032, 0.022, wood).rotateY(Math.PI / 4);
    strut(foot, foot.clone().setY(0.075), 0.012, 0.03, brass, 8);             // pointed brass shoe
    const hinge = mesh(new THREE.BoxGeometry(0.06, 0.05, 0.05), brass, [0, 0, 0], g);
    hinge.position.copy(legAt(a, HEAD - 0.04));
    hinge.rotation.y = -a;
    // spreader: a rod from the tray to each leg
    strut(new THREE.Vector3(Math.cos(a) * 0.14, 0.5, Math.sin(a) * 0.14), legAt(a, 0.5), 0.007, 0.007, brass, 6);
  }
  const tray = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 3), wood, [0, 0.5, 0], g);
  tray.rotation.y = Math.PI / 6;
  mesh(new THREE.CylinderGeometry(0.13, 0.12, 0.045, 24), brass, [0, HEAD, 0], g);

  // the mount turns on the head
  const az = new THREE.Group();
  az.position.y = HEAD + 0.02;
  g.add(az);
  mesh(new THREE.CylinderGeometry(0.028, 0.04, 0.14, 16), brass, [0, 0.07, 0], az);
  mesh(new THREE.BoxGeometry(0.27, 0.03, 0.06), brass, [0, 0.15, 0], az);
  for (const x of [-0.125, 0.125]) mesh(new THREE.BoxGeometry(0.025, 0.2, 0.06), brass, [x, 0.25, 0], az);
  const alt = new THREE.Group();
  alt.position.y = 0.33;
  alt.rotation.x = -0.6; // about 34° up
  az.add(alt);
  const trunnion = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.28, 12), brass, [0, 0, 0], alt);
  trunnion.rotation.z = Math.PI / 2;
  // the optical tube, turned on a lathe along its own +y, then laid along the yoke's +z
  const optic = new THREE.Group();
  optic.rotation.x = Math.PI / 2;
  alt.add(optic);
  const profile = [[0, -0.62], [0.02, -0.62], [0.024, -0.6], [0.019, -0.57], [0.019, -0.52], [0.028, -0.52], [0.028, -0.41],
    [0.046, -0.41], [0.046, -0.34], [0.063, -0.335], [0.066, -0.3], [0.07, 0.54], [0.082, 0.545], [0.082, 0.6], [0.089, 0.6],
    [0.089, 0.84], [0.083, 0.845], [0.08, 0.63], [0.068, 0.625]];
  mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 32), brass, [0, 0, 0], optic);
  mesh(new THREE.CircleGeometry(0.068, 32).rotateX(-Math.PI / 2), lens, [0, 0.628, 0], optic).castShadow = false;
  mesh(new THREE.CylinderGeometry(0.0715, 0.0715, 0.34, 32, 1, true), leather, [0, 0.05, 0], optic); // leather grip
  for (const y of [-0.12, 0.22, 0.54]) mesh(new THREE.TorusGeometry(0.071, 0.005, 6, 32).rotateX(Math.PI / 2), dark, [0, y, 0], optic);
  mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.02, 16), dark, [0, -0.625, 0], optic);              // eyecup
  const knobs = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 8), brass, [0, -0.375, 0], optic);
  knobs.rotation.z = Math.PI / 2;
  for (const x of [-0.07, 0.07]) mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.012, 16).rotateZ(Math.PI / 2), brass, [x, -0.375, 0], optic);
  // finder scope on two brackets, riding on top of the tube
  mesh(new THREE.CylinderGeometry(0.016, 0.014, 0.32, 16), brass, [0, 0.12, -0.105], optic);
  mesh(new THREE.CircleGeometry(0.014, 16).rotateX(-Math.PI / 2), lens, [0, 0.281, -0.105], optic).castShadow = false;
  for (const y of [0.02, 0.22]) mesh(new THREE.BoxGeometry(0.014, 0.02, 0.04), brass, [0, y, -0.085], optic);
  g.userData.az = az;
  return g;
}
