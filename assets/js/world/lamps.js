// Lamp light for the ground: the warm pools the trail lanterns and torches throw on the paths.
//
// Real point lights cost every lit surface on every frame, so the scene keeps only a few. These
// lamps are added in the ground's own shaders instead: a list of positions (uniforms), a soft
// falloff and a wrapped Lambert term, summed per fragment. No shadows, but the same cost however
// many lamps there are (about as much as two real lights), so phones get lit paths too.
//
//   addLamp(worldPos, strength)   before the first frame
//   lampLit(material)             for anything that should catch it (terrain, trails, grass...)
//   finishLamps()                 once every lamp is in; fixes the count the shaders loop over
import * as THREE from 'three';
import { PALETTE } from './materials.js';

const MAX = 48;
const RANGE = 5.5; // metres: past this a lamp adds nothing
const lamps = [];
const uniforms = {
  uLamps: { value: Array.from({ length: MAX }, () => new THREE.Vector4()) },
  uLampColor: { value: new THREE.Color(PALETTE.amber) }, // (Color() already works in linear)
};
let count = 0;

export function addLamp(pos, strength = 1) {
  if (lamps.length < MAX) lamps.push([pos.clone(), strength]);
}

export function finishLamps() {
  count = lamps.length;
  lamps.forEach(([p, k], i) => uniforms.uLamps.value[i].set(p.x, p.y, p.z, k));
}

/** Flicker them all a little, together with the flames (t = ambient time). */
export function updateLamps(t) {
  for (let i = 0; i < count; i++) {
    const v = uniforms.uLamps.value[i];
    v.w = lamps[i][1] * (0.93 + 0.07 * Math.sin(t * 7.3 + i * 1.7) * Math.sin(t * 3.1 + i));
  }
}

const VERT_HEAD = 'varying vec3 vLampPos;\nvarying vec3 vLampN;\n';
const VERT_BODY = `
  {
    mat4 lampM = modelMatrix;
    #ifdef USE_INSTANCING
      lampM = lampM * instanceMatrix;
    #endif
    vLampPos = (lampM * vec4(transformed, 1.0)).xyz;
    vLampN = normalize(mat3(lampM) * objectNormal);
  }
`;
const FRAG_HEAD = `varying vec3 vLampPos;
varying vec3 vLampN;
uniform vec4 uLamps[${MAX}];
uniform vec3 uLampColor;
`;
const fragBody = (n) => `
  {
    vec3 lampSum = vec3(0.0);
    vec3 lampN = normalize(vLampN);
    for (int i = 0; i < ${Math.max(1, n)}; i++) {
      vec3 d = uLamps[i].xyz - vLampPos;
      float d2 = dot(d, d);
      if (d2 > ${(RANGE * RANGE).toFixed(2)}) continue;
      float edge = 1.0 - d2 / ${(RANGE * RANGE).toFixed(2)};
      float ndl = dot(lampN, d * inversesqrt(d2 + 1e-4)) * 0.75 + 0.25; // wrapped: grass and pebbles catch it too
      lampSum += uLamps[i].w * edge * edge * max(ndl, 0.0) / (1.0 + d2 * 0.9);
    }
    reflectedLight.directDiffuse += uLampColor * lampSum * BRDF_Lambert(material.diffuseColor);
  }
`;

/** Let `material` catch the lamps (keeps any onBeforeCompile it already has). */
export function lampLit(material) {
  if (!material || material.userData.lampLit || !material.isMeshStandardMaterial) return material;
  material.userData.lampLit = true;
  const before = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (before) before.call(material, shader, renderer);
    shader.uniforms.uLamps = uniforms.uLamps;
    shader.uniforms.uLampColor = uniforms.uLampColor;
    shader.vertexShader = VERT_HEAD + shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>' + VERT_BODY);
    shader.fragmentShader = FRAG_HEAD + shader.fragmentShader.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>' + fragBody(count));
  };
  const key = material.customProgramCacheKey;
  material.customProgramCacheKey = () => (key ? key.call(material) : '') + '|lamps' + count;
  return material;
}

/** lampLit() every standard material under `root`, except things that glow on their own. */
export function lampLitTree(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      const glows = m && m.emissive && m.emissive.getHex() !== 0 && m.emissiveIntensity > 0;
      if (m && m.isMeshStandardMaterial && !m.userData.keep && !glows) lampLit(m);
    }
  });
}

/** Where they are (for tests). */
export const lampList = () => lamps.map(([p, k]) => [p.x, p.y, p.z, k]);
