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
import { buildPlanetSky } from './sky.js';
import { overviewFrame } from './overview.js';
import { pickThing } from './picking.js';
import { advanceWalking } from './motion.js';
import { readSpec, tellCard } from '../world/spec.js';
import { line } from '../../../supabase/functions/_shared/planet.js';
import { buildGround } from './ground.js';
import { buildThings } from './things.js';
import { loadModels, loadSceneAssets } from './models.js';
import { buildPaths } from './paths.js';
import { buildStargazing } from './stargazing.js';
import { makeRain } from './rain.js';

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
  renderer.info.autoReset = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(coarse ? 72 : spec.arrival === 'overview'||spec.reveal ? 54 : 68, 1, 0.05, 2000);
  const time = { value: 0 };
  const look = spec.look || {}, sky = look.sky || {};
  const atmosphere = buildPlanetSky(sky,quality,time), space = atmosphere.group;
  if(sky.weather==='rain') {
    scene.fog=new THREE.FogExp2(atmosphere.fill,.027);
    scene.add(makeRain(time,matchMedia('(prefers-reduced-motion: reduce)').matches));
  }
  space.traverse(o=>o.layers.enable(2)); // the telescope sees sky, not foreground fronds or its own barrel
  scene.add(space);
  // cool starlight from one side and a little from all round, so the ground reads at night
  // its shadows follow you: a small square of ground round where you stand, sharp up close
  const SUN = new THREE.Vector3(0.55, 0.62, 0.56).normalize();
  const sun = new THREE.DirectionalLight(atmosphere.key, atmosphere.keyStrength);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(quality.high ? 2048 : 1024);
  Object.assign(sun.shadow.camera, { left: -16, bottom: -16, right: 16, top: 16, near: 1, far: 90 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target, new THREE.HemisphereLight(atmosphere.fill, 0x15161e, (spec.things || []).length ? atmosphere.fillStrength : 0.8));
  // a soft room's reflections, so metal, gloss and glass have something to show; dim, it's night
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = atmosphere.environment;
  pmrem.dispose();
  const ground = buildGround(spec.slug, { quality, time, ...look.ground });
  scene.add(ground.mesh);
  // what their AI made for them from what they love (things.js); none, and the planet is bare
  let library;
  try { say('Planting the scene…');library=await loadSceneAssets(spec); }
  catch { return fail('The scene’s trees could not load. Please reload to try again.', ['required scene asset unavailable']); }
  const things = buildThings(spec.things, ground.surface, library);
  scene.add(things.group);
  ground.dress(spec.things||[]);
  // worn paths from where you land to each of their places (paths.js)
  const paths = buildPaths(spec.things || [], things.placed, ground.surface, look.ground && look.ground.color, spec.routes);
  if (paths) scene.add(paths);
  if ((spec.things || []).length) hint.dataset.things = '';
  // Frame the finished available objects, not placeholders that change after the first reveal.
  // New models still being made keep their shapes and arrive through the existing later path.
  say('Putting the finishing touches in place…');
  const models = loadModels(spec, things);
  try { await models; }
  catch { return fail('The scene’s models could not load. Please reload to try again.', ['required model unavailable']); }

  // where a tap means to walk: a ring on the ground, fading as you arrive
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
  scene.add(ring);

  const player = new Player(camera, { colliders: [...things.colliders, ...ground.colliders], surface: ground.surface });
  const UP = new THREE.Vector3(0, 1, 0);
  const overview = spec.arrival === 'overview'||!!spec.reveal;
  const walkingEye = player.eye;
  let opening = null, openingUntouched = true, revealFocus=spec.reveal;
  function frameOpening(loadingLook=true) {
    opening=overviewFrame(spec.things||[],{aspect:innerWidth/innerHeight,fov:camera.fov,height:innerHeight,surface:ground.surface,colliders:[...things.colliders,...ground.colliders],focusId:revealFocus});
    if(opening){player.eye=opening.eye;player.spawn(opening.dir,opening.target,opening.pitch);if(loadingLook)player.look(window.__veilLook||0,0);}
  }
  if (overview) frameOpening();
  else player.spawn(UP,new THREE.Vector3(0,ground.surface(UP),-10),-.18);
  if(!overview) player.look(window.__veilLook || 0, 0); // face where they looked while it loaded
  player.enabled = true;

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let walked = false;
  const aim = (x, y) => {
    ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(ground.mesh, false)[0];
    const best=pickThing(ray,spec.things||[],things.pickable,hit?hit.distance+.01:Infinity,seat?.id);
    return best ? { thing: best } : hit && !ground.isWater(hit.point.clone().normalize()) ? { point: hit.point } : null;
  };

  // What a thing does once you're there (use): sit on it, facing the way it faces, or switch its
  // light. Sitting down and getting up are body motions from and to the walking view, never cuts
  // (unless they'd rather less motion); seated, you can look round, and any walk gets you up.
  const EYE = walkingEye, SEATED = 1.3, still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let seat = null, move = null, arriving = overview, scope = null, detail = null;
  const revealView=$('reveal-view');
  if(spec.reveal) {
    revealView.hidden=false;
    revealView.addEventListener('click',()=>{
      if(move||seat||scope)return;
      player.stop();close();revealFocus=revealFocus?null:spec.reveal;
      arriving=true;openingUntouched=true;frameOpening(false);
      revealView.textContent=revealFocus?'Whole place':'See addition';
    });
  }
  let stargazing, scopeHistory=false;
  const scopeFov=()=>Math.max(18,2*Math.atan(Math.tan(9*Math.PI/180)/Math.min(1,camera.aspect))*180/Math.PI);
  const detailButton = $('details');
  function showDetailsFor(t) { detail=t; detailButton.textContent=t.name; detailButton.setAttribute('aria-label',`About ${t.name}`); detailButton.hidden=false; }
  detailButton.addEventListener('click',()=>detail && open(detail));
  const frontOf = (t) => new THREE.Vector3(0, 0, 1).applyQuaternion(t.root.quaternion);
  // a body standing at `at`, facing along `dir` (the player's own -Z forward, +Y up)
  const facing = (at, dir) => {
    const up = at.clone().normalize(), back = dir.clone().addScaledVector(up, -dir.dot(up)).normalize().negate();
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(up, back), up, back));
  };
  const glide = (to, then) => {
    player.stop();
    const angle=player.quat.angleTo(to.quat)+Math.abs((to.pitch ?? player.pitch)-player.pitch);
    const duration=Math.max(1.3,1.5*angle/(140*Math.PI/180),player.pos.distanceTo(to.pos)/3);
    move = { from: { pos: player.pos.clone(), quat: player.quat.clone(), eye: player.eye, pitch: player.pitch }, to, t: 0, dur: still ? 0 : duration, then };
  };
  function sit(t) {
    const f = frontOf(t), at = t.center.clone().addScaledVector(f, 0.1 * (t.scale || 1));
    const eye=t.seatView?.eye ?? SEATED,target=spec.things.find(a=>a.id===t.seatView?.toward);
    let direction=f,pitch=t.seatView?.pitch ?? -.18;
    if(target) {
      target.root.updateWorldMatrix(true,true);
      const up=at.clone().normalize(),to=new THREE.Box3().setFromObject(target.root).getCenter(new THREE.Vector3()).sub(at.clone().addScaledVector(up,eye));
      if(to.clone().addScaledVector(up,-to.dot(up)).lengthSq()>1e-8) {
        direction=to;pitch=THREE.MathUtils.clamp(Math.asin(to.clone().normalize().dot(up)),-1,.6);
      }
    }
    glide({ pos: at, quat: facing(at, direction), eye, pitch }, () => { seat = t; $('stand').hidden = false; showDetailsFor(t); });
  }
  function stand(then) {
    detailButton.hidden=true;
    if (scope) return leaveScope(then);
    if (!seat) return then && then();
    const t = seat, at = player.clearOf(t.center.clone().addScaledVector(frontOf(t), t.reach + 0.5));
    seat = null;
    $('stand').hidden = true;
    glide({ pos: at, quat: facing(at, player.forward()), eye: EYE }, then);
  }
  function lookThrough(t) {
    stargazing ||= buildStargazing();
    if (!stargazing.group.parent) scene.add(stargazing.group);
    const target=stargazing.show(t);
    scope={id:t.id,from:{pos:player.pos.clone(),quat:player.quat.clone(),eye:player.eye,pitch:player.pitch},fov:camera.fov,layers:camera.layers.mask};
    const at=t.root.localToWorld(new THREE.Vector3(0,0,-1.1));
    at.normalize().multiplyScalar(ground.surface(at));
    const direction=target.clone().sub(at), up=at.clone().normalize();
    const pitch=Math.asin(direction.clone().normalize().dot(up));
    close(); showDetailsFor(t);
    glide({pos:at,quat:facing(at,direction),eye:1.4,pitch},()=>{
      camera.fov=scopeFov(); camera.updateProjectionMatrix();
      camera.layers.set(2);
      history.pushState({...history.state,planetScope:true},'',location.href); scopeHistory=true;
      root.dataset.state='scope'; $('scope-caption').hidden=false;
      $('stand').textContent='Step back'; $('stand').hidden=false;
    });
  }
  function leaveScope(then) {
    const keep=scope; scope=null;
    if(scopeHistory) { scopeHistory=false; history.back(); }
    stargazing.hide(); camera.fov=keep.fov; camera.layers.mask=keep.layers; camera.updateProjectionMatrix();
    root.dataset.state='walk'; $('scope-caption').hidden=true;
    $('stand').hidden=true; $('stand').textContent='Stand up';
    glide(keep.from,then);
  }
  addEventListener('popstate',()=>{if(scope && scopeHistory){scopeHistory=false;leaveScope();}});
  function flip(t) {
    const on = t.lamp.intensity === 0;
    t.lamp.userData.on ??= t.lamp.intensity;
    t.lamp.intensity = on ? t.lamp.userData.on : 0;
    // and whatever glows on it, as a lamp's bulb does
    t.root.traverse((o) => {
      const m = o.isMesh && o.material;
      if (!m || !m.emissive || !m.emissive.getHex()) return;
      m.userData.glow ??= m.emissiveIntensity;
      m.emissiveIntensity = on ? m.userData.glow : 0;
    });
  }
  $('stand').addEventListener('click', () => stand());
  // a tap on one of their things: walk up to it and say what it is, then do what it does
  function go(t) {
    detailButton.hidden=true;
    if (t.use) close(); else open(t);
    // up to it from where you are (its front can face something close: a bench, the oven), and a
    // seat takes you the last step
    const near = t.center.clone().lerp(camera.position, Math.min(0.9, (t.reach + 1.4) / Math.max(1, t.center.distanceTo(camera.position))));
    const there = () => {
      if (t.use === 'sit') return sit(t);
      player.face(t.center);
      if (t.use === 'switch' && t.lamp) { flip(t); showDetailsFor(t); }
      if (t.use === 'greet') { things.greet(t,camera.position,still); showDetailsFor(t); }
      if (t.use === 'look') lookThrough(t);
    };
    // stopped by something on the way but close (the van beside the camp chairs): close enough
    player.walkTo(player.clearOf(near), { onArrive: there, onStuck: () => player.pos.distanceTo(t.center) < t.reach + 3 && there() });
  }

  function act(at) {
    if (!walked) { walked = true; hint.classList.add('is-gone'); }
    if (at.thing) return go(at.thing);
    close();
    const to = player.clearOf(at.point);
    player.walkTo(to);
    ring.position.copy(to).addScaledVector(to.clone().normalize(), 0.03);
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), to.clone().normalize());
    ring.material.opacity = 0.8;
  }
  canvas.addEventListener('pointerdown',()=>{openingUntouched=false;});
  bindInput(player, canvas, {
    onTap(x, y) {
      openingUntouched=false;
      if (scope) return; // lens contents are a view; its controls, Escape or walking return
      const at = aim(x, y);
      if (!at || move) return;
      if (seat && at.thing === seat) return open(seat);
      // seated, a tap elsewhere gets you up first, then goes there
      if (arriving) {
        arriving = false;
        // The first reveal is a stable view of the assembled place. Only the visitor's first
        // tap brings them down to walking height; never a camera flight over the reveal.
        return glide({ pos: player.pos.clone(), quat: player.quat.clone(), eye: EYE, pitch: -0.18 }, () => act(at));
      }
      stand(() => act(at));
    },
    onHover(x, y) { canvas.classList.toggle('is-pointing', !scope && x !== null && !!(aim(x, y) || {}).thing); },
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
  addEventListener('keydown', (e) => { if (e.key === 'Escape') { close(); stand(); } });

  // the site's own look (world/render.js): ambient occlusion on computers, glow that blooms
  const pipeline = createPipeline(renderer, scene, camera, { ...quality, N8AOPostPass: await aoIn, tone: ToneMappingMode.ACES_FILMIC, bloom: 0.6 });
  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    pipeline.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    if (overview && arriving && openingUntouched) frameOpening();
    if (scope && root.dataset.state==='scope') camera.fov=scopeFov();
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  resize();

  let last = performance.now(), frames = 0;
  renderer.setAnimationLoop((now) => {
    const real = Math.min(0.25, (now - last) / 1000), dt = Math.min(0.05, real);
    last = now;
    if (!TEST) time.value = now / 1000;
    if (move) {
      // sitting down or getting up: one smooth motion, easing in and out, by the clock (a slow
      // phone draws fewer frames of it, never a slower one)
      move.t += real;
      const k = move.dur ? Math.min(1, move.t / move.dur) : 1, e = k * k * (3 - 2 * k);
      player.pos.lerpVectors(move.from.pos, move.to.pos, e);
      player.quat.slerpQuaternions(move.from.quat, move.to.quat, e);
      player.eye = THREE.MathUtils.lerp(move.from.eye, move.to.eye, e);
      if (move.to.pitch !== undefined) player.pitch = THREE.MathUtils.lerp(move.from.pitch, move.to.pitch, e);
      if (k === 1) { const then = move.then; move = null; if (then) then(); }
    } else if (scope) {
      if (player.keys.x || player.keys.z) leaveScope();
    } else if (seat) {
      if (player.keys.x || player.keys.z) stand(); // a step gets you up
    } else {
      if (arriving && (player.keys.x || player.keys.z)) { arriving = false; glide({pos:player.pos.clone(),quat:player.quat.clone(),eye:EYE,pitch:-0.18}); }
      advanceWalking(player,real,()=>!!(move||seat||scope));
    }
    things.update(now / 1000);
    if(spec.reveal)revealView.disabled=!!(move||seat||scope);
    player.applyToCamera(now / 1000);
    space.position.copy(camera.position); // the sky is infinitely far away
    sun.target.position.copy(player.pos);
    sun.position.copy(player.pos).addScaledVector(SUN, 40);
    if (ring.material.opacity > 0) ring.material.opacity = player.target ? 0.8 : Math.max(0, ring.material.opacity - dt * 2);
    renderer.info.reset();
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
    const shots = [], keep = { pos: camera.position.clone(), q: camera.quaternion.clone(), up: camera.up.clone(),layers:camera.layers.mask };
    camera.layers.set(0);
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
    camera.layers.mask=keep.layers;
    space.position.copy(camera.position);
    return { text: `${spec.who.name}'s planet as drawn: ${named.map((x, i) => `${i + 1}. ${x}`).join('; ')}.`, images: shots };
  }
  // for tests: where on the screen one of their things is (its middle), or null if it's behind you
  const screenOf = (id) => {
    const t = (spec.things || []).find((x) => x.id === id);
    const p = t && new THREE.Box3().setFromObject(t.root).getCenter(new THREE.Vector3()).project(camera);
    return p && p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1 ? { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight } : null;
  };
  // Test-only current-view readback catches blank pixels which readiness cannot detect.
  const capture=TEST?()=>{pipeline.render(0);return canvas.toDataURL();}:undefined;
  window.__planet = { capture, ready: false, player, camera, ground, things, spec, open, screenOf, looks, models, opening:()=>opening, pickAt:(x,y)=>aim(x,y)?.thing?.id||null, seated: () => seat && seat.id, scoped:()=>scope && scope.id, busy: () => !!move, metrics: () => ({calls:renderer.info.render.calls,triangles:renderer.info.render.triangles}) };
}
