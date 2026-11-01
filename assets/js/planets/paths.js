// Worn paths on a friend's planet (My Tiny Planet, docs/planets.md): from where you land to the
// front of each place (a thing placed with at, with what stands near it round it), so you can
// always see where to go next, as on Steve's planet. Each is a soft-edged ribbon of paler,
// trodden ground, laid on the ground's own surface along a gentle curve; all in one mesh.
import * as THREE from 'three';
import { placeOnPlanet } from './things.js';
import { flagstones } from '../world/paths.js';

const DEG = Math.PI / 180;

// across a path: worn in the middle, fading into the ground at its edges, with a little grit
function wornTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const x = c.getContext('2d'), img = x.createImageData(64, 256);
  for (let j = 0; j < 256; j++) for (let i = 0; i < 64; i++) {
    const across = Math.abs(i / 63 - 0.5) * 2, edge = 1 - THREE.MathUtils.smoothstep(across, 0.45, 1);
    const k = (j * 64 + i) * 4, grit = 0.85 + Math.random() * 0.3;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = 255 * Math.min(1, grit);
    img.data[k + 3] = 255 * edge * (0.75 + Math.random() * 0.25);
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * The paths, as one mesh (or null if there are no places to walk to). `things` have been built
 * (buildThings: each has its reach and root), `placed` is placeThings' answer, `surface(dir)` the
 * ground's height, `color` the ground's colour.
 */
export function buildPaths(things, placed, surface, color = '#6b7082', routes) {
  const WIDTH = 0.9, positions = [], uvs = [], colors = [], index = [], steps = [];
  const map = (b, d) => [d * Math.sin(b * DEG), d * Math.cos(b * DEG)];
  const back = ([x, n]) => placeOnPlanet(Math.atan2(x, n) / DEG, Math.hypot(x, n));
  const destinations = routes ? routes.map((r) => ({ at: r.to, start: r.from, reach: 0, endpoint: true })) : things.map((t) => ({ ...t, at: t.at && placed.get(t.id) }));
  for (const t of destinations) {
    const at = t.at;
    if (!at || at.distance < 3) continue;
    // to the front of it: the side it faces, a step clear of it
    const p = map(at.bearing, at.distance), l = Math.hypot(...p);
    const f0 = [-p[0] / l, -p[1] / l], a = (at.turn || 0) * DEG;
    const front = [f0[0] * Math.cos(a) - f0[1] * Math.sin(a), f0[0] * Math.sin(a) + f0[1] * Math.cos(a)];
    const end = t.endpoint ? p : [p[0] + front[0] * ((t.reach || 1) + 0.6), p[1] + front[1] * ((t.reach || 1) + 0.6)];
    const start = t.start ? map(t.start.bearing, t.start.distance) : map(at.bearing, 1.2);
    // a gentle bend, the same way each time for the same place, curving in to meet its front
    const mid = t.endpoint
      ? [end[0] + Math.sign(end[0] - start[0]) * 1.5, start[1]]
      : [(start[0] + end[0]) / 2 + front[0] * 0.8, (start[1] + end[1]) / 2 + front[1] * 0.8];
    const N = Math.max(8, Math.ceil(Math.hypot(end[0] - start[0], end[1] - start[1]) * 3));
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, v = 1 - u;
      const q = [v * v * start[0] + 2 * v * u * mid[0] + u * u * end[0], v * v * start[1] + 2 * v * u * mid[1] + u * u * end[1]];
      const dir = back(q);
      pts.push(dir.multiplyScalar(surface(dir) + 0.03));
    }
    // Sparse hand-split slabs make the route legible without paving the whole beach.
    // Reuse the homepage's bevelled, terrain-draped stones with this planet's own surface.
    if (routes) for (let i = 3; i < pts.length - 2; i += 4) {
      const up = pts[i].clone().normalize(), ahead = pts[i+1].clone().sub(pts[i-1]).normalize();
      const side = new THREE.Vector3().crossVectors(ahead,up).normalize();
      steps.push({up,side,r:0.29,stretch:1.2,turn:Math.sin(i)*0.22,tone:0.93+0.08*Math.sin(i*2),outline:[1,0.91,1.04,0.86,1,0.93,0.89]});
    }
    const base = positions.length / 3;
    let along = 0;
    for (let i = 0; i < pts.length; i++) {
      const up = pts[i].clone().normalize();
      const ahead = pts[Math.min(i + 1, pts.length - 1)].clone().sub(pts[Math.max(i - 1, 0)]).normalize();
      const side = new THREE.Vector3().crossVectors(ahead, up).normalize().multiplyScalar(WIDTH / 2);
      if (i) along += pts[i].distanceTo(pts[i - 1]);
      for (const s of [-1, 1]) {
        positions.push(...pts[i].clone().addScaledVector(side, s).toArray());
        uvs.push(s < 0 ? 0 : 1, along / 3);
        const u = i/(pts.length-1), fade = THREE.MathUtils.smoothstep(u,0,0.15)*THREE.MathUtils.smoothstep(1-u,0,0.15);
        colors.push(1,1,1,fade);
      }
      if (i) index.push(base + 2 * i - 2, base + 2 * i - 1, base + 2 * i, base + 2 * i - 1, base + 2 * i + 1, base + 2 * i);
    }
  }
  if (!positions.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors,4));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const worn = new THREE.Color(color).lerp(new THREE.Color('#e3d3b6'), 0.2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color: worn, vertexColors: true, map: wornTexture(), transparent: true, depthWrite: false, roughness: 1, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide,
  }));
  if (steps.length) mesh.add(flagstones(steps, surface));
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  return mesh;
}
