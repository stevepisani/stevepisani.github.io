// What stands on someone else's planet (My Tiny Planet, docs/planets.md): things their own AI
// composed in the chat from simple shapes, from what they love. Nothing here is Steve's: no bar,
// no sign, nothing by default; a planet with no `things` is bare. Each thing is placed from where
// you land (a bearing and a distance along the ground), stands upright on the ground, and faces
// you unless it's turned. Its parts are sized and placed in metres from its foot.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RADIUS } from '../world/planet.js';

const DEG = Math.PI / 180;

// one geometry per shape, unit-sized (1 m across, its centre at the middle), shared by every part
const GEOMETRY = {
  box: () => new THREE.BoxGeometry(1, 1, 1),
  sphere: () => new THREE.SphereGeometry(0.5, 32, 16),
  cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 32),
  cone: () => new THREE.ConeGeometry(0.5, 1, 32),
  torus: () => new THREE.TorusGeometry(0.4, 0.1, 16, 48), // a ring standing up, facing you
  capsule: () => new THREE.CapsuleGeometry(0.25, 0.5, 8, 16).scale(2, 1, 2),
  text: () => new THREE.PlaneGeometry(1, 1),
};
const shared = {};
const geometry = (shape) => (shared[shape] ||= GEOMETRY[shape]());

function material(color, finish = 'matte') {
  const c = new THREE.Color(color || '#c9ccd8');
  switch (finish) {
    case 'gloss': return new THREE.MeshStandardMaterial({ color: c, roughness: 0.22, metalness: 0 });
    case 'metal': return new THREE.MeshStandardMaterial({ color: c, roughness: 0.32, metalness: 1 });
    case 'glass': return new THREE.MeshStandardMaterial({ color: c, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.35, depthWrite: false });
    case 'glow': return new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2.2, roughness: 0.6 });
    default: return new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, metalness: 0 });
  }
}

// their own words on a panel: drawn once on a canvas, as wide as the panel is
function words(text, color, finish) {
  const c = document.createElement('canvas');
  const x = c.getContext('2d');
  const font = (px) => `600 ${px}px Inter, system-ui, sans-serif`;
  x.font = font(96);
  c.width = Math.min(2048, Math.ceil(x.measureText(text).width) + 64);
  c.height = 144;
  x.font = font(96);
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillStyle = color || '#ffffff';
  if (finish === 'glow') { x.shadowColor = color || '#ffffff'; x.shadowBlur = 24; }
  x.fillText(text, c.width / 2, c.height / 2);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  // glowing words are brighter than white, so they bloom like neon (world/render.js)
  const m = finish === 'glow'
    ? new THREE.MeshBasicMaterial({ map, color: new THREE.Color(2.4, 2.4, 2.4), transparent: true, side: THREE.DoubleSide, depthWrite: false })
    : new THREE.MeshStandardMaterial({ map, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 0.8 });
  return { material: m, aspect: c.width / c.height };
}

/** Where a bearing (degrees, 0 straight ahead, + to the right) and a distance along the ground lead from where you land. */
export function placeOnPlanet(bearing, distance) {
  const b = bearing * DEG, t = distance / RADIUS;
  const ahead = new THREE.Vector3(Math.sin(b), 0, -Math.cos(b));
  return new THREE.Vector3(0, Math.cos(t), 0).addScaledVector(ahead, Math.sin(t)).normalize();
}

// one part, as a mesh placed in its thing: unit-sized shapes are scaled to its size; a rounded box,
// a tube and a lathe or extrude are built for it
function part(p) {
  const [w, h, d] = p.size;
  let mesh;
  if (p.shape === 'text') {
    const t = words(p.text, p.color, p.finish);
    mesh = new THREE.Mesh(geometry('text'), t.material);
    // as tall as asked, unless that would make it wider than asked
    const height = Math.min(h, w / t.aspect);
    mesh.scale.set(height * t.aspect, height, 1);
  } else {
    const m = material(p.color, p.finish);
    if (p.shape === 'box' && p.round) {
      mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, p.round * Math.min(w, h, d)), m);
    } else if (p.shape === 'tube') {
      const curve = new THREE.CatmullRomCurve3(p.path.map(([x, y, z]) => new THREE.Vector3(x * w, y * h, z * d)));
      mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 12 * p.path.length, (p.thick || 0.05) / 2, 12), m);
    } else if (p.shape === 'lathe') {
      // its side profile, [out from the middle, up], each 0..1 of its size, turned round its up
      m.side = THREE.DoubleSide;
      mesh = new THREE.Mesh(new THREE.LatheGeometry(p.profile.map(([r, y]) => new THREE.Vector2(r * 0.5, y - 0.5)), 48), m);
      mesh.scale.set(w, h, d);
    } else if (p.shape === 'extrude') {
      // a flat outline, [across, up], each 0..1 of its size, given its depth
      const shape = new THREE.Shape(p.outline.map(([x, y]) => new THREE.Vector2(x - 0.5, y - 0.5)));
      mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5), m);
      mesh.scale.set(w, h, d);
    } else {
      mesh = new THREE.Mesh(geometry(p.shape), m);
      mesh.scale.set(w, h, d);
    }
    // solid parts cast shadows; light passes through glass, and what glows lights itself
    mesh.castShadow = p.finish !== 'glass' && p.finish !== 'glow';
    mesh.receiveShadow = true;
  }
  mesh.position.fromArray(p.at || [0, h / 2, 0]);
  if (p.turn) mesh.rotation.set(p.turn[0] * DEG, p.turn[1] * DEG, p.turn[2] * DEG);
  if (p.spin) mesh.userData.spin = p.spin;
  return mesh;
}

