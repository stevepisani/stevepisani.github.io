// The horse, alive: the Meshy horse is one still mesh with no bones, so it's bent in its vertex
// shader instead. Its neck turns at the withers, its tail at the root and its barrel breathes,
// each region picked out by where it is in the model (head toward +z, as Meshy made it). A
// standing horse moves little else. In a loop it breathes, swishes its tail and now and then
// lowers its head to graze; tapped, it tosses its head and flicks its tail.
import * as THREE from 'three';

// where the neck and tail turn, in the model's own space (it spans about -1 to 1 on each axis)
const NECK = new THREE.Vector3(0, 0.3, 0.3), TAIL = new THREE.Vector3(0, 0.45, -0.8);

const GLSL = /* glsl */ `
uniform mat4 uToModel, uFromModel;
uniform float uHead, uTail, uBreath;
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1., 0., 0., 0., c, s, 0., -s, c); }
mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0., -s, c, 0., 0., 0., 1.); }
// how much of each turn a point in the model takes: the head and neck, the tail, the barrel
vec3 horseWeights(vec3 p) {
  float head = smoothstep(0.22, 0.5, p.z) * smoothstep(-0.05, 0.25, p.y);
  float tail = (1. - smoothstep(-0.88, -0.72, p.z)) * smoothstep(-0.75, 0.2, p.y);
  float barrel = smoothstep(-0.5, -0.2, p.z) * (1. - smoothstep(0.15, 0.35, p.z)) * smoothstep(-0.3, 0., p.y);
  return vec3(head, tail, barrel);
}
`;

/** Bend every mesh under `copy` (a clone of the horse model, already placed) and return its controls. */
export function alive(copy) {
  const uniforms = [];
  copy.updateWorldMatrix(true, true);
  const fromRoot = copy.matrixWorld.clone().invert();
  copy.traverse((o) => {
    if (!o.isMesh) return;
    const toModel = fromRoot.clone().multiply(o.matrixWorld);
    const u = {
      uToModel: { value: toModel }, uFromModel: { value: toModel.clone().invert() },
      uHead: { value: 0 }, uTail: { value: 0 }, uBreath: { value: 0 },
    };
    uniforms.push(u);
    o.material = o.material.clone();
    o.material.customProgramCacheKey = () => 'horse';
    o.material.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, u);
      s.vertexShader = GLSL + s.vertexShader
        .replace('#include <beginnormal_vertex>', /* glsl */ `
          vec3 objectNormal = vec3(normal);
          vec3 p0 = (uToModel * vec4(position, 1.)).xyz;
          vec3 w = horseWeights(p0);
          mat3 toM = mat3(uToModel), fromM = mat3(uFromModel);
          vec3 nm = toM * objectNormal;
          nm = rotX(uHead * w.x) * rotZ(uTail * w.y) * nm;
          objectNormal = normalize(fromM * nm);
          #ifdef USE_TANGENT
            vec3 objectTangent = vec3(tangent.xyz);
          #endif`)
        .replace('#include <begin_vertex>', /* glsl */ `
          vec3 pm = p0;
          pm = mix(pm, ${v(NECK)} + rotX(uHead) * (pm - ${v(NECK)}), w.x);
          pm = mix(pm, ${v(TAIL)} + rotZ(uTail) * (pm - ${v(TAIL)}), w.y);
          pm.x *= 1. + uBreath * w.z;
          vec3 transformed = (uFromModel * vec4(pm, 1.)).xyz;`);
    };
  });

  const phase = Math.random() * 100;
  let toss = -10; // when it was last tapped
  return {
    meshes: () => { const m = []; copy.traverse((o) => o.isMesh && m.push(o)); return m; },
    tap(t) { toss = t; },
    // set the pose for time t (seconds)
    update(t) {
      const s = t + phase;
      // graze: every 11 s or so, head down for a few seconds
      const g = Math.max(0, Math.sin(s * 0.57)) ** 6;
      // a toss: head up and back down over a second
      const k = t - toss, up = k >= 0 && k < 1.2 ? Math.sin((k / 1.2) * Math.PI) : 0;
      const head = 0.04 * Math.sin(s * 0.9) + 0.55 * g - 0.4 * up;
      const tail = 0.18 * Math.sin(s * 2.3) * Math.max(0, Math.sin(s * 0.41)) + 0.35 * up * Math.sin(k * 14);
      this.set(head, tail, 0.012 * Math.sin(s * 1.6));
    },
    // the pose itself: head down (radians; up is negative), tail to the side, chest out
    set(head, tail, breath) {
      for (const u of uniforms) { u.uHead.value = head; u.uTail.value = tail; u.uBreath.value = breath; }
    },
  };
}

const v = (p) => `vec3(${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)})`;
