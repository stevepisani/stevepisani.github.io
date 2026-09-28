// Deep space around the asteroid: a procedural nebula dome, twinkling stars,
// a ringed gas giant, a moon, the sun, and the odd shooting star.
import * as THREE from 'three';
import * as T from './textures.js';
import { toon } from './stylize.js';

export function buildSky({ quality }) {
  const group = new THREE.Group();
  const uniforms = { time: { value: 0 } };

  // Nebula dome: fbm noise in three hues over near-black. Rendered first, never writes depth.
  const nebula = new THREE.Mesh(
    new THREE.SphereGeometry(800, 48, 24),
    new THREE.ShaderMaterial({
      uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
      fragmentShader: `varying vec3 vDir; uniform float time;
        float hash(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        float noise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.-2.*f);
          return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x), mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                     mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x), mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y), f.z); }
        float fbm(vec3 p){ float v = 0.; float a = .5; for(int i=0;i<5;i++){ v += a*noise(p); p *= 2.02; a *= .5; } return v; }
        void main(){
          vec3 d = normalize(vDir);
          float n1 = fbm(d*2.2 + vec3(0., 0., time*0.004));
          float n2 = fbm(d*3.7 + 5.0);
          float band = smoothstep(0.55, 0.0, abs(d.y*0.8 + d.x*0.35 - 0.1));   // a milky-way-ish band
          vec3 col = vec3(0.012, 0.014, 0.04);
          col += vec3(0.35, 0.12, 0.55) * pow(n1, 3.0) * 1.4 * (0.4 + band);
          col += vec3(0.05, 0.35, 0.45) * pow(n2, 4.0) * 1.6 * band;
          col += vec3(0.6, 0.25, 0.35) * pow(n1*n2, 3.0) * 1.2;
          gl_FragColor = vec4(col, 1.0);
        }`,
    })
  );
  nebula.renderOrder = -2;
  group.add(nebula);

  // Stars: points on a big shell, twinkling in the vertex shader.
  {
    const n = quality.high ? 4500 : 2200;
    const pos = new Float32Array(n * 3), seed = new Float32Array(n), size = new Float32Array(n);
    let s = 3;
    const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < n; i++) {
      const u = rand() * 2 - 1, th = rand() * Math.PI * 2, r = 600;
      const k = Math.sqrt(1 - u * u);
      pos.set([r * k * Math.cos(th), r * u, r * k * Math.sin(th)], i * 3);
      seed[i] = rand() * 100;
      size[i] = rand() < 0.04 ? 3.5 : 1 + rand() * 1.4;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    g.setAttribute('size', new THREE.BufferAttribute(size, 1));
    const stars = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: { ...uniforms, dpr: { value: Math.min(devicePixelRatio, 2) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `attribute float seed; attribute float size; uniform float time; uniform float dpr; varying float vA; varying float vS;
        void main(){ vA = 0.55 + 0.45 * sin(time * (0.6 + fract(seed) * 2.0) + seed); vS = seed;
          gl_PointSize = size * dpr * (0.8 + 0.4 * vA); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
      fragmentShader: `varying float vA; varying float vS;
        void main(){ vec2 c = gl_PointCoord - .5; float d = length(c); if (d > .5) discard;
          vec3 tint = mix(vec3(1.0,0.9,0.8), vec3(0.75,0.85,1.0), fract(vS*7.3));
          gl_FragColor = vec4(tint * 1.6, vA * smoothstep(.5, .0, d)); }`,
    }));
    stars.renderOrder = -1;
    group.add(stars);
  }

  // Ringed gas giant, hanging low over the bar's horizon.
  {
    const planet = new THREE.Group();
    planet.position.set(-190, 110, -260);
    const body = new THREE.Mesh(new THREE.SphereGeometry(55, 48, 32), toon({ map: T.planetBands(), rim: 0.6 }));
    body.rotation.z = 0.4;
    planet.add(body);
    const rg = new THREE.RingGeometry(72, 112, 128, 1);
    const p = rg.attributes.position, uv = rg.attributes.uv, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); uv.setXY(i, (v.length() - 72) / 40, 0.5); }
    const ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ map: T.ringStripes(), side: THREE.DoubleSide, transparent: true, depthWrite: false }));
    ring.rotation.set(Math.PI / 2.25, 0.3, 0);
    planet.add(ring);
    group.add(planet);
  }

  // A small moon.
  {
    const moon = new THREE.Mesh(new THREE.IcosahedronGeometry(16, 3), toon({ color: 0xc9c2e0, rim: 0.5 }));
    moon.position.set(240, 150, 140);
    group.add(moon);
  }

  // The sun: a glowing disc plus the key light that goes with it.
  const sunDir = new THREE.Vector3(0.55, 0.62, 0.56).normalize();
  {
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow('rgba(255,220,170,1)'), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    sun.position.copy(sunDir).multiplyScalar(500);
    sun.scale.setScalar(140);
    group.add(sun);
    const core = new THREE.Mesh(new THREE.CircleGeometry(12, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff2d8).multiplyScalar(3), toneMapped: false }));
    core.position.copy(sun.position);
    core.lookAt(0, 0, 0);
    group.add(core);
  }

  // Shooting stars: a two-point line, bright head fading to a clear tail.
  const streakGeo = new THREE.BufferGeometry();
  streakGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  streakGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array([2, 2, 2, 0, 0, 0]), 3));
  const streak = new THREE.Line(streakGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  streak.frustumCulled = false;
  group.add(streak);
  const shoot = { next: 5, start: -1, from: new THREE.Vector3(), dir: new THREE.Vector3() };
  const head = new THREE.Vector3(), tail = new THREE.Vector3();

  return {
    group,
    sunDir,
    update(t, camera) {
      uniforms.time.value = t;
      group.position.copy(camera.position); // the sky is infinitely far away
      if (shoot.start < 0 && t > shoot.next) {
        shoot.start = t;
        shoot.from.set(Math.random() - 0.5, 0.2 + Math.random() * 0.6, Math.random() - 0.5).normalize().multiplyScalar(450);
        shoot.dir.set(Math.random() - 0.5, -0.5, Math.random() - 0.5).normalize();
      }
      if (shoot.start >= 0) {
        const k = (t - shoot.start) / 1.2;
        head.copy(shoot.from).addScaledVector(shoot.dir, k * 260);
        tail.copy(head).addScaledVector(shoot.dir, -60);
        streakGeo.attributes.position.array.set([head.x, head.y, head.z, tail.x, tail.y, tail.z]);
        streakGeo.attributes.position.needsUpdate = true;
        streak.material.opacity = Math.sin(Math.min(k, 1) * Math.PI);
        if (k >= 1) { shoot.start = -1; shoot.next = t + 7 + Math.random() * 12; streak.material.opacity = 0; }
      }
    },
  };
}
