// The listening sky: every book Steve has finished on Audible is a star over the hammock, and
// what he's listening to now is a comet crossing them. A series is a constellation, its books
// joined in order and its name written faintly beside it. A star's colour is its kind of book,
// its size how long it is. Lie in the hammock, look up, tap one (main.js picks with `pick()` and
// shows the card). The data is /listening.json (tools/audible-sync.py, daily); with none, no stars.
//
// Like the rest of the sky it's infinitely far away (the group rides on the camera), at fixed
// directions in the world: a cone round where you look when lying in the hammock.
import * as THREE from 'three';
import { PALETTE } from './materials.js';

const R = 520;          // inside the background star shell (600), outside everything else
const GAP = 3.4;        // degrees between any two stars
const STEP = 4.2;       // degrees between books in a constellation
const DEG = Math.PI / 180;

// kind of book -> colour (Audible's top category)
const KIND = [
  [/science fiction|fantasy/i, PALETTE.aqua],
  [/literature|fiction|mystery|thriller|romance|teen/i, PALETTE.cream],
  [/history|biograph|memoir|politic/i, PALETTE.amber],
  [/science|technology|computer|engineering|business|money|education/i, PALETTE.moon],
];
const kindColour = (genre) => new THREE.Color((KIND.find(([re]) => re.test(genre || '')) || [0, 0xf3ede2])[1]);

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
const rng = (seed) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

function label(text) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const font = '500 34px Inter, system-ui, sans-serif';
  g.font = font;
  c.width = Math.ceil(g.measureText(text).width) + 24; c.height = 48;
  g.font = font;
  g.fillStyle = 'rgba(200, 212, 255, 0.85)';
  g.textBaseline = 'middle';
  g.fillText(text, 12, 25);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false }));
  s.scale.set((c.width / c.height) * 11, 11, 1);
  s.renderOrder = -1;
  return s;
}

