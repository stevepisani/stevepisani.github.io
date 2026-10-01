// Trails across the asteroid: gravel paths draped on the terrain, flagstones set into them,
// pebble borders, and lanterns along the way. Everything here is built vertex by vertex from
// the analytic surface (surfaceRadius), the same function the terrain mesh and the player's
// feet use, so a path follows every rise and dip: nothing floats and nothing sinks out of sight.
import * as THREE from 'three';
import { RADIUS, surfaceRadius } from './planet.js';
import { PALETTE, pbr, lavaSet } from './materials.js';
import * as T from './textures.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const smooth = (x) => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };

/** Direction `w` metres to the side of `up` along unit tangent `side`. */
export function offset(up, side, w, target = new THREE.Vector3()) {
  return target.copy(up).multiplyScalar(RADIUS).addScaledVector(side, w).normalize();
}
/** The ground point in direction `dir`, lifted `lift` metres. */
const onGround = (dir, lift, target = new THREE.Vector3()) => target.copy(dir).multiplyScalar(surfaceRadius(dir) + lift);

/**
 * A smooth trail through waypoint directions, sampled every `step` metres: each sample has its
 * direction `up`, the unit `tan` along the trail and `side` across it, and its distance `s`.
 * `meander` (metres) lets it wander a little, as trodden paths do.
 */
export function sampleTrail(points, { step = 0.25, meander = 0, seed = 1 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => p.clone().normalize().multiplyScalar(RADIUS)), false, 'centripetal');
  const length = curve.getLength();
  const n = Math.max(2, Math.ceil(length / step));
  const ups = [];
  for (let i = 0; i <= n; i++) ups.push(curve.getPointAt(i / n).normalize());
  if (meander) {
    const side = new THREE.Vector3();
    for (let i = 1; i < n; i++) {
      const s = (i / n) * length;
      side.subVectors(ups[i + 1], ups[i - 1]).cross(ups[i]).normalize();
      const off = meander * (Math.sin(s * 0.42 + seed) * 0.7 + Math.sin(s * 1.07 + seed * 2.3) * 0.3) * Math.sin(Math.PI * i / n);
      ups[i] = offset(ups[i], side, off);
    }
  }
  const samples = ups.map((up, i) => {
    const a = ups[Math.max(0, i - 1)], b = ups[Math.min(n, i + 1)];
    const tan = new THREE.Vector3().subVectors(b, a);
    tan.addScaledVector(up, -tan.dot(up)).normalize();
    return { up, tan, side: new THREE.Vector3().crossVectors(tan, up).normalize(), s: (i / n) * length };
  });
  return { samples, length };
}

/** Width of a trail at distance `s`: it breathes a little, and narrows where it starts and ends. */
function widthAt(trail, s, length) {
  const w = trail.width * (1 + 0.1 * Math.sin(s * 0.9 + trail.seed) + 0.05 * Math.sin(s * 2.7 + trail.seed * 3));
  const ends = Math.min(trail.openStart ? 1 : s / 1.2, trail.openEnd ? 1 : (length - s) / 1.2, 1);
  return w * (0.45 + 0.55 * smooth(ends));
}

