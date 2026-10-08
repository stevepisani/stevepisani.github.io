// The cutaway: where the campfire trail crosses a stretch of ground that's been cut away
// (planet.js `CUT`), and what it shows: the planet is hollow, and it's a machine. The cut's walls
// are the shell in cross-section (moss, soil, lava rock, a brass seam, then riveted hull plates
// down to a lit inner skin), its edge trimmed with brass. You cross on a steel truss bridge, and
// below it the inside opens up: a glowing core at the very centre of the planet, three gimbal
// rings turning round it, spokes out to the shell carrying pulses of light, and the inner shell
// itself panelled and lit like a city at night.
//
// The bridge and the walls are ordinary lit things (lamps.js pools from the bridge's lanterns).
// Everything inside is drawn by its own small shaders, lit by the core, not by the moon: the
// moonlight has no shadow down there, so standard materials would glow where nothing reaches.
// The inside is hidden unless you're near enough to see into the opening.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE, pbr, chrome, glow } from './materials.js';
import { CUT, RADIUS, surfaceRadius } from './planet.js';
import { lampLit } from './lamps.js';

const [HX, HZ] = CUT.half, INNER = CUT.inner;
const BRIDGE = 1.0;   // the bridge's half-width (its railings stand here)
const GLASS = [0.9, 0.62]; // the glass floor in the middle of the bridge (half-sizes along and across)
const SEE = 40;       // metres from the cut within which the inside is drawn

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }

/** The shell in cross-section, top to bottom over `thick` metres: moss, soil, lava rock, a brass seam, hull plates, the lit inner skin. */
function strataTexture(thick) {
  const [c, g] = canvas(256, 512), m = 512 / thick; // px per metre down
  const band = (y0, y1, col) => { g.fillStyle = col; g.fillRect(0, y0 * m, 256, (y1 - y0) * m); };
  band(0, 0.12, '#2c4a26'); band(0.12, 0.45, '#3b2a1c'); band(0.45, 1.5, '#2a211d'); band(1.5, 1.65, '#9b7330'); band(1.65, thick, '#3a3f45');
  let seed = 5; const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 600; i++) { g.fillStyle = `rgba(${r() < 0.2 ? '90,40,25' : '8,6,5'},${0.3 + r() * 0.5})`; g.beginPath(); g.arc(r() * 256, (0.45 + r() * 1.05) * m, 1 + r() * 4, 0, 7); g.fill(); } // vesicles in the rock
  for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(20,14,10,${0.3 + r() * 0.4})`; g.fillRect(r() * 256, (0.12 + r() * 0.3) * m, 2 + r() * 6, 1 + r() * 2); } // stones in the soil
  g.strokeStyle = 'rgba(15,17,20,.8)'; g.lineWidth = 3; // hull plates: seams every 0.6 m, rivets along them
  for (let y = 1.65; y < thick; y += 0.6) { g.beginPath(); g.moveTo(0, y * m); g.lineTo(256, y * m); g.stroke(); }
  for (let x = 0; x <= 256; x += 128) { g.beginPath(); g.moveTo(x, 1.65 * m); g.lineTo(x, thick * m); g.stroke(); }
  g.fillStyle = '#7b828a';
  for (let y = 1.72; y < thick; y += 0.6) for (let x = 8; x < 256; x += 16) { g.beginPath(); g.arc(x, y * m, 2.2, 0, 7); g.fill(); }
  for (let x = 4; x < 256; x += 12) { g.fillStyle = '#c99a45'; g.beginPath(); g.arc(x, 1.575 * m, 2, 0, 7); g.fill(); } // the brass seam's rivets
  const skin = g.createLinearGradient(0, (thick - 0.5) * m, 0, thick * m); // the inner skin, lit from inside
  skin.addColorStop(0, 'rgba(255,170,80,0)'); skin.addColorStop(1, 'rgba(255,190,110,.9)');
  g.fillStyle = skin; g.fillRect(0, (thick - 0.5) * m, 256, 0.5 * m);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.wrapS = THREE.RepeatWrapping;
  return t;
}

// A little value noise and fbm, shared by the core and the shell.
const NOISE = `
  float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float n3(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * n3(p); p *= 2.03; a *= 0.5; } return s; }
