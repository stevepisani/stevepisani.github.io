// Deep space around the asteroid: a procedural nebula dome, twinkling stars,
// Earth, a moon, the sun, and the odd shooting star.
import * as THREE from 'three';
import * as T from './textures.js';
import { PALETTE } from './materials.js';

const RAD = Math.PI / 180;
let turned = 0;

/** Where the sun is overhead on Earth at `date`: { lat, lon } in degrees (good to a fraction of a degree). */
export function subsolar(date = new Date()) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0), n = (date.getTime() - start) / 864e5;
  const g = 2 * Math.PI / 365 * (n - 1);
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const eot = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g)); // minutes
  const utc = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  let lon = -15 * (utc - 12 + eot / 60);
  lon = ((lon + 540) % 360) - 180;
  return { lat: decl / RAD, lon };
}

/** A place on Earth, as a direction in Earth's own frame (its globe's texture: lon 0 at the middle). */
export function earthPoint(lat, lon, target = new THREE.Vector3()) {
  const la = lat * RAD, lo = lon * RAD;
  return target.set(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo));
}

/**
 * Turn Earth so the point under the sun is the real subsolar point. That fixes the angle between
 * its axis and the sun (90° less the sun's declination) and leaves one turn free. With the sun
 * above it in the sky, north can't point up; take the turn that tips north toward you, a little
 * above, like a globe on a desk: the northern hemisphere (Philadelphia, most of the places Steve
 * saves) faces you at every hour, half in day, half in night.
 */
function turnEarth(earth, sunDir, at) {
  const s = subsolar();
  const sl = earthPoint(s.lat, s.lon), nl = new THREE.Vector3(0, 1, 0);
  const view = at.clone().normalize();
  const up = new THREE.Vector3(0, 1, 0).addScaledVector(view, -view.y).normalize(); // up on the sky, there
  const toward = view.clone().negate().multiplyScalar(0.8).addScaledVector(up, 0.6);   // at you, tipped up
  const side = toward.addScaledVector(sunDir, -toward.dot(sunDir)).normalize();       // the nearest to it square to the sun
  const nw = sunDir.clone().multiplyScalar(Math.sin(s.lat * RAD)).addScaledVector(side, Math.cos(s.lat * RAD)).normalize();
  const frame = (a, b) => { const c = b.clone().addScaledVector(a, -b.dot(a)).normalize(); return new THREE.Matrix4().makeBasis(a, c, a.clone().cross(c)); };
  const m = frame(sunDir, nw).multiply(frame(sl, nl).transpose());
  earth.quaternion.setFromRotationMatrix(m);
  turned = Date.now();
}

