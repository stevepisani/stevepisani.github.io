// A friend's planet (My Tiny Planet, docs/planets.md): its own world, not Steve's. Only the
// planet's size is shared (Steve, Oct 2026); there's no bar, sign, campfire, telescope, rocket,
// lagoon or machine here. Until a planet is built (by hand, for the first ten) it's bare: its own
// ground under the stars, walkable the way Steve's is (tap or click to walk, drag to look, WASD).
// Small on purpose (three.js and a few hundred lines), so the planet itself is the loading
// screen's next step and comes quickly; the launch screen (_layouts/planet.html) already lets you
// drag to look around, and you face where you looked when the planet appears.
import * as THREE from 'three';
import { Player, bindInput } from '../world/player.js';
import { buildSpace } from '../world/sky.js';
import { readSpec, tellCard } from '../world/spec.js';
import { line } from '../../../supabase/functions/_shared/planet.js';
import { buildGround } from './ground.js';
import { buildThings } from './things.js';

const $ = (id) => document.getElementById(id);
const root = $('planet'), canvas = $('planet-canvas'), veil = $('veil'), status = $('veil-status'), hint = $('hint'), card = $('thing');
const TEST = new URLSearchParams(location.search).has('test');
const coarse = matchMedia('(pointer: coarse)').matches;
const quality = { high: !coarse && innerWidth > 900 };

const say = (text) => { status.textContent = text; };
const fail = (why, detail) => {
  root.dataset.state = 'failed';
  say(why);
  tellCard('failed', detail || [why]);
};

const { spec, errors = [] } = await readSpec(root, JSON.parse($('planet-data').textContent));
if (!spec) fail(/^There’s no/.test(errors[0]) ? errors[0] : `This planet can’t be drawn: ${errors[0]}${errors.length > 1 ? ` (and ${errors.length - 1} more)` : ''}`, errors);
else start(spec);

function start(spec) {
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
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(coarse ? 72 : 68, 1, 0.05, 2000);
  const time = { value: 0 };
  const look = spec.look || {}, sky = look.sky || {};
  const space = buildSpace({ quality, uniforms: { time }, tint: sky.color });
  scene.add(space);
  // cool starlight from one side and a little from all round, so the ground reads at night
  const sun = new THREE.DirectionalLight(sky.light || 0xc8d6ff, 2.2);
  sun.position.set(0.55, 0.62, 0.56).multiplyScalar(100);
  scene.add(sun, new THREE.HemisphereLight(sky.light || 0x9aa0b8, 0x15161e, (spec.things || []).length ? 1.4 : 0.8));
  const ground = buildGround(spec.slug, { quality, ...look.ground });
  scene.add(ground.mesh);
  // what their AI made for them from what they love (things.js); none, and the planet is bare
  const things = buildThings(spec.things, ground.surface);
  scene.add(things.group);
  if ((spec.things || []).length) hint.dataset.things = '';

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

  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
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
    if (ring.material.opacity > 0) ring.material.opacity = player.target ? 0.8 : Math.max(0, ring.material.opacity - dt * 2);
    renderer.render(scene, camera);
    // the launch screen goes once the first frames are drawn (shaders compile there), never over a frozen scene
    if (++frames === 3) {
      veil.classList.add('is-gone');
      setTimeout(() => { veil.hidden = true; }, 600);
      root.dataset.state = 'walk';
      tellCard('ready');
      window.__planet.ready = true;
    }
  });
  // for tests: where on the screen one of their things is (its middle), or null if it's behind you
  const screenOf = (id) => {
    const t = (spec.things || []).find((x) => x.id === id);
    const p = t && new THREE.Box3().setFromObject(t.root).getCenter(new THREE.Vector3()).project(camera);
    return p && p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1 ? { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight } : null;
  };
  window.__planet = { ready: false, player, camera, ground, things, spec, open, screenOf };
}