/** The gravel: a ribbon laid on the ground, with a faint crown down the middle. */
function ribbon(trail, { samples, length }, material) {
  const J = 8;
  const pos = [], nrm = [], uv = [], idx = [];
  const d = new THREE.Vector3(), p = new THREE.Vector3();
  samples.forEach(({ up, side, s }, i) => {
    const w = widthAt(trail, s, length);
    for (let j = 0; j <= J; j++) {
      const u = j / J, x = (u - 0.5) * w;
      offset(up, side, x, d);
      onGround(d, 0.018 + 0.012 * (1 - (2 * u - 1) ** 2), p);
      pos.push(p.x, p.y, p.z); nrm.push(d.x, d.y, d.z); uv.push(u, s / 2.2);
      if (i && j) { const a = (i - 1) * (J + 1) + j - 1, b = a + J + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); /* facing up */ }
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const m = new THREE.Mesh(geo, material);
  m.receiveShadow = true;
  m.renderOrder = -1; // before other transparent things; it only ever lies on the ground
  return m;
}

/** A slab's outline: radii round it, a lumpy closed curve (two slow bulges plus chips), smoothed so there are no spikes. */
function slabOutline(rand) {
  const n = 18 + Math.floor(rand() * 6);
  const ph1 = rand() * 6.28, ph2 = rand() * 6.28;
  const radii = Array.from({ length: n }, (_, i) => { const a = (i / n) * 6.28; return 0.9 + 0.1 * Math.sin(2 * a + ph1) + 0.06 * Math.sin(3 * a + ph2) + (rand() - 0.5) * 0.12; });
  return radii.map((r, i) => (radii[(i + n - 1) % n] + r * 2 + radii[(i + 1) % n]) / 4);
}
/** Where the point (lx, lz) of a slab, in units of its size, lies: turned and stretched in its plane, as a direction. */
const _fwd = new THREE.Vector3();
function slabDir(st, lx, lz, d) {
  _fwd.crossVectors(st.up, st.side).normalize(); // along the trail
  const ca = Math.cos(st.turn), sa = Math.sin(st.turn);
  const x = (lx * ca - lz * sa) * st.r * st.stretch, z = (lx * sa + lz * ca) * st.r;
  d.copy(st.up).multiplyScalar(RADIUS).addScaledVector(st.side, x).addScaledVector(_fwd, z).normalize();
  return { x, z };
}

/**
 * Lays slabs and pebbles so that none touches another: a slab is tried at its size, then
 * smaller, and left out if it still won't fit, so there's always a gravel joint between them.
 * Slabs are compared by their real outlines (convex hulls, in the new one's tangent plane, with
 * the buried foot and a joint's width added); pebbles as circles.
 */
function layout() {
  const cells = new Map(), CELL = 1;
  const key = (p) => `${Math.floor(p.x / CELL)},${Math.floor(p.y / CELL)},${Math.floor(p.z / CELL)}`;
  const near = (p) => {
    const out = [], cx = Math.floor(p.x / CELL), cy = Math.floor(p.y / CELL), cz = Math.floor(p.z / CELL);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) out.push(...(cells.get(`${cx + i},${cy + j},${cz + k}`) || []));
    return out;
  };
  const add = (item) => { const k = key(item.at); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(item); };
  const d = new THREE.Vector3(), q = new THREE.Vector3();
  const JOINT = 0.03;
  // the slab's footprint (to its buried foot, plus half a joint) as 3D points on the sphere
  const footprint = (st) => st.outline.map((r, i, all) => {
    const a = (i / all.length) * Math.PI * 2, k = r * 1.04;
    slabDir(st, Math.cos(a) * k, Math.sin(a) * k, d);
    return d.clone().multiplyScalar(RADIUS);
  });
  const hull = (pts) => { // monotone chain, counter-clockwise
    const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], hi = [];
    for (const v of p) { while (lo.length > 1 && cross(lo[lo.length - 2], lo[lo.length - 1], v) <= 0) lo.pop(); lo.push(v); }
    for (const v of p.reverse()) { while (hi.length > 1 && cross(hi[hi.length - 2], hi[hi.length - 1], v) <= 0) hi.pop(); hi.push(v); }
    return lo.slice(0, -1).concat(hi.slice(0, -1));
  };
  const apart = (A, B, gap) => { // separating axis between convex polygons, with a gap
    for (const P of [A, B]) for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length], nx = b[1] - a[1], ny = a[0] - b[0], l = Math.hypot(nx, ny) || 1;
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const v of A) { const t = (v[0] * nx + v[1] * ny) / l; a0 = Math.min(a0, t); a1 = Math.max(a1, t); }
      for (const v of B) { const t = (v[0] * nx + v[1] * ny) / l; b0 = Math.min(b0, t); b1 = Math.max(b1, t); }
      if (a1 + gap <= b0 || b1 + gap <= a0) return true;
    }
    return false;
  };
  return {
    slab(st) {
      const r0 = st.r;
      for (const k of [1, 0.88, 0.76]) {
        st.r = r0 * k;
        const at = st.up.clone().multiplyScalar(RADIUS), e1 = st.side, e2 = q.crossVectors(st.up, st.side).normalize().clone();
        const flat = (pts) => hull(pts.map((p) => { const v = p.clone().sub(at); return [v.dot(e1), v.dot(e2)]; }));
        const mine = flat(footprint(st));
        const reach = st.r * Math.max(1, st.stretch) * 1.2;
        const hit = near(at).some((o) => o.at.distanceTo(at) < reach + o.reach + JOINT && (o.pebble || !apart(mine, flat(o.pts), JOINT)));
        if (!hit) { add({ at, reach, pts: footprint(st) }); return true; }
      }
      return false;
    },
    pebble(dir, r) {
      const at = dir.clone().multiplyScalar(RADIUS);
      if (near(at).some((o) => o.at.distanceTo(at) < r + o.reach + 0.01)) return false;
      add({ at, reach: r, pebble: true });
      return true;
    },
  };
}

