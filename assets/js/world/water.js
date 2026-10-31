// Shared still-water craft: subtle wind ripples and a grazing reflection of the sky.
// The caller owns the analytic basin, geometry and clock (including reduced motion).
import * as THREE from 'three';

export function rippleWater(material, { time, center, tangent, bitangent, normal, sky }) {
  const before = material.onBeforeCompile;
  material.onBeforeCompile = (sh, renderer) => {
    if (before) before.call(material, sh, renderer);
    Object.assign(sh.uniforms, { uTime: time, uC: { value: center }, uT: { value: tangent }, uB: { value: bitangent }, uN: { value: normal }, uSky: { value: new THREE.Color(sky) } });
    sh.vertexShader = 'varying vec3 vWaterPos;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvWaterPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'varying vec3 vWaterPos;\nuniform float uTime;\nuniform vec3 uC, uT, uB, uN, uSky;\n' + sh.fragmentShader
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec2 wq = vec2(dot(vWaterPos - uC, uT), dot(vWaterPos - uC, uB));
        vec2 wg = vec2(0.0);
        // a few slow wind ripples, each a direction, wavenumber, amplitude and speed
        wg += vec2(0.8, 0.6) * 5.0 * 0.006 * cos(dot(wq, vec2(0.8, 0.6)) * 5.0 + uTime * 1.1);
        wg += vec2(-0.5, 0.87) * 8.5 * 0.0035 * cos(dot(wq, vec2(-0.5, 0.87)) * 8.5 + uTime * 1.6);
        wg += vec2(0.97, -0.26) * 13.0 * 0.002 * cos(dot(wq, vec2(0.97, -0.26)) * 13.0 + uTime * 2.3);
        wg += vec2(-0.2, -0.98) * 21.0 * 0.0011 * cos(dot(wq, vec2(-0.2, -0.98)) * 21.0 + uTime * 3.1);
        vec3 wN = normalize(uN - uT * wg.x - uB * wg.y);
        normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float wFres = pow(1.0 - clamp(dot(wN, normalize(cameraPosition - vWaterPos)), 0.0, 1.0), 4.0);
        totalEmissiveRadiance += uSky * (0.03 + 0.6 * wFres);`);
  };
  material.customProgramCacheKey = () => 'lagoon-ripples-v1';
  return material;
}
