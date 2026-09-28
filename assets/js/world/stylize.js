// The look: toon shading with a cool-tinted shadow band and a warm rim light.
// Every material in the world goes through toonify() so Kenney models and
// hand-built geometry read as one style.
import * as THREE from 'three';

// 4-step light ramp. NearestFilter keeps the bands crisp.
const ramp = new THREE.DataTexture(new Uint8Array([
  70, 70, 70, 255,
  140, 140, 140, 255,
  210, 210, 210, 255,
  255, 255, 255, 255,
]), 4, 1);
ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
ramp.needsUpdate = true;

const RIM_COLOR = new THREE.Color(0xffc38a);
const SHADOW_TINT = new THREE.Color(0x3a3f8f);

const cache = new Map();

/** A toon material with rim light and a blue-ish shadow side instead of grey. */
export function toon(params = {}) {
  const { rim = 0.25, ...rest } = params;
  const m = new THREE.MeshToonMaterial({ gradientMap: ramp, ...rest });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.rimColor = { value: RIM_COLOR };
    shader.uniforms.rimStrength = { value: rim };
    shader.uniforms.shadowTint = { value: SHADOW_TINT };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 rimColor;\nuniform float rimStrength;\nuniform vec3 shadowTint;')
      .replace(
        '#include <opaque_fragment>',
        `// cool the shadows, warm the rim
        float lum = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
        float base = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)) + 1e-3;
        outgoingLight = mix(outgoingLight, outgoingLight + shadowTint * 0.08, clamp(1.0 - lum / base, 0.0, 1.0));
        float rim = pow(1.0 - abs(dot(normalize(-vViewPosition), normal)), 3.0);
        outgoingLight += rimColor * rim * rimStrength;
        #include <opaque_fragment>`
      );
  };
  // share compiled programs between toon materials with the same rim strength
  m.customProgramCacheKey = () => 'toon-rim-' + rim;
  return m;
}

/** Swap every mesh material under `root` for a toon equivalent (keeps color, map, vertex colors, emissive). */
export function toonify(root, opts = {}) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const out = mats.map((m) => {
      if (m.isMeshToonMaterial || m.userData.keep) return m;
      const key = m.uuid + (opts.rim ?? '');
      if (!cache.has(key)) {
        cache.set(key, toon({
          color: m.color ? m.color.clone() : 0xffffff,
          map: m.map || null,
          vertexColors: m.vertexColors,
          emissive: m.emissive ? m.emissive.clone() : 0x000000,
          emissiveIntensity: m.emissiveIntensity ?? 1,
          emissiveMap: m.emissiveMap || null,
          transparent: m.transparent,
          opacity: m.opacity,
          side: m.side,
          rim: opts.rim ?? 0.25,
        }));
      }
      return cache.get(key);
    });
    o.material = Array.isArray(o.material) ? out : out[0];
  });
  return root;
}

/** Unlit glowing material for flames, bulbs, and neon: bloom picks these up. */
export function glowMat(color, intensity = 2.5) {
  intensity = Math.max(intensity, 2); // stay above the bloom threshold
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: false });
  m.userData.keep = true;
  return m;
}