`;

/** The core: a sphere of slowly churning light, white-hot in the middle, amber at the limb. */
function coreMaterial(time) {
  return new THREE.ShaderMaterial({
    uniforms: { time },
    vertexShader: 'varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform float time; varying vec3 vP; varying vec3 vN; varying vec3 vV; ${NOISE}
      void main() {
        vec3 p = normalize(vP);
        float n = fbm(p * 3.0 + vec3(0.0, time * 0.15, time * 0.07) + fbm(p * 2.0 - time * 0.05) * 1.5);
        float face = clamp(dot(vN, vV), 0.0, 1.0);
        vec3 hot = mix(vec3(1.0, 0.45, 0.12), vec3(1.0, 0.85, 0.55), smoothstep(0.35, 0.75, n));
        hot = mix(hot, vec3(1.0, 0.97, 0.9), smoothstep(0.6, 0.85, n) * face);
        float limb = pow(1.0 - face, 2.0);
        gl_FragColor = vec4(hot * (2.0 + 1.2 * face) + vec3(1.0, 0.5, 0.15) * limb * 2.0, 1.0);
      }`,
  });
}

/** A soft additive halo round the core. */
function haloMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying vec3 vN; varying vec3 vV; void main(){ float f = pow(clamp(dot(-vN, vV), 0.0, 1.0), 2.5); gl_FragColor = vec4(vec3(1.0, 0.55, 0.2) * f * 1.4, 1.0); }',
    side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
}

/**
 * Metal inside the planet, lit by the core: a base colour, a diffuse term toward the centre
 * (the planet's origin), a warm rim, and, where `strip` is set, a glowing line that pulses along
 * the part's length (uv.x), for the rings' and spokes' light.
 */
