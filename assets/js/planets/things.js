// What stands on someone else's planet (My Tiny Planet, docs/planets.md): things their own AI
// composed in the chat from simple shapes, from what they love. Nothing here is Steve's: no bar,
// no sign, nothing by default; a planet with no `things` is bare. Each thing is placed from where
// you land (a bearing and a distance along the ground) and faces you, or beside another thing
// (near) and faces it; it stands upright on the ground, and turns if it's turned. Its parts are sized and placed in metres from its foot.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RADIUS } from '../world/planet.js';
import { placeThings, partsOf } from '../../../supabase/functions/_shared/planet.js';
import { surface, woodSet, bambooSet, thatchSet, rattanSet } from '../world/materials.js';
import { palm } from '../world/props.js';
import { planting } from '../world/decor.js';

const DEG = Math.PI / 180;
const surfaces = new Map();
function craftedMaterial(p) {
  if (!p.surface) return material(p.color, p.finish);
  const key = p.surface + '/' + p.color;
  if (!surfaces.has(key)) {
    const color = new THREE.Color(p.color || '#ffffff');
    const set = { wood: () => woodSet(color.getHex()), bamboo: bambooSet, thatch: thatchSet, cloth: rattanSet }[p.surface]();
    const m = surface(set, { color: p.surface === 'wood' ? '#ffffff' : color, bumpScale: 0.025, roughness: 0.88 });
    m.userData.crafted = true;
    surfaces.set(key, m);
  }
  return surfaces.get(key);
}

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
    const m = craftedMaterial(p);
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

