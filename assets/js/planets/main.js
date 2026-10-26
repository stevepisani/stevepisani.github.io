// A friend's planet (My Tiny Planet, docs/planets.md): its own world, not Steve's. Only the
// planet's size is shared (Steve, Oct 2026); there's no bar, sign, campfire, telescope, rocket,
// lagoon or machine here. Until a planet is built (by hand, for the first ten) it's bare: its own
// ground under the stars, walkable the way Steve's is (tap or click to walk, drag to look, WASD).
// Small on purpose (three.js and a few hundred lines), so the planet itself is the loading
// screen's next step and comes quickly; the launch screen (_layouts/planet.html) already lets you
// drag to look around, and you face where you looked when the planet appears.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ToneMappingMode } from 'postprocessing';
import { createPipeline, loadAO } from '../world/render.js';
import { Player, bindInput } from '../world/player.js';
import { buildSpace } from '../world/sky.js';
import { readSpec, tellCard } from '../world/spec.js';
import { line } from '../../../supabase/functions/_shared/planet.js';
import { buildGround } from './ground.js';
import { buildThings } from './things.js';
import { loadModels } from './models.js';

const $ = (id) => document.getElementById(id);
const root = $('planet'), canvas = $('planet-canvas'), veil = $('veil'), status = $('veil-status'), hint = $('hint'), card = $('thing');
const TEST = new URLSearchParams(location.search).has('test');
const coarse = matchMedia('(pointer: coarse)').matches;
const quality = { high: !coarse && innerWidth > 900 };
const aoIn = quality.high ? loadAO() : null; // ambient occlusion, computers only, asked for at once

const say = (text) => { status.textContent = text; };
const fail = (why, detail) => {
  root.dataset.state = 'failed';
  say(why);
  tellCard('failed', detail || [why]);
};

const { spec, errors = [] } = await readSpec(root, JSON.parse($('planet-data').textContent));
if (!spec) fail(/^There’s no/.test(errors[0]) ? errors[0] : `This planet can’t be drawn: ${errors[0]}${errors.length > 1 ? ` (and ${errors.length - 1} more)` : ''}`, errors);
else start(spec);

