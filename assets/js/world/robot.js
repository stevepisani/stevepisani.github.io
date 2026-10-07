// The bartender: a 1950s tin-toy robot. Box head with a big glowing dial face, a glass
// dome with an antenna on top, riveted teal-and-cream enamel, an aloha shirt under a lei
// and a bow tie, jointed arms with pincer hands, and one rubber wheel instead of legs.
//
// Local frame: stands on y = 0, faces +z. Behaviour (all driven by update(dt)):
//   greet(point)  roll over and turn to face the guest (a point in the parent's frame)
//   shake(ms)     raise the shaker and shake it
//   pour()        reach forward over the counter, as if sliding the drink across
//   idle()        roll back to its spot by the back bar
// Making a drink (bar.js drives it step by step): roll(spot) up to the counter, hold() a bottle,
// bar spoon, swizzle stick or garnish in the left pincer, and reach() either hand to a point:
// the arms are solved to put the held thing's tip there, so a pour lands in the glass.
// With reduced motion the robot snaps between poses instead of animating them, and
// nothing moves on its own.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as T from './textures.js';
import { PALETTE, pbr, enamel, chrome, glow } from './materials.js';

const WHEEL_R = 0.21;
const LIFT = 0.25; // a stalk between wheel and hips, so it stands tall enough to see over the counter

function mesh(geo, material, [x, y, z] = [0, 0, 0], parent, { cast = true } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  parent && parent.add(m);
  return m;
}

const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

