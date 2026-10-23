// What the holidays share (assets/js/world/holidays/): placing things round the bar and along the
// walk, things strewn beside it, the festoon bulbs in the day's colours, a hat for the bartender,
// a canvas texture, and fireworks. Each holiday's bundle takes in only what it uses.
import {
  Group, Mesh, InstancedMesh, Object3D, Vector3, Color, CanvasTexture, SRGBColorSpace,
  CylinderGeometry, SphereGeometry, MeshStandardMaterial, DoubleSide, BufferGeometry, BufferAttribute,
  Points, PointsMaterial, AdditiveBlending,
} from 'three';

const tmp = new Object3D();

/** Where things go: each call gives a world matrix for a thing `size` across. */
export function placer({ bar, place, dirFrom, headingToward, trailEdge, nearLandmark, solid }) {
  bar.group.updateMatrixWorld(true);
  const done = () => tmp.matrix.compose(tmp.position, tmp.quaternion, tmp.scale).clone();
  return {
    /** On the ground at bar-local (x, z): the planet curves away from the bar's floor. */
    ground(x, z, size, heading = 0) {
      tmp.scale.setScalar(size);
      place(tmp, bar.group.localToWorld(new Vector3(x, 0, z)).normalize(), { heading, sink: 0.02 });
      return done();
    },
    /** At bar-local (x, y, z): on the deck or the counter. */
    bar(x, y, z, size, heading = 0) {
      tmp.position.set(x, y, z);
      tmp.rotation.set(0, heading, 0);
      tmp.scale.setScalar(size);
      tmp.updateMatrix();
      return bar.group.matrixWorld.clone().multiply(tmp.matrix);
    },
    /**
     * Just off the walk from where you land to the bar (`polar` from the bar, `side` ±1), clear
     * of the flagstones and anything solid, turned a little back toward where you land; or null.
     */
    walk(polar, side, size) {
      for (let a = 0.02; a < 0.2; a += 0.004) {
        const dir = dirFrom(polar, Math.PI / 2 + side * a / Math.sin(polar));
        if (trailEdge(dir) > 0.25 && !nearLandmark(dir, 0.2) && !solid(dir, size + 0.15)) {
          tmp.scale.setScalar(size);
          place(tmp, dir, { heading: headingToward(dir, dirFrom(polar + 0.1, Math.PI / 2)), sink: 0.02 });
          return { matrix: done(), at: tmp.position.clone(), up: dir };
        }
      }
      return null;
    },
  };
}

/** A fixed sequence of numbers in [0, 1), so what's scattered falls the same way for everyone. */
export const random = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

/**
 * World matrices for up to `n` small things strewn round the walk from where you land to the bar:
 * `polar` from the bar, `spread` either side (radians round it), kept where `keep(edge, rnd)` says
 * (edge: metres from the trail, less than 0 on it), clear of anything solid.
 */
export function scatter({ place, dirFrom, trailEdge, solid }, n, rnd, { polar = [0.2, 0.66], spread = 0.6, keep, size = [0.8, 1.5], tilt = 0.4, lift = 0.015 } = {}) {
  const out = [], o = new Object3D();
  for (let tries = 0; out.length < n && tries < n * 20; tries++) {
    const dir = dirFrom(polar[0] + rnd() * (polar[1] - polar[0]), Math.PI / 2 + (rnd() - 0.5) * spread);
    if (!keep(trailEdge(dir), rnd) || solid(dir, 0.05)) continue;
    o.scale.setScalar(size[0] + rnd() * (size[1] - size[0]));
    place(o, dir, { heading: rnd() * Math.PI * 2, lift });
    o.rotateX((rnd() - 0.5) * tilt);
    o.updateMatrix();
    out.push(o.matrix.clone());
  }
  return out;
}

/** A pumpkin a metre across, sitting on its base, and its stem (to share its instance matrices). */
export function pumpkin() {
  const body = new SphereGeometry(1, 32, 18);
  const p = body.attributes.position, v = new Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const rib = 1 - 0.07 * (1 - Math.cos(Math.atan2(v.z, v.x) * 9)) / 2;
    p.setXYZ(i, v.x * rib, v.y * 0.78 * (v.y < 0 ? 0.85 : 1), v.z * rib);
  }
  body.computeVertexNormals();
  body.translate(0, 0.68, 0);
  return { body, stem: new CylinderGeometry(0.06, 0.1, 0.32, 7).translate(0, 1.36, 0) };
}

/** One draw for many copies of a thing, from world matrices. */
export function instanced(geometry, material, matrices, { shadow = true } = {}) {
  const m = new InstancedMesh(geometry, material, matrices.length);
  matrices.forEach((x, i) => m.setMatrixAt(i, x));
  m.castShadow = shadow;
  return m;
}

