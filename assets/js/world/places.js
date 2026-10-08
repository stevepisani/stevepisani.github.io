// Everything on the asteroid that isn't the bar: your rocket, the lantern-lit path,
// the telescope, the campfire and moai on the far side, and scattered lava rock and palms.
import * as THREE from 'three';
import { PALETTE, pbr, surface, lavaSet, woodSet, bambooSet, glow } from './materials.js';
import { buildTrails, sampleTrail, trailEdgeFn, offset } from './paths.js';
import { saturnLander } from './rocket.js';
import { buildCampfire } from './camp.js';
import * as T from './textures.js';
import { palm, lavaRock, tikiTorch, radioDish, outriggerCanoe, hammock, bookStack, messageBottles, signpost, coconut, glassFloat } from './props.js';
import { stonePile } from './stones.js';
import { shrub } from './decor.js';
import { addLamp } from './lamps.js';
import { place, dirFrom, headingToward, surfacePoint, surfaceRadius, BAR_DIR, RADIUS, POND, pondDir, shoreAt, CUT } from './planet.js';
import { buildMachine } from './machine.js';

// Where things are, as (polar angle from the bar, longitude). The bar is at polar 0.
export const SPOTS = {
  spawn: dirFrom(0.62, Math.PI / 2), // ~12 m out, straight in front of the bar (it faces longitude π/2)
  rocket: dirFrom(0.72, 1.3),
  telescope: dirFrom(0.5, 2.85),
  campfire: dirFrom(2.55, -1.6),     // around the back
  dish: dirFrom(1.1, -0.2),
  boat: null, // on the lagoon's shore (below)
};
SPOTS.boat = pondDir(shoreAt(POND.boatAzimuth) + 0.55, POND.boatAzimuth);
// Round the lagoon (azimuths about its centre): the spur trail comes down beside the canoe's
// stern, the bottles have washed up further along that side, and the hammock hangs between two
// palms on the other side of the canoe.
const LAGOON = (() => {
  const b = POND.boatAzimuth, onTrail = dirFrom(0.5, -0.31);
  const s = pondDir(4, b + 0.6).angleTo(onTrail) < pondDir(4, b - 0.6).angleTo(onTrail) ? 1 : -1;
  return { s, trailPhi: b + s * 0.6, bottlesPhi: b + s * 1.05, hammockPhi: b - s * 1.15, lanternPhi: b - s * 0.5 };
})();
SPOTS.lagoonTrail = pondDir(shoreAt(LAGOON.trailPhi) + 1.6, LAGOON.trailPhi);
SPOTS.bottles = pondDir(shoreAt(LAGOON.bottlesPhi) + 0.05, LAGOON.bottlesPhi);
SPOTS.hammock = pondDir(shoreAt(LAGOON.hammockPhi) + 2.1, LAGOON.hammockPhi);

