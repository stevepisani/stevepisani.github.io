// The campfire on the far side of the planet, Outer Wilds style: a ring of lava rock, a log
// teepee over a bed of glowing coals, sparks going up, log benches, the Thinker and a moai for company, and
// a bag of marshmallows. Sit on a log, hold a marshmallow in the fire until it's golden (or
// until it catches, if that's how you like them), and eat it.
import * as THREE from 'three';
import { PALETTE, pbr, surface, woodSet } from './materials.js';
import * as T from './textures.js';
import { createFire } from './fire.js';
import { lavaRock, moai, thinkerFallback } from './props.js';
import { heroOr } from './hero.js';

function mesh(geo, material, parent, [x, y, z] = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  parent && parent.add(m);
  return m;
}

/** Glowing coals: dark embers with hot cracks, for the fire bed. */
function coalsTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  let seed = 4;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 260; i++) {
    const x = rand() * S, y = rand() * S, r = 4 + rand() * 12, d = Math.hypot(x - S / 2, y - S / 2) / (S / 2);
    const heat = Math.max(0, 1 - d) * (0.4 + rand() * 0.6);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(255,${120 + heat * 90 | 0},40,${heat})`);
    gr.addColorStop(1, 'rgba(120,20,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A split log: bark round the outside, pale end grain, charred where it's been in the fire. */
function log(length, radius, bark, end) {
  const g = new THREE.Group();
  const body = mesh(new THREE.CylinderGeometry(radius, radius * 1.05, length, 14), bark, g);
  body.rotation.z = Math.PI / 2;
  for (const s of [-1, 1]) {
    const cap = mesh(new THREE.CircleGeometry(radius * 0.98, 14), end, g, [s * (length / 2 + 0.002), 0, 0]);
    cap.rotation.y = s * Math.PI / 2;
  }
  return g;
}

/**
 * Build the camp around its fire, at the origin. `quality` from main. Returns { group, fire,
 * update(t), seatToward(x, z, groundY) }: seatToward puts the bench you sit on toward local
 * direction (x, z), lays the benches, bag and skewers on the real ground (`groundY(x, z)`: its
 * local height under that point, once the camp is placed) and returns the seat's poses (local):
 * { eye, look, stand, dip, rise }.
 */
export function buildCampfire({ quality, heroes }) {
  const group = new THREE.Group();
  const bark = surface(woodSet(PALETTE.stain), { roughness: 0.9, bumpScale: 2 });
  const endGrain = pbr({ color: PALETTE.bamboo, roughness: 0.9 });
  const charred = pbr({ color: PALETTE.lava, roughness: 0.95, emissive: PALETTE.coral, emissiveIntensity: 0.15 });

  // ring of lava rock
  for (let i = 0; i < 13; i++) {
    const a = (i / 13) * Math.PI * 2;
    const r = lavaRock({ size: 0.16 + (i % 3) * 0.035, seed: 300 + i });
    r.position.set(Math.cos(a) * 0.72, -0.02, Math.sin(a) * 0.72);
    r.rotation.y = a * 2.3;
    group.add(r);
  }
  // a bed of coals, glowing
  const coals = mesh(new THREE.CircleGeometry(0.62, 32).rotateX(-Math.PI / 2), pbr({ color: PALETTE.lava, roughness: 1, emissive: 0xffffff, emissiveMap: coalsTexture(), emissiveIntensity: 2.2 }), group, [0, 0.015, 0]);
  coals.castShadow = false;
  // the teepee: five logs leaning in, charred at the bottom
  const teepee = new THREE.Group();
  group.add(teepee);
  for (let i = 0; i < 5; i++) {
    const turn = new THREE.Group();
    turn.rotation.y = (i / 5) * Math.PI * 2;
    const l = log(0.95, 0.045, i % 2 ? bark : charred, endGrain);
    l.position.set(0.2, 0.35, 0);   // foot about 0.4 m out, top just over the middle
    l.rotation.z = 2.0;
    turn.add(l);
    teepee.add(turn);
  }
  // the fire: a big flame and a smaller one turned through it, for body
  const fire = createFire({ width: 0.9, height: 1.35, light: 7, distance: 11, shadow: quality.high });
  fire.group.position.y = 0.05;
  group.add(fire.group);
  const fire2 = createFire({ width: 0.6, height: 0.95, light: 0 });
  fire2.group.rotation.y = Math.PI / 4;
  fire2.group.position.set(0.05, 0.04, -0.04);
  group.add(fire2.group);
  // sparks: little embers rising and drifting, fading out as they go
  const SPARKS = quality.high ? 70 : 36;
  const sparkGeo = new THREE.BufferGeometry();
  const sp = new Float32Array(SPARKS * 3), seeds = new Float32Array(SPARKS);
  for (let i = 0; i < SPARKS; i++) seeds[i] = Math.random();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ map: T.glow('rgba(255,190,110,1)'), color: new THREE.Color(PALETTE.amber).multiplyScalar(3), size: 0.07, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  sparks.frustumCulled = false;
  group.add(sparks);

  // benches: logs round the fire, bedded into the real ground under both ends (it falls away
  // from the camp's flat plane). The one you sit on is placed by seatToward().
  const bench = (a, groundY, r = 1.55) => {
    const b = log(1.5, 0.17, bark, endGrain);
    b.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    b.rotation.y = -a + Math.PI / 2; // lies across the line to the fire
    b.updateMatrix();
    const end = (s) => new THREE.Vector3(s * 0.75, 0, 0).applyMatrix4(b.matrix);
    b.position.y = Math.min(...[-1, 0, 1].map((s) => { const p = end(s); return groundY(p.x, p.z); })) + 0.14;
    group.add(b);
    return b;
  };
  // company at the fire: the Thinker on his rock in one place round it, a moai behind the log
  // in another (seatToward() puts them either side of yours; places.js sinks them into the
  // ground, which curves away from the camp's flat plane)
  const watcher = heroOr(heroes, 'moai', () => moai({ height: 2.4 }));
  const thinker = heroOr(heroes, 'thinker', thinkerFallback);
  group.add(watcher, thinker);
  const faceFire = (o, a, r) => { o.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); o.rotation.y = Math.atan2(-o.position.x, -o.position.z); };

  return {
    group,
    fire,
    moai: watcher,
    thinker,
    /** Local point in the flame where a marshmallow toasts best. */
    hotSpot: new THREE.Vector3(0, 0.55, 0),
    update(t) {
      fire.update(t); fire2.update(t);
      for (let i = 0; i < SPARKS; i++) {
        const k = (t * (0.35 + seeds[i] * 0.4) + seeds[i]) % 1;
        const a = seeds[i] * 40 + t * 0.6;
        sp[i * 3] = Math.cos(a) * (0.1 + k * 0.5) * seeds[(i + 7) % SPARKS];
        sp[i * 3 + 1] = 0.4 + k * 2.6;
        sp[i * 3 + 2] = Math.sin(a) * (0.1 + k * 0.5) * seeds[(i + 3) % SPARKS];
      }
      sparkGeo.attributes.position.needsUpdate = true;
    },
    seatToward(x, z, groundY = () => 0) {
      const a = Math.atan2(z, x);
      // no log leans straight at you (end on, it would stand in front of the fire like a post)
      teepee.rotation.y = -(a + Math.PI / 5);
      bench(a, groundY);
      faceFire(thinker, a + 2.45, 1.8); // his rock is his seat
      bench(a - 2.2, groundY);
      faceFire(watcher, a - 2.5, 2.8); // behind the log
      // a bag of marshmallows and a couple of spare skewers at the end of your log
      const side = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
      const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const bagAt = out.clone().multiplyScalar(1.5).addScaledVector(side, 0.95);
      const bag = mesh(new THREE.BoxGeometry(0.16, 0.2, 0.08), pbr({ color: PALETTE.cream, roughness: 0.6 }), group, [bagAt.x, groundY(bagAt.x, bagAt.z) + 0.09, bagAt.z]);
      bag.rotation.y = -a;
      mesh(new THREE.BoxGeometry(0.162, 0.05, 0.082), pbr({ color: PALETTE.teal, roughness: 0.6 }), bag, [0, 0.02, 0]);
      // the skewers lie on the ground from end to end, wherever it slopes
      const spare = pbr({ color: PALETTE.bamboo, roughness: 0.8 });
      const onGround = (p) => p.setY(groundY(p.x, p.z) + 0.006);
      for (const k of [-1, 1]) {
        const mid = bagAt.clone().addScaledVector(side, 0.12 * k), along = out.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.1 * k);
        const p0 = onGround(mid.clone().addScaledVector(along, -0.55)), p1 = onGround(mid.clone().addScaledVector(along, 0.55));
        const st = mesh(new THREE.CylinderGeometry(0.006, 0.006, p0.distanceTo(p1), 5), spare, group, [(p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2]);
        st.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p1.clone().sub(p0).normalize());
      }
      // your seat: on the log, eyes a sitting height up, looking into the fire
      const r = 1.42;
      return {
        eye: out.clone().multiplyScalar(r).setY(1.05),
        look: new THREE.Vector3(0, 0.45, 0),
        stand: out.clone().multiplyScalar(2.15).setY(1.62),  // behind the log, standing
        dip: out.clone().multiplyScalar(1.7).setY(1.25),     // stepping over, sitting down
        rise: out.clone().multiplyScalar(1.6).setY(1.4),     // leaning forward to get up
        approach: out.clone().multiplyScalar(2.3),
      };
    },
  };
}

/* ---------- The marshmallow on its stick ---------- */

const TOAST = [[0, PALETTE.cream, 1.15], [0.18, PALETTE.cream, 1.0], [0.42, PALETTE.amber, 0.95], [0.62, PALETTE.wood, 0.9], [0.82, PALETTE.stain, 0.8], [1.05, PALETTE.lava, 0.9]];
const colourAt = (k, out) => {
  let i = 0;
  while (i < TOAST.length - 2 && k > TOAST[i + 1][0]) i++;
  const [k0, c0, b0] = TOAST[i], [k1, c1, b1] = TOAST[i + 1];
  const f = THREE.MathUtils.clamp((k - k0) / (k1 - k0), 0, 1);
  const golden = new THREE.Color(c0).lerp(new THREE.Color(PALETTE.cream), c0 === PALETTE.amber ? 0.35 : 0);
  const next = new THREE.Color(c1).lerp(new THREE.Color(PALETTE.cream), c1 === PALETTE.amber ? 0.35 : 0);
  return out.copy(golden).lerp(next, f).multiplyScalar(b0 + (b1 - b0) * f);
};

/** How it went, by how toasted it was when you ate it. */
export function verdict(k) {
  if (k < 0.12) return 'Still cold in the middle. Brave.';
  if (k < 0.3) return 'Lightly toasted. A patient choice.';
  if (k < 0.58) return 'Golden all the way round. Perfect.';
  if (k < 0.85) return 'Toasty and gooey. Respectable.';
  return 'Charcoal. Some people like it that way.';
}

/**
 * The stick you hold at the fire, drawn in front of the camera. Hold to reach it into the fire;
 * it toasts by how close the marshmallow is to the hot spot. Past dark brown it can catch fire.
 * `update(dt, holding, hotSpotWorld)` each frame; `eat()` returns the toast level and puts a
 * fresh one on after a moment; `blowOut()` puts a burning one out.
 */
export function createRoaster(camera, { reducedMotion = false } = {}) {
  const rig = new THREE.Group();
  rig.visible = false;
  camera.add(rig);
  // the stick runs from your hand, low and to the right, forward and down toward the fire
  // (the seat looks just under the hot spot, 1.5 m away: at full reach the tip is in it; at rest
  // it's well clear of the heat)
  const hand = new THREE.Vector3(0.2, -0.3, -0.3);
  const dir = new THREE.Vector3(-0.15, 0.25, -1).normalize();
  const REST = 0.55, REACH = 1.28;
  const stickMat = pbr({ color: PALETTE.bamboo, roughness: 0.75 });
  const stick = mesh(new THREE.CylinderGeometry(0.006, 0.009, 1, 6).translate(0, 0.5, 0), stickMat, rig);
  stick.castShadow = false;
  stick.position.copy(hand);
  stick.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const mallowMat = pbr({ color: PALETTE.cream, roughness: 0.7, emissive: PALETTE.coral, emissiveIntensity: 0 });
  const mallow = mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.065, 20), mallowMat, rig); // twice life size, so you can see it toast
  mallow.castShadow = false;
  const flame = createFire({ width: 0.12, height: 0.22, light: 0 });
  rig.add(flame.group);
  flame.group.visible = false;
  const state = { reach: 0, toast: 0, burning: false, on: true, respawn: 0, eating: 0 };
  const tip = new THREE.Vector3(), world = new THREE.Vector3(), c = new THREE.Color();
  const place = (len) => {
    stick.scale.set(1, len, 1);
    tip.copy(hand).addScaledVector(dir, len - 0.06);
    mallow.position.copy(tip);
    mallow.quaternion.copy(stick.quaternion);
    flame.group.position.copy(tip).add(new THREE.Vector3(0, 0.02, 0));
  };
  place(REST);
  return {
    rig,
    state,
    show(on) { rig.visible = on; if (on) { state.reach = 0; place(REST); } },
    /** Heat at the marshmallow, 0..1, for the hint and the glow. */
    heat: 0,
    update(dt, holding, hotSpot) {
      // reach in and pull back, a little slower going in (it's a long stick)
      const target = holding && state.on && !state.eating ? 1 : 0;
      state.reach = reducedMotion ? target : THREE.MathUtils.damp(state.reach, target, target ? 3.5 : 6, dt);
      place(REST + state.reach * (REACH - REST));
      // eating: it comes up to you and is gone; a fresh one goes on
      if (state.eating) {
        state.eating = Math.max(0, state.eating - dt);
        const k = 1 - state.eating / 0.5;
        mallow.position.lerp(new THREE.Vector3(0, -0.05, -0.12), Math.min(1, k * 1.2));
        mallow.scale.setScalar(Math.max(0.001, 1 - k));
        if (!state.eating) { state.on = false; state.respawn = 0.8; mallow.visible = false; }
      }
      if (!state.on) {
        state.respawn -= dt;
        if (state.respawn <= 0) { state.on = true; state.toast = 0; state.burning = false; mallow.visible = true; mallow.scale.setScalar(1); }
      }
      // heat: how near the flame's hot spot the marshmallow is
      mallow.getWorldPosition(world);
      const d = world.distanceTo(hotSpot);
      const heat = state.on && !state.eating ? THREE.MathUtils.clamp(1 - (d - 0.12) / 0.5, 0, 1) : 0;
      this.heat = heat;
      if (state.on && !state.eating) {
        state.toast += dt * (heat * heat * 0.2 + (state.burning ? 0.12 : 0));
        if (!state.burning && state.toast > 0.9 && heat > 0.55) state.burning = true;
        state.toast = Math.min(state.toast, 1.2);
      }
      flame.group.visible = state.burning && state.on && !state.eating;
      colourAt(state.toast, c);
      mallowMat.color.copy(c);
      mallowMat.emissiveIntensity = heat * 0.3 + (state.burning ? 0.12 : 0);
      mallow.scale.setScalar(state.eating ? mallow.scale.x : 1 + Math.min(state.toast, 0.6) * 0.25); // it puffs up as it toasts
    },
    /** Eat what's on the stick. Returns its toast level, or null if there's nothing to eat. */
    eat() {
      if (!state.on || state.eating) return null;
      state.burning = false;
      state.eating = reducedMotion ? 0.001 : 0.5;
      return state.toast;
    },
    blowOut() { state.burning = false; },
  };
}