/** The festoon bulbs over the bar's front, in turn through `colors` (k: how bright each). */
export function bulbs({ bar, glow }, colors, k = []) {
  const im = bar.group.getObjectByName('festoon')?.children.find((o) => o.isInstancedMesh);
  if (!im) return;
  im.material = glow(0xffffff, 2.6);
  for (let i = 0; i < im.count; i++) im.setColorAt(i, new Color(colors[i % colors.length]).multiplyScalar(k[i % colors.length] || 1));
}

/** A hat on the bartender's head (`build()` gives it, its brim at y 0; the antenna goes under it). */
export function hat({ bar }, build, tilt = -0.08) {
  const head = bar.robot.head;
  if (!head) return null;
  const h = build();
  h.position.set(0, 0.395, 0);
  h.rotation.z = tilt;
  head.add(h);
  if (bar.robot.antenna) bar.robot.antenna.visible = false;
  return h;
}

/** A cone hat: brim radius, height, how far the tip flops over, and its material. */
export function coneHat({ brim = 0, base = 0.172, height = 0.44, flop = 0.09, material }) {
  const g = new Group();
  if (brim) g.add(new Mesh(new CylinderGeometry(brim, brim, 0.012, 40), material));
  const cone = new CylinderGeometry(0.004, base, height, 24, 8, true);
  const c = cone.attributes.position;
  for (let i = 0; i < c.count; i++) { const k = c.getY(i) / height + 0.5; c.setX(i, c.getX(i) + flop * k * k * k); }
  cone.computeVertexNormals();
  g.add(new Mesh(cone.translate(0, height / 2, 0), material));
  g.userData.tip = new Vector3(flop, height, 0);
  return g;
}

export const felt = (color, roughness = 0.85) => new MeshStandardMaterial({ color, roughness, side: DoubleSide });

export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** A ball (a pompom, an ornament): radius, material, where. */
export function ball(r, material, [x, y, z] = [0, 0, 0]) {
  const m = new Mesh(new SphereGeometry(r, 16, 10), material);
  m.position.set(x, y, z);
  return m;
}

/**
 * Fireworks: `launch(from, to, color)` sends a shell up from `from` that bursts at `to`, with a
 * crack (`sfx`). A few at a time from a fixed pool, so a show never makes new materials mid-frame.
 */
export function fireworks(scene, { sfx = () => {}, pool = 8, n = 110 } = {}) {
  const spark = canvasTexture(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,0.6)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  });
  const slots = Array.from({ length: pool }, () => {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3));
    const pts = new Points(geo, new PointsMaterial({ map: spark, size: 0.3, transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false }));
    pts.frustumCulled = false;
    pts.visible = false;
    scene.add(pts);
    return { pts, vel: Array.from({ length: n }, () => new Vector3()), t: -1, live: false };
  });
  const up = new Vector3(), c = new Vector3();
  return {
    get busy() { return slots.filter((s) => s.live).length; },
    launch(from, to, color, { delay = 0, rise = 1.1, speed = 4.5 } = {}) {
      const s = slots.find((x) => !x.live);
      if (!s) return false;
      Object.assign(s, { live: true, t: -delay, rise, from: from.clone(), to: to.clone(), burst: false });
      s.pts.material.color.set(color).multiplyScalar(3);
      for (const v of s.vel) v.randomDirection().multiplyScalar(speed * (0.75 + Math.random() * 0.5));
      return true;
    },
    update(dt) {
      for (const s of slots) {
        if (!s.live) continue;
        s.t += dt;
        if (s.t < 0) continue;
        const p = s.pts.geometry.attributes.position;
        s.pts.visible = true;
        up.copy(s.to).normalize();
        if (s.t < s.rise) { // the shell going up: one bright point
          const k = s.t / s.rise;
          c.copy(s.from).lerp(s.to, 1 - (1 - k) * (1 - k));
          for (let i = 0; i < s.vel.length; i++) p.setXYZ(i, c.x, c.y, c.z);
          s.pts.material.size = 0.2;
          s.pts.material.opacity = 1;
        } else {
          if (!s.burst) { s.burst = true; sfx('firework', s.to); }
          const a = s.t - s.rise, drag = (1 - Math.exp(-2 * a)) / 2, fall = 1.1 * a * a;
          for (let i = 0; i < s.vel.length; i++) {
            const v = s.vel[i];
            p.setXYZ(i, s.to.x + v.x * drag - up.x * fall, s.to.y + v.y * drag - up.y * fall, s.to.z + v.z * drag - up.z * fall);
          }
          s.pts.material.size = 0.3;
          s.pts.material.opacity = Math.max(0, 1 - a / 2);
          if (a > 2) { s.live = false; s.pts.visible = false; }
        }
        p.needsUpdate = true;
      }
    },
  };
}
