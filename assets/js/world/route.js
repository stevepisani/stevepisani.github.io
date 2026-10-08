// Walking round things, not into them. A tap walks you straight to where you tapped, and that
// line can run into the bar's counter, a post, a palm, a rock or the machine's railing, and you'd
// stop against it. So we look for a way round first: a grid over a strip of ground laid along the
// way from you to where you're going (`onPlanet`), A* across it, then the corners pulled tight so
// you walk a few straight legs, not a staircase.
//
// The strip is flat: x is metres along the great circle from you to the goal, z metres off it to
// the side; circles are the player's colliders there, widened by the body.
import * as THREE from 'three';

const STEP = 0.25; // grid spacing, metres
const WIDE = 8;    // the strip reaches this far to either side of the straight line
const PAST = 4;    // and this far back past where you are, and on past the goal

/** Is the straight line from a to b clear of every circle ({ x, z, r })? */
export function clear(a, b, circles) {
  const dx = b[0] - a[0], dz = b[1] - a[1], len2 = dx * dx + dz * dz || 1e-9;
  for (const c of circles) {
    const t = Math.max(0, Math.min(1, ((c.x - a[0]) * dx + (c.z - a[1]) * dz) / len2));
    const px = a[0] + t * dx - c.x, pz = a[1] + t * dz - c.z;
    if (px * px + pz * pz < c.r * c.r) return false;
  }
  return true;
}

/**
 * A way from `from` to `to` round the circles, on a grid over `box` ({ x0, x1, z0, z1 }, both
 * ends inside it): the corners to walk through, not counting `to` (empty when the straight line
 * is clear, or when there's no way round).
 */
export function findRoute(from, to, circles, box) {
  if (clear(from, to, circles)) return [];
  const NI = Math.round((box.x1 - box.x0) / STEP) + 1, NJ = Math.round((box.z1 - box.z0) / STEP) + 1, N = NJ;
  const cell = (p) => [Math.round((p[0] - box.x0) / STEP), Math.round((p[1] - box.z0) / STEP)];
  const at = (i, j) => [box.x0 + i * STEP, box.z0 + j * STEP];
  const inside = (i, j) => i >= 0 && j >= 0 && i < NI && j < NJ;
  const start = from;
  // each circle marks the cells it covers
  const blocked = new Uint8Array(NI * NJ);
  for (const c of circles) {
    const [i0, j0] = cell([c.x - c.r, c.z - c.r]), [i1, j1] = cell([c.x + c.r, c.z + c.r]);
    for (let i = Math.max(0, i0); i <= Math.min(NI - 1, i1); i++) for (let j = Math.max(0, j0); j <= Math.min(NJ - 1, j1); j++) {
      const [x, z] = at(i, j);
      if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) blocked[i * N + j] = 1;
    }
  }
  const [si, sj] = cell(start), [gi, gj] = cell(to);
  if (!inside(si, sj) || !inside(gi, gj)) return [];
  blocked[si * N + sj] = 0; // you can always leave where you are (pressed against a post)
  blocked[gi * N + gj] = 0;
  // A*, eight ways, octile distance
  const h = (i, j) => { const a = Math.abs(i - gi), b = Math.abs(j - gj); return Math.max(a, b) + 0.414 * Math.min(a, b); };
  const g = new Float32Array(NI * NJ).fill(Infinity), f = new Float32Array(NI * NJ), prev = new Int32Array(NI * NJ).fill(-1), done = new Uint8Array(NI * NJ);
  const open = []; // a binary heap on f
  const push = (k) => {
    let n = open.push(k) - 1;
    while (n > 0) { const p = (n - 1) >> 1; if (f[open[p]] <= f[k]) break; open[n] = open[p]; n = p; }
    open[n] = k;
  };
  const pop = () => {
    const top = open[0], last = open.pop();
    if (open.length) {
      let n = 0;
      for (;;) {
        let c = 2 * n + 1;
        if (c >= open.length) break;
        if (c + 1 < open.length && f[open[c + 1]] < f[open[c]]) c++;
        if (f[open[c]] >= f[last]) break;
        open[n] = open[c]; n = c;
      }
      open[n] = last;
    }
    return top;
  };
  const goal = gi * N + gj;
  g[si * N + sj] = 0; f[si * N + sj] = h(si, sj);
  push(si * N + sj);
  while (open.length) {
    const k = pop();
    if (k === goal) break;
    if (done[k]) continue;
    done[k] = 1;
    const i = (k / N) | 0, j = k % N;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      if (!di && !dj) continue;
      const ni = i + di, nj = j + dj, nk = ni * N + nj;
      if (!inside(ni, nj) || blocked[nk] || done[nk]) continue;
      if (di && dj && (blocked[ni * N + j] || blocked[i * N + nj])) continue; // no cutting corners
      const ng = g[k] + (di && dj ? 1.414 : 1);
      if (ng < g[nk]) { g[nk] = ng; f[nk] = ng + h(ni, nj); prev[nk] = k; push(nk); }
    }
  }
  if (prev[goal] < 0) return [];
  const cells = [];
  for (let k = goal; k >= 0; k = prev[k]) cells.unshift(at((k / N) | 0, k % N));
  cells[0] = start;
  cells[cells.length - 1] = to;
  // pull the string tight: from each corner, straight to the farthest one in sight
  const legs = [];
  let a = from;
  for (let n = 0; n < cells.length - 1;) {
    let m = cells.length - 1;
    while (m > n + 1 && !clear(a, cells[m], circles)) m--;
    if (m === cells.length - 1) break;
    legs.push(cells[m]);
    a = cells[m];
    n = m;
  }
  return legs;
}

const _a = new THREE.Vector3(), _t = new THREE.Vector3(), _n = new THREE.Vector3(), _d = new THREE.Vector3();
/**
 * A way across the planet (radius `R`) from `from` to `to` (world points on its surface) round
 * `colliders` ({ center, radius }, widened by `body`): the corners to walk through, as unit
 * directions, not counting `to`. Empty when the way is straight.
 */
export function onPlanet(from, to, colliders, { R, body }) {
  _a.copy(from).normalize();
  const b = _d.copy(to).normalize();
  const ang = _a.angleTo(b);
  if (ang * R < 0.3) return [];
  // the strip's frame: a (where you are), t (along, toward the goal), n (to the side)
  _t.copy(b).addScaledVector(_a, -b.dot(_a));
  if (_t.lengthSq() < 1e-8) _t.set(1, 0, 0).addScaledVector(_a, -_a.x); // straight across the planet: any way round
  _t.normalize();
  _n.crossVectors(_a, _t);
  const a = _a.clone(), t = _t.clone(), n = _n.clone();
  const flat = (d) => [Math.atan2(d.dot(t), d.dot(a)) * R, Math.asin(THREE.MathUtils.clamp(d.dot(n), -1, 1)) * R];
  const L = ang * R, box = { x0: -PAST, x1: L + PAST, z0: -WIDE, z1: WIDE };
  const circles = [];
  for (const c of colliders) {
    const r = c.radius + body;
    const [x, z] = flat(_d.copy(c.center).normalize());
    if (x > box.x0 - r && x < box.x1 + r && z > box.z0 - r && z < box.z1 + r) circles.push({ x, z, r });
  }
  return findRoute([0, 0], [L, 0], circles, box).map(([x, z]) => {
    const along = x / R, side = z / R;
    return a.clone().multiplyScalar(Math.cos(along)).addScaledVector(t, Math.sin(along)).multiplyScalar(Math.cos(side)).addScaledVector(n, Math.sin(side)).normalize();
  });
}
