// Builds the space tiki bar out of primitives. Everything is low-poly and flat-shaded on
// purpose: it's cheap to render, needs no model files, and reads as "stylized", not "unfinished".
//
// Coordinates: y is up, the deck surface is y = 0, and the bar faces +z (toward the camera).
import * as THREE from 'three';
import * as T from './textures.js';

const TAU = Math.PI * 2;

// Deterministic pseudo-random so the asteroid and roof look the same on every visit.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, metalness: 0, ...opts });
}

function glowMat(color, intensity = 2) {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, toneMapped: false });
}

function mesh(geo, material, [x, y, z] = [0, 0, 0], parent) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  if (parent) parent.add(m);
  return m;
}

// Nudge every vertex by a hash of its position, so shared vertices move together
// and the surface stays closed.
function jitter(geo, amount, seed, { keepTop } = {}) {
  const rand = rng(seed);
  const table = new Map();
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    if (!table.has(key)) table.set(key, [rand() - 0.5, rand() - 0.5, rand() - 0.5].map((n) => n * amount));
    const [dx, dy, dz] = table.get(key);
    if (keepTop && v.y > keepTop) continue;
    pos.setXYZ(i, v.x + dx, v.y + dy, v.z + dz);
  }
  geo.computeVertexNormals();
  return geo;
}

const COLORS = {
  bamboo: 0xc8a25e,
  bambooDark: 0x8f6b33,
  thatch: 0xd9b46a,
  wood: 0x7a4b2a,
  woodDark: 0x4e2f1a,
  deck: 0x9a6a3e,
  rock: 0x4a4459,
  rockDark: 0x2e2a3a,
  flame: 0xffa13d,
  robot: 0xb9c3d6,
};