// Batch static opaque parts within each thing. Picking still identifies the whole thing,
// while a palm's many leaves no longer need a separate draw each. Text, glass, mirrored
// geometry and animated parts retain their original meshes/materials.
function batchParts(body) {
  body.updateMatrixWorld(true);
  const groups = new Map();
  body.traverse((o)=>{
    if(!o.isMesh || o.userData.spin || o.material.transparent || (o.material.map && !o.material.userData.crafted) || o.matrixWorld.determinant()<0) return;
    for(let parent=o.parent;parent && parent!==body;parent=parent.parent) if(parent.userData.joint) return;
    const m=o.material,key=[m.type,m.color?.getHex(),m.emissive?.getHex(),m.emissiveIntensity,m.roughness,m.metalness,m.side,m.map?.uuid,m.bumpMap?.uuid,m.bumpScale].join('/');
    if(!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(o);
  });
  for(const meshes of groups.values()) {
    if(meshes.length<2) continue;
    const geometries=meshes.map((m)=>{
      const g=(m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone()).applyMatrix4(m.matrixWorld);
      // RoundedBox has only the same position/normal/uv attributes as the other primitives.
      return g;
    });
    const geometry=mergeGeometries(geometries,false);
    geometries.forEach((g)=>g.dispose());
    if(!geometry) continue;
    const merged=new THREE.Mesh(geometry,meshes[0].material);
    merged.castShadow=meshes[0].castShadow; merged.receiveShadow=true;
    meshes.forEach((m)=>m.removeFromParent()); body.add(merged);
  }
}

/**
 * Their things, from a spec that passed checkPlanet: { group, colliders, pickable, update(t) }.
 * `surface(dir)` is the ground's distance from the centre (ground.js), so everything stands on it.
 * A pickable mesh carries its thing in `userData.thing`.
 */
export function buildThings(things = [], surface) {
  const group = new THREE.Group(), colliders = [], pickable = [], spinning = [], characters = [];
  const Y = new THREE.Vector3(0, 1, 0);
  // where each stands, from where you land or beside another thing (placeThings, in the spec's rules)
  const placed = placeThings(things);
  for (const thing of things) {
    const at = placed.get(thing.id);
    if (!at) continue;
    const dir = placeOnPlanet(at.bearing, at.distance);
    const root = new THREE.Group();
    root.position.copy(dir).multiplyScalar(surface(dir));
    // stand up on the ground, then face back toward where you land, then their own turn
    root.quaternion.setFromUnitVectors(Y, dir);
    const back = new THREE.Vector3(0, 1, 0).sub(dir.clone().multiplyScalar(dir.y)); // toward the landing spot, along the ground
    const localBack = back.lengthSq() > 1e-6 ? back.applyQuaternion(root.quaternion.clone().invert()) : new THREE.Vector3(0, 0, 1);
    const face = Math.atan2(localBack.x, localBack.z);
    root.rotateY(face + at.turn * DEG);
    root.scale.setScalar(thing.scale || 1);

    const body = new THREE.Group();
    const joints = {};
    if (thing.craft === 'palm') body.add(palm({height:4.9,lean:0.22,seed:thing.id.length}));
    if (thing.craft === 'planting') body.add(planting([[0,0,-0.06]],thing.id.length));
    for (const p of ['palm','planting'].includes(thing.craft) ? [] : partsOf(thing)) {
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
      let parent = body;
      if (p.joint) {
        if (!joints[p.joint]) {
          const joint = joints[p.joint] = new THREE.Group();
          joint.userData.joint = p.joint;
          joint.position.set(...(p.joint === 'head' ? [0, 0.98, 0] : [0.32, 0.4, -0.1]));
          body.add(joint);
        }
        parent = joints[p.joint];
        copies.position.sub(parent.position);
      }
      parent.add(copies);
      if (p.mirror) { const m = copies.clone(); m.scale.x = -1; parent.add(m); }
    }
    if (thing.craft === 'cat') { thing.joints = joints; characters.push(thing); }
    batchParts(body);
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
    thing.hull = box.clone();
    if (thing.footprint) {
      thing.hull.min.set(-thing.footprint[0]/2, box.min.y, -thing.footprint[1]/2);
      thing.hull.max.set(thing.footprint[0]/2, thing.use === 'look' ? box.max.y : Math.min(box.max.y, 1.8), thing.footprint[1]/2);
    } // where a tap means it (main.js): its shapes now, its model once it's in
    thing.body = body;
    const reach = thing.footprint ? Math.max(...thing.footprint) / 2 : Math.max(0.3, Math.hypot(Math.max(-box.min.x, box.max.x), Math.max(-box.min.z, box.max.z)));
    root.add(body);
    if (thing.light) {
      const light = new THREE.PointLight(thing.light.color || '#ffd9a0', 24 * (thing.light.strength ?? 0.6), 16, 1.4);
      light.position.set(...(thing.light.at || [0, 2, 0]));
      root.add(light);
      thing.lamp = light; // a thing you can switch (use) turns this on and off
    }
    group.add(root);
    thing.reach = Math.min(6, reach * (thing.scale || 1));
    if (thing.solid !== false) colliders.push({ center: root.position.clone(), radius: Math.min(4, thing.reach * 0.8) });
    thing.center = root.position.clone();
    thing.root = root;
  }
  return {
    group, colliders, pickable, placed,
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
      // a little into the ground: the planet curves away under anything long (a sag of L²/8R)
      const sag = (Math.max(ms.x, ms.z) * s) ** 2 / (8 * RADIUS) + 0.02;
      model.position.set(mid.x - mm.x * s, box.min.y - m.min.y * s - sag, mid.z - mm.z * s);
      thing.hull.copy(m).applyMatrix4(model.matrix.compose(model.position, model.quaternion, model.scale));
      model.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = o.receiveShadow = true;
        o.userData.thing = thing;
        pickable.push(o);
      });
      body.add(model);
    },
    // a spinning part turns about its own up, after its own turn
    greet(thing, observer, reduced) {
      if (!thing.joints?.head) return;
      const at = thing.root.worldToLocal(observer.clone());
      thing.greeting = { at:performance.now()/1000, yaw:THREE.MathUtils.clamp(Math.atan2(at.x,at.z),-0.7,0.7), reduced };
      if (reduced) { thing.joints.head.rotation.y = thing.greeting.yaw; thing.joints.head.rotation.z=0.12; if(thing.joints.tail) thing.joints.tail.rotation.z=0.2; }
    },
    update(t) {
      for (const s of spinning) s.mesh.quaternion.copy(s.base).multiply(_q.setFromAxisAngle(Y, t * s.speed));
      for (const c of characters) {
        const a=c.greeting;
        if(!a || a.reduced) continue;
        const k=THREE.MathUtils.clamp((t-a.at)/0.7,0,1), ease=k*k*(3-2*k);
        c.joints.head.rotation.y=a.yaw*ease;
        c.joints.head.rotation.x=-0.12*Math.sin(Math.min(1,(t-a.at)/2.8)*Math.PI);
        c.joints.head.rotation.z=0.12*Math.sin(Math.min(1,(t-a.at)/2.8)*Math.PI);
        if(c.joints.tail) c.joints.tail.rotation.z=0.2*Math.sin(Math.min(1,(t-a.at)/3)*Math.PI);
      }
    },
  };
}
const _q = new THREE.Quaternion();