export function tinRobot({ hero = null, reducedMotion = false } = {}) {
  const root = new THREE.Group();   // position + heading (rolls around behind the bar)
  root.name = 'robot';
  const stand = new THREE.Group();
  root.add(stand);
  const body = new THREE.Group();   // everything above the wheel; wobbles when shaking
  stand.add(body);
  const M = {
    // printed tin (see textures.tinLitho): the colour is in the print, so the enamel is white
    aqua: enamel(0xffffff, { map: T.tinLitho({ base: PALETTE.tinTeal }) }),
    vents: enamel(0xffffff, { map: T.tinLitho({ base: PALETTE.tinTeal, vents: true }) }),
    skirt: enamel(0xffffff, { map: T.tinLitho({ base: PALETTE.tinTeal, stripes: true }) }),
    teal: enamel(PALETTE.tinTeal),
    red: enamel(PALETTE.coral),
    cream: enamel(PALETTE.cream),
    chrome: chrome(),
    rubber: pbr({ color: PALETTE.lava, roughness: 0.9 }),
    shirt: pbr({ map: T.alohaShirt(), roughness: 0.8 }),
    tie: pbr({ color: PALETTE.lava, roughness: 0.55 }),
    glass: new THREE.MeshPhysicalMaterial({ color: PALETTE.aqua, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.22, clearcoat: 1, depthWrite: false }),
  };

  /* ---------- One wheel in a chrome fork ---------- */
  const axle = new THREE.Group();   // fork and axle stay put; the wheel inside spins
  axle.position.y = WHEEL_R;
  if (!hero) root.add(axle);
  const wheel = new THREE.Group();
  axle.add(wheel);
  const tyre = mesh(new THREE.TorusGeometry(WHEEL_R - 0.05, 0.05, 10, 28), M.rubber, [0, 0, 0], wheel);
  tyre.rotation.y = Math.PI / 2;
  const hub = mesh(new THREE.CylinderGeometry(WHEEL_R - 0.07, WHEEL_R - 0.07, 0.07, 20), M.cream, [0, 0, 0], wheel);
  hub.rotation.z = Math.PI / 2;
  for (let i = 0; i < 4; i++) { // spokes, so you can see it roll
    const s = mesh(new THREE.BoxGeometry(0.075, 0.02, WHEEL_R * 1.5), M.chrome, [0, 0, 0], wheel);
    s.rotation.x = (i / 4) * Math.PI;
  }
  for (const x of [-0.07, 0.07]) mesh(new THREE.BoxGeometry(0.025, 0.34, 0.09), M.chrome, [x, 0.12, 0], axle);
  mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.17, 8), M.chrome, [0, 0, 0], axle).rotation.z = Math.PI / 2;
  // chrome hubcaps, and a red tin mudguard over the top of the wheel
  for (const x of [-0.045, 0.045]) mesh(new THREE.SphereGeometry(0.05, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.chrome, [x, 0, 0], wheel).rotation.z = x > 0 ? -Math.PI / 2 : Math.PI / 2;
  const guard = mesh(new THREE.CylinderGeometry(WHEEL_R + 0.03, WHEEL_R + 0.03, 0.15, 24, 1, true, -Math.PI * 0.55, Math.PI * 1.1), M.red, [0, 0, 0], axle);
  guard.rotation.z = Math.PI / 2;
  guard.material = enamel(PALETTE.coral, { side: THREE.DoubleSide });
  for (const x of [-0.076, 0.076]) {
    const rim = mesh(new THREE.TorusGeometry(WHEEL_R + 0.03, 0.007, 6, 24, Math.PI * 1.1), M.chrome, [x, 0, 0], axle);
    rim.rotation.set(0, Math.PI / 2, -Math.PI * 0.05);
  }

  const rig = { wheel, body };

  if (hero) {
    // A generated body (it brings its own wheel): it turns, rolls and rattles as one piece.
    body.add(hero);
  } else {
    /* ---------- Riveted enamel body on a stalk ---------- */
    stand.position.y = LIFT;
    // a chrome bellows spring between the wheel and the body (tin toys wobble on these)
    for (let i = 0; i < 6; i++) mesh(new THREE.TorusGeometry(0.05 - (i % 2) * 0.008, 0.012, 6, 16), M.chrome, [0, WHEEL_R + 0.08 - LIFT + 0.19 + i * 0.035, 0], stand).rotation.x = Math.PI / 2;
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.26, 10), M.chrome, [0, WHEEL_R + 0.37 - LIFT, 0], stand);
    mesh(new THREE.CylinderGeometry(0.24, 0.12, 0.18, 24), M.skirt, [0, 0.35, 0], body);      // skirt over the stalk, chevrons round it
    mesh(new THREE.TorusGeometry(0.235, 0.012, 6, 32), M.chrome, [0, 0.44, 0], body).rotation.x = Math.PI / 2;
    mesh(new RoundedBoxGeometry(0.52, 0.22, 0.38, 3, 0.05), M.vents, [0, 0.53, 0], body);        // hips, with printed vents
    mesh(new RoundedBoxGeometry(0.56, 0.05, 0.42, 2, 0.02), M.red, [0, 0.645, 0], body);         // red band
    // three indicator lamps on the belly, as every good tin robot has
    const lamps = [PALETTE.coral, PALETTE.amber, PALETTE.aqua].map((c, i) => {
      mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.012, 14), M.chrome, [-0.09 + i * 0.09, 0.54, 0.19], body).rotation.x = Math.PI / 2;
      return mesh(new THREE.SphereGeometry(0.02, 12, 8), glow(c, 2.2), [-0.09 + i * 0.09, 0.54, 0.197], body, { cast: false });
    });
    mesh(new RoundedBoxGeometry(0.58, 0.46, 0.38, 3, 0.06), M.shirt, [0, 0.88, 0], body);       // shirt over the torso
    mesh(new RoundedBoxGeometry(0.62, 0.06, 0.42, 2, 0.02), M.red, [0, 1.12, 0], body);          // shoulder plate
    // a pocket with a paper umbrella tucked in it, low enough to clear the lei
    mesh(new THREE.BoxGeometry(0.1, 0.09, 0.012), M.shirt, [0.15, 0.79, 0.196], body);
    {
      const u = new THREE.Group();
      u.position.set(0.16, 0.8, 0.2);
      u.rotation.set(0.25, 0, -0.35);
      body.add(u);
      mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.13, 5), pbr({ color: PALETTE.bamboo }), [0, 0.065, 0], u, { cast: false });
      mesh(new THREE.ConeGeometry(0.05, 0.03, 10, 1, true), pbr({ color: PALETTE.hibiscus, roughness: 0.8, side: THREE.DoubleSide }), [0, 0.13, 0], u, { cast: false });
    }
    // shirt buttons and an open collar
    for (const y of [0.74, 0.86, 0.98]) mesh(new THREE.SphereGeometry(0.014, 8, 6), M.cream, [0, y, 0.192], body);
    for (const s of [-1, 1]) {
      const col = mesh(new THREE.BoxGeometry(0.12, 0.08, 0.01), M.shirt, [s * 0.07, 1.05, 0.195], body);
      col.rotation.z = s * 0.55;
    }
    // rivets along the cream band and the shoulder plate
    {
      const pts = [];
      for (let i = 0; i < 9; i++) { const x = -0.22 + i * 0.055; pts.push([x, 0.63, 0.201], [x, 1.12, 0.201], [x, 0.63, -0.201]); }
      for (let i = 0; i < 5; i++) { const z = -0.14 + i * 0.07; pts.push([0.271, 0.63, z], [-0.271, 0.63, z]); }
      const rivets = new THREE.InstancedMesh(new THREE.SphereGeometry(0.011, 6, 4), M.chrome, pts.length);
      const m = new THREE.Matrix4();
      pts.forEach((p, i) => rivets.setMatrixAt(i, m.makeTranslation(...p)));
      body.add(rivets);
    }
    // bow tie, on the front of the collar plate (under the head it would be hidden and clip it)
    for (const s of [-1, 1]) {
      const wing = mesh(new THREE.ConeGeometry(0.035, 0.07, 4), M.tie, [s * 0.036, 1.12, 0.228], body);
      wing.rotation.set(0, Math.PI / 4, s * Math.PI / 2);
    }
    mesh(new THREE.BoxGeometry(0.026, 0.026, 0.026), M.tie, [0, 1.12, 0.232], body);
    // neck and lei
    mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.1, 16), M.chrome, [0, 1.19, 0], body);
    {
      // plumeria flowers strung on a loop that lies the way a real lei does: flat along the top of
      // the shoulder plate (outside the head, which overhangs the neck, so nothing clips it), then
      // down the front of the shirt in a U, each flower cupped and facing away from what it lies on.
      // Top of the plate: y 1.15; front of the plate: z 0.21; front of the shirt: z 0.19.
      const loop = new THREE.CatmullRomCurve3([
        [0, 1.158, -0.19], [-0.2, 1.158, -0.16], [-0.27, 1.158, 0.0], [-0.235, 1.155, 0.17],
        [-0.2, 1.08, 0.214], [-0.13, 0.99, 0.206], [0, 0.95, 0.206],
        [0.13, 0.99, 0.206], [0.2, 1.08, 0.214], [0.235, 1.155, 0.17], [0.27, 1.158, 0.0], [0.2, 1.158, -0.16],
      ].map((p) => new THREE.Vector3(...p)), true, 'centripetal');
      const n = 30;
      const petal = new THREE.CircleGeometry(0.05, 20);
      { const pos = petal.attributes.position; for (let i = 0; i < pos.count; i++) { const r = Math.hypot(pos.getX(i), pos.getY(i)); pos.setZ(i, r * r * 5); } petal.computeVertexNormals(); }
      const flowers = new THREE.InstancedMesh(petal, pbr({ map: T.plumeria(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.6 }), n);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), Z = new THREE.Vector3(0, 0, 1);
      const cols = [PALETTE.cream, PALETTE.hibiscus, PALETTE.cream, PALETTE.amber].map((c) => new THREE.Color(c).lerp(new THREE.Color(0xffffff), 0.35));
      const up = new THREE.Vector3(0, 1, 0), front = new THREE.Vector3(0, 0.25, 1);
      loop.getSpacedPoints(n).slice(0, n).forEach((p, i) => {
        // on the plate they face up (and a little out); down the chest they face forward
        const onChest = THREE.MathUtils.smoothstep(1.15 - p.y, 0.0, 0.06);
        const out = up.clone().add(new THREE.Vector3(p.x, 0, p.z).multiplyScalar(0.8)).normalize().lerp(front, onChest).normalize();
        q.setFromUnitVectors(Z, out).multiply(new THREE.Quaternion().setFromAxisAngle(Z, i * 1.3));
        flowers.setMatrixAt(i, m.compose(p, q, new THREE.Vector3(1, 1, 1)));
        flowers.setColorAt(i, cols[i % cols.length]);
      });
      flowers.castShadow = true;
      body.add(flowers);
    }

    /* ---------- Box head: dial face, ear bolts, glass dome, antenna ---------- */
    const head = new THREE.Group();
    head.position.y = 1.24;
    body.add(head);
    mesh(new RoundedBoxGeometry(0.46, 0.38, 0.4, 3, 0.05), M.aqua, [0, 0.19, 0], head);
    mesh(new RoundedBoxGeometry(0.4, 0.34, 0.03, 2, 0.012), M.cream, [0, 0.19, 0.195], head);
    // a red visor over the face plate
    mesh(new RoundedBoxGeometry(0.44, 0.045, 0.07, 2, 0.015), M.red, [0, 0.385, 0.2], head);
    const dial = new THREE.Mesh(new THREE.CircleGeometry(0.135, 40), new THREE.MeshBasicMaterial({ map: T.dialFace(), toneMapped: false }));
    dial.material.color.setScalar(1.6); // just over the bloom threshold, so the face glows
    dial.material.userData.keep = true;
    dial.position.set(0, 0.2, 0.213);
    head.add(dial);
    const bezel = mesh(new THREE.TorusGeometry(0.14, 0.016, 8, 40), M.chrome, [0, 0.2, 0.213], head);
    bezel.scale.z = 0.6;
    const needle = new THREE.Group();
    needle.position.set(0, 0.2, 0.218);
    head.add(needle);
    mesh(new THREE.BoxGeometry(0.008, 0.11, 0.004), glow(PALETTE.hibiscus, 2.5), [0, 0.05, 0], needle, { cast: false });
    mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.012, 12), M.chrome, [0, 0, 0], needle).rotation.x = Math.PI / 2;
    // a little grille for a mouth
    for (let i = 0; i < 5; i++) mesh(new THREE.BoxGeometry(0.03, 0.008, 0.01), M.tie, [-0.06 + i * 0.03, 0.045, 0.212], head, { cast: false });
    // ear bolts with lamps
    const ears = [-1, 1].map((s) => {
      mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 16), M.chrome, [s * 0.25, 0.2, 0], head).rotation.z = Math.PI / 2;
      return mesh(new THREE.SphereGeometry(0.022, 10, 8), glow(PALETTE.aqua, 3), [s * 0.28, 0.2, 0], head, { cast: false });
    });
    // rivets round the face plate
    for (const [x, y] of [[-0.18, 0.05], [0.18, 0.05], [-0.18, 0.33], [0.18, 0.33]]) mesh(new THREE.SphereGeometry(0.012, 6, 4), M.chrome, [x, y, 0.212], head, { cast: false });
    // glass dome: a warm valve glowing inside
    mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.03, 24), M.chrome, [0, 0.395, 0], head);
    const valve = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.08, 10), glow(PALETTE.amber, 2.4), [0, 0.45, 0], head, { cast: false });
    const dome = mesh(new THREE.SphereGeometry(0.145, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.glass, [0, 0.41, 0], head, { cast: false });
    dome.renderOrder = 1;
    // the antenna on a coil spring, so it wobbles like a toy's
    {
      const pts = [];
      for (let i = 0; i <= 60; i++) { const k = i / 60; pts.push(new THREE.Vector3(Math.cos(k * 28) * 0.018, 0.56 + k * 0.1, Math.sin(k * 28) * 0.018)); }
      mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.004, 5), M.chrome, [0, 0, 0], head);
    }
    mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.14, 6), M.chrome, [0, 0.72, 0], head);
    const antenna = mesh(new THREE.SphereGeometry(0.028, 10, 8), glow(PALETTE.coral, 4), [0, 0.79, 0], head, { cast: false });

    /* ---------- Jointed arms with pincer hands ---------- */
    const arm = (s) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(s * 0.33, 1.06, 0);
      body.add(shoulder);
      mesh(new THREE.SphereGeometry(0.065, 14, 10), M.chrome, [0, 0, 0], shoulder);
      mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.1, 14), M.shirt, [0, -0.04, 0], shoulder); // short sleeve
      mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.26, 10), M.chrome, [0, -0.15, 0], shoulder);
      for (let i = 0; i < 4; i++) mesh(new THREE.TorusGeometry(0.038, 0.009, 6, 14), M.chrome, [0, -0.1 - i * 0.05, 0], shoulder).rotation.x = Math.PI / 2;
      const elbow = new THREE.Group();
      elbow.position.y = -0.29;
      shoulder.add(elbow);
      mesh(new THREE.SphereGeometry(0.048, 12, 8), M.teal, [0, 0, 0], elbow);
      mesh(new THREE.CylinderGeometry(0.032, 0.03, 0.22, 10), M.chrome, [0, -0.13, 0], elbow);
      const hand = new THREE.Group();
      hand.position.y = -0.26;
      elbow.add(hand);
      mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.04, 12), M.cream, [0, 0.01, 0], hand);
      const fingers = [-1, 1].map((f) => {
        const g = new THREE.Group();
        g.position.set(0, -0.01, f * 0.025);
        hand.add(g);
        mesh(new THREE.BoxGeometry(0.018, 0.08, 0.016), M.chrome, [0, -0.04, 0], g).rotation.x = f * 0.25;
        mesh(new THREE.BoxGeometry(0.018, 0.045, 0.016), M.chrome, [0, -0.085, -f * 0.012], g).rotation.x = -f * 0.5;
        return g;
      });
      return { shoulder, elbow, hand, fingers };
    };
    // facing +z, its right hand is on the -x side
    const right = arm(-1), left = arm(1);
    // a bar towel in the left pincer, hanging in folds
    {
      const cloth = new THREE.PlaneGeometry(0.1, 0.2, 4, 8).translate(0, -0.1, 0);
      const pos = cloth.attributes.position;
      for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); pos.setZ(i, Math.sin(pos.getX(i) * 50) * 0.008 + y * y * 0.4); }
      cloth.computeVertexNormals();
      rig.towel = mesh(cloth, pbr({ color: PALETTE.cream, roughness: 1, side: THREE.DoubleSide }), [0, -0.1, 0], left.hand);
      rig.towel.rotation.y = Math.PI / 2;
    }
    // a chrome cocktail shaker, held in the right pincer
    const shaker = new THREE.Group();
    shaker.position.y = -0.1;
    shaker.rotation.x = Math.PI; // cap outward
    right.hand.add(shaker);
    mesh(new THREE.CylinderGeometry(0.042, 0.034, 0.13, 16), M.chrome, [0, 0, 0], shaker);
    mesh(new THREE.CylinderGeometry(0.03, 0.042, 0.05, 16), M.chrome, [0, 0.09, 0], shaker);
    mesh(new THREE.SphereGeometry(0.016, 8, 6), M.chrome, [0, 0.12, 0], shaker);
    // What the pincers pick up to make a drink. Each hangs from the pincer, tipped `down` from
    // the line of the forearm: with the arm reaching out over a glass, a bottle's neck points
    // down into it and a spoon or swizzle stick stands in it. `tip` is its business end, in
    // the hand's frame.
    const tool = (hand, len, down) => {
      const g = new THREE.Group();
      g.visible = false;
      g.position.y = -0.09;
      g.rotation.x = -down; // -y (along the forearm) swings toward -z: down, when the arm is out in front
      g.userData.tip = new THREE.Vector3(0, -len, 0).applyEuler(g.rotation).add(g.position);
      hand.add(g);
      return g;
    };
    const bottleGlass = pbr({ color: PALETTE.amber, roughness: 0.15, emissive: PALETTE.amber, emissiveIntensity: 0.45 }); // lit from the back bar
    const bottle = tool(left.hand, 0.15, 1.05);
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 14), bottleGlass, [0, -0.02, 0], bottle); // held by the shoulder of it
    mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.05, 14), pbr({ color: PALETTE.cream, roughness: 0.8 }), [0, -0.02, 0], bottle); // label
    mesh(new THREE.CylinderGeometry(0.011, 0.028, 0.035, 12), bottleGlass, [0, -0.095, 0], bottle);
    mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.07, 10), M.chrome, [0, -0.15, 0], bottle); // a pour spout
    bottle.children.forEach((m) => { m.position.y += 0.04; }); // the pincer grips the body
    const rod = (hand, material, prongs) => {
      const g = tool(hand, 0.26, 1.5);
      mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.3, 6), material, [0, -0.11, 0], g);
      if (prongs) for (let i = 0; i < 5; i++) { // a real swizzle stick: the tip of a branch, with its little spokes
        const prong = mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.03, 4), material, [0, -0.26, 0], g);
        prong.rotation.set(Math.PI / 2, 0, (i / 5) * Math.PI * 2);
      } else mesh(new THREE.SphereGeometry(0.009, 8, 6), material, [0, -0.26, 0], g).scale.set(1, 0.4, 1.4);
      return g;
    };
    const spoon = rod(left.hand, M.chrome, false);
    const swizzle = rod(left.hand, pbr({ color: PALETTE.bamboo, roughness: 0.7 }), true);
    const garnish = tool(left.hand, 0.03, 1.2), garnishR = tool(right.hand, 0.03, 1.2); // whatever bar.js hands it
    const real = tool(left.hand, 0.2, 1.05); // a real bottle (a hero model), held round the body, neck first
    Object.assign(rig, { head, needle, ears, valve, antenna, left, right, lamps, shaker, tools: { bottle, spoon, swizzle, garnish, garnishR, real }, bottleGlass });
  }

  /* ---------- Poses ---------- */
  // Each arm: [shoulder x, shoulder z, elbow x, pincer open]. Negative x raises the arm forward.
  const POSES = {
    rest:  { r: [-0.55, -0.12, -1.25, 0.1], l: [-0.35, 0.12, -0.9, 0.2] },  // shaker at the chest
    greet: { r: [-0.55, -0.12, -1.25, 0.1], l: [-0.2, 2.5, -0.35, 0.4] },   // left hand up: aloha
    shake: { r: [-2.7, -0.2, -0.5, 0.05], l: [-0.8, 0.25, -1.3, 0.1] },    // shaker up by the dome
    pour:  { r: [-1.45, 0.05, -0.15, 0.1], l: [-0.8, 0.25, -1.3, 0.1] },   // reaching across the counter
    wipe:  { r: [-0.55, -0.12, -1.25, 0.1], l: [-1.05, 0.15, -0.55, 0.3] },  // towel down on the bar top
  };
  const cur = { r: [...POSES.rest.r], l: [...POSES.rest.l] };
  let target = POSES.rest;
  const home = { pos: new THREE.Vector3(), heading: 0 };
  const goal = { pos: new THREE.Vector3(), heading: 0 };
  const from = { pos: new THREE.Vector3(), heading: 0 };
  let moveT = 1, moveDur = 0.9;
  let clock = 0, shakeUntil = -1, poseUntil = -1, after = 'rest', talking = false;
  let rolled = 0;
  let idleFor = 0; // seconds at rest with nothing to do: now and then it wipes down the bar

  function moveTo(pos, heading, dur = 0.9) {
    from.pos.copy(root.position); from.heading = root.rotation.y;
    goal.pos.copy(pos); goal.heading = heading;
    moveDur = dur;
    moveT = reducedMotion ? 1 : 0;
    if (reducedMotion) { root.position.copy(pos); root.rotation.y = heading; }
  }
  function pose(name, seconds = 0, then = 'rest') {
    work = null;
    target = POSES[name];
    poseUntil = seconds ? clock + seconds : -1;
    after = then;
    if (reducedMotion) { cur.r = [...target.r]; cur.l = [...target.l]; }
  }

  // Reaching: the arm angles that put a hand's held thing at a point, found by coordinate
  // descent on the real joints (a few dozen forward passes), solved for where the robot is
  // headed so it arrives with its hands already in place.
  let work = null;
  const LIM = [[-3.1, 0.8], [-1.2, 1.4], [-2.4, 0]];
  const tipLocal = (side) => {
    if (side === 'r') {
      if (rig.tools && rig.tools.garnishR.visible) return rig.tools.garnishR.userData.tip.clone();
      return work && work.r && work.r.pincer ? new THREE.Vector3(0, -0.11, 0) : new THREE.Vector3(0, -0.23, 0); // the shaker's cap
    }
    const held = rig.tools && Object.entries(rig.tools).find(([k, g]) => k !== 'garnishR' && g.visible);
    if (held) return held[1].userData.tip.clone();
    return new THREE.Vector3(0, -0.11, 0);
  };
  function solveArm(side, world, init, fine) {
    const a = side === 'r' ? rig.right : rig.left, s = side === 'r' ? -1 : 1;
    const local = tipLocal(side), tip = new THREE.Vector3();
    const cost = (p) => {
      a.shoulder.rotation.set(p[0], 0, s * p[1]);
      a.elbow.rotation.x = p[2];
      a.shoulder.updateMatrixWorld(true);
      tip.copy(local).applyMatrix4(a.hand.matrixWorld);
      return tip.distanceToSquared(world) + 0.0004 * p[1] * p[1]; // keep elbows in when it can
    };
    // from where it is (fine), or the best of a few natural starts, so it doesn't settle in a
    // poor fold of the arm
    const starts = fine ? [init] : [init, POSES.rest.r, [-0.03, -0.65, -1.72], [-1.0, -0.4, -1.0], [-1.8, 0, -0.6]];
    let p = null, best = Infinity;
    for (const s0 of starts) { const c = cost(s0); if (c < best) { best = c; p = s0.slice(0, 3); } }
    for (let step = fine ? 0.08 : 0.5; step > 0.003; step *= 0.5) {
      for (let pass = 0, better = true; better && pass < 12; pass++) {
        better = false;
        for (let j = 0; j < 3; j++) for (const d of [step, -step]) {
          const q = p.slice();
          q[j] = THREE.MathUtils.clamp(q[j] + d, LIM[j][0], LIM[j][1]);
          const c = cost(q);
          if (c < best) { best = c; p = q; better = true; }
        }
      }
    }
    return p;
  }
  function solveWork(time, fresh) {
    if (!work || !rig.right) return;
    // solve for where it's going to be standing
    const was = { pos: root.position.clone(), rot: root.rotation.y };
    root.position.copy(goal.pos); root.rotation.y = goal.heading;
    root.updateMatrixWorld(true);
    for (const side of ['r', 'l']) {
      const w = work[side];
      if (!w) continue;
      const at = w.at.clone();
      if (w.wiggle === 'stir' && !reducedMotion) { at.x += Math.cos(time * 9) * 0.012; at.z += Math.sin(time * 9) * 0.012; }
      if (w.wiggle === 'swizzle' && !reducedMotion) at.y += Math.sin(time * 16) * 0.018;
      const world = root.parent ? root.parent.localToWorld(at) : at;
      const p = solveArm(side, world, fresh ? POSES.pour.r : target[side], !fresh); // from reaching forward
      target[side] = [...p, target[side][3]];
      if (reducedMotion) cur[side] = [...target[side]];
    }
    root.position.copy(was.pos); root.rotation.y = was.rot;
    root.updateMatrixWorld(true);
    applyArms();
  }

  function applyArms() {
    if (!rig.right) return;
    for (const [side, a] of [['r', rig.right], ['l', rig.left]]) {
      const [sx, sz, ex, open] = cur[side];
      const s = side === 'r' ? -1 : 1; // the arm's side (x sign): +z rotation swings a hand toward +x
      a.shoulder.rotation.set(sx, 0, s * sz);
      a.elbow.rotation.x = ex;
      a.fingers.forEach((f, i) => { f.rotation.x = (i ? 1 : -1) * open; });
    }
  }

  return {
    group: root,
    /** Where it waits: `pos` in the parent frame, facing `heading` (radians about +y). */
    setHome(pos, heading) {
      home.pos.copy(pos); home.heading = heading;
      root.position.copy(pos); root.rotation.y = heading;
      goal.pos.copy(pos); goal.heading = heading;
    },
    /** Roll to `spot` and turn to face `guest` (both in the parent frame). */
    greet(spot, guest) {
      const heading = Math.atan2(guest.x - spot.x, guest.z - spot.z);
      moveTo(spot, heading);
      pose('greet', 1.4);
    },
    idle() {
      moveTo(home.pos, home.heading, 1.1);
      pose('rest');
    },
    /** Turn on the spot to face `guest` (parent frame) and wave. */
    beckon(guest) {
      moveTo(root.position.clone(), Math.atan2(guest.x - root.position.x, guest.z - root.position.z), 0.8);
      pose('greet', 1.8);
    },
    shake(seconds) {
      shakeUntil = clock + seconds;
      pose('shake', seconds, 'rest');
    },
    pour(seconds) { pose('pour', seconds, 'rest'); },
    /** Talking (answering you): the gauge flickers with the words, the lamps chatter, the head nods. */
    talk(on) { talking = !!on; },
    /** Where its head is (for looking it in the eye). */
    get head() { return rig.head; },

    /* ---------- Making a drink ---------- */
    /** Roll to `spot` (parent frame) facing `heading`. */
    roll(spot, heading, dur = 0.9) { moveTo(spot, heading, dur); },
    /**
     * What the left pincer holds: 'towel' (its usual), 'bottle' (tinted `color`), 'spoon',
     * 'swizzle', 'garnish' (with `object` in it), 'real' (a real bottle, `object`, standing on
     * y = 0 and `height` tall: held round the body, neck toward the pour), or nothing.
     * `shaker` shows or hides the one in the right.
     */
    hold(item, { color, object, shaker = true, side = 'l', height = 0.25 } = {}) {
      if (!rig.tools) return;
      const name = item === 'garnish' && side === 'r' ? 'garnishR' : item;
      rig.towel.visible = item === 'towel';
      for (const [k, g] of Object.entries(rig.tools)) g.visible = k === name;
      if (item === 'bottle' && color !== undefined) { rig.bottleGlass.color.set(color); rig.bottleGlass.emissive.set(color); }
      if (item === 'garnish') { rig.tools[name].clear(); if (object) rig.tools[name].add(object); }
      if (item === 'real') {
        const g = rig.tools.real;
        g.clear();
        // held round the body, neck first: the base sticks out behind the pincer
        const grip = height * 0.45;
        if (object) { object.rotation.set(Math.PI, 0, 0); object.position.set(0, grip, 0); g.add(object); }
        g.userData.tip = new THREE.Vector3(0, grip - height, 0).applyEuler(g.rotation).add(g.position);
      }
      rig.shaker.visible = shaker && name !== 'garnishR';
    },
    /**
     * Put a hand's held thing where it's needed: `r` / `l` are { at (a point in the parent frame),
     * wiggle: 'stir' | 'swizzle' } or null (that arm rests). The right hand's tip is the shaker's
     * cap, or the pincer when `pincer`. null for both ends it.
     */
    reach(r, l) {
      work = r || l ? { r, l } : null;
      if (!work) { pose('rest'); return; }
      target = { r: [...POSES.rest.r], l: [...POSES.rest.l] };
      poseUntil = -1;
      solveWork(0, true);
    },
    /** For tests: what each hand is reaching for, and where its tip is (parent frame). */
    debug() {
      const toParent = (v) => (v && root.parent ? root.parent.worldToLocal(v) : v);
      return { work: work && { r: work.r && work.r.at, l: work.l && work.l.at }, r: toParent(this.tip('r')), l: toParent(this.tip('l')),
        held: rig.tools && Object.entries(rig.tools).filter(([, g]) => g.visible).map(([k]) => k), target, cur };
    },
    /** Where a hand's held thing ends, in world space (null without arms). */
    tip(side) {
      if (!rig.right) return null;
      root.updateMatrixWorld(true);
      return tipLocal(side).applyMatrix4((side === 'r' ? rig.right : rig.left).hand.matrixWorld);
    },
    update(dt, t) {
      clock += dt;
      // roll and turn
      if (moveT < 1) {
        const before = root.position.clone();
        moveT = Math.min(1, moveT + dt / moveDur);
        const k = ease(moveT);
        root.position.lerpVectors(from.pos, goal.pos, k);
        root.rotation.y = lerpAngle(from.heading, goal.heading, k);
        rolled += before.distanceTo(root.position) + Math.abs(dt * 0.6); // a turn-in-place still turns the wheel a little
      }
      wheel.rotation.x = rolled / WHEEL_R;
      // making a drink: keep stirring / swizzling (re-solved each frame from where the arm is)
      if (work && ((work.l && work.l.wiggle) || (work.r && work.r.wiggle))) solveWork(clock, false);
      if (rig.tools && rig.tools.swizzle.visible && !reducedMotion) rig.tools.swizzle.rotation.y += dt * 40; // spun between the palms
      // arms ease toward the target pose, then back to `after`
      if (poseUntil > 0 && clock > poseUntil) { poseUntil = -1; target = POSES[after]; if (reducedMotion) { cur.r = [...target.r]; cur.l = [...target.l]; } }
      if (!reducedMotion) {
        const k = 1 - Math.exp(-dt * 9);
        for (const side of ['r', 'l']) for (let i = 0; i < 4; i++) cur[side][i] += (target[side][i] - cur[side][i]) * k;
      }
      // Idle: every so often, wipe the counter in little circles. Only when motion is allowed, and
      // only when it's standing at rest with nothing else to do.
      const resting = target === POSES.rest && poseUntil < 0 && moveT >= 1;
      idleFor = resting && !reducedMotion ? idleFor + dt : 0;
      if (idleFor > 9) { idleFor = 0; pose('wipe', 2.6); }
      if (target === POSES.wipe && !reducedMotion) { cur.l[0] += Math.sin(clock * 5.5) * 0.012; cur.l[1] += Math.cos(clock * 5.5) * 0.012; }
      const shaking = clock < shakeUntil;
      if (shaking && !reducedMotion) {
        const w = Math.sin(clock * 34);
        if (rig.right) { cur.r[0] = target.r[0] + w * 0.22; cur.r[2] = target.r[2] - w * 0.3; }
        body.rotation.z = w * 0.02;
        body.position.y = Math.abs(w) * 0.012; // a tin toy rattles when it works
      } else {
        body.rotation.z = 0;
        // a little bob on the wheel, only when motion is allowed
        body.position.y = reducedMotion ? 0 : Math.sin(t * 2.1) * 0.006;
      }
      applyArms();
      if (rig.needle) {
        // the gauge swings to VOLCANIC while shaking, idles near MILD
        // (+z rotation swings it left, toward MILD; the scale spans ±2.2 rad)
        const aim = shaking ? -1.9
          : talking && !reducedMotion ? 0.9 + Math.sin(clock * 13) * 0.35 + Math.sin(clock * 7.3) * 0.25 // the needle flickers with the words
            : 1.6 + (reducedMotion ? 0 : Math.sin(t * 1.3) * 0.05);
        rig.needle.rotation.z += (aim - rig.needle.rotation.z) * (reducedMotion ? 1 : Math.min(1, dt * 8));
        rig.antenna.visible = (t % 2) > 0.15 || reducedMotion;
        const pulse = 1 + (reducedMotion ? 0 : Math.sin(t * 3) * 0.15);
        rig.valve.scale.set(pulse, 1, pulse);
        // belly lamps blink in turn (all on under reduced motion)
        rig.lamps.forEach((l, i) => { l.visible = reducedMotion || Math.floor((talking ? clock * 7 : t * 1.5)) % 3 !== i; });
        // a small nod now and then as it talks
        rig.head.rotation.x += ((talking && !reducedMotion ? Math.max(0, Math.sin(clock * 3.1)) * 0.06 : 0) - rig.head.rotation.x) * Math.min(1, dt * 6);
      }
    },
  };
}