export function buildWorld({ posts, lab }) {
  const world = new THREE.Group();   // everything, including the sky
  const island = new THREE.Group();  // the floating bar; bobs gently
  world.add(island);
  const animated = [];               // (t, dt) => void
  const spots = {};                  // id -> { object, anchor, view }

  function spot(id, object, anchor, view) {
    object.traverse((o) => { o.userData.spot = id; });
    spots[id] = { object, anchor: new THREE.Vector3(...anchor), view };
  }

  /* ---------------- Sky ---------------- */
  const sky = new THREE.Group();
  world.add(sky);

  // Stars: a shell of points, slightly tinted.
  {
    const rand = rng(7);
    const n = window.innerWidth < 700 ? 1800 : 3500;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const tints = [[1, 1, 1], [0.8, 0.88, 1], [1, 0.9, 0.8], [0.9, 0.8, 1]];
    for (let i = 0; i < n; i++) {
      const u = rand() * 2 - 1, th = rand() * TAU, r = 260 + rand() * 200;
      const s = Math.sqrt(1 - u * u);
      pos.set([r * s * Math.cos(th), r * u, r * s * Math.sin(th)], i * 3);
      const [a, b, c] = tints[i % tints.length];
      const k = 0.5 + rand() * 0.5;
      col.set([a * k, b * k, c * k], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, toneMapped: false }));
    sky.add(stars);
    animated.push((t) => { stars.rotation.y = t * 0.004; });
  }

  // Nebula clouds: big additive sprites far away.
  [
    ['rgba(160,70,255,.55)', [-160, 60, -260], 260],
    ['rgba(40,200,220,.45)', [190, -40, -240], 230],
    ['rgba(255,80,160,.35)', [40, 120, -300], 220],
    ['rgba(80,110,255,.4)', [-60, -110, -220], 200],
  ].forEach(([c, p, s]) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow(c), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
    sp.position.set(...p);
    sp.scale.setScalar(s);
    sky.add(sp);
  });

  // Ringed gas giant.
  {
    const planet = new THREE.Group();
    planet.position.set(-150, 70, -300);
    const body = mesh(new THREE.SphereGeometry(26, 48, 32), new THREE.MeshStandardMaterial({ map: T.planetBands(), roughness: 1 }), [0, 0, 0], planet);
    body.rotation.z = 0.35;
    const ringGeo = new THREE.RingGeometry(34, 52, 96, 1);
    // map the stripe texture radially: u = distance from inner to outer edge
    const p = ringGeo.attributes.position, uv = ringGeo.attributes.uv, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); uv.setXY(i, (v.length() - 34) / 18, 0.5); }
    const ring = mesh(ringGeo, new THREE.MeshBasicMaterial({ map: T.ringStripes(), side: THREE.DoubleSide, transparent: true, depthWrite: false }), [0, 0, 0], planet);
    ring.rotation.x = Math.PI / 2.3;
    ring.rotation.y = 0.35;
    sky.add(planet);
    animated.push((t) => { body.rotation.y = t * 0.02; });
  }

  // A small cratered moon off to the right.
  {
    const moon = mesh(jitter(new THREE.IcosahedronGeometry(6, 2), 0.8, 11), mat(0x9a96a8), [70, 42, -150], sky);
    animated.push((t) => { moon.rotation.y = t * 0.03; });
  }

  // Occasional shooting star.
  {
    const streak = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 0.25),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    );
    sky.add(streak);
    let next = 4, start = -1;
    const from = new THREE.Vector3(), dir = new THREE.Vector3();
    animated.push((t) => {
      if (start < 0 && t > next) {
        start = t;
        from.set(-120 + Math.random() * 240, 40 + Math.random() * 60, -160);
        dir.set(1, -0.35 - Math.random() * 0.3, 0).normalize();
        streak.rotation.z = Math.atan2(dir.y, dir.x);
      }
      if (start >= 0) {
        const k = (t - start) / 1.1;
        streak.position.copy(from).addScaledVector(dir, k * 160);
        streak.material.opacity = Math.sin(Math.min(k, 1) * Math.PI) * 0.9;
        if (k >= 1) { start = -1; next = t + 6 + Math.random() * 10; streak.material.opacity = 0; }
      }
    });
  }

  /* ---------------- The asteroid ---------------- */
  {
    const deck = mesh(new THREE.CylinderGeometry(5.6, 5.8, 0.35, 12), mat(COLORS.deck), [0, -0.175, 0], island);
    // plank lines
    for (let i = -5; i <= 5; i++) {
      const w = Math.sqrt(Math.max(0, 5.5 ** 2 - i * i)) * 2;
      mesh(new THREE.BoxGeometry(0.03, 0.01, w), mat(COLORS.woodDark), [i * 0.5, 0.005, 0], island);
    }
    deck.receiveShadow = true;
    const rock = mesh(jitter(new THREE.ConeGeometry(6.1, 6.5, 11, 4), 1.1, 3, { keepTop: 3.2 }), mat(COLORS.rock), [0, -3.6, 0], island);
    rock.rotation.x = Math.PI;
    mesh(jitter(new THREE.IcosahedronGeometry(1.4, 1), 0.5, 5), mat(COLORS.rockDark), [2.5, -3.2, 2.4], island);

    // Retro thrusters keeping the whole thing in orbit.
    [[-2.6, -1.9, 2.1], [2.8, -2.2, -1.2], [-1.2, -2.6, -2.9]].forEach(([x, y, z], i) => {
      const nozzle = mesh(new THREE.CylinderGeometry(0.35, 0.6, 0.8, 10), mat(0x6c7385, { metalness: 0.6, roughness: 0.4 }), [x, y, z], island);
      const flame = mesh(new THREE.ConeGeometry(0.45, 1.6, 10), glowMat(0x7fd8ff, 3), [x, y - 1.15, z], island);
      flame.rotation.x = Math.PI;
      animated.push((t) => { flame.scale.y = 0.85 + Math.sin(t * 18 + i * 2) * 0.12 + Math.random() * 0.08; });
      nozzle.castShadow = false;
    });

    // A few rocks orbiting the island.
    const orbiters = new THREE.Group();
    island.add(orbiters);
    const rand = rng(21);
    for (let i = 0; i < 7; i++) {
      const r = mesh(jitter(new THREE.IcosahedronGeometry(0.2 + rand() * 0.35, 0), 0.12, 30 + i), mat(COLORS.rock), [0, 0, 0], orbiters);
      const a = (i / 7) * TAU, d = 7.5 + rand() * 2.5;
      r.position.set(Math.cos(a) * d, -1.5 + rand() * 3, Math.sin(a) * d);
    }
    animated.push((t, dt) => {
      orbiters.rotation.y = t * 0.05;
      orbiters.children.forEach((r, i) => { r.rotation.x += dt * (0.3 + i * 0.05); r.rotation.y += dt * 0.2; });
    });
  }

  /* ---------------- The hut ---------------- */
  const bamboo = mat(COLORS.bamboo);
  const bambooDark = mat(COLORS.bambooDark);

  function bambooPole(x, z, h, r = 0.12) {
    const g = new THREE.Group();
    mesh(new THREE.CylinderGeometry(r, r * 1.1, h, 8), bamboo, [0, h / 2, 0], g);
    for (let y = 0.5; y < h; y += 0.75) mesh(new THREE.CylinderGeometry(r * 1.15, r * 1.15, 0.05, 8), bambooDark, [0, y, 0], g);
    g.position.set(x, 0, z);
    island.add(g);
    return g;
  }
  [[-3.1, 2.1], [3.1, 2.1], [-3.1, -1.9], [3.1, -1.9]].forEach(([x, z]) => bambooPole(x, z, 3.4));

  // Thatched roof: a jittered cone plus a fringe of hanging straw.
  {
    const roof = mesh(jitter(new THREE.ConeGeometry(4.9, 2.1, 12, 3), 0.25, 9), mat(COLORS.thatch), [0, 4.35, 0.1], island);
    roof.rotation.y = 0.13;
    const straw = mat(0xc49a4f);
    const rand = rng(13);
    for (let i = 0; i < 90; i++) {
      const a = (i / 90) * TAU;
      const len = 0.35 + rand() * 0.35;
      const s = mesh(new THREE.ConeGeometry(0.1, len, 4), straw, [Math.cos(a) * 4.75, 3.3 - len / 2 + 0.02, Math.sin(a) * 4.75 + 0.1], island);
      s.rotation.x = Math.PI;
    }
  }

  // String lights along the front of the roof.
  {
    const colors = [0xff4fa3, 0x3ff5e8, 0xffd36e, 0x8f7bff];
    const bulbs = [];
    for (let i = 0; i <= 14; i++) {
      const x = -3.1 + (i / 14) * 6.2;
      const sag = Math.sin((i / 14) * Math.PI) * 0.35;
      bulbs.push(mesh(new THREE.SphereGeometry(0.07, 8, 6), glowMat(colors[i % colors.length], 2.5), [x, 3.2 - sag, 2.35], island));
    }
    animated.push((t) => bulbs.forEach((b, i) => { b.material.emissiveIntensity = 1.6 + Math.sin(t * 2 + i) * 0.9; }));
  }

  // Neon sign on the roof.
  {
    // Mounted out in front of the roof slope on two bamboo struts.
    const signGroup = new THREE.Group();
    signGroup.position.set(0, 4.55, 3.05);
    signGroup.rotation.x = -0.3;
    island.add(signGroup);
    const sign = mesh(new THREE.PlaneGeometry(3.4, 1.06), new THREE.MeshBasicMaterial({ map: T.neonSign(), transparent: true, toneMapped: false }), [0, 0, 0.04], signGroup);
    mesh(new THREE.BoxGeometry(3.55, 1.15, 0.06), mat(0x1a1428), [0, 0, 0], signGroup);
    [-1.2, 1.2].forEach((x) => {
      const strut = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 6), bamboo, [x, -0.2, -0.55], signGroup);
      strut.rotation.x = 1.0;
    });
    const neonLight = new THREE.PointLight(0xff4fa3, 6, 7, 1.5);
    neonLight.position.set(0, 4.2, 3.8);
    island.add(neonLight);
    animated.push((t) => {
      // the occasional neon flicker
      const f = Math.sin(t * 0.7) > 0.985 ? 0.3 : 1;
      sign.material.opacity = f;
      neonLight.intensity = 6 * f;
    });
  }

  /* ---------------- The bar ---------------- */
  {
    const bar = new THREE.Group();
    bar.position.set(0, 0, 1.25);
    island.add(bar);
    mesh(new THREE.BoxGeometry(5, 1.1, 0.8), mat(COLORS.wood), [0, 0.55, 0], bar);
    for (let i = 0; i < 26; i++) {
      mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.08, 6), i % 2 ? bamboo : mat(0xb58f4f), [-2.4 + i * 0.192, 0.55, 0.42], bar);
    }
    mesh(new THREE.BoxGeometry(5.4, 0.12, 1.15), mat(COLORS.woodDark, { roughness: 0.5 }), [0, 1.16, 0.05], bar);
  }

  // Back shelf with bottles: the top shelf is the reading list.
  {
    const shelf = new THREE.Group();
    shelf.position.set(0, 0, -1.55);
    island.add(shelf);
    mesh(new THREE.BoxGeometry(4.8, 2.6, 0.12), mat(COLORS.woodDark), [0, 1.35, -0.25], shelf);
    const rand = rng(17);
    const bottleColors = [0x2f9e6e, 0x9b3d2e, 0xd9a441, 0x4e7fd1, 0x8a4fbf, 0xe0e0d0, 0x3a2b1f, 0x55c2c2];
    const profile = (h, r) => [
      [0, 0], [r, 0], [r, h * 0.62], [r * 0.45, h * 0.78], [r * 0.3, h * 0.82], [r * 0.3, h], [0, h],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    for (const y of [1.25, 2.05]) {
      mesh(new THREE.BoxGeometry(4.6, 0.08, 0.5), mat(COLORS.wood), [0, y, 0], shelf);
      for (let x = -2.05; x <= 2.05; x += 0.3 + rand() * 0.12) {
        const h = 0.45 + rand() * 0.3, r = 0.08 + rand() * 0.05;
        const c = bottleColors[Math.floor(rand() * bottleColors.length)];
        mesh(new THREE.LatheGeometry(profile(h, r), 10),
          new THREE.MeshStandardMaterial({ color: c, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85, emissive: c, emissiveIntensity: 0.25 }),
          [x, y + 0.04, (rand() - 0.5) * 0.15], shelf);
      }
    }
    // Soft light washing the bottles so they glow.
    const l = new THREE.PointLight(0x9ff0ff, 3, 4, 2);
    l.position.set(0, 2.4, 0.6);
    shelf.add(l);
    spot('shelf', shelf, [-0.6, 2.7, -1.55], { pos: [-2.4, 2.5, 3.4], target: [-0.9, 1.8, -1.6] });
  }

  // Robot bartender (the AI) in a pineapple shirt.
  {
    const robot = new THREE.Group();
    robot.position.set(1.35, 0, -0.25);
    island.add(robot);
    const metal = mat(COLORS.robot, { metalness: 0.7, roughness: 0.3, flatShading: false });
    const body = mesh(new THREE.CapsuleGeometry(0.42, 0.55, 8, 16), new THREE.MeshStandardMaterial({ map: T.pineappleShirt(), roughness: 0.9 }), [0, 1.55, 0], robot);
    // hover disc + glow instead of legs
    mesh(new THREE.CylinderGeometry(0.3, 0.2, 0.18, 16), metal, [0, 0.92, 0], robot);
    const hoverGlow = mesh(new THREE.CylinderGeometry(0.18, 0.02, 0.5, 12), glowMat(0x3ff5e8, 2), [0, 0.6, 0], robot);
    hoverGlow.material.transparent = true;
    hoverGlow.material.opacity = 0.8;

    const head = new THREE.Group();
    head.position.set(0, 2.35, 0);
    robot.add(head);
    mesh(new THREE.SphereGeometry(0.34, 24, 16), metal, [0, 0, 0], head);
    const visor = mesh(new THREE.BoxGeometry(0.5, 0.16, 0.2), mat(0x10131c, { roughness: 0.2 }), [0, 0.02, 0.24], head);
    const eyes = [-0.1, 0.1].map((x) => mesh(new THREE.SphereGeometry(0.045, 12, 8), glowMat(0x3ff5e8, 4), [x, 0.03, 0.34], head));
    mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.3, 6), metal, [0, 0.45, 0], head);
    const antenna = mesh(new THREE.SphereGeometry(0.05, 10, 8), glowMat(0xff4f6a, 3), [0, 0.62, 0], head);

    // Arms: left rests on the bar, right shakes a cocktail.
    const arm = (x) => {
      const a = new THREE.Group();
      a.position.set(x, 1.85, 0);
      robot.add(a);
      mesh(new THREE.SphereGeometry(0.1, 12, 8), metal, [0, 0, 0], a);
      mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 8), metal, [0, -0.3, 0], a);
      return a;
    };
    const left = arm(-0.5);
    left.rotation.set(-0.9, 0, 0.35);
    const right = arm(0.5);
    right.rotation.set(-1.2, 0, -0.2);
    const shaker = mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.32, 12), mat(0xd9dde6, { metalness: 0.9, roughness: 0.2, flatShading: false }), [0, -0.66, 0], right);
    shaker.rotation.x = 1.2;

    animated.push((t) => {
      robot.position.y = Math.sin(t * 1.6) * 0.05;
      head.rotation.y = Math.sin(t * 0.5) * 0.35;
      head.rotation.z = Math.sin(t * 0.8) * 0.05;
      antenna.material.emissiveIntensity = (t % 2) < 0.15 ? 0.3 : 3;
      const blink = (t % 4.3) < 0.12 ? 0.1 : 1;
      eyes.forEach((e) => { e.scale.y = blink; });
      // shake for ~1.5s every 7s
      const shaking = (t % 7) < 1.5;
      right.rotation.x = -1.2 + (shaking ? Math.sin(t * 28) * 0.35 : 0);
      hoverGlow.scale.y = 0.8 + Math.sin(t * 20) * 0.1;
    });
    spot('about', robot, [1.35, 3.1, -0.25], { pos: [3.0, 2.6, 5.2], target: [1.2, 1.8, -0.2] });
  }

  // Tiki mugs on the bar: the lab.
  {
    const mugs = new THREE.Group();
    mugs.position.set(-0.55, 1.22, 1.35);
    island.add(mugs);
    const colors = ['#2fa39a', '#d9722e', '#8a5a3c', '#c9463d'];
    const n = Math.max(3, Math.min(4, lab.length));
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group();
      g.position.set(i * 0.42 - 0.63, 0, (i % 2) * 0.12);
      g.rotation.y = -0.25 + i * 0.15;
      mugs.add(g);
      const face = new THREE.MeshStandardMaterial({ map: T.tikiFace(colors[i % 4]), roughness: 0.6 });
      mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.42, 14), face, [0, 0.21, 0], g);
      // straw + umbrella
      const straw = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6), mat(0xff4fa3), [0.05, 0.5, 0], g);
      straw.rotation.z = -0.25;
      if (i % 2 === 0) {
        const umb = mesh(new THREE.ConeGeometry(0.16, 0.08, 8), mat(['#ffd36e', '#3ff5e8'][i / 2 % 2], { side: THREE.DoubleSide }), [0.12, 0.72, 0], g);
        umb.rotation.z = -0.4;
      }
    }
    spot('lab', mugs, [-0.55, 2.0, 1.35], { pos: [-0.9, 2.3, 4.1], target: [-0.5, 1.35, 1.3] });
  }

  // Tip jar: contact.
  {
    const jar = new THREE.Group();
    jar.position.set(-2.1, 1.22, 1.3);
    island.add(jar);
    mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.45, 16, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.35, roughness: 0.05, side: THREE.DoubleSide }), [0, 0.225, 0], jar);
    const gold = mat(0xf2c14e, { metalness: 0.9, roughness: 0.3 });
    const rand = rng(41);
    for (let i = 0; i < 9; i++) {
      const c = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.015, 10), gold, [(rand() - 0.5) * 0.2, 0.02 + i * 0.02, (rand() - 0.5) * 0.2], jar);
      c.rotation.set(rand(), 0, rand());
    }
    const tag = mesh(new THREE.PlaneGeometry(0.34, 0.13), new THREE.MeshStandardMaterial({ map: T.label('TIPS') }), [0, 0.25, 0.205], jar);
    tag.rotation.x = -0.05;
    spot('contact', jar, [-2.1, 1.95, 1.3], { pos: [-2.6, 2.1, 3.6], target: [-2.0, 1.4, 1.3] });
  }

  // Your tab: the résumé on a receipt spike.
  {
    const tab = new THREE.Group();
    tab.position.set(1.7, 1.22, 1.45);
    island.add(tab);
    mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.04, 12), mat(0x333842, { metalness: 0.6 }), [0, 0.02, 0], tab);
    mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 6), mat(0xcfd4de, { metalness: 0.9 }), [0, 0.2, 0], tab);
    const paper = mat(0xf7f3e8);
    for (let i = 0; i < 3; i++) {
      const p = mesh(new THREE.BoxGeometry(0.22, 0.004, 0.32), paper, [0, 0.06 + i * 0.05, 0], tab);
      p.rotation.set(0.15 * (i - 1), i * 0.6, 0.1);
    }
    spot('resume', tab, [1.7, 1.85, 1.45], { pos: [2.3, 2.1, 3.7], target: [1.7, 1.35, 1.45] });
  }

  // Chalkboard menu: writing.
  {
    const board = new THREE.Group();
    board.position.set(-4.0, 0, 2.9);
    board.rotation.y = 0.45;
    island.add(board);
    const legMat = mat(COLORS.wood);
    [[-0.55, 0.12], [0.55, 0.12], [0, -0.5]].forEach(([x, z]) => {
      const leg = mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.3, 6), legMat, [x, 1.1, z * 0.6], board);
      leg.rotation.x = z * 0.25;
    });
    const face = mesh(new THREE.PlaneGeometry(1.3, 1.62), new THREE.MeshStandardMaterial({ map: T.chalkboard(posts), roughness: 0.95 }), [0, 1.45, 0.17], board);
    face.rotation.x = -0.12;
    spot('writing', board, [-4.0, 2.55, 2.9], { pos: [-2.4, 1.9, 5.8], target: [-4.0, 1.45, 2.9] });
  }

  // Telescope on the deck: next launch.
  {
    const scope = new THREE.Group();
    scope.position.set(4.1, 0, 2.6);
    island.add(scope);
    const brass = mat(0xc9a14a, { metalness: 0.85, roughness: 0.3, flatShading: false });
    const dark = mat(0x2a2d36, { metalness: 0.5 });
    [0, 1, 2].forEach((i) => {
      const a = (i / 3) * TAU;
      const leg = mesh(new THREE.CylinderGeometry(0.035, 0.04, 1.5, 6), dark, [Math.cos(a) * 0.3, 0.7, Math.sin(a) * 0.3], scope);
      leg.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3);
    });
    const tube = new THREE.Group();
    tube.position.set(0, 1.5, 0);
    tube.rotation.set(0, 0.9, 0.75);
    scope.add(tube);
    mesh(new THREE.CylinderGeometry(0.13, 0.18, 1.4, 16), brass, [0, 0.2, 0], tube);
    mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 16), dark, [0, 0.9, 0], tube);
    mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8), dark, [0, -0.6, 0], tube);
    animated.push((t) => { tube.rotation.y = 0.9 + Math.sin(t * 0.2) * 0.15; });
    spot('launch', scope, [4.1, 2.5, 2.6], { pos: [7.2, 3.4, 7.6], target: [3.4, 1.7, 1.6] });
  }

  /* ---------------- Decor ---------------- */
  // Bar stools.
  [-1.6, -0.2, 1.2].forEach((x) => {
    const s = new THREE.Group();
    s.position.set(x, 0, 2.55);
    island.add(s);
    mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.8, 8), mat(0x2a2d36, { metalness: 0.6 }), [0, 0.4, 0], s);
    mesh(new THREE.CylinderGeometry(0.3, 0.28, 0.1, 16), mat(0xc9463d), [0, 0.83, 0], s);
    mesh(new THREE.TorusGeometry(0.2, 0.02, 6, 16), mat(0x2a2d36, { metalness: 0.6 }), [0, 0.3, 0], s).rotation.x = Math.PI / 2;
  });

  // Tiki torches with flickering light.
  [[-4.6, 0.4], [4.8, -0.6], [-2.4, -3.9]].forEach(([x, z], i) => {
    const torch = new THREE.Group();
    torch.position.set(x, 0, z);
    island.add(torch);
    mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.4, 6), bamboo, [0, 1.2, 0], torch);
    mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.3, 8), bambooDark, [0, 2.45, 0], torch);
    const flame = mesh(new THREE.ConeGeometry(0.13, 0.45, 8), glowMat(COLORS.flame, 3), [0, 2.8, 0], torch);
    const light = new THREE.PointLight(0xff8a2a, 4, 6, 1.6);
    light.position.set(0, 2.9, 0);
    torch.add(light);
    animated.push((t) => {
      const f = 0.85 + Math.sin(t * 13 + i) * 0.08 + Math.sin(t * 7.3 + i * 3) * 0.07;
      flame.scale.set(1, f, 1);
      light.intensity = 4 * f;
    });
  });

  // Moai-style tiki statue.
  {
    const stone = mat(0x6f6a7d);
    const tiki = new THREE.Group();
    tiki.position.set(-4.3, 0, -1.9);
    tiki.rotation.y = 0.5;
    island.add(tiki);
    mesh(new THREE.BoxGeometry(0.9, 2.4, 0.8), stone, [0, 1.2, 0], tiki);
    mesh(new THREE.BoxGeometry(1.0, 0.18, 0.9), stone, [0, 1.95, 0.05], tiki);      // brow
    mesh(new THREE.BoxGeometry(0.22, 0.6, 0.25), stone, [0, 1.55, 0.45], tiki);      // nose
    mesh(new THREE.BoxGeometry(0.6, 0.1, 0.1), mat(0x3e3a48), [0, 1.05, 0.41], tiki); // mouth
    [-0.22, 0.22].forEach((x) => mesh(new THREE.BoxGeometry(0.22, 0.12, 0.05), glowMat(0xffa13d, 1.2), [x, 1.78, 0.41], tiki)); // glowing eyes
    mesh(new THREE.BoxGeometry(0.95, 0.12, 0.85), stone, [0, 2.46, 0], tiki);
  }

  // Palm tree.
  {
    const palm = new THREE.Group();
    palm.position.set(3.9, 0, -2.8);
    island.add(palm);
    let p = new THREE.Vector3(0, 0, 0);
    const trunk = mat(0x8a6a44);
    for (let i = 0; i < 9; i++) {
      const seg = mesh(new THREE.CylinderGeometry(0.16 - i * 0.008, 0.19 - i * 0.008, 0.62, 7), trunk, [p.x, p.y + 0.3, p.z], palm);
      seg.rotation.z = -0.06 * i;
      p = new THREE.Vector3(p.x + Math.sin(0.06 * i) * 0.6, p.y + 0.58, p.z);
    }
    const leaf = mat(0x3fa45a, { side: THREE.DoubleSide });
    const crown = new THREE.Group();
    crown.position.copy(p).add(new THREE.Vector3(0, 0.3, 0));
    palm.add(crown);
    for (let i = 0; i < 8; i++) {
      const l = new THREE.Mesh(new THREE.ConeGeometry(0.28, 2.2, 4, 1), leaf);
      l.scale.z = 0.25;
      l.geometry.translate(0, 1.1, 0);
      l.rotation.set(1.1 + (i % 2) * 0.25, (i / 8) * TAU, 0, 'YXZ');
      crown.add(l);
    }
    animated.push((t) => { crown.rotation.z = Math.sin(t * 0.9) * 0.05; crown.rotation.x = Math.cos(t * 0.7) * 0.04; });
  }

  /* ---------------- Light ---------------- */
  world.add(new THREE.HemisphereLight(0x8fa8ff, 0x2a1830, 1.1));
  const sun = new THREE.DirectionalLight(0xffe2b8, 1.6);
  sun.position.set(12, 14, 8);
  world.add(sun);
  const rim = new THREE.DirectionalLight(0x7f6bff, 1.2);
  rim.position.set(-10, 4, -12);
  world.add(rim);

  // The island floats: slow bob and sway.
  animated.push((t) => {
    island.position.y = Math.sin(t * 0.6) * 0.12;
    island.rotation.y = Math.sin(t * 0.15) * 0.06;
    island.rotation.z = Math.sin(t * 0.4) * 0.012;
  });

  return {
    world,
    island,
    spots,
    update(t, dt) { for (const f of animated) f(t, dt); },
  };
}
