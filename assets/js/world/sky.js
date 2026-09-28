// Deep space around the asteroid: a procedural nebula dome, twinkling stars,
// a ringed gas giant, a moon, the sun, and the odd shooting star.
import * as THREE from 'three';
import * as T from './textures.js';
import { PALETTE } from './materials.js';

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
          vec3 col = vec3(0.006, 0.007, 0.02);
          col += vec3(0.28, 0.08, 0.42) * pow(n1, 3.2) * 0.9 * (0.3 + band);
          col += vec3(0.03, 0.22, 0.32) * pow(n2, 4.0) * 1.1 * band;
          col += vec3(0.5, 0.18, 0.26) * pow(n1*n2, 3.2) * 0.8;
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

  // The sun: a glowing disc plus the key light that goes with it. (First: the planet and moon
  // are lit by it.)
  const sunDir = new THREE.Vector3(0.55, 0.62, 0.56).normalize();
  {
    // a cool, distant blue-white star: the source of the moonlight
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow('rgba(170,195,255,0.9)'), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
    sun.position.copy(sunDir).multiplyScalar(500);
    sun.scale.setScalar(90);
    group.add(sun);
    const core = new THREE.Mesh(new THREE.CircleGeometry(5, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xe8eeff).multiplyScalar(4), toneMapped: false, fog: false }));
    core.position.copy(sun.position);
    core.lookAt(0, 0, 0);
    group.add(core);
  }

  // Ringed gas giant, low on your left as you land (about 13° up), half lit by the star.
  // Shaded by hand: warped, turbulent bands and a storm, a soft terminator (it has an
  // atmosphere), darkening toward the limb, the rings' shadow across the globe and the globe's
  // shadow across the rings.
  {
    const R = 34, R1 = 45, R2 = 74;
    const giant = new THREE.Group();
    giant.position.set(-0.422, 0.674, -0.607).normalize().multiplyScalar(360);
    giant.rotation.set(0.42, 0.5, 0.36);
    giant.updateMatrixWorld(true);
    const sunLocal = { value: sunDir.clone().applyQuaternion(giant.quaternion.clone().invert()) };
    const C = (k) => new THREE.Color(PALETTE[k]);
    const shared = { sunLocal, time: uniforms.time, cream: { value: C('giantCream') }, tan: { value: C('giantTan') }, rust: { value: C('giantRust') }, umber: { value: C('giantUmber') } };
    const noiseGLSL = `
      float h3(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.-2.*f);
        return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x), mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x), mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y), f.z); }
      float fbm3(vec3 p){ float v = 0., a = .5; for (int i = 0; i < 5; i++){ v += a*n3(p); p *= 2.03; a *= .5; } return v; }`;
    const body = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), new THREE.ShaderMaterial({
      uniforms: shared,
      fog: false,
      vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vV;
        void main(){ vP = position; vN = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 sunLocal; uniform float time; uniform vec3 cream, tan, rust, umber;
        varying vec3 vP; varying vec3 vN; varying vec3 vV;
        ${noiseGLSL}
        void main(){
          vec3 p = normalize(vP);
          // bands by latitude, warped by turbulence that shears along the bands
          float warp = fbm3(vec3(p.x * 3.0, p.y * 14.0, p.z * 3.0) + vec3(time * 0.004, 0., 0.)) - .5;
          float lat = p.y + warp * 0.07 + 0.02 * sin(atan(p.z, p.x) * 3.0 + p.y * 9.0);
          float b1 = .5 + .5 * sin(lat * 19.0), b2 = .5 + .5 * sin(lat * 43.0 + 1.3), b3 = .5 + .5 * sin(lat * 7.0 - .6);
          vec3 col = mix(cream, tan, b1);
          col = mix(col, rust, b2 * b3 * .75);
          col = mix(col, umber, smoothstep(.72, .98, abs(p.y)) * .8);          // darker poles
          col *= .9 + .2 * fbm3(p * 22.0);
          // a great storm in the southern belt
          vec2 st = vec2(atan(p.z, p.x) - 1.1, (p.y + .32) * 3.2);
          float storm = smoothstep(.16, .0, length(st * vec2(1.0, 1.6)));
          col = mix(col, rust * 1.15, storm * .8);
          // light: a soft terminator, darker at the limb, a faint night side
          float ndl = dot(p, normalize(sunLocal));
          float lit = smoothstep(-.12, .55, ndl);
          // the rings' shadow on the globe
          vec3 L = normalize(sunLocal);
          if (L.y * vP.y < 0.0) {
            float t = -vP.y / L.y; vec2 hit = (vP + L * t).xz; float r = length(hit);
            float d = smoothstep(${R1.toFixed(1)}, ${(R1 + 6).toFixed(1)}, r) * smoothstep(${R2.toFixed(1)}, ${(R2 - 8).toFixed(1)}, r);
            lit *= 1.0 - d * .65;
          }
          float mu = max(dot(normalize(vN), vV), 0.);
          col *= lit * (.5 + .5 * pow(mu, .45)) * 1.25 + .025;
          col += vec3(.25, .18, .12) * pow(1. - mu, 3.) * lit * .5;             // hazy lit rim
          gl_FragColor = vec4(col, 1.);
        }`,
    }));
    giant.add(body);
    const ringGeo = new THREE.RingGeometry(R1, R2, 256, 4).rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, new THREE.ShaderMaterial({
      uniforms: shared,
      fog: false,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
      fragmentShader: `uniform vec3 sunLocal; uniform vec3 cream, tan, umber; varying vec3 vP;
        float h1(float x){ return fract(sin(x * 127.1) * 43758.5453); }
        float n1(float x){ float i = floor(x), f = fract(x); return mix(h1(i), h1(i + 1.), f * f * (3. - 2. * f)); }
        void main(){
          float r = length(vP.xz), k = (r - ${R1.toFixed(1)}) / ${(R2 - R1).toFixed(1)};
          // ringlets of varying density, a clear gap (a Cassini division) and soft edges
          float dens = .35 + .45 * n1(k * 60.) + .2 * n1(k * 230.);
          dens *= smoothstep(.0, .06, k) * smoothstep(1., .9, k);
          dens *= 1. - smoothstep(.02, .0, abs(k - .62)) * .92;
          dens *= mix(.55, 1., smoothstep(.0, .35, k));                          // the faint inner ring
          vec3 col = mix(tan, cream, n1(k * 18.));
          // lit from either face (it's thin), and in the globe's shadow behind it
          vec3 L = normalize(sunLocal);
          float light = .35 + .65 * abs(L.y);
          float b = dot(vP, L), c = dot(vP, vP) - ${(R * R).toFixed(1)};
          if (b < 0. && b * b - c > 0.) light *= .12;
          gl_FragColor = vec4(col * light * 1.1, dens * .85);
        }`,
    }));
    giant.add(ring);
    group.add(giant);
  }

  // A small moon up on your right as you land (about 20° up). It's near the star in the sky, so
  // it's a crescent: craters and dark seas, lit with a moon's flat, bright-to-the-edge look
  // (Lommel-Seeliger), and the gas giant's shine faintly lighting its dark side.
  {
    const { map, height } = T.moonMaps();
    const moon = new THREE.Mesh(new THREE.SphereGeometry(14, 64, 48), new THREE.ShaderMaterial({
      uniforms: { map: { value: map }, height: { value: height }, sun: { value: sunDir } },
      fog: false,
      vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying vec3 vV;
        void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz;
          vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform sampler2D map; uniform sampler2D height; uniform vec3 sun; varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying vec3 vV;
        void main(){
          vec3 albedo = texture2D(map, vUv).rgb;
          // bump from the height map, in world space
          float h = texture2D(height, vUv).r;
          vec3 dpx = dFdx(vW), dpy = dFdy(vW);
          float dhx = dFdx(h), dhy = dFdy(h);
          vec3 n = normalize(vN);
          vec3 r1 = cross(dpy, n), r2 = cross(n, dpx);
          float det = dot(dpx, r1);
          n = normalize(abs(det) * n - sign(det) * (dhx * r1 + dhy * r2) * 1.4);
          float mu0 = max(dot(n, sun), 0.), mu = max(dot(normalize(vN), vV), .05);
          float ls = mu0 / (mu0 + mu) * 2.0;                                      // Lommel-Seeliger
          vec3 col = albedo * mix(mu0, ls, .7) * 1.4 + albedo * vec3(.075, .065, .06);
          gl_FragColor = vec4(col, 1.);
        }`,
    }));
    moon.position.set(0.47, 0.757, -0.459).normalize().multiplyScalar(300);
    moon.rotation.y = 2.2;
    group.add(moon);
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
