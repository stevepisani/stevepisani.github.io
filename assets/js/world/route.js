// Walking round things, not into them. A tap walks you straight to where you tapped; near the
// bar that line can run into the counter, a post or a palm, and you'd stop against it. So there
// we look for a way round first: a small grid over the ground around the bar, A* across it, then
// the corners pulled tight so you walk a few straight legs, not a staircase.
//
// Everything is flat: points are (x, z) in the bar's frame (the bar sits at the pole, so that's
// the planet seen from above), circles are the player's colliders, widened by the body.

const STEP = 0.25; // grid spacing, metres
const SPAN = 8;    // the grid covers ±SPAN round the bar

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
 * A way from `from` to `to` round the circles: the corners to walk through, not counting `to`
 * (empty when the straight line is clear, or when there's no way round). Starts farther out than
 * the grid head straight in until they reach it.
 */
export function findRoute(from, to, circles) {
  if (clear(from, to, circles)) return [];
  const N = Math.round((2 * SPAN) / STEP) + 1;
  const cell = (p) => [Math.round((p[0] + SPAN) / STEP), Math.round((p[1] + SPAN) / STEP)];
  const at = (i, j) => [i * STEP - SPAN, j * STEP - SPAN];
  const inside = (i, j) => i >= 0 && j >= 0 && i < N && j < N;
  // where the walk meets the grid: the start itself, or where its straight line in crosses the edge
  let start = from;
  const out = Math.max(Math.abs(from[0]), Math.abs(from[1]));
  if (out > SPAN - STEP) {
    const k = (SPAN - STEP) / out;
    start = [from[0] * k, from[1] * k];
  }
  const blocked = new Uint8Array(N * N);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const [x, z] = at(i, j);
    for (const c of circles) if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) { blocked[i * N + j] = 1; break; }
  }
  const [si, sj] = cell(start), [gi, gj] = cell(to);
  if (!inside(si, sj) || !inside(gi, gj)) return [];
  blocked[si * N + sj] = 0; // you can always leave where you are (pressed against a post)
  blocked[gi * N + gj] = 0;
  // A*, eight ways, octile distance
  const h = (i, j) => { const a = Math.abs(i - gi), b = Math.abs(j - gj); return Math.max(a, b) + 0.414 * Math.min(a, b); };
  const g = new Float32Array(N * N).fill(Infinity), f = new Float32Array(N * N), prev = new Int32Array(N * N).fill(-1), done = new Uint8Array(N * N);
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