// The trail network. The flagstone walk runs from where you land to the bar; gravel trails
// branch off it to everything else, so every landmark is somewhere a path goes. Waypoints are
// (polar, longitude) like SPOTS; they swing wide of the bar's palms and planting.
const FORK = dirFrom(0.33, Math.PI / 2); // where the trails leave the walk
export const TRAILS = [
  { id: 'bar', points: [dirFrom(0.68, Math.PI / 2), dirFrom(0.5, Math.PI / 2 + 0.03), FORK, dirFrom(0.2, Math.PI / 2)], width: 1.5, flags: 'walk', seed: 1, lanterns: 4.4, lanternStart: 2.8, openEnd: true }, // not at your feet as you land
  { id: 'rocket', points: [dirFrom(0.6, Math.PI / 2), dirFrom(0.625, 1.48), dirFrom(0.66, 1.4)], width: 1.0, flags: 'steps', seed: 2, openStart: true, openEnd: true },
  { id: 'telescope', points: [FORK, dirFrom(0.35, 2.05), dirFrom(0.44, 2.48), dirFrom(0.525, 2.7)], width: 1.05, flags: 'steps', seed: 3, meander: 0.3, lanterns: 5, openStart: true },
  { id: 'dish', points: [FORK, dirFrom(0.35, 1.0), dirFrom(0.38, 0.3), dirFrom(0.45, -0.3), dirFrom(0.7, -0.32), dirFrom(0.97, -0.24)], width: 1.05, flags: 'steps', seed: 4, meander: 0.35, lanterns: 5, openStart: true },
  { id: 'lagoon', points: [dirFrom(0.5, -0.31), SPOTS.lagoonTrail.clone().add(dirFrom(0.5, -0.31)).normalize(), SPOTS.lagoonTrail], width: 0.95, flags: 'steps', seed: 6, meander: 0.25, openStart: true },
  // round the back to the campfire, broken where it crosses the cutaway on a bridge (machine.js)
  { id: 'campfire', points: [dirFrom(0.97, -0.24), CUT.from, CUT.ends[0]], width: 0.95, flags: 'steps', seed: 5, meander: 0.5, lanterns: 6, openStart: true, openEnd: true },
  { id: 'campfire2', points: [CUT.ends[1], CUT.to, dirFrom(2.2, -1.4), dirFrom(2.43, -1.58)], width: 0.95, flags: 'steps', seed: 7, meander: 0.5, lanterns: 6, openStart: true },
];
for (const t of TRAILS) t.sampled = sampleTrail(t.points, t);
/** Metres from a direction to the nearest trail's edge (negative on a trail). */
export const trailEdge = trailEdgeFn(TRAILS);
// Footprints the planet's grass and pebbles keep out of: the cutaway, the landing pad, the camp,
// the dish, the boat and the telescope (they're placed before any of these exist).
const FOOTPRINTS = [[CUT.up, Math.hypot(...CUT.half) + 0.8], [SPOTS.rocket, 2.7], [SPOTS.campfire, 2.2], [SPOTS.dish, 1.3], [SPOTS.boat, 1.2], [POND.center, POND.shore + 0.3], [SPOTS.hammock, 2.0], [SPOTS.bottles, 0.7], [SPOTS.telescope, 0.7]].map(([d, r]) => [d.clone().normalize(), r]);
/** True within `margin` metres of a landmark's footprint. */
export const nearLandmark = (dir, margin = 0) => FOOTPRINTS.some(([d, r]) => d.angleTo(dir) * RADIUS < r + margin);
/** True where nothing should grow: on a trail or under a landmark. */
export const keepClear = (dir, margin = 0) => trailEdge(dir) < margin || nearLandmark(dir, margin);

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
  const loose = []; // things physics.js moves: { object, radius, buoyancy (floats if > 1) }
  const occupied = [[CUT.up.clone(), Math.hypot(...CUT.half) + 0.5]]; // directions + radii kept clear of scatter (the cutaway's from the start)

  const put = (obj, dir, opts = {}, clear = 1.5) => {
    place(obj, dir, opts);
    group.add(obj);
    occupied.push([dir.clone().normalize(), clear]);
    return obj;
  };
  // A bamboo post with a crook arm and a hooded glass lantern hanging from it: the practical
  // light for a landmark out in the dark, and the way-markers along the trails. None of them is a
  // real light (every light costs every lit surface): each throws its warm pool through the
  // ground's shaders instead (lamps.js), on phones too.
  const lanternMats = { bamboo: surface(bambooSet(), { roughness: 0.7 }), cap: pbr({ color: PALETTE.lava, roughness: 0.5, metalness: 0.4 }), glass: glow(PALETTE.amber, 3), cord: pbr({ color: PALETTE.lava }) };
  const lantern = (dir, { height = 1.5, light = 0, pool = 12 } = {}) => {
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
    put(g, dir, { heading: (dir.x * 13.7 + dir.z * 7.1) % 6.28 }, 0.3);
    colliders.push({ center: g.position.clone(), radius: 0.08, height: height });
    // no real light: it lights the ground through the shaders instead (lamps.js)
    if (!light) { g.updateMatrixWorld(true); addLamp(g.localToWorld(new THREE.Vector3(0.25, height - 0.23, 0)), pool); }
    return g;
  };
  // Something loose lying on the ground, for physics.js to take over: until it loads, it just lies there.
  const drop = (object, dir, buoyancy) => {
    const radius = object.userData.radius;
    object.position.copy(surfacePoint(dir, radius * 0.9));
    group.add(object);
    loose.push({ object, radius, buoyancy });
  };
  // a few fallen coconuts round the foot of a palm
  const fallen = (dir, n, seed) => {
    for (let i = 0; i < n; i++) drop(coconut(seed + i), beside(dir, 0.55 + 0.35 * ((seed * 7 + i * 3) % 5) / 5, seed + i * 2.3), 1.6);
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

  // Your ship (rocket.js): how you got here, a Saturn V cut down into an Outer Wilds-style lander,
  // standing on its legs on a landing pad. "Fly home" leaves for the classic site. At night it
  // has to be findable: floodlights wash up the hull, the pad's edge lights blink in turn, and a
  // beacon on the escape tower's nose blinks like an aircraft's.
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

    // the lander on its four legs, hatch, porthole and badge turned towards the path
    const ship = saturnLander({ badge });
    ship.faceFront(fromPath.x, fromPath.z);
    const rocket = new THREE.Group();
    rocket.position.y = PAD_TOP;
    rocket.add(ship.group);
    pad.add(rocket);
    const top = ship.top;

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
      const flood = new THREE.SpotLight(PALETTE.moon, quality.high ? 9 : 12, 9, 0.62, 1, 1.2);
      flood.position.set(x, PAD_TOP + 0.15, z);
      flood.target.position.set(0, top * 0.55, 0);
      pad.add(flood, flood.target);
    }
    colliders.push({ center: pad.position.clone(), radius: 1.2 });
    interactables.push({ id: 'rocket', label: 'Your rocket', verb: 'Fly to the classic site', object: rocket, point: pad.position.clone(), approach: surfacePoint(dirFrom(0.66, 1.42)), radius: 2.6 });
  }

  // The trails: a flagstone walk from where you land to the bar, and gravel trails from it to
  // everything else, with lanterns along the long ones. Paths lead somewhere; nobody needs to
  // be told to follow one.
  {
    const trails = buildTrails(TRAILS, { quality });
    group.add(trails.group);
    for (const dir of trails.lanterns) lantern(dir, { height: 1.1 });
    // a pair of tiki torches marks the walk a few steps in, so they don't loom at your feet
    const walk = TRAILS[0].sampled;
    const mark = walk.samples.find((x) => Math.acos(x.up.dot(BAR_DIR)) < 0.43);
    for (const side of [-1, 1]) {
      const torch = tikiTorch({ height: 1.7, light: quality.high ? 2.0 : 0 });
      put(torch, offset(mark.up, mark.side, side * 1.15), {}, 0.3);
      colliders.push({ center: torch.position.clone(), radius: 0.12, height: 1.8 });
      // its real light (desktop) barely reaches the ground; the pool at its foot does
      torch.updateMatrixWorld(true);
      addLamp(torch.localToWorld(new THREE.Vector3(0, 1.75, 0)), quality.high ? 9 : 14);
      animated.push((t) => torch.userData.update(t));
    }
  }

  // A tiki signpost in the corner of the fork, its arrows along the real trails: wayfinding at a
  // glance, from where you land (nobody needs to be told what's out there).
  {
    const bar = BAR_DIR.clone();
    const tangent = (from, to) => to.clone().normalize().sub(from.clone().multiplyScalar(to.clone().normalize().dot(from))).normalize();
    const f = FORK.clone().normalize();
    const toBar = tangent(f, bar), toScope = tangent(f, TRAILS[2].points[1]);
    const at = f.clone().multiplyScalar(RADIUS).addScaledVector(toBar.clone().add(toScope).normalize(), 1.6).normalize();
    const dests = [
      ["Steve's", bar], ['Telescope', TRAILS[2].points[1]], ['Radio dish', TRAILS[3].points[1]],
      ['Lagoon', TRAILS[3].points[1]], ['Campfire', TRAILS[3].points[1]], ['Rocket', TRAILS[0].points[0]],
    ];
    const sign = new THREE.Group();
    put(sign, at, { heading: 0 }, 0.4);
    const inv = sign.quaternion.clone().invert();
    const boards = dests.map(([text, to]) => {
      const l = tangent(at, to).applyQuaternion(inv);
      return { text, angle: Math.atan2(-l.z, l.x) };
    });
    sign.add(signpost(boards));
    colliders.push({ center: sign.position.clone(), radius: 0.3 });
  }

  // Telescope: a brass refractor on a wooden surveyor's tripod, slowly tracking the sky
  // (aimed at the next launch).
  {
    const scope = brassTelescope();
    put(scope, SPOTS.telescope, { heading: 2.0, sink: footDrop(SPOTS.telescope, 0.58) + 0.01 }, 1.5);
    // left alone it sweeps the sky slowly; at the eyepiece, main.js turns it (held) to what you look at
    const mount = { az: scope.userData.az, alt: scope.userData.alt, held: false };
    const az0 = mount.az.rotation.y, alt0 = mount.alt.rotation.x;
    animated.push((t) => {
      if (mount.held) return;
      mount.az.rotation.y += (az0 + Math.sin(t * 0.2) * 0.3 - mount.az.rotation.y) * 0.05; // eases back from wherever it was left
      mount.alt.rotation.x += (alt0 - mount.alt.rotation.x) * 0.05;
    });
    // its lantern stands on the side you walk up from (towards the bar)
    {
      const up = SPOTS.telescope.clone().normalize();
      const towardBar = BAR_DIR.clone().sub(up.clone().multiplyScalar(up.dot(BAR_DIR))).normalize();
      const side = towardBar.clone().cross(up).normalize();
      lantern(up.clone().multiplyScalar(RADIUS).addScaledVector(towardBar, 0.9).addScaledVector(side, 0.8).normalize());
    }
    colliders.push({ center: scope.position.clone(), radius: 0.6 });
    interactables.push({ id: 'launch', label: 'Telescope', verb: 'Look through it', object: scope, point: scope.position.clone(), approach: surfacePoint(dirFrom(0.54, 2.73)), radius: 2.2, mount });
  }

  // The campfire on the far side (camp.js), Outer Wilds style: you sit on the log facing the way
  // the trail comes in, and roast marshmallows.
  {
    const cf = buildCampfire({ quality, heroes });
    const camp = cf.group;
    put(camp, SPOTS.campfire, { heading: 0.8 }, 3);
    camp.updateMatrixWorld(true);
    const trailEnd = camp.worldToLocal(surfacePoint(dirFrom(2.43, -1.58)));
    // the real ground's height in the camp's frame: it falls away from the camp's flat plane
    const groundY = (x, z) => {
      const dir = camp.localToWorld(new THREE.Vector3(x, 0, z)).normalize();
      return camp.worldToLocal(surfacePoint(dir)).y;
    };
    const local = cf.seatToward(trailEnd.x, trailEnd.z, groundY);
    camp.updateMatrixWorld(true);
    const toWorld = (v) => camp.localToWorld(v.clone());
    const seat = { eye: toWorld(local.eye), look: toWorld(local.look), stand: toWorld(local.stand), dip: toWorld(local.dip), rise: toWorld(local.rise) };
    animated.push((t) => cf.update(t));
    colliders.push({ center: camp.position.clone(), radius: 0.8 });
    // the moai and the Thinker stand on the real ground: it falls away from the camp's plane
    for (const [m, r] of [[cf.moai, 0.5], [cf.thinker, 0.35]]) {
      const base = m.getWorldPosition(new THREE.Vector3()), dir = base.clone().normalize();
      const above = base.length() - surfaceRadius(dir);
      m.position.y -= above + footDrop(dir, r) + 0.06;
      colliders.push({ center: surfacePoint(dir), radius: r + 0.15 });
    }
    interactables.push({
      id: 'campfire', label: 'Campfire', verb: 'Sit and roast a marshmallow', object: camp, point: camp.position.clone(),
      approach: surfacePoint(toWorld(local.approach).normalize()), radius: 2.8, seat, hotSpot: toWorld(cf.hotSpot),
    });
  }

  // A retro radio telescope, pointed at the sky.
  {
    // facing the trail as you walk up, tipped back toward the sky
    const dish = ground(radioDish(), SPOTS.dish, { heading: headingToward(SPOTS.dish, dirFrom(0.97, -0.24)) }, 2);
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
    // a ground station: this is where you send Steve a signal
    interactables.push({ id: 'contact', label: 'Radio dish', verb: 'Get in touch', object: dish, point: dish.position.clone(), approach: surfacePoint(dirFrom(1.01, -0.23)), radius: 2.4 });
  }

  // An outrigger canoe, pulled up out of the lagoon, for reasons nobody can explain: stern on
  // the sand, bow in the shallows, pointing at the water. The lagoon itself (planet.js) is a
  // collider, so you walk up to the waterline and stop.
  {
    const phi = POND.boatAzimuth;
    // (not ground(): that would sink a 3 m hull by the fall of the ground over its whole length)
    const hull = outriggerCanoe();
    hull.rotation.x = 0.06; // nose down the beach
    const boat = new THREE.Group();
    boat.add(hull);
    put(boat, SPOTS.boat, { heading: headingToward(SPOTS.boat, POND.center), sink: 0.1 }, 2.2);
    lantern(pondDir(shoreAt(LAGOON.lanternPhi) + 1.0, LAGOON.lanternPhi), { height: 1.3 });
    colliders.push({ center: boat.position.clone(), radius: 1.4 });
    colliders.push({ center: surfacePoint(POND.center), radius: POND.shore - 0.35, walkOnly: true }); // stop at the waterline (it wanders ±15%)
  }

  // A hammock between two palms by the lagoon, a book left open in it: the reading list.
  {
    const phi = LAGOON.hammockPhi, r = shoreAt(phi) + 2.1;
    const along = 1.75 / r; // half the span, as an angle round the lagoon
    const ends = [phi - along, phi + along].map((p) => pondDir(r + 0.1, p));
    const ties = ends.map((dir, i) => {
      const other = ends[1 - i];
      const h = 5 + i * 0.6, lean = 0.12;
      const tree = palm({ height: h, lean, seed: 310 + i });
      // it leans away from the other palm (a palm's lean is along its local +x)
      const away = dir.clone().multiplyScalar(2).sub(other).normalize();
      put(tree, dir, { heading: headingToward(dir, away) + Math.PI / 2 }, 0.4);
      colliders.push({ center: tree.position.clone(), radius: 0.35 });
      const y = 1.45, k = y / h;
      tree.updateMatrixWorld(true);
      return tree.localToWorld(new THREE.Vector3(Math.sin(k * 1.4) * lean * h * 0.35, y, 0));
    });
    const up = SPOTS.hammock.clone().normalize();
    const hm = hammock(ties[0], ties[1], up);
    group.add(hm);
    // Two palms at the water's edge in front of you as you lie back (main.js looks up and out
    // over the lagoon), one either side of the view, leaning out over the water and apart:
    // their trunks rise up its edges and their crowns arch over the top, framing the listening
    // sky between them.
    {
      // (along the shore from the middle, in metres: the shoreline curves, so they differ to look even)
      [[-1, 2.1, 6.2, 330], [1, 1.6, 6.6, 331]].forEach(([s, along, h, seed]) => {
        const p = phi + s * (along / r);
        const dir = pondDir(shoreAt(p) + 0.35, p);
        const over = pondDir(shoreAt(phi) - 2, phi + s * (8 / r)); // out over the water and away from the middle
        const tree = palm({ height: h, lean: 0.75, seed });
        put(tree, dir, { heading: headingToward(dir, over) + Math.PI / 2 }, 0.6);
        colliders.push({ center: tree.position.clone(), radius: 0.35 });
      });
    }
    const books = bookStack(3);
    put(books, pondDir(r + 0.55, phi + 0.08), { heading: 0.6 }, 0.3);
    colliders.push({ center: surfacePoint(SPOTS.hammock), radius: 0.7 });
    // you climb in, lie back and read (main.js lieInHammock); `hammock` is how (props.js)
    interactables.push({ id: 'hammock', label: 'Hammock', verb: 'Lie down and read', object: hm, extra: [books], point: surfacePoint(SPOTS.hammock), approach: surfacePoint(pondDir(r + 1.4, phi)), radius: 2.4, hammock: hm.userData.hammock });
  }

  // Flat stones at the waterline where the lagoon trail comes down: crouch and skip one
  // (main.js goToShore; stones.js). You crouch just back from the water, facing across it.
  {
    const phi = LAGOON.trailPhi, shore = shoreAt(phi);
    const pile = stonePile();
    put(pile, pondDir(shore + 0.3, phi), { heading: 0.4 }, 0.5);
    const crouch = surfacePoint(pondDir(shore + 0.7, phi));
    const far = pondDir(shoreAt(phi + Math.PI) * 0.8, phi + Math.PI); // across the water, toward the reeds
    const up = crouch.clone().normalize();
    interactables.push({ id: 'stones', label: 'Flat stones', verb: 'Skip a stone', object: pile, point: surfacePoint(pondDir(shore + 0.3, phi)), approach: surfacePoint(pondDir(shore + 1.4, phi)), radius: 2.2,
      shore: { eye: crouch.clone().addScaledVector(up, 0.85), stand: crouch.clone().addScaledVector(up, 1.62), look: far.clone().multiplyScalar(RADIUS + POND.level + 0.25) } });
  }

  // Messages in bottles, washed up at the waterline: crouch behind them and write one, then
  // throw it into space (main.js goToBottles; note.js). You face across the water and up a
  // little, so there's sky to throw it into.
  {
    const phi = LAGOON.bottlesPhi, shore = shoreAt(phi);
    // two glass floats washed up along from them, loose in their nets (they float)
    [[0.9, PALETTE.aqua], [-1.3, PALETTE.amber]].forEach(([m, color]) => {
      const f = glassFloat({ radius: 0.15, color, lit: 0.5 });
      f.userData.radius = 0.155;
      f.userData.label = 'Glass float';
      const at = phi + m / shore;
      drop(f, pondDir(shoreAt(at) + 0.4, at), 4);
    });
    const pile = messageBottles(3);
    put(pile, SPOTS.bottles, { heading: phi }, 0.3);
    const crouch = surfacePoint(pondDir(shore + 0.75, phi));
    const up = crouch.clone().normalize();
    const far = pondDir(shoreAt(phi + Math.PI) * 0.6, phi + Math.PI);
    interactables.push({ id: 'bottles', label: 'Messages in bottles', verb: 'Write one', object: pile, point: surfacePoint(SPOTS.bottles), approach: surfacePoint(pondDir(shore + 1.5, phi)), radius: 2.2,
      note: { eye: crouch.clone().addScaledVector(up, 0.85), stand: crouch.clone().addScaledVector(up, 1.62), look: far.clone().multiplyScalar(RADIUS + POND.level + 3), upright: pile.userData.upright } });
  }

  // Scatter: lava rock, palms and dark greenery.
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
      if (i < 6) fallen(dir, 2, 20 + i * 5);
      const crown = p.userData.crown;
      animated.push((t) => { crown.rotation.z = Math.sin(t * 0.8 + i) * 0.035; });
    }
    // tropical shrubs: ferns, monstera and red ti, the same leaves as round the bar
    for (let i = 0; i < Math.round(40 * scale); i++) {
      const dir = spot(0.3, 0.5);
      if (!dir) continue;
      const b = shrub(i);
      b.scale.setScalar(0.8 + rand() * 0.6);
      put(b, dir, { heading: rand() * 6.28, sink: 0.03 }, 0.3);
    }
  }

  // The cutaway: the campfire trail crosses it on a bridge, and the planet's hollow underneath
  // (machine.js). Its railings keep you on the bridge; walk out onto the glass and look down.
  const machine = buildMachine({ quality });
  group.add(machine.group, machine.inside);
  colliders.push(...machine.colliders);
  for (const [p, k] of machine.lamps) addLamp(p, k);
  animated.push((t) => machine.update(t));

  return {
    group,
    colliders,
    interactables,
    loose,
    machine,
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
  const eyecup = mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.02, 16), dark, [0, -0.625, 0], optic); // eyecup
  const knobs = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 8), brass, [0, -0.375, 0], optic);
  knobs.rotation.z = Math.PI / 2;
  for (const x of [-0.07, 0.07]) mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.012, 16).rotateZ(Math.PI / 2), brass, [x, -0.375, 0], optic);
  // finder scope on two brackets, riding on top of the tube
  mesh(new THREE.CylinderGeometry(0.016, 0.014, 0.32, 16), brass, [0, 0.12, -0.105], optic);
  mesh(new THREE.CircleGeometry(0.014, 16).rotateX(-Math.PI / 2), lens, [0, 0.281, -0.105], optic).castShadow = false;
  for (const y of [0.02, 0.22]) mesh(new THREE.BoxGeometry(0.014, 0.02, 0.04), brass, [0, y, -0.085], optic);
  g.userData.az = az;
  g.userData.alt = alt;
  g.userData.eyecup = eyecup; // where you put your eye (main.js); its +y runs up the tube
  return g;
}
