// The book sky: every book Steve has read is a star. Walking about, they're loose in the sky over
// the lagoon, small and pale among the others, nothing to see. Lie back in the hammock and they
// drift together into their shelves between the palms (the shelves of /bookshelf,
// _data/books.yml): each a patch of sky in its own soft colour with its name beside it, a series
// inside it a constellation, its books joined in order. Get up and they drift apart again.
// What he's reading now crosses the whole field as comets, a few at a time. A star's size is the
// book's length. Lie in the hammock, look up, tap a shelf to lean in (main.js zooms to `aim()`),
// tap a star for its card. The data is /library.json (tools/library.mjs); with none, no stars.
//
// Like the rest of the sky it's infinitely far away (the group rides on the camera), at fixed
// directions in the world: a cone round where you look when lying in the hammock, laid out in the
// window between the palms (WIN).
import * as THREE from 'three';
import { PALETTE } from './materials.js';

const R = 520;          // inside the background star shell (600), outside everything else
const GAP_MAX = 3.4;    // degrees between stars when there are few; with many they sit closer, never under GAP_MIN
const GAP_MIN = 1.0;
const PAD = 1;          // degrees between shelves
// the window the palms leave open, which the shelves are packed into: half-width, half-height and
// how far below the centre its middle is (degrees). The fronds hang across the top.
const WIN = { w: 30, h: 16, down: 5 };
const LOOSE = 70;       // degrees round the hammock view the loose stars are scattered over
const GATHER = 7;       // seconds for them to drift into their shelves (each starts a little after the last)
const COMETS = 3;       // comets in flight at once; the other books wait their turn
const CROSS = 90;       // seconds for a comet to cross the field
const DEG = Math.PI / 180;

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
const rng = (seed) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

function label(text, { size = 34, weight = 500, spacing = 0, colour = 'rgba(200, 212, 255, 0.85)', height = 11 } = {}) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const font = `${weight} ${size}px Inter, system-ui, sans-serif`;
  g.font = font;
  if (spacing) g.letterSpacing = `${spacing}px`;
  c.width = Math.ceil(g.measureText(text).width) + 24; c.height = Math.round(size * 1.42);
  g.font = font;
  if (spacing) g.letterSpacing = `${spacing}px`;
  g.fillStyle = colour;
  g.textBaseline = 'middle';
  g.fillText(text, 12, c.height * 0.52);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false }));
  s.scale.set((c.width / c.height) * height, height, 1);
  s.renderOrder = -1;
  return s;
}

