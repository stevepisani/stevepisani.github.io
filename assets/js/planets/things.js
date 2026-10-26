// What stands on someone else's planet (My Tiny Planet, docs/planets.md): things their own AI
// composed in the chat from simple shapes, from what they love. Nothing here is Steve's: no bar,
// no sign, nothing by default; a planet with no `things` is bare. Each thing is placed from where
// you land (a bearing and a distance along the ground), stands upright on the ground, and faces
// you unless it's turned. Its parts are sized and placed in metres from its foot.
import * as THREE from 'three';
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
  const m = finish === 'glow'
    ? new THREE.MeshBasicMaterial({ map, transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })
    : new THREE.MeshStandardMaterial({ map, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 0.8 });
  return { material: m, aspect: c.width / c.height };
}

/** Where a bearing (degrees, 0 straight ahead, + to the right) and a distance along the ground lead from where you land. */
export function placeOnPlanet(bearing, distance) {
  const b = bearing * DEG, t = distance / RADIUS;
  const ahead = new THREE.Vector3(Math.sin(b), 0, -Math.cos(b));
  return new THREE.Vector3(0, Math.cos(t), 0).addScaledVector(ahead, Math.sin(t)).normalize();
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

    let reach = 0.3;
    for (const p of thing.parts) {
      const [w, h, d] = p.size;
      let mesh;
      if (p.shape === 'text') {
        const t = words(p.text, p.color, p.finish);
        mesh = new THREE.Mesh(geometry('text'), t.material);
        // as tall as asked, unless that would make it wider than asked
        const height = Math.min(h, w / t.aspect);
        mesh.scale.set(height * t.aspect, height, 1);
      } else {
        mesh = new THREE.Mesh(geometry(p.shape), material(p.color, p.finish));
        mesh.scale.set(w, h, d);
      }
      const [x, y, z] = p.at || [0, h / 2, 0];
      mesh.position.set(x, y, z);
      if (p.turn) mesh.rotation.set(p.turn[0] * DEG, p.turn[1] * DEG, p.turn[2] * DEG);
      mesh.userData.thing = thing;
      if (p.spin) spinning.push({ mesh, speed: p.spin * DEG, base: mesh.quaternion.clone() });
      root.add(mesh);
      pickable.push(mesh);
      reach = Math.max(reach, Math.hypot(x, z) + Math.max(w, d) / 2 * (p.shape === 'text' ? 0 : 1));
    }
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
    // a spinning part turns about its own up, after its own turn
    update(t) { for (const s of spinning) s.mesh.quaternion.copy(s.base).multiply(_q.setFromAxisAngle(Y, t * s.speed)); },
  };
}
const _q = new THREE.Quaternion();
