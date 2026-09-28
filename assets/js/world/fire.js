// Shader fire: two crossed quads with scrolling fbm noise shaped into a flame, plus
// a flickering point light. Used for tiki torches, the campfire, and the volcano bowl.
import * as THREE from 'three';

const shared = { time: { value: 0 } };

const fireMaterial = new THREE.ShaderMaterial({
  uniforms: { time: shared.time },
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
  toneMapped: false,
  vertexShader: `varying vec2 vUv; varying float vSeed;
    void main(){
      vUv = uv;
      vSeed = fract(sin(dot(modelMatrix[3].xyz, vec3(12.9898,78.233,37.719))) * 43758.5453);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `uniform float time; varying vec2 vUv; varying float vSeed;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
    float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
      return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
    float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 4; i++){ v += a*noise(p); p *= 2.1; a *= .5; } return v; }
    void main(){
      vec2 uv = vUv;
      float t = time * 1.6 + vSeed * 10.;
      // teardrop: wide at the bottom, pinched at the top, wobbling sideways
      float x = (uv.x - .5) * 2.;
      x += (fbm(vec2(uv.y * 3. - t, vSeed * 7.)) - .5) * .6 * uv.y;
      float width = mix(.95, .08, pow(uv.y, .7));
      float body = smoothstep(width, width * .35, abs(x));
      float n = fbm(vec2(uv.x * 4., uv.y * 3. - t * 1.4));
      float flame = body * smoothstep(1., .25, uv.y + n * .45) * smoothstep(0., .08, uv.y);
      // white-yellow core → orange → red edges, in HDR so bloom catches it
      vec3 col = mix(vec3(.9, .18, .03), vec3(1.0, .48, .08), smoothstep(.05, .45, flame));
      col = mix(col, vec3(1.0, .78, .38), smoothstep(.7, 1.0, flame));
      gl_FragColor = vec4(col * (0.9 + flame * 1.25), flame * .9);
    }`,
});

/**
 * A flame of the given size with a flickering light.
 * Returns { group, update(t) }. Put update() in the frame loop (or call Fire.tick).
 */
export function createFire({ width = 0.35, height = 0.8, light = 2.5, distance = 6, color = 0xff8a2a, shadow = false } = {}) {
  const group = new THREE.Group();
  const quad = new THREE.PlaneGeometry(width, height);
  quad.translate(0, height / 2, 0);
  for (const r of [0, Math.PI / 2]) {
    const m = new THREE.Mesh(quad, fireMaterial);
    m.rotation.y = r;
    m.renderOrder = 3;
    group.add(m);
  }
  // light <= 0: flame only (used to save lights on phones)
  const pl = light > 0 ? new THREE.PointLight(color, light, distance, 1.6) : null;
  if (pl) {
    pl.position.y = height * 0.45;
    pl.castShadow = shadow;
    if (shadow) { pl.shadow.mapSize.set(256, 256); pl.shadow.bias = -0.002; pl.shadow.radius = 4; }
    group.add(pl);
  }
  const seed = Math.random() * 100;
  return {
    group,
    light: pl,
    update(t) {
      const f = 0.82 + Math.sin(t * 13 + seed) * 0.07 + Math.sin(t * 7.3 + seed * 2) * 0.06 + Math.sin(t * 23 + seed * 3) * 0.05;
      if (pl) pl.intensity = light * f;
    },
  };
}

export const Fire = { tick(t) { shared.time.value = t; } };