export function buildSky({ quality }) {
  const group = new THREE.Group();
  // what the telescope can be pointed at: where each is, and how wide it looks (radians across)
  const bodies = {};
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

  // One sun lights everything: the asteroid (main.js's key light), Earth and the moon.
  // It's far away next to all three, so its light comes from the same direction for each, and
  // what you see of each body's lit side follows from where it is in the sky against the sun.
  // Earth and the moon go round in (nearly) one plane through the sun, like real
  // planets and moons: across the sky they lie along one line, the ecliptic.
  const sunDir = new THREE.Vector3(0.55, 0.62, 0.56).normalize();
  const GIANT_DIR = new THREE.Vector3(-0.422, 0.674, -0.607).normalize(); // where Earth is
  const ecliptic = sunDir.clone().cross(GIANT_DIR).normalize(); // the orbital plane's normal
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
    bodies.sun = { dir: sunDir.clone(), across: 2 * Math.atan(5 / 500), dist: 500 };
  }

  // Earth, low on your left as you land (about 11° up), on the ecliptic, about 99° round the sky
  // from the sun. The real one: NASA's Blue Marble by day and Black Marble's city lights by night
  // (assets/images/earth/, public domain), clouds drifting over it, a thin blue atmosphere. It's
  // lit by this planet's sun like everything else, and turned so the point under that sun is the
  // real subsolar point now: day where it's day, the cities lit where it's night (Philadelphia
  // goes dark when it really does). `earthPoint(lat, lon)` gives a place on it, for the places to
  // come (docs/roadmap.md).
  const earth = new THREE.Group();
  {
    const R = 34;
    earth.userData.radius = R;
    earth.position.copy(GIANT_DIR).multiplyScalar(360);
    const url = (document.querySelector('script[data-earth]') || { dataset: {} }).dataset.earth || '/assets/images/earth/';
    const loader = new THREE.TextureLoader();
    const ready = { value: 0 };
    const tex = (f) => loader.load(url + f, () => { ready.value += 0.5; }, undefined, () => {});
    const day = tex('earth-day.webp'), night = tex('earth-night.webp');
    day.colorSpace = THREE.SRGBColorSpace;
    for (const t of [day, night]) { t.anisotropy = 4; t.wrapS = THREE.RepeatWrapping; }
    const mat = new THREE.ShaderMaterial({
      uniforms: { day: { value: day }, night: { value: night }, ready, sun: { value: sunDir }, time: uniforms.time },
      fog: false,
      vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vL;
        void main(){ vUv = uv; vL = position; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.);
          vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform sampler2D day; uniform sampler2D night; uniform float ready; uniform vec3 sun; uniform float time;
        varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vL;
        float h3(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.-2.*f);
          return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x), mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
                     mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x), mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y), f.z); }
        float fbm(vec3 p){ float v = 0., a = .5; for (int i = 0; i < 5; i++){ v += a*n3(p); p *= 2.07; a *= .5; } return v; }
        void main(){
          vec3 n = normalize(vN), v = normalize(vV);
          float ndl = dot(n, sun);
          // the ground: the Blue Marble once it's in, a plain ocean blue until then
          vec3 ground = mix(vec3(.02, .07, .16), texture2D(day, vUv).rgb, ready);
          float ocean = smoothstep(.02, .1, ground.b - max(ground.r, ground.g)) * ready;
          // clouds, drifting slowly east, thicker toward the storm belts
          vec3 p = normalize(vL);
          vec3 q = p * vec3(4.5, 9., 4.5) + vec3(time * .003, 0., time * .002); // streaked along the latitudes
          q += (vec3(fbm(q * .7), fbm(q * .7 + 3.1), fbm(q * .7 + 7.7)) - .5) * 1.6; // swirled, not blobs
          float c = fbm(q * 1.9);
          c = smoothstep(.55, .78, c + .06 * (1. - abs(p.y))) * .72;
          // day: soft terminator (it has an atmosphere), a glint of sun off the sea
          float lit = smoothstep(-.08, .3, ndl);
          vec3 h = normalize(sun + v);
          float glint = pow(max(dot(n, h), 0.), 60.) * ocean * (1. - c) * 1.6;
          vec3 col = mix(ground, vec3(.92, .94, .97), c) * lit * 1.15 + vec3(1., .95, .85) * glint * lit;
          // night: the cities, warm, where it's dark (and under no cloud)
          float lights = smoothstep(.16, .75, texture2D(night, vUv).r) * ready * (1. - smoothstep(-.18, .06, ndl)) * (1. - c * .8); // the cities, not the moonlit land under them
          col += vec3(1., .72, .38) * lights * 2.2;
          // a thin blue atmosphere at the edge, on the lit side
          float mu = max(dot(n, v), 0.);
          col += vec3(.25, .5, 1.) * pow(1. - mu, 3.) * smoothstep(-.25, .4, ndl) * .9;
          gl_FragColor = vec4(col, 1.);
        }`,
    });
    earth.add(new THREE.Mesh(new THREE.SphereGeometry(R, 128, 64), mat));
    // the atmosphere's glow just past the edge
    const halo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.035, 96, 48), new THREE.ShaderMaterial({
      uniforms: { sun: { value: sunDir } },
      fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
      vertexShader: `varying vec3 vN; varying vec3 vV;
        void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.);
          vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform vec3 sun; varying vec3 vN; varying vec3 vV;
        void main(){ float mu = abs(dot(normalize(vN), normalize(vV)));
          float rim = pow(1. - mu, 2.) * smoothstep(.45, .0, mu);
          gl_FragColor = vec4(vec3(.3, .55, 1.) * rim * smoothstep(-.3, .5, dot(normalize(vN), sun)) * 1.2, 1.); }`,
    }));
    earth.add(halo);
    group.add(earth);
    bodies.earth = { dir: GIANT_DIR.clone(), across: 2 * Math.atan(R / 360), dist: 360 };
  }
  turnEarth(earth, sunDir, GIANT_DIR);

  // The moon, in tonight's real phase: a phase is only where the moon is against the sun (new
  // beside it, full opposite it), so it's placed that far round the ecliptic from the sun,
  // tonight.phase of a turn, and lit by the same sun as everything else. Its orbit is tilted 5°
  // from the ecliptic, like ours, so a new moon passes beside the sun rather than over it. It
  // moves night to night: up ahead as you land for part of the month, over the far side of the
  // planet (where the campfire is) for the rest. Craters and dark seas, lit with a moon's flat,
  // bright-to-the-edge look (Lommel-Seeliger), and Earth's shine faintly lighting its dark side.
  {
    const { map, height } = T.moonMaps();
    const tonight = window.moonTonight ? window.moonTonight() : { phase: 0.18 };
    const orbit = ecliptic.clone().applyAxisAngle(GIANT_DIR, THREE.MathUtils.degToRad(5));
    const MOON_DIR = sunDir.clone().projectOnPlane(orbit).normalize().applyAxisAngle(orbit, -tonight.phase * Math.PI * 2);
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
    moon.position.copy(MOON_DIR).multiplyScalar(300);
    bodies.moon = { dir: MOON_DIR.clone(), across: 2 * Math.atan(14 / 300), dist: 300 };
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
    bodies,
    earth,
    update(t, camera) {
      uniforms.time.value = t;
      if (Date.now() - turned > 60000) turnEarth(earth, sunDir, GIANT_DIR);
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