export function createListeningSky({ center, reducedMotion = false }) {
  const group = new THREE.Group();
  const C = center.clone().normalize();
  const e1 = new THREE.Vector3(0, 1, 0).cross(C);
  if (e1.lengthSq() < 1e-4) e1.set(1, 0, 0);
  e1.normalize();
  const e2 = C.clone().cross(e1).normalize();
  // (x, y) in degrees from the centre -> a direction
  const dirAt = (x, y, out = new THREE.Vector3()) => out.copy(C).addScaledVector(e1, Math.tan(x * DEG)).addScaledVector(e2, Math.tan(y * DEG)).normalize();

  let books = [], points = null, comets = [], lines = [], labels = [];
  const uniforms = { time: { value: 0 }, dpr: { value: Math.min(devicePixelRatio, 2) }, picked: { value: -1 }, still: { value: reducedMotion ? 1 : 0 } };

  function clear() {
    for (const o of [...group.children]) { group.remove(o); o.geometry && o.geometry.dispose(); o.material && (o.material.map && o.material.map.dispose(), o.material.dispose()); }
    books = []; comets = []; lines = []; labels = []; points = null;
  }

  /** Lay out the stars for `data` ({ finished: [...], listening: [...] } from /listening.json). */
  function setBooks(data) {
    clear();
    const finished = (data && data.finished) || [], listening = (data && data.listening) || [];
    if (!finished.length && !listening.length) return;
    const placed = []; // [x, y] in degrees
    let spread = Math.max(14, Math.sqrt(finished.length) * 3); // degrees from the centre; it grows if it must
    const free = (x, y) => Math.hypot(x, y) < spread && placed.every(([a, b]) => Math.hypot(a - x, b - y) >= GAP);
    // series of two or more become constellations; the rest are single stars
    const bySeries = new Map();
    for (const b of finished) if (b.series) (bySeries.get(b.series) || bySeries.set(b.series, []).get(b.series)).push(b);
    const groups = [];
    for (const [name, list] of bySeries) if (list.length > 1) groups.push({ name, list: list.sort((a, b) => parseFloat(a.seq) - parseFloat(b.seq)) });
    const inGroup = new Set(groups.flatMap((g) => g.list));
    groups.sort((a, b) => b.list.length - a.list.length); // the biggest first, while there's room

    const stars = []; // { book, x, y }
    for (const g of groups) {
      const r = rng(hash(g.name));
      let ok = null;
      for (let tries = 0; !ok; tries++) {
        if (tries && tries % 80 === 0) spread += 4;
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * (spread - 2);
        let x = Math.cos(a) * d, y = Math.sin(a) * d, heading = r() * Math.PI * 2;
        const pts = [];
        for (let i = 0; i < g.list.length; i++) {
          if (i) { heading += (r() - 0.5) * 1.6; x += Math.cos(heading) * STEP; y += Math.sin(heading) * STEP; }
          pts.push([x, y]);
        }
        if (pts.every(([px, py], i) => free(px, py) && pts.slice(0, i).every(([qx, qy]) => Math.hypot(px - qx, py - qy) >= GAP))) ok = pts;
      }
      ok.forEach(([x, y], i) => { placed.push([x, y]); stars.push({ book: g.list[i], x, y, series: g.name }); });
      g.pts = ok;
    }
    for (const b of finished) {
      if (inGroup.has(b)) continue;
      const r = rng(hash(b.asin || b.title));
      for (let tries = 0; ; tries++) {
        if (tries && tries % 80 === 0) spread += 4;
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * spread, x = Math.cos(a) * d, y = Math.sin(a) * d;
        if (free(x, y)) { placed.push([x, y]); stars.push({ book: b, x, y }); break; }
      }
    }

    // the stars: one Points, a soft glow each, bright enough to bloom a little
    const n = stars.length + listening.length;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), seed = new Float32Array(n);
    const v = new THREE.Vector3();
    stars.forEach((s, i) => {
      dirAt(s.x, s.y, v).multiplyScalar(R);
      pos.set([v.x, v.y, v.z], i * 3);
      const c = kindColour(s.book.genre).multiplyScalar(2.4);
      col.set([c.r, c.g, c.b], i * 3);
      size[i] = 13 + 9 * Math.min(1, (s.book.minutes || 600) / 1500);
      seed[i] = (hash(s.book.asin || s.book.title) % 1000) / 10;
      books.push({ book: s.book, dir: dirAt(s.x, s.y), index: i, series: s.series || null });
    });
    // listening now: comets, drifting slowly across the field (still under reduced motion)
    listening.forEach((b, k) => {
      const i = stars.length + k, r = rng(hash(b.asin || b.title));
      const a = r() * Math.PI * 2, from = [Math.cos(a) * spread * 0.9, Math.sin(a) * spread * 0.9];
      const to = [-from[0] * 0.8 + (r() - 0.5) * 10, -from[1] * 0.8 + (r() - 0.5) * 10];
      const c = new THREE.Color(PALETTE.coral).lerp(new THREE.Color(PALETTE.amber), 0.6).multiplyScalar(1.8);
      col.set([c.r, c.g, c.b], i * 3);
      size[i] = 15;
      seed[i] = 0;
      const comet = { book: b, index: i, from, to, phase: r(), dir: new THREE.Vector3(), tail: null };
      comets.push(comet);
      books.push({ book: b, dir: comet.dir, index: i, comet: true });
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    points = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float size; attribute float seed; attribute vec3 color; uniform float time, dpr, picked, still; varying vec3 vC; varying float vA;
        void main(){ float tw = still > .5 ? 1. : .8 + .2 * sin(time * (.4 + fract(seed) * 1.2) + seed);
          float sel = abs(float(gl_VertexID) - picked) < .5 ? 1.7 : 1.;
          vC = color; vA = tw; gl_PointSize = size * dpr * tw * sel; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
      // a bright core, a soft halo, and four thin rays: they read as stars you can pick, not the field
      fragmentShader: `varying vec3 vC; varying float vA;
        void main(){ vec2 p = gl_PointCoord - .5; float d = length(p); if (d > .5) discard;
          float core = smoothstep(.09, .0, d), halo = smoothstep(.5, .0, d) * .22;
          float rays = (smoothstep(.035, .0, abs(p.x)) + smoothstep(.035, .0, abs(p.y))) * smoothstep(.5, .1, d) * .5;
          float k = core + halo + rays;
          gl_FragColor = vec4(vC * k, k * vA); }`,
    }));
    points.frustumCulled = false;
    points.renderOrder = -1;
    group.add(points);

    // constellation lines and names
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
      line.userData.series = g.name;
      group.add(line);
      lines.push(line);
      // its name, below its lowest star
      const low = g.pts.reduce((m, q) => (q[1] < m[1] ? q : m));
      const s = label(g.name);
      s.position.copy(dirAt(low[0], low[1] - 2.4)).multiplyScalar(R);
      s.userData.series = g.name;
      group.add(s);
      labels.push(s);
    }
    // comet tails
    for (const c of comets) {
      const tg = new THREE.BufferGeometry();
      tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array([2.2, 1.4, 0.8, 0, 0, 0]), 3));
      c.tail = new THREE.Line(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
      c.tail.frustumCulled = false;
      c.tail.renderOrder = -1;
      group.add(c.tail);
    }
    placeComets(0);
  }

  // A comet crosses the field in about four minutes and comes round again; the tail points back
  // along its path.
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();
  function placeComets(t) {
    if (!points) return;
    const pos = points.geometry.attributes.position;
    for (const c of comets) {
      const k = reducedMotion ? 0.5 : (c.phase + t / 240) % 1;
      const x = c.from[0] + (c.to[0] - c.from[0]) * k, y = c.from[1] + (c.to[1] - c.from[1]) * k;
      dirAt(x, y, c.dir);
      _a.copy(c.dir).multiplyScalar(R);
      pos.setXYZ(c.index, _a.x, _a.y, _a.z);
      const back = Math.hypot(c.to[0] - c.from[0], c.to[1] - c.from[1]);
      dirAt(x - ((c.to[0] - c.from[0]) / back) * 9, y - ((c.to[1] - c.from[1]) / back) * 9, _b).multiplyScalar(R);
      c.tail.geometry.attributes.position.array.set([_a.x, _a.y, _a.z, _b.x, _b.y, _b.z]);
      c.tail.geometry.attributes.position.needsUpdate = true;
    }
    pos.needsUpdate = true;
  }

  let shown = 0, selected = null;
  const _p = new THREE.Vector3();
  return {
    group,
    get count() { return books.length; },
    get books() { return books; },
    setBooks,
    /** `t` ambient time; `lying`: you're in the hammock, so the names come up. */
    update(t, camera, dt, lying) {
      group.position.copy(camera.position);
      uniforms.time.value = t;
      if (comets.length) placeComets(t);
      const want = lying ? 1 : 0;
      shown = reducedMotion ? want : THREE.MathUtils.clamp(shown + Math.sign(want - shown) * dt / 1.5, 0, 1);
      for (const s of labels) s.material.opacity = shown * (selected && selected.series === s.userData.series ? 0.95 : 0.5);
      for (const l of lines) l.material.opacity = 0.14 + 0.16 * shown + (selected && selected.series === l.userData.series ? 0.35 : 0);
    },
    /** The book nearest screen point (x, y) within `reach` px, or null. */
    pick(x, y, camera, rect, reach = 26) {
      let best = null, bestD = reach;
      for (const b of books) {
        _p.copy(b.dir).multiplyScalar(R).add(camera.position).project(camera);
        if (_p.z > 1 || _p.z < -1) continue;
        const sx = rect.left + ((_p.x + 1) / 2) * rect.width, sy = rect.top + ((1 - _p.y) / 2) * rect.height;
        const d = Math.hypot(sx - x, sy - y);
        if (d < bestD) { best = b; bestD = d; }
      }
      return best;
    },
    /** Where a book's star is on screen. */
    screenOf(b, camera, rect) {
      _p.copy(b.dir).multiplyScalar(R).add(camera.position).project(camera);
      return { x: rect.left + ((_p.x + 1) / 2) * rect.width, y: rect.top + ((1 - _p.y) / 2) * rect.height, visible: _p.z < 1 && Math.abs(_p.x) < 1 && Math.abs(_p.y) < 1 };
    },
    /** Light one up (or none). */
    select(b) { selected = b || null; uniforms.picked.value = b ? b.index : -1; },
  };
}
