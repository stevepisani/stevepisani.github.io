// Steve's: the tiki bar on the north pole, plus the robot bartender.
// Local frame: deck at y = 0, the counter faces +z (where customers sit).
import * as THREE from 'three';
import * as T from './textures.js';
import { toon, glowMat } from './stylize.js';
import { place, BAR_DIR } from './planet.js';

const TAU = Math.PI * 2;

function mesh(geo, material, [x, y, z] = [0, 0, 0], parent) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  parent && parent.add(m);
  return m;
}

export function buildBar({ prop, quality, posts }) {
  const bar = new THREE.Group();
  bar.name = 'bar';
  const animated = [];
  const C = {
    bamboo: toon({ color: 0xd9b36a }),
    bambooDark: toon({ color: 0x9c7440 }),
    thatch: toon({ color: 0xdcb26a, rim: 0.1 }),
    straw: toon({ color: 0xcf9f55 }),
    wood: toon({ color: 0x8a5634 }),
    woodDark: toon({ color: 0x5a3521 }),
    deck: toon({ map: planks(), rim: 0.15 }),
    metal: toon({ color: 0x8f9bb3, rim: 0.3 }),
  };

  // Deck
  mesh(new THREE.CylinderGeometry(3.6, 3.75, 0.3, 24), C.deck, [0, 0.05, 0.3], bar);

  // Bamboo posts
  const post = (x, z, h = 2.8) => {
    const g = new THREE.Group();
    mesh(new THREE.CylinderGeometry(0.11, 0.13, h, 8), C.bamboo, [0, h / 2, 0], g);
    for (let y = 0.5; y < h; y += 0.7) mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.05, 8), C.bambooDark, [0, y, 0], g);
    g.position.set(x, 0.2, z);
    bar.add(g);
  };
  const POSTS = [[-2.3, 1.35], [2.3, 1.35], [-2.3, -1.5], [2.3, -1.5]];
  POSTS.forEach(([x, z]) => post(x, z));

  // Thatched roof with a straw fringe
  {
    const roofGeo = new THREE.ConeGeometry(3.55, 1.6, 10, 3);
    const p = roofGeo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + Math.sin(i * 12.9898) * 0.06);
    roofGeo.computeVertexNormals();
    const roof = mesh(roofGeo, C.thatch, [0, 3.75, 0], bar);
    roof.rotation.y = 0.15;
    const fringe = new THREE.InstancedMesh(new THREE.ConeGeometry(0.09, 0.5, 4), C.straw, 80);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, 0, 0));
    for (let i = 0; i < 80; i++) {
      const a = (i / 80) * TAU;
      const len = 0.8 + Math.sin(i * 3.7) * 0.25;
      fringe.setMatrixAt(i, m.compose(new THREE.Vector3(Math.cos(a) * 3.42, 2.82, Math.sin(a) * 3.42), q, new THREE.Vector3(1, len * 0.8, 1)));
    }
    bar.add(fringe);
  }

  // String lights along the front edge
  {
    const colors = [0xff4fa3, 0x3ff5e8, 0xffd36e, 0x9f8bff];
    const bulbs = new THREE.Group();
    for (let i = 0; i <= 16; i++) {
      const x = -2.3 + (i / 16) * 4.6;
      const sag = Math.sin((i / 16) * Math.PI) * 0.25;
      mesh(new THREE.SphereGeometry(0.06, 8, 6), glowMat(colors[i % 4], 2.2), [x, 2.85 - sag, 1.45], bulbs);
    }
    bar.add(bulbs);
    animated.push((t) => bulbs.children.forEach((b, i) => b.scale.setScalar(0.85 + Math.sin(t * 2 + i) * 0.2)));
  }

  // Neon sign mounted out front of the roof
  {
    // Upright on a bamboo frame above the roof, facing the path, so it reads over the horizon.
    const sign = new THREE.Group();
    sign.position.set(0, 5.35, 0.9);
    bar.add(sign);
    mesh(new THREE.BoxGeometry(4.3, 1.4, 0.1), toon({ color: 0x1c1530 }), [0, 0, 0], sign);
    [-1.9, 1.9].forEach((x) => mesh(new THREE.CylinderGeometry(0.07, 0.08, 2.3, 6), C.bamboo, [x, -1.15, -0.05], sign));
    const face = mesh(new THREE.PlaneGeometry(4.2, 1.31), new THREE.MeshBasicMaterial({ map: T.neonSign(), transparent: true, toneMapped: false }), [0, 0, 0.06], sign);
    face.material.userData.keep = true;
    const light = new THREE.PointLight(0xff4fa3, 3, 7, 1.6);
    light.position.set(0, 5.2, 2.2);
    bar.add(light);
    animated.push((t) => {
      const on = Math.sin(t * 0.7) > 0.985 ? 0.25 : 1;
      face.material.opacity = on;
      light.intensity = 3 * on;
    });
  }

  // Counter: bamboo front, dark wood top. The customer side is +z.
  {
    const counter = new THREE.Group();
    counter.position.set(0, 0.2, 0.55);
    bar.add(counter);
    mesh(new THREE.BoxGeometry(3.8, 0.85, 0.65), C.wood, [0, 0.425, 0], counter);
    const slats = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.08, 0.85, 6), C.bamboo, 22);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 22; i++) slats.setMatrixAt(i, m.makeTranslation(-1.82 + i * 0.173, 0.425, 0.34));
    counter.add(slats);
    mesh(new THREE.BoxGeometry(4.1, 0.1, 0.95), C.woodDark, [0, 0.9, 0.08], counter);
  }
  const BAR_TOP = 0.2 + 0.95; // y of the counter top

  // Back shelf with bottles (Kenney) and a crate
  {
    const shelf = new THREE.Group();
    shelf.position.set(0, 0.2, -1.35);
    bar.add(shelf);
    mesh(new THREE.BoxGeometry(4.2, 2.4, 0.1), C.woodDark, [0, 1.2, -0.2], shelf);
    for (const y of [1.1, 1.8]) {
      mesh(new THREE.BoxGeometry(4.0, 0.07, 0.4), C.wood, [0, y, 0], shelf);
      for (let i = 0; i < 9; i++) {
        const b = prop(i % 3 === 0 ? 'pirate-kit_bottle-large' : 'pirate-kit_bottle', 0.34 + (i % 2) * 0.05);
        b.position.set(-1.75 + i * 0.44, y + 0.035, 0);
        b.rotation.y = i * 1.3;
        shelf.add(b);
      }
    }
    const crate = prop('pirate-kit_crate-bottles', 0.6);
    crate.position.set(-1.6, 0.0, 0.05);
    shelf.add(crate);
    const light = new THREE.PointLight(0x9ff0ff, 1.2, 3, 2);
    light.position.set(0, 2.2, 0.2);
    shelf.add(light);
  }

  // Bar-top dressing
  {
    const add = (name, scale, x, z, ry = 0) => {
      const o = prop(name, scale);
      o.position.set(x, BAR_TOP, z);
      o.rotation.y = ry;
      bar.add(o);
    };
    add('food-kit_pineapple', 0.6, -1.7, 0.55);
    add('food-kit_coconut-half', 0.7, -1.3, 0.75, 0.6);
    add('food-kit_lemon-half', 0.6, 1.5, 0.7);
    add('furniture-kit_radio', 1.3, 1.8, 0.35, -0.4);
    add('food-kit_glass', 0.6, 1.05, 0.5);
  }

  // Stools. The middle one is "your" seat.
  const stools = [-1.2, 0, 1.2].map((x) => {
    const s = prop('furniture-kit_stoolbar', 1.75);
    s.position.set(x, 0.2, 1.4);
    bar.add(s);
    return s;
  });

  // Chalkboard easel by the entrance: the menu, which is also the writing list.
  const boardGroup = new THREE.Group();
  {
    const board = boardGroup;
    board.position.set(-2.9, 0.2, 2.3);
    board.rotation.y = 0.55;
    bar.add(board);
    [[-0.5, 0.1], [0.5, 0.1], [0, -0.45]].forEach(([x, z]) => {
      const leg = mesh(new THREE.CylinderGeometry(0.035, 0.045, 2.0, 6), C.wood, [x, 0.95, z * 0.6], board);
      leg.rotation.x = z * 0.25;
    });
    const face = mesh(new THREE.PlaneGeometry(1.15, 1.45), toon({ map: T.chalkboard(posts), rim: 0 }), [0, 1.25, 0.15], board);
    face.rotation.x = -0.12;
  }

  // Tiki torches
  const torchSpots = [[-3.0, -1.1], [3.0, -1.1], [3.0, 2.0]];
  torchSpots.forEach(([x, z], i) => {
    const torch = new THREE.Group();
    torch.position.set(x, 0.2, z);
    bar.add(torch);
    mesh(new THREE.CylinderGeometry(0.05, 0.07, 2.2, 6), C.bamboo, [0, 1.1, 0], torch);
    mesh(new THREE.CylinderGeometry(0.13, 0.09, 0.28, 8), C.bambooDark, [0, 2.25, 0], torch);
    const flame = mesh(new THREE.ConeGeometry(0.12, 0.42, 8), glowMat(0xff9a3d, 2.8), [0, 2.58, 0], torch);
    const light = new THREE.PointLight(0xff8a2a, 1.6, 5, 1.8);
    light.position.set(0, 2.7, 0);
    torch.add(light);
    animated.push((t) => {
      const f = 0.85 + Math.sin(t * 13 + i) * 0.08 + Math.sin(t * 7.3 + i * 3) * 0.07;
      flame.scale.set(1, f, 1);
      light.intensity = 1.6 * f;
    });
  });

  // The robot bartender (the AI), in a pineapple shirt.
  const robot = new THREE.Group();
  robot.position.set(0.1, 0.2, -0.7);
  robot.scale.setScalar(0.78);
  bar.add(robot);
  const head = new THREE.Group();
  let right;
  {
    mesh(new THREE.CapsuleGeometry(0.38, 0.5, 6, 14), toon({ map: T.pineappleShirt(), rim: 0.3 }), [0, 1.5, 0], robot);
    mesh(new THREE.CylinderGeometry(0.27, 0.18, 0.16, 16), C.metal, [0, 0.93, 0], robot);
    const hover = mesh(new THREE.ConeGeometry(0.16, 0.45, 12), glowMat(0x3ff5e8, 1.8), [0, 0.64, 0], robot);
    hover.rotation.x = Math.PI;
    head.position.set(0, 2.25, 0);
    robot.add(head);
    mesh(new THREE.SphereGeometry(0.31, 20, 14), C.metal, [0, 0, 0], head);
    mesh(new THREE.BoxGeometry(0.46, 0.15, 0.16), toon({ color: 0x10131c }), [0, 0.02, 0.23], head);
    const eyes = [-0.09, 0.09].map((x) => mesh(new THREE.SphereGeometry(0.042, 10, 8), glowMat(0x3ff5e8, 3), [x, 0.03, 0.31], head));
    mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.28, 6), C.metal, [0, 0.42, 0], head);
    const antenna = mesh(new THREE.SphereGeometry(0.05, 10, 8), glowMat(0xff4f6a, 3), [0, 0.58, 0], head);
    const arm = (x) => {
      const a = new THREE.Group();
      a.position.set(x, 1.78, 0);
      robot.add(a);
      mesh(new THREE.SphereGeometry(0.09, 10, 8), C.metal, [0, 0, 0], a);
      mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.55, 8), C.metal, [0, -0.28, 0], a);
      return a;
    };
    const left = arm(-0.46);
    left.rotation.set(-0.8, 0, 0.3);
    right = arm(0.46);
    right.rotation.set(-1.2, 0, -0.2);
    const shaker = mesh(new THREE.CylinderGeometry(0.075, 0.095, 0.3, 12), C.metal, [0, -0.62, 0], right);
    shaker.rotation.x = 1.2;
    let blinkAt = 3;
    animated.push((t) => {
      robot.position.y = 0.25 + Math.sin(t * 1.6) * 0.04;
      hover.scale.y = 0.8 + Math.sin(t * 20) * 0.1;
      antenna.visible = (t % 2) > 0.15;
      const blink = t > blinkAt && t < blinkAt + 0.12;
      if (t > blinkAt + 0.12) blinkAt = t + 2.5 + Math.random() * 3;
      eyes.forEach((e) => { e.scale.y = blink ? 0.15 : 1; });
      const shaking = t < shakeUntil;
      right.rotation.x = -1.2 + (shaking ? Math.sin(t * 30) * 0.4 : Math.sin(t * 0.8) * 0.05);
    });
  }
  let shakeUntil = 0;

  // Palms and beach dressing just off the deck, in bar-local space.
  const PALMS = [[-4.4, -2.6, 0.3, 1.25], [4.6, -2.0, 2.6, 1.1], [-4.9, 1.9, 4.2, 1.0]];
  PALMS.forEach(([x, z, ry, s]) => {
    const palm = prop('pirate-kit_palm-detailed-bend', s);
    palm.position.set(x, -0.1, z);
    palm.rotation.y = ry;
    bar.add(palm);
  });

  place(bar, BAR_DIR);
  bar.updateMatrixWorld(true);

  // World-space helpers for the player
  const toWorld = (x, y, z) => bar.localToWorld(new THREE.Vector3(x, y, z));
  const seatStool = stools[1];
  const seat = {
    eye: toWorld(seatStool.position.x, 1.5, 1.55),   // where your eyes are when seated
    look: toWorld(0.1, 1.35, -0.7),                  // looking at the bartender
    served: new THREE.Vector3(0, BAR_TOP, 0.85),     // where drinks land (bar-local)
  };

  const colliders = [
    // the counter, as three circles, plus the stools
    { center: toWorld(-1.3, 0, 0.5), radius: 0.85 }, { center: toWorld(0, 0, 0.5), radius: 0.85 }, { center: toWorld(1.3, 0, 0.5), radius: 0.85 },
    ...stools.map((st) => ({ center: toWorld(st.position.x, 0, st.position.z), radius: 0.28 })),
    ...POSTS.map(([x, z]) => ({ center: toWorld(x, 0, z), radius: 0.3 })),
    ...PALMS.map(([x, z]) => ({ center: toWorld(x, 0, z), radius: 0.45 })),
    { center: toWorld(-1.2, 0, -1.2), radius: 1.2 }, { center: toWorld(1.2, 0, -1.2), radius: 1.2 }, // behind the bar is staff only
  ];

  const interactables = [
    // object: what you click. approach: where you walk to (feet, world). radius: close enough to use it.
    { id: 'seat', label: "Steve's", verb: 'Sit at the bar', object: bar, point: toWorld(0, 1, 1.8), approach: toWorld(0, 0, 2.35), radius: 2.6 },
    { id: 'writing', label: 'Chalkboard', verb: 'Read my writing', object: boardGroup, point: toWorld(-2.9, 1.2, 2.3), approach: toWorld(-2.4, 0, 3.2), radius: 2.0 },
  ];

  // Serving: drop a drink in front of the seat. Keeps the last few.
  const drinks = [];
  const DRINK = { about: 'food-kit_cocktail', writing: 'food-kit_soda-glass', shelf: 'pirate-kit_bottle', lab: 'food-kit_soda-glass', launch: 'food-kit_cocktail', contact: 'food-kit_glass', resume: 'food-kit_glass', campfire: 'food-kit_coconut-half' };
  function serve(id) {
    shakeUntil = clock.t + 1.3;
    setTimeout(() => {
      const d = prop(DRINK[id] || 'food-kit_cocktail', id === 'shelf' ? 0.28 : 0.42);
      d.position.copy(seat.served).add(new THREE.Vector3((drinks.length % 3 - 1) * 0.28, 0, (drinks.length % 2) * 0.12));
      d.rotation.y = Math.random() * TAU;
      bar.add(d);
      drinks.push(d);
      if (drinks.length > 5) bar.remove(drinks.shift());
    }, 900);
  }

  const clock = { t: 0 };
  return {
    group: bar,
    seat,
    colliders,
    interactables,
    serve,
    head,
    update(t) {
      clock.t = t;
      for (const f of animated) f(t);
    },
  };
}

// A plank texture for the deck.
function planks() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#a8703f';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#9a6536' : '#b27a46';
    g.fillRect(0, i * 32 + 2, 256, 28);
  }
  g.fillStyle = 'rgba(60,30,10,.5)';
  for (let i = 0; i < 8; i++) g.fillRect(0, i * 32, 256, 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  return t;
}