/**
 * Their things, from a spec that passed checkPlanet: { group, colliders, pickable, update(t) }.
 * `surface(dir)` is the ground's distance from the centre (ground.js), so everything stands on it.
 * A pickable mesh carries its thing in `userData.thing`.
 */
export function buildThings(things = [], surface) {
  const group = new THREE.Group(), colliders = [], pickable = [], spinning = [];
  const Y = new THREE.Vector3(0, 1, 0);
  for (const thing of things) {
    const dir = placeOnPlanet(thing.at.bearing, thing.at.distance);
    const root = new THREE.Group();
    root.position.copy(dir).multiplyScalar(surface(dir));
    // stand up on the ground, then face back toward where you land, then their own turn
    root.quaternion.setFromUnitVectors(Y, dir);
    const back = new THREE.Vector3(0, 1, 0).sub(dir.clone().multiplyScalar(dir.y)); // toward the landing spot, along the ground
    const localBack = back.lengthSq() > 1e-6 ? back.applyQuaternion(root.quaternion.clone().invert()) : new THREE.Vector3(0, 0, 1);
    const face = Math.atan2(localBack.x, localBack.z);
    root.rotateY(face + (thing.turn || 0) * DEG);
    root.scale.setScalar(thing.scale || 1);

    const body = new THREE.Group();
    for (const p of thing.parts) {
      const one = part(p);
      // repeated in steps (each copy moved and turned one more step about the foot), then mirrored
      const copies = new THREE.Group();
      const n = p.repeat ? p.repeat.count : 1;
      for (let i = 0; i < n; i++) {
        const step = new THREE.Group();
        if (p.repeat) {
          step.position.fromArray(p.repeat.at || [0, 0, 0]).multiplyScalar(i);
          step.rotation.set(...(p.repeat.turn || [0, 0, 0]).map((a) => a * DEG * i));
        }
        step.add(i ? one.clone() : one);
        copies.add(step);
      }
      body.add(copies);
      if (p.mirror) { const m = copies.clone(); m.scale.x = -1; body.add(m); }
    }
    body.traverse((o) => {
      if (!o.isMesh) return;
      o.userData.thing = thing; // a clone's userData is a copy: point every copy at the thing itself
      pickable.push(o);
      if (o.userData.spin) spinning.push({ mesh: o, speed: o.userData.spin * DEG, base: o.quaternion.clone() });
    });
    // how far it reaches from its foot, along the ground: where you stop when you walk up to it
    // (measured before it's placed, so in metres from its foot)
    const box = new THREE.Box3().setFromObject(body);
    thing.box = box;
    thing.body = body;
    const reach = Math.max(0.3, Math.hypot(Math.max(-box.min.x, box.max.x), Math.max(-box.min.z, box.max.z)));
    root.add(body);
    if (thing.light) {
      const light = new THREE.PointLight(thing.light.color || '#ffd9a0', 24 * (thing.light.strength ?? 0.6), 16, 1.4);
      light.position.set(...(thing.light.at || [0, 2, 0]));
      root.add(light);
    }
    group.add(root);
    thing.reach = Math.min(6, reach * (thing.scale || 1));
    if (thing.solid !== false) colliders.push({ center: root.position.clone(), radius: Math.min(4, thing.reach * 0.8) });
    thing.center = root.position.clone();
    thing.root = root;
  }
  return {
    group, colliders, pickable,
    // a real model in place of a thing's shapes (models.js): as big as fits in the room the shapes
    // took (as tall, and as long along the ground), standing where they stood
    swap(thing, model) {
      const { body, box } = thing;
      const had = new Set();
      body.traverse((o) => { if (o.isMesh) had.add(o); });
      for (let i = pickable.length; i--;) if (had.has(pickable[i])) pickable.splice(i, 1);
      for (let i = spinning.length; i--;) if (had.has(spinning[i].mesh)) spinning.splice(i, 1);
      body.clear();
      const m = new THREE.Box3().setFromObject(model), ms = m.getSize(new THREE.Vector3()), bs = box.getSize(new THREE.Vector3());
      const s = Math.min(bs.y / ms.y, Math.max(bs.x, bs.z) / Math.max(ms.x, ms.z));
      model.scale.setScalar(s);
      const mid = box.getCenter(new THREE.Vector3()), mm = m.getCenter(new THREE.Vector3());
      model.position.set(mid.x - mm.x * s, box.min.y - m.min.y * s, mid.z - mm.z * s);
      model.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = o.receiveShadow = true;
        o.userData.thing = thing;
        pickable.push(o);
      });
      body.add(model);
    },
    // a spinning part turns about its own up, after its own turn
    update(t) { for (const s of spinning) s.mesh.quaternion.copy(s.base).multiply(_q.setFromAxisAngle(Y, t * s.speed)); },
  };
}
const _q = new THREE.Quaternion();