export function createBookSky({ center, reducedMotion = false }) {
  const group = new THREE.Group();
  const C = center.clone().normalize();
  const e1 = C.clone().cross(new THREE.Vector3(0, 1, 0)); // x runs left to right as you look along C
  if (e1.lengthSq() < 1e-4) e1.set(1, 0, 0);
  e1.normalize();
  const e2 = e1.clone().cross(C).normalize(); // and y bottom to top
  // (x, y) in degrees from the centre -> a direction
  const dirAt = (x, y, out = new THREE.Vector3()) => out.copy(C).addScaledVector(e1, Math.tan(x * DEG)).addScaledVector(e2, Math.tan(y * DEG)).normalize();

  let books = [], regions = [], points = null, comets = [], lines = [], labels = [];
  const uniforms = { time: { value: 0 }, dpr: { value: Math.min(devicePixelRatio, 2) }, picked: { value: -1 }, still: { value: reducedMotion ? 1 : 0 }, focus: { value: -1 }, dim: { value: 0 }, gather: { value: 0 } };

  function clear() {
    for (const o of [...group.children]) { group.remove(o); o.geometry && o.geometry.dispose(); o.material && (o.material.map && o.material.map.dispose(), o.material.dispose()); }
    books = []; regions = []; comets = []; lines = []; labels = []; points = null;
  }

  /** Lay out the stars for `lib` ({ shelves, read, now } from /library.json). */
  function setBooks(lib) {
    clear();
    const read = (lib && lib.read) || [], now = (lib && lib.now) || [];
    if (!read.length && !now.length) return;
    const shelves = ((lib && lib.shelves) || []).map((s) => ({ ...s, list: read.filter((b) => b.shelf === s.slug) })).filter((s) => s.list.length);

    // Each shelf is a disc, just big enough for its books at GAP apart (with a little room to place
    // them), and the discs sit in two rows in shelf order, left to right, like the shelves of a
    // bookcase: the split that keeps the rows most even. The whole fills the window between the
    // palms (WIN); with more books every star sits a little closer, never under GAP_MIN.
    let GAP = GAP_MAX, discs = null;
    const radius = (n) => GAP * Math.sqrt((1.7 * n) / Math.PI) + 0.6;
    const layout = () => {
      const rs = shelves.map((s) => radius(s.list.length));
      const width = (a, b) => rs.slice(a, b).reduce((w, r) => w + 2 * r, 0) + PAD * Math.max(0, b - a - 1);
      let k = shelves.length, best = Infinity; // one row if that's best (few shelves)
      for (let i = 1; i < shelves.length; i++) { const w = Math.max(width(0, i), width(i, shelves.length)); if (w < best) { best = w; k = i; } }
      if (shelves.length < 4 || width(0, shelves.length) <= best) { k = shelves.length; best = width(0, k); }
      const rows = k < shelves.length ? [[0, k], [k, shelves.length]] : [[0, k]];
      const tall = rows.map(([a, b]) => 2 * Math.max(...rs.slice(a, b)));
      const height = tall.reduce((h, t) => h + t, 0) + PAD * (rows.length - 1);
      if (best > 2 * WIN.w || height > 2 * WIN.h) return null;
      const out = [];
      let y = height / 2 - WIN.down;
      rows.forEach(([a, b], ri) => {
        y -= tall[ri] / 2;
        let x = -width(a, b) / 2;
        // each a little above or below the row's line, as far as the row's height allows, so they sit
        // like clusters in the sky rather than a row of plates
        for (let i = a; i < b; i++) { const j = (rng(hash(shelves[i].slug))() - 0.5) * 1.6 * (tall[ri] / 2 - rs[i]); out.push({ s: shelves[i], x: x + rs[i], y: y + j, r: rs[i] }); x += 2 * rs[i] + PAD; }
        y -= tall[ri] / 2 + PAD;
      });
      return out;
    };
    while (!(discs = layout()) && GAP > GAP_MIN) GAP = Math.max(GAP_MIN, GAP * 0.96);
    if (!discs) discs = layout() || shelves.map((s, i) => ({ s, x: (i - shelves.length / 2) * 8, y: 0, r: radius(s.list.length) })); // too many to fit
    const STEP = GAP * 1.25; // between books in a constellation

    const stars = []; // { book, x, y, region, series }
    const groups = [];
    discs.forEach((d, ri) => {
      const placed = [];
      let r = d.r - 0.4;
      const free = (x, y) => Math.hypot(x - d.x, y - d.y) < r && placed.every(([a, b]) => Math.hypot(a - x, b - y) >= GAP);
      // series of two or more become constellations; the rest are single stars
      const bySeries = new Map();
      for (const b of d.s.list) if (b.series) (bySeries.get(b.series) || bySeries.set(b.series, []).get(b.series)).push(b);
      const mine = [];
      for (const [name, list] of bySeries) if (list.length > 1) mine.push({ name, list: [...list].sort((a, b) => parseFloat(a.seq) - parseFloat(b.seq)), region: ri });
      mine.sort((a, b) => b.list.length - a.list.length);
      const inGroup = new Set(mine.flatMap((g) => g.list));
      for (const g of mine) {
        const rn = rng(hash(g.name));
        let ok = null;
        for (let tries = 0; !ok; tries++) {
          if (tries && tries % 300 === 0) r += 0.3;
          const a = rn() * Math.PI * 2, dd = Math.sqrt(rn()) * Math.max(0.5, r - 1.5);
          let x = d.x + Math.cos(a) * dd, y = d.y + Math.sin(a) * dd, heading = rn() * Math.PI * 2;
          const pts = [];
          for (let i = 0; i < g.list.length; i++) {
            if (i) { heading += (rn() - 0.5) * 1.6; x += Math.cos(heading) * STEP; y += Math.sin(heading) * STEP; }
            pts.push([x, y]);
          }
          if (pts.every(([px, py], i) => free(px, py) && pts.slice(0, i).every(([qx, qy]) => Math.hypot(px - qx, py - qy) >= GAP))) ok = pts;
        }
        ok.forEach(([x, y], i) => { placed.push([x, y]); stars.push({ book: g.list[i], x, y, region: ri, series: g.name }); });
        g.pts = ok;
        groups.push(g);
      }
      for (const b of d.s.list) {
        if (inGroup.has(b)) continue;
        const rn = rng(hash(b.id || b.title));
        for (let tries = 0; ; tries++) {
          if (tries && tries % 300 === 0) r += 0.3;
          const a = rn() * Math.PI * 2, dd = Math.sqrt(rn()) * r, x = d.x + Math.cos(a) * dd, y = d.y + Math.sin(a) * dd;
          if (free(x, y)) { placed.push([x, y]); stars.push({ book: b, x, y, region: ri }); break; }
        }
      }
      d.r = Math.max(d.r, r + 0.4);
    });

    // the stars: one Points, a small core each that just blooms, with faint rays; a few times the
    // size of the field's stars, no more. Colour: the shelf's, pale enough to read as starlight.
    const n = stars.length + now.length;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), seed = new Float32Array(n), region = new Float32Array(n);
    const v = new THREE.Vector3(), c = new THREE.Color();
    discs.forEach((d, ri) => regions.push({ index: ri, slug: d.s.slug, name: d.s.name, hue: d.s.hue, count: d.s.list.length, x: d.x, y: d.y, r: d.r, dir: dirAt(d.x, d.y), books: [] }));
    stars.forEach((s, i) => {
      dirAt(s.x, s.y, v).multiplyScalar(R);
      pos.set([v.x, v.y, v.z], i * 3);
      c.setHSL(regions[s.region].hue / 360, 0.45, 0.78).multiplyScalar(1.5);
      col.set([c.r, c.g, c.b], i * 3);
      size[i] = s.book.minutes ? 8 + 5 * Math.min(1, s.book.minutes / 1500) : 10;
      seed[i] = (hash(s.book.id || s.book.title) % 1000) / 10;
      region[i] = s.region;
      // where it is while you're up and about: somewhere in a cap round the hammock view
      const rn = rng(hash(s.book.id || s.book.title) ^ 0x5bd1e995);
      const th = Math.acos(1 - rn() * (1 - Math.cos(LOOSE * DEG))), ph = rn() * Math.PI * 2;
      const loose = C.clone().multiplyScalar(Math.cos(th)).addScaledVector(e1, Math.cos(ph) * Math.sin(th)).addScaledVector(e2, Math.sin(ph) * Math.sin(th));
      const home = dirAt(s.x, s.y);
      books.push({ book: s.book, home, loose, dir: loose.clone(), delay: rn() * 0.4, index: i, series: s.series || null, region: regions[s.region] });
    });
    // each shelf's books in the shelf page's order (newest first), for stepping through them
    for (const r of regions) r.books = r.slug ? books.filter((b) => b.region === r).sort((a, b) => read.indexOf(a.book) - read.indexOf(b.book)) : [];
    // reading now: comets, the most recently played first; placeComets() decides which few are in
    // flight (under reduced motion the first few sit mid-way)
    now.forEach((b, k) => {
      const i = stars.length + k, r = rng(hash(b.id || b.title));
      const a = r() * Math.PI * 2, from = [Math.cos(a) * WIN.w * 0.9, Math.sin(a) * WIN.h * 0.9 - WIN.down];
      const to = [-from[0] * 0.8 + (r() - 0.5) * 10, -(from[1] + WIN.down) * 0.8 - WIN.down + (r() - 0.5) * 10];
      c.set(PALETTE.coral).lerp(new THREE.Color(PALETTE.amber), 0.6).multiplyScalar(1.3);
      col.set([c.r, c.g, c.b], i * 3);
      size[i] = 0; // set each frame while it's in flight
      seed[i] = 0;
      region[i] = -1;
      const comet = { book: b, index: i, from, to, slot: k, dir: new THREE.Vector3(), tail: null, active: false };
      comets.push(comet);
      books.push({ book: b, dir: comet.dir, index: i, comet, region: null });
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    geo.setAttribute('region', new THREE.BufferAttribute(region, 1));
    points = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      // leaning in on a shelf (`focus`), the others fade back as `dim` comes up. Loose (`gather` 0)
      // they're small and pale, like the field's stars; gathered they take their shelf's colour
      vertexShader: `attribute float size; attribute float seed; attribute float region; attribute vec3 color; uniform float time, dpr, picked, still, focus, dim, gather; varying vec3 vC; varying float vA; varying float vG;
        void main(){ float tw = still > .5 ? 1. : .8 + .2 * sin(time * (.4 + fract(seed) * 1.2) + seed);
          float sel = abs(float(gl_VertexID) - picked) < .5 ? 1.7 : 1.;
          float away = focus > -.5 && region > -.5 && abs(region - focus) > .5 ? dim * .85 : 0.;
          vC = mix(vec3(.85, .88, 1.) * (region > -.5 ? .9 : 1.), color, region > -.5 ? gather : 1.); vG = region > -.5 ? gather : 1.; vA = tw * (1. - away); gl_PointSize = size * dpr * tw * sel * mix(.55, 1., vG); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
      // a small core, a soft halo and four faint rays: they read as stars you can pick, not the field
      fragmentShader: `varying vec3 vC; varying float vA; varying float vG;
        void main(){ vec2 p = gl_PointCoord - .5; float d = length(p); if (d > .5) discard;
          float core = smoothstep(.09, .0, d), halo = smoothstep(.5, .0, d) * .18 * vG;
          float rays = (smoothstep(.025, .0, abs(p.x)) + smoothstep(.025, .0, abs(p.y))) * smoothstep(.5, .1, d) * .28 * vG;
          float k = core + halo + rays;
          gl_FragColor = vec4(vC * k * vA, k * vA); }`,
    }));
    points.frustumCulled = false;
    points.renderOrder = -1;
    group.add(points);

    // each shelf's name, in letter-spaced caps in its colour: above its patch on the top row, below
    // it on the bottom one, so the names stay clear of the gap between the rows
    const midY = discs.reduce((m, d) => m + d.y, 0) / Math.max(1, discs.length);
    for (const r of regions) {
      const s = label(r.name.toUpperCase(), { size: 30, weight: 600, spacing: 3, colour: `hsla(${r.hue}, 70%, 86%, 1)`, height: 11 });
      const h = s.scale.y / R / DEG;
      r.label = { x: r.x, y: r.y >= midY ? r.y + r.r + h * 0.4 : r.y - r.r - h * 0.4, w: s.scale.x / R / DEG, h };
      r.labelDir = dirAt(r.label.x, r.label.y);
      s.position.copy(r.labelDir).multiplyScalar(R);
      s.userData.region = r;
      group.add(s);
      labels.push(s);
    }
    // constellation lines and names (the names only when you've leaned in on their shelf)
    const named = []; // the names' boxes, in degrees
    for (const g of groups) {
      const p = [];
      for (let i = 1; i < g.pts.length; i++) {
        const a = dirAt(...g.pts[i - 1]).multiplyScalar(R), b = dirAt(...g.pts[i]).multiplyScalar(R);
        // stop short of each star, so the line doesn't run into its glow
        const ab = b.clone().sub(a), k = Math.min(0.3, 1.1 / Math.max(1, ab.length() / (R * DEG)));
        p.push(...a.clone().addScaledVector(ab, k).toArray(), ...b.clone().addScaledVector(ab, -k).toArray());
      }
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      const line = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x8fa2ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
      line.frustumCulled = false;
      line.renderOrder = -1;
      line.userData = { series: g.name, region: regions[g.region] };
      group.add(line);
      lines.push(line);
      // its name, below its lowest star, unless it would cover another name (the biggest series
      // were placed first, so they keep theirs)
      const low = g.pts.reduce((m, q) => (q[1] < m[1] ? q : m));
      const s = label(g.name, { size: 34, height: 6 });
      const box = { x: low[0], y: low[1] - 1.3, w: s.scale.x / R / DEG, h: s.scale.y / R / DEG };
      if (named.some((o) => Math.abs(o.x - box.x) * 2 < o.w + box.w && Math.abs(o.y - box.y) * 2 < o.h + box.h)) { s.material.map.dispose(); s.material.dispose(); continue; }
      named.push(box);
      s.position.copy(dirAt(box.x, box.y)).multiplyScalar(R);
      s.userData = { series: g.name, region: regions[g.region] };
      group.add(s);
      labels.push(s);
    }
    // comet tails
    for (const cm of comets) {
      const tg = new THREE.BufferGeometry();
      tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array([1.4, 0.9, 0.5, 0, 0, 0]), 3));
      cm.tail = new THREE.Line(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
      cm.tail.frustumCulled = false;
      cm.tail.renderOrder = -1;
      group.add(cm.tail);
    }
    gathered = -1; // place the stars on the next update
    placeComets(0);
  }

  // A few comets are in flight at once. Each takes CROSS seconds to cross the field, fading in and
  // out at the ends (the head shrinks to nothing, the tail goes transparent); when its turn is over
  // the next book's begins, so over time every one of them shows. The tail points back along the path.
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();
  function placeComets(t) {
    if (!points) return;
    const pos = points.geometry.attributes.position, size = points.geometry.attributes.size;
    const n = comets.length, atOnce = Math.min(COMETS, n), period = (CROSS * n) / atOnce;
    for (const c of comets) {
      let k = 0.5, env = 1;
      if (reducedMotion) c.active = c.slot < atOnce;
      else {
        // seconds into this comet's turn; the clock starts a crossing ahead, so a few are already mid-flight when you look
        const u = (((t + CROSS - (c.slot * period) / n) % period) + period) % period;
        c.active = u < CROSS;
        k = u / CROSS;
        env = Math.sin(Math.PI * k);
      }
      const fade = focus ? 1 - shownDim * 0.85 : 1; // leaning in on a shelf, they pass quietly
      const g = Math.max(0, gathered);
      size.setX(c.index, c.active ? 11 * env * g : 0);
      c.tail.material.opacity = c.active ? env * fade * g : 0;
      if (!c.active) continue;
      const dx = c.to[0] - c.from[0], dy = c.to[1] - c.from[1], x = c.from[0] + dx * k, y = c.from[1] + dy * k;
      dirAt(x, y, c.dir);
      _a.copy(c.dir).multiplyScalar(R);
      pos.setXYZ(c.index, _a.x, _a.y, _a.z);
      const back = Math.hypot(dx, dy);
      dirAt(x - (dx / back) * 6, y - (dy / back) * 6, _b).multiplyScalar(R);
      c.tail.geometry.attributes.position.array.set([_a.x, _a.y, _a.z, _b.x, _b.y, _b.z]);
      c.tail.geometry.attributes.position.needsUpdate = true;
    }
    pos.needsUpdate = true;
    size.needsUpdate = true;
  }

  let shown = 0, shownDim = 0, selected = null, focus = null, gathered = 0;
  const _p = new THREE.Vector3();
  const toScreen = (dir, camera, rect) => {
    _p.copy(dir).multiplyScalar(R).add(camera.position).project(camera);
    return { x: rect.left + ((_p.x + 1) / 2) * rect.width, y: rect.top + ((1 - _p.y) / 2) * rect.height, visible: _p.z < 1 && Math.abs(_p.x) < 1 && Math.abs(_p.y) < 1 };
  };
  return {
    group,
    get count() { return books.length; },
    get books() { return books; },
    get regions() { return regions; },
    get focus() { return focus; },
    /** Whether they've drifted into their shelves (and can be leaned in on). */
    get settled() { return gathered >= 1; },
    setBooks,
    /** `t` ambient time; `gather`: you're lying back in the hammock with the sky to look at, so
     * the stars drift into their shelves (and apart again when it's false). */
    update(t, camera, dt, gather) {
      group.position.copy(camera.position);
      uniforms.time.value = t;
      const step = (v, want, s) => (reducedMotion ? want : THREE.MathUtils.clamp(v + Math.sign(want - v) * dt / s, 0, 1));
      const was = gathered;
      gathered = step(Math.max(0, gathered), gather ? 1 : 0, GATHER);
      if (gathered !== was && points) {
        // each star sets off a little after the last (its `delay`), eases out and in, and keeps to the sky's shell
        const pos = points.geometry.attributes.position;
        for (const b of books) {
          if (!b.home) continue;
          const u = THREE.MathUtils.clamp((gathered - b.delay) / 0.6, 0, 1), e = u * u * (3 - 2 * u);
          b.dir.copy(b.loose).lerp(b.home, e).normalize();
          pos.setXYZ(b.index, b.dir.x * R, b.dir.y * R, b.dir.z * R);
        }
        pos.needsUpdate = true;
      }
      uniforms.gather.value = gathered * gathered * (3 - 2 * gathered);
      // the names and lines only once they've settled
      shown = step(shown, gather && gathered >= 1 ? 1 : 0, 1.5);
      shownDim = step(shownDim, focus ? 1 : 0, 0.8);
      uniforms.dim.value = shownDim;
      if (comets.length) placeComets(t);
      for (const s of labels) {
        const r = s.userData.region, mine = focus && r === focus;
        if (s.userData.series) s.material.opacity = shown * shownDim * (mine ? (selected && selected.series === s.userData.series ? 0.95 : 0.6) : 0);
        else s.material.opacity = shown * 0.75 * (1 - shownDim); // leaned in, the strip names the shelf
      }
      for (const l of lines) {
        const mine = focus && l.userData.region === focus;
        l.material.opacity = shown * (0.14 * (focus && !mine ? 1 - shownDim * 0.8 : 1) + (mine ? 0.18 * shownDim : 0) + (selected && selected.series === l.userData.series ? 0.3 : 0));
      }
    },
    /** The book nearest screen point (x, y) within `reach` px, or null; with `inRegion`, only its books (and comets). */
    pick(x, y, camera, rect, reach = 26, inRegion = null) {
      let best = null, bestD = reach;
      for (const b of books) {
        if (b.comet && !b.comet.active) continue; // waiting its turn: not in the sky
        if (inRegion && b.region && b.region !== inRegion) continue;
        const s = toScreen(b.dir, camera, rect);
        if (!s.visible) continue;
        const d = Math.hypot(s.x - x, s.y - y);
        if (d < bestD) { best = b; bestD = d; }
      }
      return best;
    },
    /** The shelf under screen point (x, y): its name (padded to 44 px) or its patch of sky. */
    regionAt(x, y, camera, rect) {
      const pxPerDeg = rect.height / camera.fov;
      for (const r of regions) {
        const s = toScreen(r.labelDir, camera, rect);
        if (s.visible && Math.abs(s.x - x) < Math.max(22, (r.label.w * pxPerDeg) / 2) && Math.abs(s.y - y) < Math.max(22, (r.label.h * pxPerDeg) / 2)) return r;
      }
      let best = null, bestD = Infinity;
      for (const r of regions) {
        const s = toScreen(r.dir, camera, rect), d = Math.hypot(s.x - x, s.y - y) / (r.r * pxPerDeg);
        if (s.visible && d < 1 && d < bestD) { best = r; bestD = d; }
      }
      return best;
    },
    /** Where to look and how narrow a view (vertical fov, degrees) to lean in on shelf `r`. */
    aim(r, baseFov) {
      return { dir: r.dir, fov: THREE.MathUtils.clamp(2 * r.r + 4, 18, baseFov) };
    },
    /** Lean in on a shelf (or none): the others fade back and its series show their names. */
    setFocus(r) { focus = r || null; uniforms.focus.value = r ? r.index : -1; },
    /** Where a book's star is on screen. */
    screenOf(b, camera, rect) { return toScreen(b.dir, camera, rect); },
    /** Light one up (or none). */
    select(b) { selected = b || null; uniforms.picked.value = b ? b.index : -1; },
  };
}