async function start(spec) {
  document.title = `${spec.who.name}: a tiny planet`;
  $('topbar-name').textContent = spec.who.name;
  $('topbar-line').textContent = spec.look && spec.look.home ? `A tiny planet in ${spec.look.home}` : 'A tiny planet';
  canvas.setAttribute('aria-label', `${spec.who.name}'s tiny planet. Click or tap to walk, drag to look around.`);

  let renderer;
  try {
    if (!document.createElement('canvas').getContext('webgl2')) throw new Error('no WebGL2');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch (e) {
    return fail('This browser can’t draw the planet in 3D.', ['no WebGL2']);
  }
  say('Shaping the planet…');
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(coarse ? 72 : 68, 1, 0.05, 2000);
  const time = { value: 0 };
  const look = spec.look || {}, sky = look.sky || {};
  const space = buildSpace({ quality, uniforms: { time }, tint: sky.color });
  scene.add(space);
  // cool starlight from one side and a little from all round, so the ground reads at night
  // its shadows follow you: a small square of ground round where you stand, sharp up close
  const SUN = new THREE.Vector3(0.55, 0.62, 0.56).normalize();
  const sun = new THREE.DirectionalLight(sky.light || 0xc8d6ff, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(quality.high ? 2048 : 1024);
  Object.assign(sun.shadow.camera, { left: -16, bottom: -16, right: 16, top: 16, near: 1, far: 90 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target, new THREE.HemisphereLight(sky.light || 0x9aa0b8, 0x15161e, (spec.things || []).length ? 1.1 : 0.8));
  // a soft room's reflections, so metal, gloss and glass have something to show; dim, it's night
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.2;
  pmrem.dispose();
  const ground = buildGround(spec.slug, { quality, ...look.ground });
  scene.add(ground.mesh);
  // what their AI made for them from what they love (things.js); none, and the planet is bare
  const things = buildThings(spec.things, ground.surface);
  scene.add(things.group);
  if ((spec.things || []).length) hint.dataset.things = '';
  // their real models, where they've been made (models.js), in place of the shapes as they come
  const models = loadModels(spec, things);

  // where a tap means to walk: a ring on the ground, fading as you arrive
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
  scene.add(ring);

  const player = new Player(camera, { colliders: things.colliders, surface: ground.surface });
  const UP = new THREE.Vector3(0, 1, 0);
  player.spawn(UP, new THREE.Vector3(0, ground.surface(UP), -10), -0.18); // looking a little down: the ground is what's theirs
  player.look(window.__veilLook || 0, 0); // face where they looked while it loaded
  player.enabled = true;

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let walked = false;
  const aim = (x, y) => {
    ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const thing = ray.intersectObjects(things.pickable, false)[0];
    const hit = ray.intersectObject(ground.mesh, false)[0];
    return thing && (!hit || thing.distance <= hit.distance + 0.01) ? { thing: thing.object.userData.thing } : hit ? { point: hit.point } : null;
  };
  bindInput(player, canvas, {
    onTap(x, y) {
      const at = aim(x, y);
      if (!at) return;
      if (at.thing) {
        // a tap on one of their things: walk up to it, and say what it is
        open(at.thing);
        const near = at.thing.center.clone().lerp(camera.position, Math.min(0.9, (at.thing.reach + 1.4) / Math.max(1, at.thing.center.distanceTo(camera.position))));
        player.walkTo(player.clearOf(near), { onArrive: () => player.face(at.thing.center) });
        if (!walked) { walked = true; hint.classList.add('is-gone'); }
        return;
      }
      close();
      const to = player.clearOf(at.point);
      player.walkTo(to);
      ring.position.copy(to).addScaledVector(to.clone().normalize(), 0.03);
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), to.clone().normalize());
      ring.material.opacity = 0.8;
      if (!walked) { walked = true; hint.classList.add('is-gone'); }
    },
    onHover(x, y) { canvas.classList.toggle('is-pointing', x !== null && !!(aim(x, y) || {}).thing); },
    onKeyAction() {},
  });

  // a thing's card: its name, their note, and the things it holds, in their words
  function open(thing) {
    const c = thing.collection && spec.collections && spec.collections[thing.collection];
    $('thing-name').textContent = thing.name;
    $('thing-note').textContent = thing.note || '';
    $('thing-note').hidden = !thing.note;
    $('thing-title').textContent = c ? c.title : '';
    $('thing-title').hidden = !c;
    const items = $('thing-items');
    items.replaceChildren(...((c && c.items) || []).slice(0, 40).map((x) => {
      const li = document.createElement('li');
      li.textContent = line(x);
      if (x && typeof x === 'object' && !Array.isArray(x)) {
        const more = [x.by, x.year, x.why || x.note].filter((v) => v !== undefined && v !== '').join(' · ');
        if (more) { const sm = document.createElement('small'); sm.textContent = more; li.append(sm); }
      }
      return li;
    }));
    card.hidden = false;
  }
  function close() { card.hidden = true; }
  $('thing-close').addEventListener('click', close);
  addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  // the site's own look (world/render.js): ambient occlusion on computers, glow that blooms
  const pipeline = createPipeline(renderer, scene, camera, { ...quality, N8AOPostPass: await aoIn, tone: ToneMappingMode.ACES_FILMIC, bloom: 0.6 });
  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    pipeline.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  resize();

  let last = performance.now(), frames = 0;
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!TEST) time.value = now / 1000;
    player.update(dt);
    things.update(now / 1000);
    player.applyToCamera(now / 1000);
    space.position.copy(camera.position); // the sky is infinitely far away
    sun.target.position.copy(player.pos);
    sun.position.copy(player.pos).addScaledVector(SUN, 40);
    if (ring.material.opacity > 0) ring.material.opacity = player.target ? 0.8 : Math.max(0, ring.material.opacity - dt * 2);
    pipeline.render(dt);
    // the launch screen goes once the first frames are drawn (shaders compile there), never over a frozen scene
    if (++frames === 3) {
      veil.classList.add('is-gone');
      setTimeout(() => { veil.hidden = true; }, 600);
      root.dataset.state = 'walk';
      tellCard('ready');
      window.__planet.ready = true;
      // in a chat's card, a few views of it go back to the AI that made it, to look at and fix
      // (after their models are in, so it sees what they'll see)
      if (window.parent !== window && (spec.things || []).length) Promise.all([models, new Promise((r) => setTimeout(r, 1500))]).then(() => tellCard('look', looks()));
    }
  });
  // A few views of the planet as drawn: from above where you land, then up to three of their
  // things, each from the side it faces, framed to fit. Each is drawn and read in one go, between
  // two frames, so the walk never shows them; small JPEGs, for a model to look at.
  function looks() {
    const shots = [], keep = { pos: camera.position.clone(), q: camera.quaternion.clone(), up: camera.up.clone() };
    const small = document.createElement('canvas'), ctx = small.getContext('2d');
    small.width = 512; small.height = Math.round(512 * innerHeight / innerWidth);
    const shoot = (from, at, up) => {
      camera.position.copy(from); camera.up.copy(up); camera.lookAt(at);
      space.position.copy(camera.position);
      sun.target.position.copy(at); sun.position.copy(at).addScaledVector(SUN, 40);
      pipeline.render(0);
      ctx.drawImage(canvas, 0, 0, small.width, small.height);
      shots.push(small.toDataURL('image/jpeg', 0.75).split(',')[1]);
    };
    const top = ground.surface(UP);
    shoot(new THREE.Vector3(0, top + 7, 7), new THREE.Vector3(0, top, -5), UP);
    const named = ['from above where you land, looking ahead'];
    for (const t of (spec.things || []).slice(0, 3)) {
      const n = t.center.clone().normalize(), box = new THREE.Box3().setFromObject(t.root);
      const mid = box.getCenter(new THREE.Vector3()), r = box.getBoundingSphere(new THREE.Sphere()).radius;
      // the side it faces: toward where you land, along the ground
      const face = UP.clone().addScaledVector(n, -n.dot(UP)).normalize();
      shoot(mid.clone().addScaledVector(face, r * 1.6 + 1).addScaledVector(n, r * 0.6), mid, n);
      named.push(t.name);
    }
    camera.position.copy(keep.pos); camera.quaternion.copy(keep.q); camera.up.copy(keep.up);
    space.position.copy(camera.position);
    return { text: `${spec.who.name}'s planet as drawn: ${named.map((x, i) => `${i + 1}. ${x}`).join('; ')}.`, images: shots };
  }
  // for tests: where on the screen one of their things is (its middle), or null if it's behind you
  const screenOf = (id) => {
    const t = (spec.things || []).find((x) => x.id === id);
    const p = t && new THREE.Box3().setFromObject(t.root).getCenter(new THREE.Vector3()).project(camera);
    return p && p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1 ? { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight } : null;
  };
  window.__planet = { ready: false, player, camera, ground, things, spec, open, screenOf, looks, models };
}
