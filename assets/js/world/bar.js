// Steve's: a classic A-frame tiki bar on a lava-rock plinth, at the north pole.
// Local frame: the deck top is y = DECK, the counter faces +z (where customers sit).
//
// Tiki signals, strongest first (see the research brief in CLAUDE.md): carved tiki posts,
// a steep thatched A-frame with an upswept ridge beam, glass floats in nets, pufferfish
// lamps, a bamboo bar front, tiki mugs, tapa cloth, a volcano bowl, torches, neon script.
import * as THREE from 'three';
import * as T from './textures.js';
import { PALETTE, pbr, surface, woodSet, bambooSet, thatchSet, lavaSet, rattanSet, tapaTexture, glow } from './materials.js';
import { carvedTiki, glassFloat, pufferLamp, tikiMug, volcanoBowl, tikiTorch, palm, lavaRock } from './props.js';
import { place, BAR_DIR, surfaceRadius } from './planet.js';
import { heroOr } from './hero.js';
import { createFire } from './fire.js';
import { tinRobot } from './robot.js';

const TAU = Math.PI * 2;

// The bar sits at the pole with no rotation, so its local axes are world axes. Off the deck
// the planet curves away: this is the local y of the real ground at (x, z).
const R0 = surfaceRadius(BAR_DIR);
function groundY(x, z) {
  const rg = surfaceRadius(new THREE.Vector3(x, R0, z).normalize());
  return Math.sqrt(Math.max(0, rg * rg - x * x - z * z)) - R0;
}
const DECK = 0.25;      // deck surface height above the ground
const BAR_TOP = DECK + 0.95;

function mesh(geo, material, [x, y, z] = [0, 0, 0], parent, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = receive;
  parent && parent.add(m);
  return m;
}