function coreLit(color, { strip = 0, stripColor = PALETTE.aqua, speed = 0.6 } = {}, time) {
  return new THREE.ShaderMaterial({
    uniforms: { time, base: { value: new THREE.Color(color) }, glowC: { value: new THREE.Color(stripColor) }, strip: { value: strip }, speed: { value: speed } },
    vertexShader: 'varying vec3 vW; varying vec3 vN; varying vec2 vUv; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float time; uniform vec3 base; uniform vec3 glowC; uniform float strip; uniform float speed; varying vec3 vW; varying vec3 vN; varying vec2 vUv;
      void main() {
        vec3 n = normalize(vN), toCore = normalize(-vW);
        float lit = max(dot(n, toCore), 0.0) * (14.0 / (4.0 + length(vW)));
        float rim = pow(1.0 - abs(dot(n, normalize(cameraPosition - vW))), 3.0);
        vec3 c = base * (0.10 + lit * 1.4) + vec3(1.0, 0.55, 0.2) * rim * 0.25 * lit;
        if (strip > 0.0) {
          float band = smoothstep(0.42, 0.5, vUv.y) * (1.0 - smoothstep(0.5, 0.58, vUv.y));
          float pulse = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(vUv.x * 40.0 - time * speed * 6.0), 6.0);
          c += glowC * band * pulse * strip;
        }
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

/**
 * The inner shell, seen from inside: dark hull panels in rows of latitude, their seams faintly
 * lit, windows of light in some of them like a city at night, and bands of conduit round it with
 * light running along them.
 */
function shellMaterial(time) {
  return new THREE.ShaderMaterial({
    uniforms: { time },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float time; varying vec3 vP; ${NOISE}
      void main() {
        vec3 p = normalize(vP);
        float lon = atan(p.z, p.x) / 6.2831853 + 0.5, lat = asin(clamp(p.y, -1.0, 1.0)) / 3.1415927 + 0.5;
        vec2 g = vec2(lon * 96.0, lat * 48.0), cell = floor(g), f = fract(g);
        float seam = 1.0 - smoothstep(0.0, 0.06, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
        float r = h3(vec3(cell, 3.0));
        vec3 c = vec3(0.02, 0.024, 0.03) * (0.6 + 0.8 * r) + vec3(0.25, 0.75, 0.8) * seam * 0.06;
        // windows: a grid of small lights in about one panel in four, some going off and on
        if (r > 0.74) {
          vec2 w = fract(f * vec2(4.0, 3.0)) - 0.5, wi = floor(f * vec2(4.0, 3.0));
          float on = step(0.35, h3(vec3(cell * 7.0 + wi, floor(time * 0.2 + r * 10.0))));
          c += vec3(1.0, 0.72, 0.38) * (1.0 - smoothstep(0.18, 0.3, max(abs(w.x), abs(w.y)))) * on * 0.9;
        }
        // conduits: a band every eight rows, with light running round it
        if (mod(cell.y, 8.0) == 4.0) {
          float run = pow(0.5 + 0.5 * sin(lon * 6.2831853 * 12.0 - time * 1.5 + cell.y), 8.0);
          c = mix(c, vec3(0.12, 0.13, 0.14), 0.7) + vec3(0.3, 0.9, 1.0) * (0.15 + run * 0.9) * (1.0 - smoothstep(0.3, 0.5, abs(f.y - 0.5)));
        }
        c += vec3(0.05, 0.022, 0.01) * (0.5 + 0.5 * fbm(p * 6.0)); // the core's warm light on it
        gl_FragColor = vec4(c, 1.0);
      }`,
    side: THREE.BackSide,
  });
}

export function buildMachine({ quality }) {
  const group = new THREE.Group();
  group.name = 'machine';
  const R0 = surfaceRadius(CUT.up);
  group.position.copy(CUT.up).multiplyScalar(R0);
  group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(CUT.e1, CUT.up, CUT.e2));
  group.updateMatrixWorld(true);
  const inv = group.matrixWorld.clone().invert();
  const ray = (x, z) => CUT.up.clone().multiplyScalar(RADIUS).addScaledVector(CUT.e1, x).addScaledVector(CUT.e2, z).normalize();
  const at = (dir, r) => dir.clone().multiplyScalar(r).applyMatrix4(inv);
  const ground = (x, z) => { const d = ray(x, z); return at(d, surfaceRadius(d)); };
  const thick = R0 - INNER;
  const time = { value: 0 };

  const M = {
    strata: pbr({ map: strataTexture(thick), roughness: 0.9, side: THREE.DoubleSide }),
    steel: pbr({ color: 0x5d646c, metalness: 0.75, roughness: 0.45 }),
    dark: pbr({ color: 0x23272c, metalness: 0.5, roughness: 0.6 }),
    grate: pbr({ color: 0x8a9198, metalness: 0.7, roughness: 0.45 }),
    lip: pbr({ color: PALETTE.brass, metalness: 0.8, roughness: 0.4, side: THREE.DoubleSide }),
    rail: chrome({ roughness: 0.35 }),
    bulb: glow(PALETTE.amber, 3),
  };
  M.strata.emissiveMap = M.strata.map; M.strata.emissive = new THREE.Color(0x3a2a20); // just visible in the dark; the skin at the bottom glows
  lampLit(M.strata);
  for (const k of ['steel', 'dark', 'grate', 'lip', 'rail']) lampLit(M[k], { specular: 24 });
  const add = (geo, mat, parent = group) => { const m = new THREE.Mesh(geo, mat); m.castShadow = quality.high; m.receiveShadow = true; parent.add(m); return m; };
  const up = (v, h) => v.clone().add(new THREE.Vector3(0, h, 0));
  const bar = (a, b, w, h, parts) => { // a box from a to b, w wide and h tall
    const g = new THREE.BoxGeometry(a.distanceTo(b), h, w);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), b.clone().sub(a).normalize());
    parts.push(g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1))));
  };
  const rod = (a, b, r, parts) => {
    const g = new THREE.CylinderGeometry(r, r, a.distanceTo(b), 6);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    parts.push(g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1))));
  };

  /* ---------- The opening: four walls through the shell, and a brass lip round the edge ---------- */
  const N = 40, edges = [[[-HX, -HZ], [HX, -HZ]], [[HX, -HZ], [HX, HZ]], [[HX, HZ], [-HX, HZ]], [[-HX, HZ], [-HX, -HZ]]];
  for (const [[x0, z0], [x1, z1]] of edges) {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const k = i / N, x = x0 + (x1 - x0) * k, z = z0 + (z1 - z0) * k, d = ray(x, z);
      const top = at(d, surfaceRadius(d) + 0.02), bot = at(d, INNER);
      const along = Math.hypot(x1 - x0, z1 - z0) * k;
      pos.push(top.x, top.y, top.z, bot.x, bot.y, bot.z);
      uv.push(along / 2, 1, along / 2, 1 - top.distanceTo(bot) / thick); // the strata by metres down
      if (i) idx.push((i - 1) * 2, (i - 1) * 2 + 1, i * 2, i * 2, (i - 1) * 2 + 1, i * 2 + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    add(g, M.strata).castShadow = false;
  }
  {
    const ring = [], lp = [], li = [];
    for (const [[x0, z0], [x1, z1]] of edges) for (let i = 0; i < N; i++) { const k = i / N; ring.push([x0 + (x1 - x0) * k, z0 + (z1 - z0) * k]); }
    for (const [x, z] of ring) {
      const o = [Math.sign(x) * (Math.abs(x) >= HX - 1e-6 ? 0.22 : 0), Math.sign(z) * (Math.abs(z) >= HZ - 1e-6 ? 0.22 : 0)];
      const outer = ground(x + o[0], z + o[1]), inner = ground(x - o[0] * 0.3, z - o[1] * 0.3);
      lp.push(outer.x, outer.y + 0.05, outer.z, inner.x, inner.y + 0.05, inner.z);
    }
    for (let i = 0; i < ring.length; i++) { const a = i * 2, b = ((i + 1) % ring.length) * 2; li.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    g.setIndex(li);
    g.computeVertexNormals();
    add(g, M.lip);
  }

  /* ---------- The bridge: a steel truss across, a grating you see down through ---------- */
  const colliders = [], solids = [], lamps = [];
  const x0 = -HX - 0.7, x1 = HX + 0.7;
  {
    const n = Math.ceil((x1 - x0) / 0.5), xs = Array.from({ length: n + 1 }, (_, i) => x0 + (x1 - x0) * (i / n));
    const deck = [], frame = [], rail = [];
    // the grating: bars along every 18 cm, cross bars every 10 cm; a glass floor in the middle
    const glassAt = (x) => Math.abs(x) < GLASS[0];
    for (let k = 0; k <= Math.round((2 * BRIDGE) / 0.18); k++) {
      const z = Math.min(BRIDGE, -BRIDGE + k * 0.18), side = Math.abs(z) > GLASS[1];
      for (let i = 0; i < n; i++) if (side || !(glassAt(xs[i]) && glassAt(xs[i + 1]))) bar(up(ground(xs[i], z), -0.01), up(ground(xs[i + 1], z), -0.01), 0.035, 0.03, deck);
    }
    for (let x = x0 + 0.05; x < x1; x += 0.1) {
      if (glassAt(x)) { // only the strips either side of the glass
        for (const s of [-1, 1]) { const a = up(ground(x, s * BRIDGE), -0.012), b = up(ground(x, s * GLASS[1]), -0.012); bar(a.clone().lerp(b, 0), b, 0.012, 0.025, deck); }
        continue;
      }
      const a = up(ground(x, -BRIDGE), -0.012), b = up(ground(x, BRIDGE), -0.012), g = new THREE.BoxGeometry(0.012, 0.025, a.distanceTo(b));
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), b.clone().sub(a).normalize());
      deck.push(g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1))));
    }
    add(mergeGeometries(deck), M.grate);
    // the glass: you stand on it and look straight down, past nothing, to the core
    {
      const nx = 8, nz = 4, pos = [], idx = [];
      for (let i = 0; i <= nx; i++) for (let k = 0; k <= nz; k++) { const p = up(ground(-GLASS[0] + (2 * GLASS[0] * i) / nx, -GLASS[1] + (2 * GLASS[1] * k) / nz), -0.005); pos.push(p.x, p.y, p.z); }
      for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) { const a = i * (nz + 1) + k, b = a + nz + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      const glass = add(g, pbr({ color: 0x9fd8e0, transparent: true, opacity: 0.1, roughness: 0.05, metalness: 0.2, depthWrite: false, side: THREE.DoubleSide }));
      glass.castShadow = false; glass.userData.noBatch = true;
      const rim = [], c = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => up(ground(a * GLASS[0], b * GLASS[1]), 0.005));
      for (let i = 0; i < 4; i++) bar(c[i], c[(i + 1) % 4], 0.07, 0.04, rim);
      add(mergeGeometries(rim), M.lip);
    }
    // the trusses: a bottom chord under the deck, posts and diagonals, a handrail and a mid rail
    for (const z of [-BRIDGE, BRIDGE]) {
      for (let i = 0; i < n; i++) {
        const a = ground(xs[i], z), b = ground(xs[i + 1], z);
        bar(up(a, -0.32), up(b, -0.32), 0.08, 0.14, frame);
        rod(up(a, -0.32), up(a, 1.05), 0.035, frame);
        rod(up(i % 2 ? a : b, -0.32), up(i % 2 ? b : a, 1.05), 0.022, frame);
        bar(up(a, 1.05), up(b, 1.05), 0.07, 0.07, rail);
        bar(up(a, 0.5), up(b, 0.5), 0.03, 0.03, rail);
      }
      rod(up(ground(x1, z), -0.32), up(ground(x1, z), 1.05), 0.035, frame);
    }
    for (const x of xs.filter((x, i) => i % 3 === 0 && !glassAt(x))) bar(up(ground(x, -BRIDGE), -0.32), up(ground(x, BRIDGE), -0.32), 0.1, 0.12, frame); // cross beams
    add(mergeGeometries(frame), M.steel);
    add(mergeGeometries(rail), M.rail);
    // lanterns on the handrail, two each side, lighting the deck
    for (const [x, z] of [[-HX * 0.5, -BRIDGE], [HX * 0.5, BRIDGE], [-HX * 0.5, BRIDGE], [HX * 0.5, -BRIDGE]]) {
      const p = up(ground(x, z), 1.2);
      add(new THREE.CylinderGeometry(0.05, 0.07, 0.08, 10), M.dark).position.copy(up(p, 0.09));
      const b = add(new THREE.SphereGeometry(0.06, 12, 8), M.bulb); b.position.copy(p); b.castShadow = false;
      lamps.push([up(p, 0.1), 9]);
    }
    // a railing round the rest of the edge, open where the bridge meets the trail
    const ex = HX + 0.25, ez = HZ + 0.25, edge = [];
    for (const s of [-1, 1]) {
      const pts = [[-ex, s * BRIDGE], [-ex, s * ez], [ex, s * ez], [ex, s * BRIDGE]].map(([x, z]) => ground(x, z));
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], b = pts[i + 1], m = Math.max(1, Math.round(a.distanceTo(b)));
        for (const h of [0.5, 1.0]) rod(up(a, h), up(b, h), 0.025, edge);
        for (let k = 0; k <= m; k++) { const p = a.clone().lerp(b, k / m); rod(p, up(p, 1.05), 0.035, edge); }
      }
    }
    add(mergeGeometries(edge), M.rail);
    // colliders every 45 cm along every railing, so you can't squeeze through
    const line = (pts) => {
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = ground(...pts[i]), b = ground(...pts[i + 1]), m = Math.max(1, Math.ceil(a.distanceTo(b) / 0.45));
        for (let k = 0; k <= m; k++) colliders.push(a.clone().lerp(b, k / m));
      }
    };
    line([[x0, -BRIDGE], [x1, -BRIDGE]]); line([[x0, BRIDGE], [x1, BRIDGE]]);
    for (const s of [-1, 1]) line([[-ex, s * BRIDGE], [-ex, s * ez], [ex, s * ez], [ex, s * BRIDGE]]);
    solids.push({ cuboid: [(x1 - x0) / 2, 0.05, BRIDGE], at: [0, ground(0, 0).y - 0.06, 0] });
  }
  for (const [sx, sz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) solids.push({ cuboid: [sx ? 0.15 : HX, thick / 2, sz ? 0.15 : HZ], at: [sx * (HX + 0.15), -thick / 2, sz * (HZ + 0.15)] });

  /* ---------- What you tap: the opening itself (not drawn) ---------- */
  const opening = new THREE.Mesh(new THREE.PlaneGeometry(2 * HX, 2 * HZ).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ visible: false }));
  opening.position.y = -0.6;
  opening.userData.noBatch = true;
  group.add(opening);

  /* ---------- Inside: the hollow, centred on the planet's centre ---------- */
  const inside = new THREE.Group();
  inside.name = 'inside';
  inside.userData.noBatch = true;
  inside.add(new THREE.Mesh(new THREE.SphereGeometry(INNER + 0.05, 96, 64), shellMaterial(time)));
  const core = new THREE.Mesh(new THREE.SphereGeometry(2.4, 64, 48), coreMaterial(time));
  inside.add(core);
  inside.add(new THREE.Mesh(new THREE.SphereGeometry(5.0, 48, 32), haloMaterial()));
  // three gimbal rings, each on its own axis, turning; beads of light round each
  const rings = [];
  [[4.4, 0.16, 0.22, PALETTE.brass], [5.9, 0.2, -0.15, 0x6d747c], [7.5, 0.26, 0.09, PALETTE.brass]].forEach(([r, tube, speed, color], i) => {
    const pivot = new THREE.Group();
    pivot.rotation.set(i * 1.1 + 0.4, i * 0.7, i * 0.5);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 12, 160), coreLit(color, { strip: 1.2, stripColor: i === 1 ? PALETTE.amber : PALETTE.aqua, speed: 0.4 + i * 0.3 }, time));
    pivot.add(ring);
    const beads = new THREE.InstancedMesh(new THREE.SphereGeometry(tube * 0.7, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(i === 1 ? PALETTE.aqua : PALETTE.amber).multiplyScalar(2.5), toneMapped: false }), 12);
    const m4 = new THREE.Matrix4();
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; beads.setMatrixAt(k, m4.makeTranslation(Math.cos(a) * r, Math.sin(a) * r, tube * 0.9)); }
    ring.add(beads);
    inside.add(pivot);
    rings.push([ring, speed]);
  });
  // spokes from the outer ring out to the shell, carrying pulses of light; none straight under the opening
  {
    const golden = Math.PI * (3 - Math.sqrt(5)), tilt = new THREE.Vector3(1, 0, 0), dirs = [];
    for (let i = 0; dirs.length < 10 && i < 20; i++) {
      const y = 1 - (i + 0.5) / 10, rr = Math.sqrt(1 - y * y);
      const d = new THREE.Vector3(Math.cos(i * golden) * rr, y, Math.sin(i * golden) * rr).applyAxisAngle(tilt, 0.6);
      if (d.angleTo(CUT.up) > 0.75) dirs.push(d);
    }
    for (const d of dirs) {
      const a = d.clone().multiplyScalar(7.9), b = d.clone().multiplyScalar(INNER);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.45, a.distanceTo(b), 12, 1, true), coreLit(0x4a5058, { strip: 1.6, stripColor: PALETTE.aqua, speed: 0.8 }, time));
      spoke.position.copy(a).add(b).multiplyScalar(0.5); spoke.quaternion.copy(q);
      inside.add(spoke);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 0.5, 0.8, 16), coreLit(PALETTE.brass, {}, time));
      foot.position.copy(d).multiplyScalar(INNER - 0.4); foot.quaternion.copy(q);
      inside.add(foot);
    }
  }

  /* ---------- Into world space ---------- */
  group.updateMatrixWorld(true);
  const toWorld = (v) => v.clone().applyMatrix4(group.matrixWorld);
  return {
    group,
    inside,
    /** What you tap to look inside: the opening (an undrawn plane just below the bridge). */
    opening,
    /** Player colliders: the bridge's railings and the railing round the edge (physics.js stands them up). */
    colliders: colliders.map((p) => ({ center: toWorld(p), radius: 0.08, height: 1.1 })),
    /** Fixed things a thrown coconut meets, in this frame (physics.addFixed): the bridge deck and the walls. */
    solids,
    /** Lamp pools (lamps.js): the bridge's lanterns. */
    lamps: lamps.map(([p, k]) => [toWorld(p), k]),
    /** Where you stand to look in (on the glass, the middle of the bridge) and what you look at (the core, at the planet's centre). */
    platform: toWorld(ground(0, 0)),
    core: new THREE.Vector3(),
    /** The camera, set by main.js: the inside is drawn only when it's near enough to see in. */
    camera: null,
    update(t) {
      const camera = this.camera;
      time.value = t;
      for (const [ring, speed] of rings) ring.rotation.z = t * speed;
      core.rotation.y = t * 0.05;
      inside.visible = !camera || camera.position.distanceTo(group.position) < SEE;
    },
  };
}