/**
 * Flagstones, each an irregular slab built in its own tangent frame and then draped on the
 * terrain: its top stands a couple of centimetres proud, its bevelled edge meets the ground,
 * and its sides run down into it. `stones` is [{ up, side, r, stretch, turn, tone, outline }].
 */
function flagstones(stones) {
  const pos = [], col = [], uv = [];
  const base = new THREE.Color(PALETTE.basalt).lerp(new THREE.Color(PALETTE.stone), 0.55), c = new THREE.Color();
  const d = new THREE.Vector3();
  for (const st of stones) {
    const soft = st.outline, n = soft.length;
    const vert = (lx, lz, y) => { const { x, z } = slabDir(st, lx, lz, d); return { p: onGround(d, y, new THREE.Vector3()), u: x * 1.1, v: z * 1.1 }; };
    const ring = (k, y) => soft.map((r, i) => { const a = (i / n) * Math.PI * 2; return vert(Math.cos(a) * r * k, Math.sin(a) * r * k, y); });
    const centre = vert(0, 0, 0.045);
    const top = ring(0.86, 0.036), bevel = ring(1, 0.012), foot = ring(1.04, -0.09);
    c.copy(base).multiplyScalar(st.tone);
    // wound to face outward (counter-clockwise seen from outside)
    const tri = (a, b, e) => { for (const v of [a, e, b]) { pos.push(v.p.x, v.p.y, v.p.z); uv.push(v.u, v.v); col.push(c.r, c.g, c.b); } };
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      tri(centre, top[j], top[i]);
      tri(top[i], top[j], bevel[i]); tri(bevel[i], top[j], bevel[j]);
      tri(bevel[i], bevel[j], foot[i]); tri(foot[i], bevel[j], foot[j]);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals(); // non-indexed, so each facet is flat: chipped, hand-split stone
  const m = new THREE.Mesh(geo, pbr({ vertexColors: true, bumpMap: lavaSet().bump, bumpScale: 1.2, roughness: 0.88 }));
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** Pebbles along the edges, half buried. */
function pebbles(list) {
  const im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), pbr({ bumpMap: lavaSet().bump, bumpScale: 1, roughness: 0.9 }), list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
  const tones = [PALETTE.stone, PALETTE.basalt, PALETTE.ash, PALETTE.stone].map((c) => new THREE.Color(c));
  list.forEach(({ dir, r, turn, k }, i) => {
    q.setFromUnitVectors(Y, dir).multiply(q2.setFromAxisAngle(Y, turn));
    m.compose(onGround(dir, -r * 0.3), q, new THREE.Vector3(r, r * 0.55, r * 0.8));
    im.setMatrixAt(i, m);
    im.setColorAt(i, tones[k % tones.length].clone().multiplyScalar(0.8 + (k % 5) * 0.1));
  });
  im.castShadow = im.receiveShadow = true;
  return im;
}

/**
 * Build every trail. `trails` is [{ points, width, flags: 'walk' | 'steps', lanterns (spacing, m), lanternStart, seed,
 * meander, openStart, openEnd }]; returns { group, lanterns: [dirs], samples: [[trail, sampled]] }.
 * 'walk' lays a full flagstone walk (the way to the bar); 'steps' sets a stone every few paces.
 */
export function buildTrails(trails, { quality }) {
  const group = new THREE.Group();
  const gravel = pbr({ map: T.trailTexture(), transparent: true, depthWrite: false, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  gravel.bumpMap = gravel.map; gravel.bumpScale = 1.2;
  const stones = [], stonesAt = [], pebbleList = [], lanterns = [];
  const d = new THREE.Vector3();
  const fit = layout(), shapes = rng(7);
  const lay = (st) => { st.outline = slabOutline(shapes); if (fit.slab(st)) stones.push(st); };
  const edges = []; // pebble candidates: placed once every slab is down
  for (const trail of trails) {
    const sampled = trail.sampled || sampleTrail(trail.points, trail);
    const { samples, length } = sampled;
    const rand = rng(trail.seed * 97 + 13);
    group.add(ribbon(trail, sampled, gravel));
    const at = (s) => samples[Math.min(samples.length - 1, Math.round((s / length) * (samples.length - 1)))];
    if (trail.flags === 'walk') {
      // pairs of slabs, staggered, filling the walk with gravel joints between them
      for (let s = 0.5, row = 0; s < length - 0.4; s += 0.62 + rand() * 0.1, row++) {
        const { up, side } = at(s), w = widthAt(trail, s, length) * 0.5;
        const pair = row % 2 ? [-0.32, 0.3] : [-0.12, 0.42];
        for (const x of pair) {
          if (Math.abs(x) > w - 0.18) continue;
          lay({ up: offset(up, side, x * (w / 0.75)), side, r: 0.23 + rand() * 0.06, stretch: 1.1 + rand() * 0.3, turn: (rand() - 0.5) * 0.6, tone: 0.85 + rand() * 0.3 });
        }
      }
    } else if (trail.flags === 'steps') {
      for (let s = 1.0; s < length - 0.8; s += 1.6 + rand() * 1.4) {
        const { up, side } = at(s);
        lay({ up: offset(up, side, (rand() - 0.5) * trail.width * 0.3), side, r: 0.2 + rand() * 0.08, stretch: 1.15 + rand() * 0.35, turn: rand() * 3, tone: 0.8 + rand() * 0.3 });
      }
    }
    // pebbles spilling off both edges
    const every = quality.high ? 0.32 : 0.55;
    for (let s = 0.3; s < length - 0.3; s += every * (0.6 + rand() * 0.8)) {
      const { up, side } = at(s), w = widthAt(trail, s, length) * 0.5;
      const sign = rand() < 0.5 ? -1 : 1;
      edges.push({ dir: offset(up, side, sign * (w + (rand() - 0.25) * 0.3), new THREE.Vector3()), r: 0.035 + rand() * rand() * 0.11, turn: rand() * 6.28 });
    }
    // lanterns every so often, alternating sides
    if (trail.lanterns) {
      let side = 1;
      for (let s = trail.lanternStart ?? trail.lanterns * 0.6; s < length - 1.5; s += trail.lanterns) {
        const smp = at(s);
        lanterns.push(offset(smp.up, smp.side, side * (widthAt(trail, s, length) * 0.5 + 0.3), d).clone());
        side = -side;
      }
    }
    stonesAt.push([trail, sampled]);
  }
  for (const p of edges) if (fit.pebble(p.dir, p.r)) pebbleList.push({ ...p, k: pebbleList.length });
  if (stones.length) group.add(flagstones(stones));
  if (pebbleList.length) group.add(pebbles(pebbleList));
  return { group, lanterns, samples: stonesAt };
}

/**
 * Distance (metres) from direction `dir` to the edge of the nearest trail: negative on it.
 * Coarse (half-metre samples), for keeping grass and scatter off the paths and wearing the ground.
 */
export function trailEdgeFn(trails) {
  const pts = [];
  for (const t of trails) {
    const { samples, length } = t.sampled || sampleTrail(t.points, t);
    const stride = Math.max(1, Math.round((samples.length / length) * 0.5));
    for (let i = 0; i < samples.length; i += stride) pts.push([samples[i].up, widthAt(t, samples[i].s, length) * 0.5]);
  }
  const near = Math.cos(4 / RADIUS);
  return (dir) => {
    let best = Infinity;
    for (const [up, half] of pts) {
      const c = up.dot(dir);
      if (c < near) continue;
      const dist = Math.acos(Math.min(1, c)) * RADIUS - half;
      if (dist < best) best = dist;
    }
    return best;
  };
}