export function buildBar({ prop, quality, favorites = [], heroes, menuItems = [], reducedMotion = false }) {
  const bar = new THREE.Group();
  bar.name = 'bar';
  const animated = [];
  const M = {
    deck: surface(woodSet(0x5a3a24), { repeat: [3, 3], roughness: 0.8 }),
    beam: surface(woodSet(PALETTE.stain), { roughness: 0.75 }),
    top: surface(woodSet(0x3a2214), { roughness: 0.42, bumpScale: 0.15 }), // lacquered bar top
    bamboo: surface(bambooSet(), { roughness: 0.6 }),
    thatch: surface(thatchSet(), { roughness: 1, bumpScale: 3, side: THREE.DoubleSide }),
    lava: surface(lavaSet(), { bumpScale: 3, roughness: 0.95 }),
    rattan: surface(rattanSet(), { roughness: 0.7 }),
  };

  // Generated hero props don't come with lights or fire; add them.
  // A hanging lamp: the model, a cord up to the beam `hang` metres above, a light inside.
  const litHero = (slot, intensity, hang) => {
    const g = new THREE.Group();
    const h = heroOr(heroes, slot);
    g.add(h);
    const top = new THREE.Box3().setFromObject(h).max.y;
    h.position.y -= top / 2; // centred on the group, like the procedural lamp
    mesh(new THREE.CylinderGeometry(0.006, 0.006, hang, 5), pbr({ color: PALETTE.lava, roughness: 0.9 }), [0, top * 0.45 + hang / 2, 0], g, { cast: false });
    g.add(new THREE.PointLight(PALETTE.amber, intensity, 5.5, 1.6));
    return g;
  };
  const firedHero = (slot) => {
    const g = new THREE.Group();
    const h = heroOr(heroes, slot);
    g.add(h);
    const top = new THREE.Box3().setFromObject(h).max.y;
    const fire = createFire({ width: 0.09, height: 0.16, light: 1.2, distance: 3 });
    fire.group.position.y = top * 0.9;
    g.add(fire.group);
    g.userData.update = fire.update;
    return g;
  };

  // The mug set: the teal tiki mug, a parrot mug and a pineapple mug (generated hero models),
  // each falling back to the procedural mug. Drinks, the shelf and the counter all draw on it.
  const MUGS = ['tiki-mug', 'parrot-mug', 'pineapple-mug'];
  const mugFallback = [PALETTE.teal, PALETTE.coral, PALETTE.amber];
  const anyMug = (i, { garnish = true } = {}) => {
    const slot = MUGS[i % MUGS.length];
    return heroOr(heroes, slot, () => tikiMug({ glaze: mugFallback[i % MUGS.length], shape: i % 2 ? 'moai' : 'tall', garnish }));
  };

  /* ---------- A big carved tiki guards the entrance ---------- */
  {
    const statue = heroOr(heroes, 'tiki-statue', () => carvedTiki({ height: 2.7, radius: 0.36, style: 'marquesan' }));
    statue.position.set(-1.55, groundY(-1.55, 4.35) - 0.05, 4.35);
    statue.rotation.y = 0.35;
    bar.add(statue);
  }

  /* ---------- Plinth and deck ---------- */
  // deep enough that its edge sinks into the ground where the planet curves away
  mesh(new THREE.CylinderGeometry(3.7, 3.9, DECK + 0.7, 40), M.deck, [0, (DECK - 0.7) / 2, 0.2], bar);
  // lava-rock rim
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * TAU;
    if (Math.abs(a - Math.PI / 2) < 0.42) continue; // leave the entrance open where the path arrives
    const rock = lavaRock({ size: 0.24 + (i % 3) * 0.05, seed: i + 3 });
    const rx = Math.cos(a) * 3.85, rz = Math.sin(a) * 3.85 + 0.2;
    rock.position.set(rx, groundY(rx, rz) + 0.05, rz);
    rock.rotation.y = a * 3;
    bar.add(rock);
  }

  /* ---------- Carved tiki posts hold up the roof ---------- */
  const POSTS = [[-2.45, 1.55, 'marquesan'], [2.45, 1.55, 'marquesan'], [-2.45, -1.6, 'ku'], [2.45, -1.6, 'ku']];
  const EAVE = DECK + 2.7;
  POSTS.forEach(([x, z, style]) => {
    const post = heroOr(heroes, 'tiki-post', () => carvedTiki({ height: EAVE - DECK, radius: 0.24, style }));
    post.position.set(x, DECK, z);
    post.rotation.y = z > 0 ? 0 : Math.PI; // faces point outward, front and back
    bar.add(post);
  });
  // eave beams along both sides, tie beams front and back
  for (const x of [-2.45, 2.45]) mesh(new THREE.BoxGeometry(0.22, 0.22, 4.4), M.beam, [x, EAVE + 0.05, -0.02], bar);
  for (const z of [1.55, -1.6]) mesh(new THREE.BoxGeometry(5.2, 0.18, 0.18), M.beam, [0, EAVE, z], bar);

  /* ---------- Steep A-frame thatched roof, gable facing the customer ---------- */
  const RIDGE = EAVE + 3.1, HALF = 3.05, Z0 = -2.5, Z1 = 2.6;
  {
    const slope = Math.hypot(HALF, RIDGE - EAVE);
    const ang = Math.atan2(RIDGE - EAVE, HALF);
    for (const s of [-1, 1]) {
      const plane = mesh(new THREE.BoxGeometry(slope + 0.4, 0.28, Z1 - Z0), M.thatch, [s * HALF / 2, (EAVE + RIDGE) / 2 - 0.05, (Z0 + Z1) / 2], bar);
      plane.rotation.z = -s * ang;
    }
    // ridge beam, sticking out past the gable and sweeping up at the front
    mesh(new THREE.BoxGeometry(0.26, 0.26, Z1 - Z0 + 0.6), M.beam, [0, RIDGE + 0.05, (Z0 + Z1) / 2 - 0.1], bar);
    const sweep = mesh(new THREE.BoxGeometry(0.24, 0.24, 1.5), M.beam, [0, RIDGE + 0.35, Z1 + 0.85], bar);
    sweep.rotation.x = -0.45;
    // Googie starburst on the tip: the space-age half of Polynesian Pop
    const star = new THREE.Group();
    star.position.set(0, RIDGE + 0.72, Z1 + 1.55);
    bar.add(star);
    const rayMat = glow(PALETTE.aqua, 3.2);
    for (let i = 0; i < 8; i++) {
      const ray = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, i % 2 ? 0.38 : 0.62, 4), rayMat);
      ray.rotation.z = (i / 8) * Math.PI;
      star.add(ray);
    }
    star.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), glow(0xffffff, 4)));
    animated.push((t) => { star.rotation.z = t * 0.25; });
    // frayed thatch fringe hanging off both eaves
    const strands = new THREE.InstancedMesh(new THREE.ConeGeometry(0.05, 0.55, 3).translate(0, -0.27, 0), pbr({ color: PALETTE.thatch, roughness: 1 }), 120);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (let i = 0; i < 120; i++) {
      const s = i < 60 ? -1 : 1, k = (i % 60) / 59;
      const len = 0.8 + Math.sin(i * 7.1) * 0.3;
      q.setFromEuler(new THREE.Euler(0, 0, s * 0.35 + Math.sin(i * 3.3) * 0.1));
      strands.setMatrixAt(i, m.compose(new THREE.Vector3(s * (HALF + 0.12), EAVE - 0.05, Z0 + k * (Z1 - Z0)), q, new THREE.Vector3(1, len, 1)));
    }
    strands.castShadow = true;
    bar.add(strands);
  }

  /* ---------- Neon script sign in the gable ---------- */
  {
    const sign = new THREE.Group();
    sign.position.set(0, EAVE + 1.25, Z1 - 0.05);
    bar.add(sign);
    // dark plank backing cut to the gable's triangle
    const tri = new THREE.Shape();
    tri.moveTo(-2.6, -1.05); tri.lineTo(2.6, -1.05); tri.lineTo(0, 1.75); tri.closePath();
    mesh(new THREE.ShapeGeometry(tri), surface(woodSet(0x2a180e), { roughness: 0.9, side: THREE.DoubleSide }), [0, 0, -0.02], sign);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 1.03), new THREE.MeshBasicMaterial({ map: T.neonSign(), transparent: true, toneMapped: false, depthWrite: false }));
    face.material.userData.keep = true;
    face.material.color.setScalar(1.35); // just into HDR: the bright tube cores bloom, the letters stay crisp
    face.position.set(0, -0.15, 0.03);
    sign.add(face);
    const neonLight = new THREE.PointLight(PALETTE.hibiscus, 3, 7, 1.6);
    neonLight.position.set(0, EAVE + 0.9, Z1 + 1.3);
    bar.add(neonLight);
    animated.push((t) => {
      const on = Math.sin(t * 0.7) > 0.985 ? 0.2 : 1;
      face.material.opacity = on;
      neonLight.intensity = 3 * on;
    });
  }

  /* ---------- Warm spill out of the front, so the bar glows from down the path ---------- */
  {
    const spill = new THREE.PointLight(PALETTE.amber, 4.5, 9, 1.4);
    spill.position.set(0, DECK + 2.2, 1.9);
    bar.add(spill);
  }

  /* ---------- Counter ---------- */
  {
    const counter = new THREE.Group();
    counter.position.set(0, DECK, 0.55);
    bar.add(counter);
    mesh(new THREE.BoxGeometry(3.8, 0.85, 0.62), M.beam, [0, 0.425, 0], counter);
    const n = 30;
    const slats = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.063, 0.063, 0.86, 10), M.bamboo, n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) slats.setMatrixAt(i, m.makeTranslation(-1.85 + i * (3.7 / (n - 1)), 0.43, 0.33));
    slats.castShadow = slats.receiveShadow = true;
    counter.add(slats);
    mesh(new THREE.BoxGeometry(4.15, 0.09, 0.92), M.top, [0, 0.9, 0.08], counter);
    // a warm strip of light under the bar-top lip
    mesh(new THREE.BoxGeometry(3.9, 0.02, 0.02), glow(PALETTE.amber, 2.2), [0, 0.84, 0.52], counter, { cast: false });
  }

  const boardGroup = new THREE.Group(); // the favorite-drinks chalkboard, hung on the back bar below

  /* ---------- Back bar: tapa-cloth wall, lit shelves of bottles and mugs ---------- */
  {
    const back = new THREE.Group();
    back.position.set(0, DECK, -1.45);
    bar.add(back);
    // bamboo wall with a tapa panel
    const wall = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 8), M.bamboo, 34);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 34; i++) wall.setMatrixAt(i, m.makeTranslation(-2.3 + i * 0.14, 1.3, -0.32));
    wall.receiveShadow = true;
    back.add(wall);
    mesh(new THREE.PlaneGeometry(3.6, 0.9), pbr({ map: tapaTexture(), roughness: 0.95 }), [0, 2.1, -0.24], back);
    for (const y of [0.95, 1.5]) {
      mesh(new THREE.BoxGeometry(3.6, 0.06, 0.34), M.beam, [0, y, 0], back);
      mesh(new THREE.BoxGeometry(3.5, 0.015, 0.015), glow(PALETTE.amber, 2.4), [0, y - 0.04, 0.16], back, { cast: false });
    }
    // bottles: dark glass catching the amber light
    const glassColors = [0x5a2a10, 0x1f3a24, 0x3a1a0a, 0x6a4a18, 0x20304a];
    for (let i = 0; i < 11; i++) {
      const b = prop(i % 3 ? 'pirate-kit_bottle' : 'pirate-kit_bottle-large', 0.3 + (i % 2) * 0.04);
      b.traverse((o) => { if (o.isMesh) { o.material = pbr({ color: glassColors[i % 5], roughness: 0.12, metalness: 0.1, emissive: PALETTE.amber, emissiveIntensity: 0.08 }); o.castShadow = true; } });
      b.position.set(-1.6 + i * 0.32, 0.98, (i % 2) * 0.06);
      b.rotation.y = i;
      back.add(b);
    }
    for (let i = 0; i < 9; i++) {
      const mug = anyMug(i, { garnish: false });
      mug.position.set(-1.55 + i * 0.39, 1.53, 0.02);
      mug.scale.setScalar(1.4);
      back.add(mug);
    }
    // Favorite drinks, chalked on a board hung on the back wall where you see it from your
    // stool, to the robot's left. Faintly self-lit, so the chalk reads in the dim bar.
    {
      const map = T.chalkboard(favorites);
      boardGroup.position.set(-0.95, 2.19, -0.2); // above the mugs on the top shelf
      boardGroup.rotation.x = 0.06; // hangs a touch forward
      back.add(boardGroup);
      mesh(new THREE.BoxGeometry(1.04, 0.8, 0.04), M.beam, [0, 0, -0.015], boardGroup);
      const face = mesh(new THREE.PlaneGeometry(0.96, 0.72), pbr({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.95 }), [0, 0, 0.007], boardGroup);
      face.castShadow = false;
    }
    const shelfLight = new THREE.PointLight(PALETTE.amber, 1.4, 3.5, 2);
    shelfLight.position.set(0, 1.9, 0.6);
    back.add(shelfLight);
  }

  /* ---------- Hanging: glass floats in nets and pufferfish lamps ---------- */
  {
    const floats = [[-1.6, 1.0, 0.6, PALETTE.aqua], [-0.7, 0.2, 1.1, 0x4fa36a], [0.9, -0.4, 0.8, PALETTE.amber], [1.7, 0.9, 0.5, PALETTE.aqua], [0.1, 1.3, 1.4, 0x3f7fd0]];
    floats.forEach(([x, z, hang, c], i) => {
      const f = glassFloat({ radius: 0.14 + (i % 2) * 0.04, color: c, hang, lit: 2.6 });
      f.position.set(x, EAVE + 0.9 - hang, z);
      bar.add(f);
      animated.push((t) => { f.rotation.z = Math.sin(t * 0.6 + i) * 0.04; });
    });
    const heroPuffer = heroes && heroes.has('puffer-lamp');
    for (const x of [-0.95, 0.95]) {
      const p = heroPuffer ? litHero('puffer-lamp', quality.high ? 2.6 : 1.8, 0.9) : pufferLamp({ radius: 0.2, hang: 0.9, light: quality.high ? 2.6 : 1.8 });
      p.position.set(x, EAVE + 0.4 - 0.9, 0.7);
      // the procedural fish faces +x; generated ones face +z, so turn them in toward the seat
      p.rotation.y = heroPuffer ? (x > 0 ? -0.45 : 0.45) : (x > 0 ? Math.PI : 0);
      bar.add(p);
    }
  }

  /* ---------- On the bar ---------- */
  {
    const bowl = heroes && heroes.has('volcano-bowl') ? firedHero('volcano-bowl') : volcanoBowl();
    bowl.position.set(0.85, BAR_TOP, 0.7);
    bowl.scale.setScalar(1.3);
    bar.add(bowl);
    animated.push((t) => bowl.userData.update(t));
    [[-1.35, 0.72, 1], [-1.05, 0.58, 2]].forEach(([x, z, i]) => { // a parrot and a pineapple
      const mug = anyMug(i);
      mug.position.set(x, BAR_TOP, z);
      mug.scale.setScalar(1.3);
      bar.add(mug);
    });
    const coconut = prop('food-kit_coconut-half', 0.55);
    coconut.position.set(-1.7, BAR_TOP, 0.62);
    bar.add(coconut);
  }

  /* ---------- The menu, propped up in front of your stool: click it to pick it up ---------- */
  // The whole card (with its bamboo frame) flies up to you; nothing of it stays on the bar.
  const MENU_W = 0.16, MENU_H = 0.24, MENU_LEAN = 1.1; // leans well back, so it never blocks the robot
  const menuCard = new THREE.Group();
  const menuStand = new THREE.Group();
  {
    menuStand.position.set(0.05, BAR_TOP, 1.0);
    menuStand.rotation.y = -0.08; // turned a touch toward the middle stool
    bar.add(menuStand);
    menuCard.rotation.x = -MENU_LEAN;
    menuStand.add(menuCard);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(MENU_W, MENU_H), pbr({ map: T.menuCard(menuItems), roughness: 0.8 }));
    face.position.set(0, MENU_H / 2, 0.004);
    face.castShadow = face.receiveShadow = true;
    menuCard.add(face);
    mesh(new THREE.BoxGeometry(MENU_W, MENU_H, 0.006), M.beam, [0, MENU_H / 2, 0], menuCard);
    const rod = new THREE.CylinderGeometry(0.006, 0.006, 1, 8);
    for (const [x, y, len, rz] of [[0, 0, MENU_W + 0.02, Math.PI / 2], [0, MENU_H, MENU_W + 0.02, Math.PI / 2], [-MENU_W / 2, MENU_H / 2, MENU_H + 0.02, 0], [MENU_W / 2, MENU_H / 2, MENU_H + 0.02, 0]]) {
      const r = mesh(rod, M.bamboo, [x, y, 0.006], menuCard);
      r.scale.y = len;
      r.rotation.z = rz;
    }
  }

  /* ---------- Rattan stools; the middle one is yours ---------- */
  const stools = [-1.15, 0, 1.15].map((x) => {
    const s = new THREE.Group();
    s.position.set(x, DECK, 1.42);
    bar.add(s);
    mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.12, 20), M.rattan, [0, 0.74, 0], s);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.4;
      const leg = mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.72, 6), M.bamboo, [Math.cos(a) * 0.14, 0.36, Math.sin(a) * 0.14], s);
      leg.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12);
    }
    mesh(new THREE.TorusGeometry(0.15, 0.015, 6, 20), M.bamboo, [0, 0.28, 0], s).rotation.x = Math.PI / 2;
    return s;
  });

  /* ---------- Your stool sits in a pool of light, so the bar needs no label ---------- */
  {
    const lamp = new THREE.Group();
    lamp.position.set(stools[1].position.x, EAVE - 0.55, 1.5);
    bar.add(lamp);
    mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.55, 5), pbr({ color: PALETTE.lava }), [0, 0.3, 0], lamp, { cast: false });
    mesh(new THREE.ConeGeometry(0.16, 0.16, 16, 1, true), surface(bambooSet(), { roughness: 0.6, side: THREE.DoubleSide }), [0, 0, 0], lamp);
    mesh(new THREE.SphereGeometry(0.045, 12, 8), glow(PALETTE.amber, 4), [0, -0.05, 0], lamp, { cast: false });
    const pool = new THREE.SpotLight(PALETTE.amber, quality.high ? 9 : 6, 4.5, 0.62, 0.7, 1.4);
    pool.position.set(0, -0.06, 0);
    lamp.add(pool);
    pool.target.position.set(stools[1].position.x, DECK, 1.45);
    bar.add(pool.target);
  }

  /* ---------- Torches flanking the entrance and the back ---------- */
  const TORCHES = [[-3.25, 2.75], [3.25, 2.75], [-3.3, -1.9], [3.3, -1.9]];
  TORCHES.forEach(([x, z], i) => {
    const torch = tikiTorch({ height: 2.1, light: i < 2 ? 2.6 : (quality.high ? 1.8 : 0) });
    torch.position.set(x, DECK, z);
    bar.add(torch);
    animated.push((t) => torch.userData.update(t));
  });

  /* ---------- The robot bartender: a 1950s tin toy on one wheel ---------- */
  const ROBOT_HOME = new THREE.Vector3(0.75, DECK, -0.75); // waiting by the back bar
  const ROBOT_SERVE = new THREE.Vector3(0.05, DECK, -0.55); // across the counter from your stool
  const robot = tinRobot({ hero: heroes && heroes.has('robot') ? heroOr(heroes, 'robot') : null, reducedMotion });
  robot.setHome(ROBOT_HOME, -0.55); // three-quarters on, so you see its face from the path
  bar.add(robot.group);

  /* ---------- Palms around the plinth ---------- */
  const PALMS = [[-4.7, -2.6, 0.5, 6.2], [4.8, -1.8, 2.8, 5.4], [-5.2, 1.9, 4.0, 4.8], [4.4, 3.6, 1.2, 4.2]];
  PALMS.forEach(([x, z, ry, h], i) => {
    const p = palm({ height: h, lean: 0.3 + (i % 2) * 0.15, seed: i + 5 });
    p.position.set(x, groundY(x, z) - 0.1, z);
    p.rotation.y = ry;
    bar.add(p);
    const crown = p.userData.crown;
    animated.push((t) => { crown.rotation.z = Math.sin(t * 0.8 + i) * 0.035; crown.rotation.x = Math.cos(t * 0.6 + i) * 0.03; });
  });

  place(bar, BAR_DIR);
  bar.updateMatrixWorld(true);

  /* ---------- World-space helpers for the player ---------- */
  const toWorld = (x, y, z) => bar.localToWorld(new THREE.Vector3(x, y, z));
  // Your body at the middle stool: where your eyes are (and look) as you step up, sit and get up.
  const sx = stools[1].position.x;
  const seat = {
    eye: toWorld(sx, DECK + 1.25, 1.55),
    look: toWorld(0.05, DECK + 1.25, -0.55), // the robot, across the counter
    stand: toWorld(sx, DECK + 1.6, 1.9),      // standing just behind the stool
    dip: toWorld(sx, DECK + 1.16, 1.5),       // lowest point while sitting down, leaning in
    lean: toWorld(sx, DECK + 1.3, 1.42),      // leaning forward to push up off the stool
    barTop: toWorld(0.05, DECK + 0.9, 0.4),   // where your eyes go while you sit or stand
    served: new THREE.Vector3(0, BAR_TOP, 0.82),
  };

  const colliders = [
    { center: toWorld(-1.3, 0, 0.5), radius: 0.85 }, { center: toWorld(0, 0, 0.5), radius: 0.85 }, { center: toWorld(1.3, 0, 0.5), radius: 0.85 },
    ...stools.map((st) => ({ center: toWorld(st.position.x, 0, st.position.z), radius: 0.28 })),
    ...POSTS.map(([x, z]) => ({ center: toWorld(x, 0, z), radius: 0.3 })),
    ...PALMS.map(([x, z]) => ({ center: toWorld(x, 0, z), radius: 0.3 })),
    ...TORCHES.map(([x, z]) => ({ center: toWorld(x, 0, z), radius: 0.15 })),
    { center: toWorld(-1.55, 0, 4.35), radius: 0.45 }, // entrance tiki
    { center: toWorld(-1.2, 0, -1.2), radius: 1.2 }, { center: toWorld(1.2, 0, -1.2), radius: 1.2 }, // staff only
  ];

  const interactables = [
    { id: 'seat', label: "Steve's", verb: 'Sit at the bar', object: bar, point: toWorld(0, 1, 1.8), approach: toWorld(0, 0, 2.35), radius: 2.6 },
    // listed after the bar, so clicking the card itself picks it up (and walks you over if need be)
    { id: 'menu', label: 'Menu', verb: 'Pick up the menu', object: menuCard, point: toWorld(0.05, BAR_TOP + 0.1, 0.95), approach: toWorld(0, 0, 2.35), radius: 2.6 },
    { id: 'drinks', label: 'Favorite drinks', verb: 'Read the recipes', object: boardGroup, point: toWorld(-0.95, DECK + 2.19, -1.65), approach: toWorld(0, 0, 2.35), radius: 2.6 },
  ];

  // Serving: the robot shakes, then slides a fresh tiki mug across the counter to your seat.
  // Timing: shake starts at once, the mug appears at 0.9s and has arrived by 1.3s, when
  // `onServed(mug)` is called. Each section's drink is its own colour.
  // Keeps the last few on the bar.
  const drinks = [];
  const sliding = [];
  const ORDER = ['about', 'writing', 'lab', 'shelf', 'contact', 'resume', 'launch', 'campfire'];
  const LIQUID = [PALETTE.amber, PALETTE.coral, PALETTE.aqua];
  const SLIDE = 0.4;
  function serve(id, onServed) {
    robot.shake(0.85);
    setTimeout(() => {
      const i = Math.max(0, ORDER.indexOf(id));
      // always the open-topped tiki mug, so you can look into it; the drink's colour changes
      const d = anyMug(0, { garnish: false });
      // The drink: a glossy surface just below the rim, so there's something to look into.
      // Fitted to the rim itself (the mug's highest vertices), not the bounding box, which
      // the handle pulls off-centre.
      d.updateMatrixWorld(true);
      const top = new THREE.Box3().setFromObject(d).max.y;
      const rim = new THREE.Box3(), v = new THREE.Vector3();
      d.traverse((m) => {
        if (!m.isMesh) return;
        const pos = m.geometry.attributes.position;
        for (let k = 0; k < pos.count; k++) { v.fromBufferAttribute(pos, k).applyMatrix4(m.matrixWorld); if (v.y > top * 0.94) rim.expandByPoint(v); }
      });
      const mouth = rim.getCenter(new THREE.Vector3()).setY(top);
      const radius = Math.min(rim.max.x - rim.min.x, rim.max.z - rim.min.z) * 0.5 * 0.8; // inside the rim's thickness
      const liquid = new THREE.Mesh(new THREE.CircleGeometry(radius, 28).rotateX(-Math.PI / 2),
        pbr({ color: LIQUID[i % LIQUID.length], emissive: LIQUID[i % LIQUID.length], emissiveIntensity: 0.12, roughness: 0.12 }));
      liquid.position.set(mouth.x, top * 0.88, mouth.z);
      d.add(liquid);
      d.userData.mouth = mouth; // top centre, in the mug's frame
      d.userData.height = top;
      // first one just left of the menu, where a phone's narrow portrait view still shows it
      const to = seat.served.clone().add(new THREE.Vector3([-0.2, 0.3, -0.46][drinks.length % 3], 0, (drinks.length % 2) * -0.08));
      d.scale.setScalar(1.3);
      d.rotation.y = 0.15; // mugs face +z: toward you
      bar.add(d);
      drinks.push(d);
      if (drinks.length > 5) bar.remove(drinks.shift());
      robot.pour(SLIDE + 0.25);
      if (reducedMotion) { d.position.copy(to); onServed && onServed(d); }
      else {
        // from the robot's side of the bar top, sliding to you
        const from = new THREE.Vector3(to.x * 0.4 + ROBOT_SERVE.x * 0.6, BAR_TOP, 0.3);
        d.position.copy(from);
        sliding.push({ d, from, to, k: 0, onServed });
      }
    }, 900);
  }

  return {
    group: bar,
    seat,
    colliders,
    interactables,
    serve,
    robot,
    /** The menu card on the bar (what gets picked up) and a point just above it for its label. */
    menu: { card: menuCard, label: toWorld(0.05, BAR_TOP + 0.12, 0.9), height: MENU_H },
    /** The guest sat down: the robot rolls over to face them. */
    greet() { robot.greet(ROBOT_SERVE, new THREE.Vector3(stools[1].position.x, DECK, stools[1].position.z)); },
    /** The guest left: back to its spot. */
    farewell() { robot.idle(); },
    /** Someone's walking up (a world point): turn to them and wave them over. */
    beckon(worldPoint) { robot.beckon(bar.worldToLocal(worldPoint.clone())); },
    // t: ambient time (frozen under ?test); dt: real frame time, for things people cause
    update(t, dt = 0) {
      for (const f of animated) f(t);
      robot.update(dt, t);
      for (let i = sliding.length - 1; i >= 0; i--) {
        const s = sliding[i];
        s.k = Math.min(1, s.k + dt / SLIDE);
        const e = 1 - Math.pow(1 - s.k, 3); // decelerates, like a glass sliding on lacquer
        s.d.position.lerpVectors(s.from, s.to, e);
        if (s.k === 1) { sliding.splice(i, 1); s.onServed && s.onServed(s.d); }
      }
    },
  };
}
