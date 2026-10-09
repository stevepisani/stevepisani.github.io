// Smoke test: drives the built site in a real browser and fails on anything broken. It serves
// the build itself (`_site`, or the folder given), loads every page, then walks the homepage's
// planet through each thing a visitor can do, on desktop and on a phone, the private apps
// against a made-up Supabase, and checks the no-WebGL fallback. Nothing leaves the machine:
// every request outside the build is refused, so it runs offline and never writes to Supabase. WebGL runs on SwiftShader (software), so
// the planet is driven through `window.__world` with `?test=1` and reduced motion.
//
//   npm run build && bundle exec jekyll build && npm test            (CI does this)
//   node tools/smoke.mjs [_site] [--shots <dir>] [--only desktop|phone|pages|apps|nogl]
//
// --shots saves a screenshot at each step, for looking at what changed.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, readdirSync } from 'node:fs';
import { join, extname, resolve, relative } from 'node:path';
import { buildLibrary } from './library.mjs';
import * as esbuild from 'esbuild';
import { wardrobeDb } from './wardrobe-db.mjs';
import { rpc, APP_URI } from '../supabase/functions/mcp/server.js';

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : null; };
const shotsDir = flag('--shots'), only = flag('--only');
const root = resolve(args[0] || '_site');
if (!existsSync(join(root, 'index.html'))) { console.error(`No built site at ${root}.`); process.exit(2); }
if (shotsDir) mkdirSync(shotsDir, { recursive: true });

// Steve's books for the sky, made up: a fixture Audible library and shelves, merged by the real
// tools/library.mjs (the real ones are synced daily). The merge first: a book on both lists is
// one book (Audible's, so its cover and date) on its listed shelf, a genre no shelf lists lands on the "*" shelf.
const library = buildLibrary(JSON.parse(readFileSync(new URL('./fixtures/listening.json', import.meta.url))), readFileSync(new URL('./fixtures/books.yml', import.meta.url), 'utf8'));
{
  const dune = library.read.filter((b) => b.title === 'Dune');
  if (dune.length !== 1 || !dune[0].id.startsWith('FIXTURE') || dune[0].shelf !== 'science-fiction') throw new Error('library: a book on both lists should be one book, the Audible one, on its listed shelf');
  if (library.read.find((b) => b.title === 'The Signal and the Noise').shelf !== 'data-and-craft') throw new Error('library: a genre no shelf lists should land on the "*" shelf');
  if (library.read.length !== 25 || library.now.length !== 2 || library.shelves.reduce((n, s) => n + s.count, 0) !== 25) throw new Error(`library: counts don't add up (${library.read.length} read, ${library.now.length} now)`);
  console.log(`library: ${library.read.length} read on ${library.shelves.length} shelves, ${library.now.length} reading now, merged as expected`);
}


// A static server for the build (what Pages does: /x serves x.html or x/index.html)
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.xml': 'application/xml', '.map': 'application/json', '.py': 'text/plain' };
const server = createServer((req, res) => {
  let p = join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  else if (!existsSync(p) && existsSync(p + '.html')) p += '.html';
  if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
}).listen(0);
const base = `http://localhost:${server.address().port}`;

const browserArgs = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const failures = [];
const step = (name) => console.log(`  · ${name}`);

async function session(name, contextOptions, fn, launchArgs = browserArgs) {
  console.log(`\n${name}`);
  const browser = await chromium.launch({ args: launchArgs });
  const context = await browser.newContext({ reducedMotion: 'reduce', ...contextOptions });
  // only the build: fonts, APIs, Supabase (REST and the fireflies' websocket) are refused
  await context.route((url) => !url.href.startsWith(base), (route) => route.abort());
  await context.routeWebSocket(/.*/, (ws) => ws.close());
  await context.route(`${base}/library.json`, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(library) }));
  const page = await context.newPage();
  const errors = [];
  // with where it was thrown (the first few frames), so a red run says where to look
  page.on('pageerror', (e) => errors.push(`page error: ${e.message}${e.stack ? `\n    ${e.stack.split('\n').slice(1, 6).map((l) => l.trim()).join('\n    ')}` : ''}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|ERR_BLOCKED|WebSocket|Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  let n = 0;
  const shot = async (label) => { if (shotsDir) await page.screenshot({ path: join(shotsDir, `${name.split(' ')[0]}-${String(++n).padStart(2, '0')}-${label}.png`), timeout: 180000 }); };
  try {
    await fn(page, shot);
    if (errors.length) throw new Error(errors.join('\n'));
    console.log('  ✓ fine');
  } catch (e) {
    failures.push(`${name}: ${e.message.split('\n').slice(0, 6).join('\n')}`);
    console.log(`  ✗ ${e.message.split('\n')[0]}`);
    await page.screenshot({ path: join(shotsDir || '.', `smoke-failed-${name.split(' ')[0]}.png`) }).catch(() => {});
  }
  await browser.close();
}

const until = (page, fn, arg, timeout = 120000) => page.waitForFunction(fn, arg, { timeout });
const flatText = (x) => x.replace(/\s+/g, ' ').trim(); // no-break spaces and line breaks as plain spaces
const expectState = async (page, s, timeout) => { await until(page, (s) => window.__world.state === s && !window.__world.cameraFlying, s, timeout); };

// Every page loads without a script error
async function pages(page) {
  const all = (function walk(d) { return readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; }); })(root)
    .filter((f) => f.endsWith('.html') && !relative(root, f).startsWith('recipe_tracker/') /* it only redirects */ && relative(root, f) !== 'index.html');
  for (const f of all) {
    const path = '/' + relative(root, f);
    await page.goto(base + path, { waitUntil: 'load' });
    await page.waitForTimeout(150);
  }
  step(`${all.length} pages load`);
  // the bookshelf: one list, by shelf in the library's order, nothing about how a book was read
  const lib = JSON.parse(readFileSync(join(root, 'library.json'), 'utf8'));
  await page.goto(base + '/bookshelf', { waitUntil: 'load' });
  const ids = await page.$$eval('section.books[id]', (els) => els.map((e) => e.id).filter((id) => id !== 'now'));
  const want = lib.shelves.filter((sh) => sh.count).map((sh) => sh.slug);
  if (ids.join() !== want.join()) throw new Error(`bookshelf: shelves ${ids} should be ${want}`);
  if (await page.$('.spine') || /read on paper|listened/i.test(await page.textContent('main'))) throw new Error('bookshelf: still tells read and listened apart');
  step(`bookshelf: ${ids.length} shelves in order, ${lib.read.length} books`);
}

// The planet, everything a visitor can do
async function planet(page, shot, { phone = false } = {}) {
  const t0 = Date.now();
  await page.goto(base + '/?test=1');
  await until(page, () => window.__sceneReady, null, 240000);
  step(`scene up in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  await shot('arrive');

  // a section from the top bar opens as a panel, and closes
  if (phone) { await page.click('#menu-btn'); await page.click('#menu a[data-order="about"]'); }
  else await page.click('#topbar a[data-order="about"]');
  await until(page, () => !document.getElementById('panel').hidden);
  await shot('panel');
  await page.keyboard.press('Escape');
  await until(page, () => document.getElementById('panel').hidden);
  step('a section opens from the top bar and closes');

  // tap the bar: walk over and sit
  const tap = async (xy) => (phone ? page.touchscreen.tap(...xy) : page.mouse.click(...xy));
  const onScreen = (id) => page.evaluate((id) => {
    const W = window.__world, it = W.interactables.find((i) => i.id === id);
    const p = it.point.clone().project(W.camera), r = document.getElementById('world-canvas').getBoundingClientRect();
    return [r.left + ((p.x + 1) / 2) * r.width, r.top + ((1 - p.y) / 2) * r.height];
  }, id);
  await tap(await onScreen('seat'));
  await expectState(page, 'seat', 600000);
  await shot('seated');
  step('tap the bar: walked over and sat down');

  // pick up the menu, order, the panel pours out of the mug, back to the menu, put it down, leave
  await tap(await onScreen('menu'));
  await until(page, () => window.__world.menuHeld && !document.getElementById('menu').hidden);
  await page.click('#menu a[data-order="lab"]');
  await until(page, () => !document.getElementById('panel').hidden, null, 60000);
  await shot('ordered');
  await page.click('#panel-close');
  await until(page, () => document.getElementById('panel').hidden && !document.getElementById('menu').hidden, null, 60000);
  await page.click('#menu-close');
  await until(page, () => !window.__world.menuHeld && !window.__world.cardFlying);
  step('menu: picked up, ordered, served, put down');

  // the chalkboard: tap it and you lean in on it; tap a name and its recipe is chalked on a card;
  // Esc puts the card away; "Make me one" turns you to the robot, which makes it (skipped to the end)
  await tap(await onScreen('drinks'));
  await until(page, () => window.__world.board.on && !document.getElementById('board-back').hidden);
  await page.waitForTimeout(1500); // a frame or two at the board's view
  const nameAt = () => page.evaluate(() => { for (let y = 40; y < innerHeight; y += 5) for (let x = 10; x < innerWidth; x += 10) if (window.__world.board.rowAt(x, y) === 0) return [x, y]; return null; });
  const name = await nameAt();
  if (!name) throw new Error('chalkboard: no drink name on screen after leaning in');
  await tap(name);
  await until(page, () => !document.getElementById('board-card').hidden && window.__world.board.picked === 0);
  await shot('chalkboard');
  await page.keyboard.press('Escape');
  await until(page, () => document.getElementById('board-card').hidden && window.__world.board.on);
  await tap(name);
  await until(page, () => !document.getElementById('board-card').hidden);
  await page.click('#board-make');
  await until(page, () => window.__world.making && !window.__world.board.on && document.querySelectorAll('#making-build li').length > 0);
  await page.keyboard.press('Escape');
  await until(page, () => !window.__world.making, null, 60000);
  step('chalkboard: leaned in, read a recipe, the robot made it');

  // ask the bartender: your question shows in the transcript and, with every request outside the
  // site refused here, the robot says the bar's closed
  await until(page, () => !document.getElementById('chat').hidden);
  // something to ask is offered until you've asked; the box is 16 px (or iOS zooms in on it); going
  // to type turns you to face the bartender
  if (await page.isHidden('#chat-ask') || (await page.$$('#chat-ask button')).length < 2) throw new Error("the bar doesn't offer anything to ask");
  if (await page.$eval('#chat-input', (el) => parseFloat(getComputedStyle(el).fontSize)) < 16) throw new Error('the question box is under 16 px: iOS zooms into it');
  await page.focus('#chat-input');
  await until(page, () => window.__world.faceK > 0.99, null, 30000);
  await page.fill('#chat-input', 'What should I order?');
  await page.click('#chat button[type="submit"]');
  await until(page, () => document.getElementById('chat-ask').hidden);
  // offline (no Supabase here), so the house answers from the site's own facts: one of Steve's drinks
  await until(page, () => { const l = document.querySelectorAll('#chat-log li'); return l.length === 2 && /^Try the /.test(l[1].textContent); }, null, 60000);
  await shot('asked');
  // done typing (Done on a phone's keyboard): out of the box, "Leave the bar" is back
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await until(page, () => !document.getElementById('world').classList.contains('is-typing') && getComputedStyle(document.getElementById('seat-leave')).display !== 'none');
  step(`asked the bartender: the question showed, and offline the house answered ("${await page.textContent('#chat-log li:last-child')}")`);

  await page.click('#seat-leave');
  await expectState(page, 'walk', 120000);
  step('left the bar');

  // from behind the bar, a tap on it walks you round to the front, not into the counter, and sits you
  const back = await page.evaluate(() => {
    const W = window.__world, V = W.camera.position.constructor, b = W.bar.group;
    W.player.spawn(b.localToWorld(new V(0.8, 0, -4.6)).normalize(), b.localToWorld(new V(0, 1.4, 0)), -0.05);
    W.player.applyToCamera();
    W.camera.updateMatrixWorld(true);
    const p = b.localToWorld(new V(0, 1.6, -1.45)).project(W.camera), r = document.getElementById('world-canvas').getBoundingClientRect();
    return [r.left + ((p.x + 1) / 2) * r.width, r.top + ((1 - p.y) / 2) * r.height];
  });
  await tap(back);
  await until(page, () => window.__world.player.target && window.__world.player.target.legs.length > 1, null, 20000);
  await expectState(page, 'seat', 600000);
  await page.click('#seat-leave');
  await expectState(page, 'walk', 120000);
  step('from behind the bar: walked round to the front and sat down');

  // the campfire: sit, roast, eat, leave
  await page.evaluate(() => window.__world.sitAtFire());
  await expectState(page, 'camp');
  await page.evaluate(() => { window.__world.roaster.state.toast = 0.5; });
  await page.evaluate(() => window.__world.eatIt());
  await shot('fire');
  await page.evaluate(() => window.__world.leaveFire());
  await expectState(page, 'walk');
  step('campfire: sat, ate one, left');

  // the hammock: lie in it, the stars, the reading list, get up
  await page.evaluate(() => window.__world.lieInHammock());
  await until(page, () => window.__world.state === 'hammock' && window.__world.lying, null, 120000);
  await shot('hammock');
  // the book sky: lying back you look up and the stars gather into their shelves (the reading
  // list is a button away, and closing it brings you back to them); lean in on a shelf (the view
  // narrows, its titles come up, the strip names it, its newest book's card opens), step to the
  // next shelf, step through its books; Esc puts the card away, Esc again leans out; Back leans out too
  await until(page, () => window.__world.stars > 0, null, 60000);
  if (!(await page.isHidden('#panel'))) throw new Error('lying back opened the reading list: the stars come first');
  await until(page, () => window.__world.sky.settled, null, 60000);
  await page.click('#hammock-read');
  await until(page, () => !document.getElementById('panel').hidden, null, 60000);
  await page.keyboard.press('Escape');
  await until(page, () => document.getElementById('panel').hidden);
  const fov0 = await page.evaluate(() => window.__world.camera.fov);
  await page.evaluate(() => window.__world.zoom('science-fiction'));
  await until(page, (f) => window.__world.zoomK === 1 && window.__world.camera.fov < f - 10 && document.querySelector('.sky-label:not([hidden])'), fov0, 60000);
  if (await page.isHidden('#sky-shelf') || !(await page.textContent('#sky-name')).includes('Science Fiction')) throw new Error("leaning in on a shelf didn't show its name");
  await until(page, () => { const W = window.__world, r = W.sky.regions.find((x) => x.slug === 'science-fiction'); return W.starCard === r.books[0].book.title; }, null, 60000); // its newest book, without hunting for it
  await shot('shelf');
  // a title on screen is a tap target for its book
  const label = await page.evaluate(() => { const el = [...document.querySelectorAll('.sky-label:not([hidden]):not(.is-open)')][0]; if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left + 8, y: b.top + b.height / 2, title: el.textContent }; });
  if (!label) throw new Error('leaned in, no other titles showed');
  await tap([label.x, label.y]);
  await until(page, (t) => window.__world.starCard === t, label.title);
  await page.evaluate(() => window.__world.stepShelf(1));
  await until(page, () => window.__world.zoomed === 'fiction');
  await until(page, () => !document.getElementById('star-card').hidden, null, 60000);
  if (!(await page.textContent('#star-kind')).startsWith('Fiction')) throw new Error("a book's card doesn't name its shelf");
  const first = await page.textContent('#star-title');
  await page.click('#star-next');
  if ((await page.textContent('#star-title')) === first) throw new Error("the card's › didn't step to the next book");
  if (/paper|listen|audible/i.test(await page.textContent('#star-card'))) throw new Error('a card still says how the book was read');
  await shot('star');
  await page.keyboard.press('Escape');
  await until(page, () => document.getElementById('star-card').hidden && !document.getElementById('sky-shelf').hidden);
  await page.keyboard.press('Escape');
  await until(page, (f) => !window.__world.zoomed && window.__world.camera.fov === f && window.__world.state === 'hammock', fov0);
  await page.evaluate(() => window.__world.zoom('fiction'));
  await until(page, () => window.__world.zoomed === 'fiction' && location.hash === '#sky');
  await page.goBack();
  await until(page, () => !window.__world.zoomed && document.getElementById('sky-shelf').hidden);
  await page.goBack(); // and Back again gets you up
  await expectState(page, 'walk');
  step(`hammock: lay down, leaned in on a shelf and stepped through it (${await page.evaluate(() => window.__world.stars)} stars), got up`);

  // the telescope: bend to the eyepiece and the view opens on what it's pointed at, a card
  // says what; › swings it to the next; Esc steps back
  await page.evaluate(() => window.__world.scope.go());
  await until(page, () => window.__world.state === 'scope' && window.__world.scope.k === 1 && !document.getElementById('scope-card').hidden, null, 120000);
  const firstSight = await page.evaluate(() => window.__world.scope.target);
  if (!firstSight || await page.evaluate(() => window.__world.camera.fov >= 60)) throw new Error("the telescope didn't narrow onto anything");
  await shot('telescope');
  if (await page.evaluate(() => window.__world.scope.count) > 1) {
    await page.click('#scope-next');
    await until(page, (f) => window.__world.scope.target !== f, firstSight);
  }
  if (await page.evaluate(() => { const m = window.__world.interactables.find((i) => i.id === 'launch').mount; return !m.held; })) throw new Error("the telescope didn't swing round to what you're looking at");
  if (await page.isVisible('#scope-more')) throw new Error('the telescope card still offers something besides the sky');
  await page.keyboard.press('Escape');
  await expectState(page, 'walk');
  // launch control: the console by the rocket opens the launch panel (offline here, its screen
  // says so rather than counting down)
  await page.evaluate(() => window.__world.goUse('console'));
  await until(page, () => !document.getElementById('panel').hidden && document.getElementById('panel').dataset.id === 'launch', null, 120000);
  await shot('launch-control');
  await page.click('#panel-close');
  await until(page, () => document.getElementById('panel').hidden);
  await expectState(page, 'walk');
  // the door past the telescope: walk up and step through it into the real place (the real
  // splat, about a minute under software WebGL), look round, then step back out where you went
  // in. The planet stops drawing while you're through it, so wait by the clock, not by frames.
  if (!phone) {
    const tick = { timeout: 300000, polling: 500 };
    await page.evaluate(() => window.__world.goUse('door'));
    await page.waitForFunction(() => window.__world.door.inside, null, tick);
    if (await page.evaluate(() => location.hash) !== '#door') throw new Error("stepping through the door didn't add a history entry");
    if (!(await page.textContent('#portal-credit')).includes('CC BY 4.0') || await page.isHidden('#door-leave')) throw new Error('through the door: no credit for the scan, or no way back');
    const yaw0 = await page.evaluate(() => window.__world.door.view.yaw);
    await page.mouse.move(640, 400); await page.mouse.down(); await page.mouse.move(540, 400, { steps: 4 }); await page.mouse.up();
    await page.waitForFunction((y) => window.__world.door.view.yaw !== y, yaw0, tick);
    if (shotsDir) { const url = await page.evaluate(() => window.__world.door.view.snapshot()); writeFileSync(join(shotsDir, 'desktop-door.png'), Buffer.from(url.split(',')[1], 'base64')); }
    await page.evaluate(() => document.getElementById('door-leave').click()); // (page.click waits on frames, which crawl here)
    await page.waitForFunction(() => window.__world.state === 'walk' && !window.__world.cameraFlying && !document.querySelector('.portal-view'), null, tick);
    if (await page.evaluate(() => location.hash)) throw new Error("stepping back out didn't take the door's history entry back off");
  }
  // again, with the live views answering (made up: tools/fixtures/sky.json, a crescent with the
  // landing sites in the dark, the nearest full moon, and a stand-in picture for NASA's): the real
  // moon goes over the drawn one with its landing sites; tap one and the view narrows onto it, in
  // daylight (the full moon's picture); Esc goes back to the whole moon, then Back steps back
  const picture = readFileSync(join(root, 'assets/images/saturn-v-800.webp'));
  await page.route(/functions\/v1\/sky$/, (route) => route.fulfill({ contentType: 'application/json', body: readFileSync(new URL('./fixtures/sky.json', import.meta.url)) }));
  await page.route(/^https:\/\/(svs\.gsfc\.nasa\.gov|soho\.nascom\.nasa\.gov)\//, (route) => route.fulfill({ contentType: 'image/webp', body: picture }));
  const live = await page.evaluate(() => window.__world.scope.targets.includes('moon'));
  if (live) {
    await page.evaluate(() => window.__world.scope.go());
    await until(page, () => window.__world.scope.live && window.__world.scope.k === 1 && +document.getElementById('eyepiece-live').style.opacity > 0.9, null, 120000);
    if (await page.isHidden('#scope-live')) throw new Error("the card doesn't say the moon is live");
    const rings = await page.$$('.eyepiece__mark:not([hidden])');
    if (!rings.length) throw new Error('no landing sites on the moon');
    await shot('telescope-live');
    const fovMoon = await page.evaluate(() => window.__world.camera.fov);
    const ring = await rings[0].boundingBox();
    await tap([ring.x + ring.width / 2, ring.y + ring.height / 2]); // where it is (it's laid out again every frame)
    await until(page, (f) => window.__world.scope.site >= 0 && window.__world.camera.fov < f / 2, fovMoon, 60000);
    if (!/^Apollo/.test(await page.textContent('#scope-name'))) throw new Error("a landing site's card doesn't name it");
    if (!/full moon/.test(await page.textContent('#scope-note'))) throw new Error('a landing site in the dark should be shown at full moon');
    await shot('landing-site');
    await page.keyboard.press('Escape');
    await until(page, () => window.__world.scope.site === -1 && window.__world.state === 'scope');
    await page.goBack(); // Back steps back from the telescope
    await expectState(page, 'walk');
  }
  await page.unroute(/functions\/v1\/sky$/);
  step(`telescope: looked through it at ${firstSight.toLowerCase()}${live ? ', then the real moon and a landing site' : ''}, stepped back`);

  // skip a stone
  await page.evaluate(() => window.__world.goToShore());
  await until(page, () => window.__world.state === 'shore' && window.__world.stoneInHand, null, 120000);
  await page.evaluate(() => { window.__lastThrow = null; window.__world.throwStone(0.7); });
  await until(page, () => window.__lastThrow, null, 60000);
  await page.evaluate(() => window.__world.leaveShore());
  await expectState(page, 'walk');
  step(`skipped a stone (${await page.evaluate(() => `${window.__lastThrow.skips} skips`)})`);

  // a message in a bottle: written, rolled up, thrown (tests never write to the table)
  await page.evaluate(() => { const it = window.__world.interactables.find((i) => i.id === 'bottles'); window.__world.player.spawn(it.approach.clone().normalize(), it.point, 0); });
  await page.evaluate(() => window.__world.note.go());
  await until(page, () => window.__world.note.step === 'writing');
  await page.fill('#note-text', 'Smoke test: hello from the little planet.');
  await shot('note');
  await page.click('.note__roll');
  await until(page, () => window.__world.note.step === 'ready');
  if (!(await page.evaluate(() => window.__lastBottle && window.__lastBottle.message))) throw new Error('the bottle was not sent');
  await page.evaluate(() => window.__world.note.throwIt());
  await page.keyboard.press('Escape');
  await expectState(page, 'walk');
  step('wrote a message, threw the bottle');

  // physics: the engine loads, a coconut is picked up and thrown and lands on the ground
  await until(page, () => window.__world.physics, null, 120000);
  await page.evaluate(() => window.__world.goGrab(0));
  await until(page, () => window.__world.carrying, null, 300000);
  await page.evaluate(() => window.__world.toss(0.6));
  // software rendering is a few frames a second, and the physics never steps more than 0.1 s a
  // frame: wait for it to come down and slow to a roll rather than a fixed time
  await until(page, () => {
    const W = window.__world, it = W.physics.items[0], p = it.object.position, v = it.body && it.body.linvel();
    return v && p.length() - W.surfaceRadius(p.clone().normalize()) - it.radius < 0.3 && Math.hypot(v.x, v.y, v.z) < 1;
  }, null, 120000).catch(() => {});
  const landed = await page.evaluate(() => {
    const W = window.__world, it = W.physics.items[0], p = it.object.position;
    return { moved: p.distanceTo(it.home), above: p.length() - W.surfaceRadius(p.clone().normalize()) - it.radius };
  });
  if (!(landed.moved > 0.5) || Math.abs(landed.above) > 0.6) throw new Error(`the coconut didn't land: ${JSON.stringify(landed)}`);
  step(`threw a coconut ${landed.moved.toFixed(1)} m`);

  // the second coconut picked up brings the neon hoop, clear of everything; one dropped down
  // through its rim sets off the fireworks, and it flickers back out
  await page.evaluate(() => window.__world.goGrab(0));
  await until(page, () => window.__world.carrying, null, 300000);
  // its flicker-in runs on frames (0.1 s of it at most a frame), which crawl on a phone in CI
  await until(page, () => window.__world.hoop.state === 'up', null, 120000);
  const clearOf = await page.evaluate(() => {
    const W = window.__world, rim = W.hoop.rim, feet = rim.clone().addScaledVector(W.hoop.up, -2.6);
    return Math.min(...W.interactables.map((i) => i.point.distanceTo(feet)));
  });
  if (!(clearOf > 2)) throw new Error(`the hoop came down on top of something (${clearOf.toFixed(1)} m from it)`);
  await shot('hoop');
  await page.evaluate(() => {
    const W = window.__world, it = W.physics.items[0];
    W.putDown();
    W.physics.take(it);
    W.physics.release(it, W.hoop.rim.addScaledVector(W.hoop.up, 0.7), W.hoop.up.multiplyScalar(-1));
  });
  await until(page, () => window.__hoopScored === 1, null, 120000);
  await shot('fireworks');
  await until(page, () => window.__world.hoop.state === 'off', null, 120000);
  step('a second coconut brought the hoop; one through it set off fireworks, and it left');

  // the cutaway: from the end of the bridge, a tap on its middle walks you out onto
  // it (the deck counts as ground; nothing on the bridge takes the tap instead)
  const mid = await page.evaluate(() => {
    const W = window.__world, m = W.machine, g = m.group, V = g.position.constructor;
    W.player.spawn(g.localToWorld(new V(-6.5, 0, 0)).normalize(), m.platform, -0.35);
    W.player.applyToCamera(); W.camera.updateMatrixWorld(true);
    const p = g.localToWorld(new V(0, -0.08, 0)).project(W.camera), r = document.querySelector('canvas').getBoundingClientRect(); // the deck's surface, not just above it
    const xy = [r.left + ((p.x + 1) / 2) * r.width, r.top + ((1 - p.y) / 2) * r.height], hit = W.pick(...xy);
    return { xy, ground: !!(hit && hit.ground), thing: hit && hit.thing && hit.thing.id };
  });
  if (!mid.ground) throw new Error(`a tap on the bridge didn't land on it as ground (${mid.thing || 'nothing'})`);
  await tap(mid.xy);
  await until(page, () => !window.__world.player.target, null, 120000);
  const onMid = await page.evaluate(() => window.__world.player.pos.distanceTo(window.__world.machine.platform));
  if (!(onMid < 1)) throw new Error(`didn't walk out to the middle of the bridge (${onMid.toFixed(2)} m off)`);
  await page.evaluate(() => { window.__world.player.pitch = -1.2; });
  await shot('machine');
  step('tapped the middle of the bridge, walked out to it, looked down into the planet');

  // a long walk: from where you land to the campfire on the far side of the planet, round
  // whatever's in between (route.js), without stopping short
  const far = await page.evaluate(() => {
    const W = window.__world, P = W.player, it = W.interactables.find((i) => i.id === 'campfire');
    P.spawn(W.SPOTS.spawn, it.point, 0);
    const via = W.routeTo(it.approach);
    P.walkTo(it.approach, { arrive: 0.45, via });
    return { corners: via.length, metres: Math.round(P.pos.angleTo(it.approach) * P.pos.length()) };
  });
  await until(page, () => !window.__world.player.target, null, 240000);
  const short = await page.evaluate(() => { const W = window.__world; return W.player.pos.distanceTo(W.interactables.find((i) => i.id === 'campfire').approach); });
  if (!(short < 0.6)) throw new Error(`the walk to the campfire stopped ${short.toFixed(1)} m short`);
  step(`walked ${far.metres} m from where you land to the campfire, round ${far.corners} corners`);
}

// Signed in as a member, against a made-up Supabase (routed on `target`: the page, or its whole
// context so the service worker's requests are caught too) and a made-up Open-Meteo in Florence's
// timezone where every day is partly cloudy, 18° / 9° with a 40% chance of rain, except 15
// October: rain (70%), dry and cloudy until 2 PM, then rain, heaviest at 4, 10.5° by 8 PM. The trip has three travelers,
// two bags, a packing list (a garment, a baby's thing, a shared one, one nobody's, one of Lexi's,
// and one on a trip that isn't loaded, never shown), three journeys (the last a train to Siena on
// 16 October), two stays and a link; the days' record (tools/fixtures/events.json: a shirt worn
// at home, the trip's first day worn as planned and its line, and what the app adds); the euro is
// $1.1269 (Frankfurter, made up). By default the
// member is Steve (me(): his name, all four sections); `email` and `me` make someone else. Returns
// what was asked of it.
async function member(page, target, { email = 'member@example.com', me = { name: 'Steve', sections: ['today', 'closet', 'trips', 'recipes'] } } = {}) {
  const db = new URL(await page.getAttribute('meta[name="supabase-url"]', 'content'));
  const jwt = [{ alg: 'HS256', typ: 'JWT' }, { sub: 'u1', email, role: 'authenticated', exp: 4102444800 }, 'x'].map((p) => Buffer.from(JSON.stringify(p)).toString('base64url')).join('.');
  await page.addInitScript(([key, token, email]) => localStorage.setItem(key, JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: 4102444800, user: { id: 'u1', email, aud: 'authenticated', role: 'authenticated' } })), [`sb-${db.host.split('.')[0]}-auth-token`, jwt, email]);
  const table = JSON.parse(readFileSync(new URL('./fixtures/recipes.json', import.meta.url)));
  const closet = JSON.parse(readFileSync(new URL('./fixtures/wardrobe.json', import.meta.url)));
  // the trip's own row lost its packing list to trip_packing, and has who's going and each day's plans
  const tripTable = JSON.parse(readFileSync(new URL('./fixtures/trips.json', import.meta.url))).map(({ packing, ...t }) => ({
    ...t, laundry: null,
    travelers: [{ id: 'v1', key: 'steve', name: 'Steve', type: 'adult' }, { id: 'v2', key: 'lexi', name: 'Lexi', type: 'adult' }, { id: 'v3', key: 'dominic', name: 'Dominic', type: 'child' }],
    days: t.days.map((d) => (d.date === '2026-10-15' ? { ...d, activities: [{ id: 'a2', title: 'Dinner at Buca Mario', type: 'dining', start_time: '20:00' }, { id: 'a1', title: 'Uffizi', type: 'sightseeing', start_time: '09:30', end_time: '12:00' }] } : d)),
  }));
  const mine = { trip_id: 't1', owner: 'u1' };
  const tripParts = {
    trip_bags: [{ id: 'b1', key: 'steve_carry_on', label: "Steve's carry-on", type: 'carry_on', traveler_key: 'steve' }, { id: 'b2', key: 'checked_1', label: 'Checked bag', type: 'checked' }],
    trip_packing: [
      { id: 'p1', item_id: 'w1', category: 'clothing', traveler_key: 'steve', qty: 1, status: 'packed', bag_id: 'b1' },
      { id: 'p2', item_id: 'w2', category: 'clothing', traveler_key: 'steve', qty: 3, status: 'needed' },
      { id: 'p3', label: 'Diapers', category: 'baby', traveler_key: 'dominic', qty: 1, status: 'to_buy', essential: true, notes: 'Size 4' },
      { id: 'p4', label: 'Plug adapter', category: 'electronics', traveler_key: 'shared', qty: 2, status: 'ready', bag_id: 'b2' },
      { id: 'p5', label: 'Passports', category: 'documents', traveler_key: null, qty: 1, status: 'needed', essential: true },
      { id: 'p6', label: 'Sunscreen', category: 'toiletries', traveler_key: 'lexi', qty: 1, status: 'needed' },
      { id: 'p9', label: 'From a trip in the trash', category: 'misc', qty: 1, status: 'needed', trip_id: 'gone' },
    ],
    trip_transport: [
      { id: 'g2', type: 'train', date: '2026-10-14', origin: 'London', destination: 'Florence', departure_time: '2026-10-14T07:01:00+01:00', arrival_time: '2026-10-14T19:30:00+02:00', carrier: 'Eurostar', number: '9010' },
      { id: 'g1', type: 'flight', date: '2026-10-06', origin: 'Philadelphia', destination: 'London', origin_code: 'PHL', destination_code: 'LHR', departure_time: '2026-10-06T18:30:00-04:00', arrival_time: '2026-10-07T06:45:00+01:00', carrier: 'British Airways', number: 'BA 66', confirmation: 'XK7Q2B' },
      { id: 'g3', type: 'train', date: '2026-10-16', origin: 'Firenze Santa Maria Novella', destination: 'Siena', departure_time: '2026-10-16T09:10:00+02:00', arrival_time: '2026-10-16T10:38:00+02:00', carrier: 'Trenitalia', number: 'R 3127', confirmation: 'PZ4K7M' },
    ],
    trip_lodging: [
      { id: 'l1', name: 'Hotel Bloomsbury', place: 'London', check_in: '2026-10-07', check_out: '2026-10-14' },
      { id: 'l2', name: 'Florence Airbnb', place: 'Florence', address: 'Lungarno Acciaiuoli 4, 50123 Firenze', check_in: '2026-10-14', check_out: '2026-11-14', confirmation: 'HMQ3X9TZ', booking_url: 'https://www.airbnb.com/trips' },
    ],
    trip_resources: [{ id: 'r1', type: 'insurance', label: 'Travel insurance', url: 'https://insurance.example/policy' }],
  };
  for (const [k, rows] of Object.entries(tripParts)) tripParts[k] = rows.map((r, i) => ({ ...mine, created_at: `2026-10-01T12:00:0${i}Z`, ...r }));
  let made = 0;
  const photoTable = JSON.parse(readFileSync(new URL('./fixtures/wardrobe-photos.json', import.meta.url)));
  // what happened, a day at a time: a shirt worn at home, the first day of the trip worn as planned
  // and its line; what the app adds and trashes is kept here, so a reload shows it
  const eventTable = JSON.parse(readFileSync(new URL('./fixtures/events.json', import.meta.url)));
  // the files in Storage: every photo the fixtures name, the oxford's with its small and large
  // copies (its tag's without, so the app's fallback to the file itself is seen), and what's uploaded
  const stored = new Set([...closet.map((c) => c.photo_path), ...photoTable.map((f) => f.path)].filter(Boolean));
  for (const px of [512, 1080]) stored.add(`wardrobe/u1/oxford.jpg.w${px}`);
  const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const asked = [];
  await target.route(`${db.origin}/**`, (route) => {
    const req = route.request(), url = new URL(req.url()), method = req.method();
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const body = (() => { try { return req.postDataJSON(); } catch (e) { return null; } })(); // a photo isn't JSON
    asked.push({ method, path: url.pathname + url.search, body });
    if (url.pathname.endsWith('/rpc/is_member')) return json(true);
    if (url.pathname.endsWith('/rpc/me')) return json(me);
    // Storage, as it answers: an upload is kept; signing gives a link only for a file that's there;
    // a signed link is the picture
    const file = /\/storage\/v1\/object\/photos\/(.+)$/.exec(url.pathname);
    if (file && method === 'POST') stored.add(decodeURIComponent(file[1]));
    if (url.pathname.endsWith('/storage/v1/object/sign/photos') && method === 'POST') return json(body.paths.map((p) => (stored.has(p) ? { path: p, signedURL: `/object/sign/photos/${p}?token=t`, error: null } : { path: p, signedURL: null, error: 'Either the object does not exist or you do not have access to it' })));
    if (url.pathname.includes('/storage/v1/object/sign/photos/')) return route.fulfill({ contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: PIXEL });
    if (url.pathname.endsWith('/rest/v1/recipes')) {
      if (method === 'GET') return json(table);
      if (method === 'POST') return json(req.postDataJSON().map((r, i) => ({ id: `new-${i}`, cooked: false, rating: 0, created_at: new Date().toISOString(), ...r })), 201);
      return json(method === 'PATCH' ? [{ id: url.searchParams.get('id').slice(3) }] : []); // the row an update asks back for
    }
    if (url.pathname.endsWith('/rest/v1/wardrobe_closet')) return json(closet); // the flat view the app reads
    if (url.pathname.endsWith('/rest/v1/wardrobe_photos')) {
      if (method === 'GET') return json(photoTable.filter((f) => f.item_id === url.searchParams.get('item_id')?.slice(3)));
      if (method === 'POST') return json(req.postDataJSON().map((r, i) => ({ id: `new-f${i}`, owner: 'u1', created_at: new Date().toISOString(), ...r })), 201);
      return json(method === 'PATCH' ? [{ id: url.searchParams.get('id').slice(3) }] : []);
    }
    if (url.pathname.endsWith('/rest/v1/wardrobe_items')) {
      if (method === 'POST') return json(req.postDataJSON().map((r, i) => ({ id: `new-w${i}`, owner: 'u1', seasons: [], retired: false, created_at: new Date().toISOString(), ...r })), 201);
      return json(method === 'PATCH' ? [{ id: url.searchParams.get('id').slice(3) }] : []);
    }
    if (url.pathname.endsWith('/rest/v1/trips')) {
      if (method === 'GET') return json(tripTable);
      if (method === 'POST') return json(req.postDataJSON().map((r, i) => ({ id: `new-t${i}`, owner: 'u1', created_at: new Date().toISOString(), ...r })), 201);
      return json(method === 'PATCH' ? [{ id: url.searchParams.get('id').slice(3) }] : []);
    }
    if (url.pathname.endsWith('/rest/v1/events')) {
      if (method === 'GET') return json(eventTable.filter((e) => !e.deleted_at));
      if (method === 'POST') { const added = [].concat(req.postDataJSON()).map((r) => ({ owner: 'u1', deleted_at: null, ...r })); for (const r of added) { if (eventTable.some((e) => e.id === r.id)) return json({ code: '23505', message: 'duplicate key value violates unique constraint "events_pkey"' }, 409); eventTable.push(r); } return json(added, 201); }
      const e = eventTable.find((x) => x.id === url.searchParams.get('id')?.slice(3));
      if (method === 'PATCH' && e) Object.assign(e, req.postDataJSON());
      return json(e ? [{ id: e.id }] : []);
    }
    const part = /\/rest\/v1\/(trip_(?:packing|bags|transport|lodging|resources))$/.exec(url.pathname);
    if (part) {
      if (method === 'GET') return json(tripParts[part[1]]);
      if (method === 'POST') return json(req.postDataJSON().map((r) => ({ id: `new-p${++made}`, owner: 'u1', created_at: new Date().toISOString(), ...r })), 201);
      return json(method === 'PATCH' ? [{ id: url.searchParams.get('id').slice(3) }] : []);
    }
    // a store link, read: what the edge function answers for a page it can read
    // the consent page: one request from ChatGPT, one from somewhere else
    const auth = /\/auth\/v1\/oauth\/authorizations\/([^/]+)(\/consent)?$/.exec(url.pathname);
    if (auth) {
      if (auth[2]) return json({ redirect_url: `https://chatgpt.com/connector_platform_oauth_redirect?code=c&state=s` });
      const from = { gpt: 'https://chatgpt.com/connector_platform_oauth_redirect', claude: 'https://claude.ai/api/mcp/auth_callback' }[auth[1]] || 'https://evil.example/callback';
      return json({ authorization_id: auth[1], redirect_uri: from, client: { id: 'c1', name: { gpt: 'ChatGPT', claude: 'Claude' }[auth[1]] || 'Someone', uri: '', logo_uri: '' }, user: { id: 'u1', email: 'member@example.com' }, scope: 'openid email' });
    }
    if (url.pathname.endsWith('/functions/v1/wardrobe-link')) return json({ name: 'The Organic Cotton Crew | White', brand: 'Everlane', price: 30, currency: 'USD', link: 'https://www.everlane.com/products/crew', photo_path: null });
    return json([]); // signed links for photos: none
  });

  // Open-Meteo, made up: a place is wherever you ask; every request is kept in asked (as GET open-meteo)
  await target.route(/open-meteo\.com/, (route) => {
    const u = new URL(route.request().url()), json = (b) => route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(b) });
    asked.push({ method: 'GET', path: `open-meteo:${u.hostname.split('.')[0]}${u.search}` });
    if (u.hostname.startsWith('geocoding')) return json({ results: [{ name: u.searchParams.get('name').split(',')[0], country: 'Somewhere', latitude: 45, longitude: 9, timezone: 'Europe/Rome' }] });
    const from = new Date(u.searchParams.get('start_date') + 'T12:00:00Z'), to = new Date(u.searchParams.get('end_date') + 'T12:00:00Z'), time = [];
    for (let d = from; d <= to; d = new Date(d.getTime() + 864e5)) time.push(d.toISOString().slice(0, 10));
    const fill = (v) => time.map(() => v), wet = (d) => d === '2026-10-15';
    const daily = { time, temperature_2m_max: fill(18), temperature_2m_min: fill(9), precipitation_probability_max: time.map((d) => (wet(d) ? 70 : 40)), precipitation_sum: fill(u.searchParams.get('start_date').endsWith('5') ? 3 : 0) };
    if (u.hostname.startsWith('archive')) return json({ timezone: 'Europe/Rome', daily });
    Object.assign(daily, { weather_code: time.map((d) => (wet(d) ? 63 : 2)), apparent_temperature_max: fill(17), apparent_temperature_min: fill(7), sunrise: time.map((d) => `${d}T07:21`), sunset: time.map((d) => `${d}T18:39`), uv_index_max: fill(3), wind_speed_10m_max: fill(14) });
    const out = { timezone: 'Europe/Rome', utc_offset_seconds: 7200, daily };
    if (u.searchParams.get('hourly')) {
      const hours = [];
      for (let t = new Date(u.searchParams.get('start_hour') + ':00Z'); t <= new Date(u.searchParams.get('end_hour') + ':00Z'); t = new Date(t.getTime() + 36e5)) hours.push(t.toISOString().slice(0, 16));
      const at = (t) => { const d = t.slice(0, 10), h = +t.slice(11, 13), rain = wet(d) && h >= 14 && h <= 18 ? [60, 70, 80, 70, 60][h - 14] : 10; return { temp: h <= 6 ? 9 : h <= 15 ? 9 + h - 6 : Math.max(9, 18 - 1.5 * (h - 15)), rain, mm: rain >= 50 ? (h === 16 ? 2.5 : 0.8) : 0, code: rain >= 50 ? (h === 16 ? 63 : 61) : wet(d) ? 3 : 2, day: h >= 7 && h <= 18 ? 1 : 0 }; };
      const H = hours.map(at);
      out.hourly = { time: hours, temperature_2m: H.map((x) => x.temp), apparent_temperature: H.map((x) => x.temp - 1), precipitation_probability: H.map((x) => x.rain), precipitation: H.map((x) => x.mm), weather_code: H.map((x) => x.code), is_day: H.map((x) => x.day), wind_speed_10m: H.map(() => 8) };
    }
    return json(out);
  });
  // the day's exchange rate (Frankfurter, the ECB's): one euro in dollars; each request kept in asked
  await target.route(/api\.frankfurter\.dev/, (route) => {
    const u = new URL(route.request().url());
    asked.push({ method: 'GET', path: `frankfurter:${u.search}` });
    return route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ amount: 1, base: u.searchParams.get('base'), date: '2026-10-14', rates: { [u.searchParams.get('symbols')]: 1.1269 } }) });
  });
  return asked;
}

// A pull down from the top of the page, as a finger does it (real touch events, through the
// browser's own input), `by` pixels
async function pullDown(page, by = 260, { x = 195, y = 180 } = {}) {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, at) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: at == null ? [] : [{ x, y: at }] });
  await touch('touchStart', y);
  for (let i = 1; i <= 12; i++) { await touch('touchMove', y + (by * i) / 12); await page.waitForTimeout(16); }
  await touch('touchEnd');
  await cdp.detach();
}

// The private app (SJPJr, /apps), on a phone, against a made-up Supabase: its own frame
// (no site nav or footer: the badge and where you are), signed out only the sign-in form; signed
// in as Steve, Today first, then the recipe tracker (now its Recipes tab, reached from its old
// address) lists, searches, marks one cooked, saves notes and a rating, and adds one, and each of
// those asks the database for the right thing.
async function apps(page, shot) {
  await page.goto(base + '/apps/');
  await until(page, () => document.getElementById('app').dataset.state === 'out');
  if (await page.isVisible('#app-main')) throw new Error('the app shows without signing in');
  if (await page.$('.site-head, .site-foot, .site-nav') || !(await page.isVisible('#app-top #app-me img'))) throw new Error("an app page should have its own bar (the badge), not the site's nav and footer");
  if ((await page.textContent('#gate-title')) !== 'Sign in' || /members|private/i.test(await page.textContent('#app-gate'))) throw new Error(`the gate should be short and personal: ${flatText(await page.textContent('#app-gate'))}`);
  await shot('gate');
  step('signed out: its own bar with the badge, no site nav or footer, and only the sign-in form, said plainly');

  const asked = await member(page, page);
  await page.clock.setFixedTime(new Date('2026-09-01T10:00:00+02:00')); // before the trip, so Today is at home
  await page.goto(base + '/apps/recipes');
  await page.waitForURL(/\/apps\/#recipes$/);
  await until(page, () => document.querySelectorAll('#recipe-cards .item').length === 3 && !document.getElementById('recipes-view').hidden);
  if (!(await page.textContent('#recipe-tally')).includes('1 of 3') || (await page.textContent('#app-title')) !== 'Recipes' || !(await page.isVisible('#tabs a[data-value="recipes"][aria-current="page"]'))) throw new Error('the recipes tab: the cooked count, the title or the tab is wrong');
  await shot('recipes');
  step('/apps/recipes leads to the Recipes tab in SJPJr: 3 recipes, 1 cooked');

  await page.fill('#recipe-search', 'noodles');
  if ((await page.locator('#recipe-cards .item:visible').count()) !== 1) throw new Error("search didn't narrow the list to one");
  await page.fill('#recipe-search', '');
  step('search narrows the list');

  await page.locator('#recipe-cards .item:visible [data-do="cook"]:visible').first().click();
  await until(page, () => document.getElementById('recipe-tally').textContent.includes('2 of 3'));
  const cooked = asked.find((a) => a.method === 'PATCH');
  if (!cooked || cooked.body.cooked !== true || !/^\d{4}-\d\d-\d\d$/.test(cooked.body.date_cooked)) throw new Error(`marking one cooked sent ${JSON.stringify(cooked)}`);
  step('marked one cooked');

  // notes save themselves a moment after the typing stops; a star saves at once
  const first = page.locator('#recipe-cards .item:visible').first();
  await first.locator('[data-is="notes"]').fill('Smoke test note');
  await until(page, () => !document.querySelector('[data-save="saving"]'));
  await first.locator('.rating button').nth(6).click();
  await until(page, () => /7\/10/.test(document.querySelector('#recipe-cards .item .rating output').textContent));
  const sent = asked.filter((a) => a.method === 'PATCH').map((a) => a.body);
  if (!sent.some((b) => b.notes === 'Smoke test note') || !sent.some((b) => b.rating === 7)) throw new Error(`notes and a rating sent ${JSON.stringify(sent)}`);
  step('notes saved as typed, and a rating');

  // a photo is shrunk to a JPEG, stored under recipes/<id>/, and the recipe points at it
  await first.locator('.photo-btn input').setInputFiles({ name: 'dinner.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
  await until(page, () => document.querySelector('#recipe-cards .item .item__photo:not([hidden])'));
  const upload = asked.find((a) => a.method === 'POST' && a.path.includes('/object/photos/recipes/'));
  if (!upload || !upload.path.endsWith('.jpg') || !asked.some((a) => a.method === 'PATCH' && /^recipes\/.+\.jpg$/.test(a.body?.photo_path))) throw new Error(`adding a photo sent ${JSON.stringify(upload)}`);
  step('added a photo');

  // Enter in the dialog adds it (a link without https:// is fine); Cancel adds nothing
  await page.click('#recipe-add');
  await page.click('#recipe-add-dialog [data-close]');
  await page.click('#recipe-add');
  await page.fill('#recipe-add-dialog [name="title"]', 'Smoke test soup');
  await page.fill('#recipe-add-dialog [name="link"]', 'example.com/soup');
  await page.keyboard.press('Enter');
  await until(page, () => document.querySelectorAll('#recipe-cards .item').length === 4);
  if (asked.filter((a) => a.method === 'POST' && a.path.includes('/rest/v1/recipes')).length !== 1) throw new Error('cancelling the dialog added a recipe');
  await shot('added');
  step('added one with Enter; Cancel added nothing');

  // pull to refresh on the recipes: they're asked for again, and it says so
  const recipeGets = () => asked.filter((a) => a.method === 'GET' && a.path.startsWith('/rest/v1/recipes')).length;
  const gotRecipes = recipeGets();
  await page.evaluate(() => scrollTo(0, 0));
  await pullDown(page);
  await until(page, () => /^Updated/.test(document.getElementById('app-toast').textContent) && !document.getElementById('app-toast').hidden);
  if (recipeGets() !== gotRecipes + 1) throw new Error(`pulling down should reload the recipes once: ${recipeGets() - gotRecipes}`);
  step('pull to refresh reloads the recipes and says "Updated"');

  // an expired sign-in link says so (through the old address, which keeps a sign-in link's hash)
  await page.goto(base + '/apps/recipes#error=access_denied&error_code=otp_expired&error_description=expired');
  await page.waitForURL(/\/apps\/(#|$)/);
  await until(page, () => document.getElementById('app').dataset.state === 'in');
  if (!/expired/.test(await page.textContent('#gate-note')) || (await page.evaluate(() => location.hash))) throw new Error("an expired sign-in link wasn't explained");
  step('an expired sign-in link says so');

  // the wardrobe: the closet, a chip, an item's sheet saving as it's typed, adding from a store
  // link and from a photo (offline the cut-out can't load, so the photo is kept as taken), retiring.
  // The clock is set to five weeks before the fixture's trip: it opens on Today at home (the
  // greeting, nothing planned to wear, the weather in Philadelphia, the next trip a tap away), with
  // Steve's four tabs; then the closet.
  await page.clock.setFixedTime(new Date('2026-09-01T10:00:00+02:00'));
  await page.goto(base + '/apps/');
  await until(page, () => document.querySelector('#today-view .sky-panel') && !document.getElementById('today-view').hidden);
  const tabNames = await page.locator('#tabs a:visible').allTextContents();
  if (tabNames.join() !== 'Today,Closet,Trips,Recipes' || !(await page.isVisible('#tabs a[data-value="today"][aria-current="page"]')) || (await page.evaluate(() => location.hash))) throw new Error(`Steve's tabs, Today first and open with no address: ${tabNames}`);
  if ((await page.textContent('#app-title')) !== 'Good morning, Steve' || !/Tuesday/.test(await page.textContent('#app-over'))) throw new Error(`Today's greeting and date: ${await page.textContent('#app-title')} / ${await page.textContent('#app-over')}`);
  const home = flatText(await page.textContent('#today-view'));
  if (!/Nothing planned for today/.test(home) || (await page.textContent('.today-card__place')) !== 'Philadelphia' || !/Next trip.*Europe, autumn/.test(home) || (await page.locator('#today-view .trip-card').getAttribute('href')) !== '#trip/t1') throw new Error(`Today at home: ${home.slice(0, 400)}`);
  await shot('today-home');
  step('opens on Today with no address: "Good morning, Steve" and the date, what you\'re wearing, the weather at home, the next trip; four tabs');
  // with nothing planned (at home), Wore it asks what you wore: the closet to pick from (what's
  // retired left out), Save only once something's picked; one POST of that day, and Undo moves it
  // to the trash
  const dayPosts = () => asked.filter((a) => a.method === 'POST' && a.path.startsWith('/rest/v1/events'));
  const dayPatches = () => asked.filter((a) => a.method === 'PATCH' && a.path.startsWith('/rest/v1/events'));
  // a change shows at once and its request follows: wait for the request to have come in
  const landed = async (count, n, what) => { for (let i = 0; count() < n; i++) { if (i > 200) throw new Error(`${what} never went out`); await page.waitForTimeout(50); } };
  await page.click('.today-card .wore__btn');
  await until(page, () => document.getElementById('wore-sheet').open && document.querySelectorAll('#wore-grid .wore-pick').length === 3);
  if (!(await page.isDisabled('#wore-ok')) || (await page.locator('#wore-grid [aria-pressed="true"]').count()) || (await page.isVisible('#wore-clear'))) throw new Error('at home, Wore it should open the closet with nothing picked, Save waiting for a pick');
  await page.locator('#wore-grid .wore-pick', { hasText: 'Navy oxford shirt' }).click();
  await page.click('#wore-ok');
  await until(page, () => !document.getElementById('wore-sheet').open && document.querySelector('.wore__done')?.textContent === 'Worn today ✓');
  await landed(() => dayPosts().length, 1, 'Wore it at home');
  const homeWore = dayPosts().pop()?.body;
  if (!homeWore || homeWore.kind !== 'wore' || homeWore.date !== '2026-09-01' || homeWore.item_ids.join() !== 'w1' || homeWore.trip_id !== null || homeWore.source !== 'app' || homeWore.evidence.how !== 'picked the pieces' || !/^[0-9a-f-]{36}$/.test(homeWore.id)) throw new Error(`Wore it at home sent ${JSON.stringify(homeWore)}`);
  await page.click('.app-toast__undo');
  await until(page, () => document.querySelector('.today-card .wore__btn'));
  await landed(() => dayPatches().length, 1, 'Undo');
  const homeUndo = dayPatches().pop();
  if (!homeUndo || !homeUndo.path.includes(`id=eq.${homeWore.id}`) || !homeUndo.body.deleted_at || Object.keys(homeUndo.body).length !== 1) throw new Error(`Undo should move what was logged to the trash: ${JSON.stringify(homeUndo)}`);
  step('at home, Wore it asks what you wore (the closet, nothing picked), logs the day as one POST, and Undo moves it to the trash');
  await page.click('#tabs a[data-value="closet"]');
  await until(page, () => document.querySelectorAll('#grid .tile:not([hidden])').length === 3);
  if (!(await page.textContent('#cats')).includes('Shoes1')) throw new Error("the wardrobe's chips don't count the shoes");
  if ((await page.textContent('#app-title')) !== 'Closet' || !(await page.isVisible('#tabs a[data-value="closet"][aria-current="page"]'))) throw new Error("the wardrobe doesn't say it's on the closet");
  await shot('wardrobe');
  step('wardrobe: 3 in the closet (the retired one hidden), chips counted, the title and tab say where it is');
  // pull to refresh: from the top, the closet is asked for again and it says so; a drag that
  // starts lower down the page scrolls, and reloads nothing
  const closetGets = () => asked.filter((a) => a.method === 'GET' && a.path.startsWith('/rest/v1/wardrobe_closet')).length;
  const gotCloset = closetGets();
  await pullDown(page);
  await until(page, () => /^Updated/.test(document.getElementById('app-toast').textContent) && !document.getElementById('app-toast').hidden);
  if (closetGets() !== gotCloset + 1) throw new Error(`pulling down should reload the closet once: ${closetGets() - gotCloset}`);
  await page.evaluate(() => { document.body.style.minHeight = '3000px'; scrollTo(0, 400); });
  await pullDown(page);
  await page.waitForTimeout(400);
  await page.evaluate(() => { document.body.style.minHeight = ''; scrollTo(0, 0); });
  if (closetGets() !== gotCloset + 1) throw new Error('a drag that starts down the page reloaded the closet');
  step('pull to refresh on the closet reloads it ("Updated"); a drag further down the page doesn\'t');
  // a tile shows the photo's small copy, never the stored file (a 2 MB catalog PNG)
  const tileSrc = await page.getAttribute('#grid .tile img:not([hidden])', 'src');
  if (!/oxford\.jpg\.w512\?/.test(tileSrc || '')) throw new Error(`a tile shows ${tileSrc}, not the photo's small copy`);
  step("a tile shows its photo's small copy");
  await page.click('#cats button[data-value="shoes"]');
  if ((await page.locator('#grid .tile:visible').count()) !== 1) throw new Error("the Shoes chip didn't narrow the closet");
  await page.click('#cats button[data-value=""]');
  // the colours there are, as dots (navy, white, brown): one narrows the closet to it, again shows all
  if ((await page.locator('#swatches .swatch').count()) !== 3) throw new Error(`the colour dots: ${await page.locator('#swatches .swatch').count()}`);
  await page.click('#swatches .swatch[data-value="brown"]');
  if ((await page.locator('#grid .tile:visible').count()) !== 1 || !/loafers/.test(await page.textContent('#grid .tile:not([hidden])'))) throw new Error("the brown dot didn't narrow the closet to the loafers");
  await page.click('#swatches .swatch[data-value="brown"]');
  if ((await page.locator('#grid .tile:visible').count()) !== 3) throw new Error('tapping the colour again should show everything');
  step('the colour dots narrow the closet, and tapping one again shows everything');
  await page.locator('#grid .tile:visible .tile__open').first().click();
  await until(page, () => document.getElementById('sheet').open && /^#item\//.test(location.hash));
  if (!(await page.isVisible('#sv-name')) || await page.isVisible('#sheet [data-is="brand"]')) throw new Error("an item doesn't open on what it is");
  await shot('item');
  // its photos: the tag is kept beside the garment photo; a garment photo that becomes a "detail"
  // stops being shown, and the tag never takes its place; any photo can be shown on purpose
  await until(page, () => document.querySelectorAll('#sheet-photos .photo-thumb').length === 2);
  // the sheet's photo is sharpened to the large copy; a photo with no copies yet shows as stored
  await until(page, () => /oxford\.jpg\.w1080\?/.test(document.querySelector('.sheet__photo img').src));
  const tagSrc = await page.getAttribute('#sheet-photos .photo-thumb:nth-child(2) img', 'src');
  if (!/oxford-tag\.jpg\?/.test(tagSrc || '')) throw new Error(`a photo with no copies yet shows ${tagSrc}`);
  if (await page.evaluate(() => document.activeElement !== document.getElementById('sheet'))) throw new Error('an opened sheet should hold focus itself, not ring its first button');
  step("the sheet's photo sharpens to the large copy; a photo without copies shows as stored; the sheet holds focus, no ring");
  if (!/Garment · shown/.test(await page.textContent('#sheet-photos')) || !/Tag/.test(await page.textContent('#sheet-photos'))) throw new Error("the item's photos don't say their roles");
  await page.locator('#sheet-photos .photo-thumb').first().click();
  await page.selectOption('#photo-role', 'detail');
  await until(page, () => !/shown/.test(document.getElementById('sheet-photos').textContent));
  await page.locator('#sheet-photos .photo-thumb').nth(1).click();
  await page.click('#photo-show');
  await until(page, () => /Tag · shown/.test(document.getElementById('sheet-photos').textContent));
  const photoSaves = asked.filter((a) => a.method === 'PATCH' && /wardrobe_(photos|items)/.test(a.path)).map((a) => a.body);
  if (!photoSaves.some((b) => b.role === 'detail') || !photoSaves.some((b) => 'photo_path' in b && b.photo_path === null) || !photoSaves.some((b) => b.photo_path === 'wardrobe/u1/oxford-tag.jpg')) throw new Error(`changing photos saved ${JSON.stringify(photoSaves)}`);
  await shot('photos');
  step('an item\'s photos, each with its role: a tag is never shown in a garment photo\'s place unless asked');
  await page.click('#sheet-edit');
  if (!(await page.isVisible('#sheet-shared'))) throw new Error("editing a garment with a product doesn't say the changes are for this piece only");
  await page.fill('#sheet [data-is="brand"]', 'Smoke Brand');
  await page.selectOption('#sheet [data-is="dressiness"]', 'formal');
  await until(page, () => !document.querySelector('#sheet [data-save="saving"]'));
  await shot('sheet');
  // Done while editing goes back to what it is (what was typed, saved); then Done closes it
  await page.click('#sheet-finish');
  if ((await page.getAttribute('#sheet', 'data-mode')) !== 'view' || !/Smoke Brand/.test(await page.textContent('#sv-facts'))) throw new Error("Done while editing doesn't go back to the garment, saved");
  await page.click('#sheet [data-close]');
  const patched = asked.filter((a) => a.method === 'PATCH' && a.path.includes('wardrobe_items')).map((a) => a.body);
  if (!patched.some((b) => b.brand === 'Smoke Brand') || !patched.some((b) => b.dressiness === 'formal')) throw new Error(`the sheet saved ${JSON.stringify(patched)}`);
  await until(page, () => location.hash === '#closet' || location.hash === '');
  step('an item opens on what it is, its fields behind Edit save as they\'re typed; closing goes back');
  await page.click('#add');
  await page.fill('#add-dialog [name="link"]', 'everlane.com/products/crew');
  await page.click('#read-link');
  await until(page, () => document.querySelector('#add-dialog [name="name"]').value.includes('Organic Cotton'));
  await page.click('#add-ok');
  await until(page, () => document.getElementById('sheet').open);
  const fromLink = asked.find((a) => a.method === 'POST' && a.path.includes('/rest/v1/wardrobe_items'));
  if (!fromLink || fromLink.body[0].brand !== 'Everlane' || fromLink.body[0].buy_link !== 'https://www.everlane.com/products/crew') throw new Error(`adding from a link sent ${JSON.stringify(fromLink)}`);
  if ((await page.getAttribute('#sheet', 'data-mode')) !== 'edit') throw new Error('something just added should open on its fields');
  await page.keyboard.press('Escape'); // Esc closes it, like Done
  await until(page, () => !document.getElementById('sheet').open);
  step('added one from a store link: name, brand, price and the buy link; Esc closes it');
  // Cancel never throws away what was typed without asking: kept if the answer's no, gone if yes
  await page.click('#add');
  await page.fill('#add-dialog [name="name"]', 'Half typed');
  page.once('dialog', (d) => d.dismiss());
  await page.click('#add-dialog [data-close]');
  if (!(await page.evaluate(() => document.getElementById('add-dialog').open)) || (await page.inputValue('#add-dialog [name="name"]')) !== 'Half typed') throw new Error('Cancel threw away what was typed without asking');
  page.once('dialog', (d) => d.accept());
  await page.keyboard.press('Escape');
  await until(page, () => !document.getElementById('add-dialog').open);
  if (asked.filter((a) => a.method === 'POST' && a.path.includes('/rest/v1/wardrobe_items')).length !== 1) throw new Error('cancelling added something');
  step('Cancel (or Esc) asks before throwing away what was typed');
  await page.click('#add');
  await page.locator('#add-photo input').setInputFiles({ name: 'shirt.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
  await page.fill('#add-dialog [name="name"]', 'Smoke linen shirt');
  await until(page, () => !document.getElementById('add-ok').disabled, null, 60000);
  await page.click('#add-ok');
  await until(page, () => document.getElementById('sheet').open);
  const shirtUpload = asked.find((a) => a.method === 'POST' && a.path.includes('/object/photos/wardrobe/u1/'));
  const withPhoto = asked.filter((a) => a.method === 'POST' && a.path.includes('/rest/v1/wardrobe_items')).pop();
  if (!shirtUpload || !/^wardrobe\/u1\//.test(withPhoto.body[0].photo_path || '')) throw new Error(`adding a photo sent ${JSON.stringify(shirtUpload)} / ${JSON.stringify(withPhoto)}`);
  const copies = asked.filter((a) => a.method === 'POST' && a.path.startsWith(`/storage/v1/object/photos/${withPhoto.body[0].photo_path}.w`)).map((a) => a.path.split('.w').pop());
  if (copies.sort().join() !== '1080,512') throw new Error(`a photo added in the app stored copies ${copies}`);
  await page.click('#retire');
  await until(page, () => !document.getElementById('sheet').open);
  if (!asked.some((a) => a.method === 'PATCH' && a.path.includes('wardrobe_items') && a.body?.retired === true)) throw new Error("retiring didn't save");
  await shot('wardrobe-added');
  step('added one from a photo, into its own folder; retired it');

  // trips: the list, a trip with its legs and weather, who's going, getting there (in order),
  // staying, links, its days and their plans; then the Packing Board (below); a new trip looks its
  // places up. The weather: each leg's days in a list (the sky from its code, the bars on one
  // scale, today with a dot, the typical days marked), in °F for an American browser; one
  // forecast request a leg, the hours with it
  await page.clock.setFixedTime(new Date('2026-10-15T11:00:00+02:00'));
  const meteoBefore = asked.length;
  await page.goto(base + '/apps/');
  await until(page, () => document.getElementById('app').dataset.state === 'in');
  await page.click('#tabs a[data-value="trips"]');
  await until(page, () => document.querySelectorAll('#trip-list .trip-card').length === 1);
  await shot('trips');
  await page.click('#trip-list .trip-card');
  await until(page, () => document.querySelectorAll('#legs .daylist__day').length > 30);
  if ((await page.locator('#legs .leg').count()) !== 3 || (await page.locator('#days .day').count()) !== 2 || !(await page.textContent('#pack-sum')).includes('1 of 6 packed')) throw new Error(`the trip doesn't show its legs, days and packing (the entries, the one on a trip in the trash left out): ${JSON.stringify([await page.locator('#legs .leg').count(), await page.locator('#days .day').count(), await page.textContent('#pack-sum')])}`);
  if (!/highs 64°, lows 48°/.test(await page.textContent('#legs'))) throw new Error(`the trip's weather isn't shown, in °F: ${await page.textContent('#legs')}`);
  const florence = page.locator('#legs .leg').nth(1), dayRows = florence.locator('.daylist__day');
  if ((await dayRows.count()) !== 31 || (await florence.locator('.daylist__day:visible').count()) !== 10 || !/All 31 days/.test(await florence.locator('.daylist__more').textContent())) throw new Error(`a long leg shows ten days and a way to the rest: ${await dayRows.count()} days, ${await florence.locator('.daylist__day:visible').count()} showing`);
  const todayRow = florence.locator('.daylist__day.is-today');
  if (!/Today/.test(await todayRow.textContent()) || !(await todayRow.locator('.daylist__now').count()) || (await todayRow.locator('use').getAttribute('href')) !== '#i-rain' || !/rain, high 64°, low 48°, 70% chance of rain/.test(await todayRow.locator('.visually-hidden').textContent())) throw new Error(`today's row: its sky from the code (rain), a dot where it is now, and in words: ${await todayRow.innerHTML()}`);
  if ((await dayRows.nth(1).locator('use').getAttribute('href')) !== '#i-sun-cloud' || !/partly cloudy/.test(await dayRows.nth(1).locator('.visually-hidden').textContent())) throw new Error("a day's sky isn't from its weather code");
  await florence.locator('.daylist__more button').click();
  await until(page, () => document.querySelectorAll('#legs .leg:nth-child(2) .daylist__day:not([hidden])').length === 31);
  const typical = florence.locator('.daylist__day.is-typical');
  if (!(await typical.count()) || (await typical.first().locator('use').getAttribute('href')) !== '#i-typical' || !/last three years/.test(await florence.locator('.daylist__note').textContent()) || !/typically/.test(await typical.first().locator('.visually-hidden').textContent())) throw new Error('the typical days (beyond the forecast) aren\'t marked as typical');
  if (!/70% chance of rain/.test(await page.getAttribute('#days .day.is-today .day__wx', 'aria-label'))) throw new Error("today's day card doesn't say its weather");
  const meteo = asked.slice(meteoBefore).filter((a) => a.path.startsWith('open-meteo:api'));
  if (meteo.length !== 1 || !/weather_code/.test(meteo[0].path) || !/hourly=.*start_hour=2026-10-15T00:00&end_hour=2026-10-16T23:00/.test(meteo[0].path)) throw new Error(`one forecast request a leg that has forecast days (London's is over, Paris's beyond the forecast), with the hours of today and tomorrow: ${meteo.map((a) => a.path).join('\n')}`);
  const who = await page.locator('#trip-who .person').evaluateAll((ps) => ps.map((p) => [p.querySelector('.person__name').textContent, p.querySelector('.person__type')?.textContent].filter(Boolean).join(' ')));
  if (who.join(', ') !== 'Steve, Lexi, Dominic child') throw new Error(`who's going: ${who}`);
  if ((await page.textContent('#app-title')) !== 'Europe, autumn' || (await page.getAttribute('#app-back', 'href')) !== '#trips') throw new Error("the trip's title, or the way back to the trips, is wrong");
  // each planned day's outfit laid flat, its pieces opening the garments
  if ((await page.locator('#days .day').first().locator('.flatlay .flatlay__piece').count()) !== 2) throw new Error("a day's outfit isn't laid out");
  // getting there, as boarding cards in order: the ends (codes big, names under), the times as
  // given there (an arrival on another day says which), the reference; past ones have no Calendar
  const goes = (await page.locator('#trip-go .journey').allTextContents()).map(flatText);
  if (goes.length !== 3 || !/^Flight: British Airways BA 66\s*Tue, Oct 6\s*PHL\s*Philadelphia\s*6:30 PM\s*to\s*LHR\s*London\s*6:45 AM\s*Wed, Oct 7.*Ref\s*XK7Q2B/.test(goes[0]) || !/^Train: Eurostar 9010.*London.*7:01 AM.*Florence.*7:30 PM/.test(goes[1]) || !/^Train: Trenitalia R 3127.*Firenze Santa Maria Novella.*9:10 AM.*Siena.*10:38 AM/.test(goes[2])) throw new Error(`getting there, in order, times as given: ${goes.join(' / ')}`);
  if (!(await page.locator('#trip-go .journey').first().evaluate((c) => c.classList.contains('is-past'))) || /Calendar/.test(goes[0]) || !/Add to Google Calendar/.test(goes[2])) throw new Error('a journey that has happened should look it, and not offer Calendar; one to come should');
  if (!/Hotel Bloomsbury.*London/.test(await page.textContent('#trip-stay')) || (await page.getAttribute('#trip-links a', 'href')) !== 'https://insurance.example/policy') throw new Error("the trip's lodging or links aren't shown");
  const stay = page.locator('#trip-stay .stay', { hasText: 'Florence Airbnb' });
  if (!/Oct 14 – .*Nov 14 · 31 nights · staying now/.test(flatText(await stay.textContent())) || (await stay.locator('.map-link').getAttribute('href')) !== 'https://maps.apple.com/?q=Florence%20Airbnb&address=Lungarno%20Acciaiuoli%204%2C%2050123%20Firenze' || (await stay.locator('.map-link').getAttribute('target')) !== '_blank') throw new Error(`a stay: its dates and nights, its address opening Apple Maps: ${await stay.innerHTML()}`);
  if (!/09:30–12:00\s*Uffizi\s*sightseeing\s*20:00\s*Dinner at Buca Mario/.test(await page.textContent('#days'))) throw new Error(`a day's plans, in time order: ${await page.textContent('#days')}`);
  // a day that's been: what was worn (as planned) and its line, from what's logged
  const firstDay = page.locator('#days .day').first();
  if (!/Worn as planned ✓/.test(await firstDay.textContent()) || (await firstDay.locator('.day__journal').textContent()) !== '“Landed early, a long walk on the South Bank.”' || (await page.textContent('#days-count')) !== '2 of 42 planned · 1 logged') throw new Error(`a day of the trip that's been: what was worn and its line: ${flatText(await firstDay.textContent())} / ${await page.textContent('#days-count')}`);
  await firstDay.scrollIntoViewIfNeeded();
  await shot('trip-day-worn');
  step("a trip's day that's been says what was worn (as planned) and its line");
  await page.locator('#trip-go-part').scrollIntoViewIfNeeded();
  await shot('trip');
  step('a trip: legs with weather, who\'s going, getting there as boarding cards in order with times as given, staying with a map, links, each day\'s plans');

  // the Packing Board: status counts, filters that narrow it (and stay), a tap that moves one on
  // (one PATCH of that entry) with Undo, an entry's sheet (a bag, how many), adding from the planned
  // outfits and by hand (POSTs), taking one off and putting it back
  await page.click('#pack-open');
  const rowsShown = () => page.locator('#pack-groups .pack-row').count();
  const packPatches = () => asked.filter((a) => a.method === 'PATCH' && a.path.includes('/rest/v1/trip_packing'));
  await until(page, () => location.hash === '#trip/t1/pack' && document.querySelectorAll('#pack-groups .pack-row').length === 5);
  const statusText = await page.textContent('#pack-status');
  if (!/To pack5/.test(statusText) || !/Need3/.test(statusText) || !/To buy1/.test(statusText) || !/Packed1/.test(statusText) || !/All6/.test(statusText)) throw new Error(`the status counts: ${statusText}`);
  const heads = await page.locator('#pack-groups .pack-group__head span:first-child').allTextContents();
  if (heads.join() !== 'Clothes,Baby,Toiletries,Electronics,Documents') throw new Error(`the board's categories, in order: ${heads}`);
  if (!/Planned: (Oct 7|7 Oct)/.test(await page.textContent('#pack-groups .pack-row'))) throw new Error("a garment's row doesn't say when it's planned");
  if ((await page.locator('#pack-groups .pack-row__must').count()) !== 2) throw new Error('the essential entries carry no marker');
  if (!(await page.isVisible('#pack-from-plan'))) throw new Error("the planned outfits' things aren't offered");
  await page.click('#pack-who button[data-value="lexi"]');
  if ((await rowsShown()) !== 1 || !/Sunscreen/.test(await page.textContent('#pack-groups'))) throw new Error("Lexi's filter didn't narrow the board to her things");
  await page.click('#pack-who button[data-value="shared"]');
  if ((await rowsShown()) !== 2 || !/Plug adapter/.test(await page.textContent('#pack-groups')) || !/Passports/.test(await page.textContent('#pack-groups'))) throw new Error('Shared should be what\'s shared and what\'s nobody\'s');
  await page.click('#pack-who button[data-value=""]');
  await page.selectOption('#pack-cat', 'baby');
  if ((await rowsShown()) !== 1 || !/Diapers/.test(await page.textContent('#pack-groups'))) throw new Error("the category picker didn't narrow the board");
  await page.selectOption('#pack-cat', '');
  await page.selectOption('#pack-bag', 'b2');
  await page.reload();
  await until(page, () => document.querySelectorAll('#pack-groups .pack-row').length === 1 && document.getElementById('pack-bag').value === 'b2');
  await page.selectOption('#pack-bag', '');
  await until(page, () => document.querySelectorAll('#pack-groups .pack-row').length === 5);
  step('the board: status counts, categories in order, Planned dates, essentials marked; whose, category and bag narrow it, and stay after a reload');
  const tee = page.locator('#pack-groups .pack-row', { hasText: 'White crew tee' });
  await tee.locator('.pack-row__status').click();
  await until(page, () => /Ready/.test([...document.querySelectorAll('#pack-groups .pack-row')].find((r) => /White crew tee/.test(r.textContent))?.querySelector('.pack-row__status').textContent) && document.querySelector('.app-toast__undo'));
  if (packPatches().length !== 1 || !/^\/rest\/v1\/trip_packing\?(.*&)?id=eq\.p2(&|$)/.test(packPatches()[0].path) || JSON.stringify(packPatches()[0].body) !== '{"status":"ready"}') throw new Error(`a status tap sent ${JSON.stringify(packPatches())}`);
  if (asked.some((a) => a.method === 'PATCH' && a.path.includes('/rest/v1/trips'))) throw new Error('a status tap rewrote the trip');
  await page.click('.app-toast__undo');
  await until(page, () => /Need/.test([...document.querySelectorAll('#pack-groups .pack-row')].find((r) => /White crew tee/.test(r.textContent))?.querySelector('.pack-row__status').textContent));
  if (packPatches().length !== 2 || packPatches()[1].body.status !== 'needed') throw new Error(`Undo sent ${JSON.stringify(packPatches().slice(1))}`);
  step('one tap moves a thing on, as one PATCH of that entry; Undo puts it back');
  await tee.locator('.pack-row__open').click();
  await until(page, () => document.getElementById('pack-sheet').open);
  await page.selectOption('#ps-bag', 'b1');
  await page.click('#ps-more');
  await until(page, () => document.getElementById('ps-qty').textContent === '4');
  await shot('pack-entry');
  const sheetSaves = packPatches().slice(2).map((a) => JSON.stringify(a.body));
  if (sheetSaves.join() !== '{"bag_id":"b1"},{"qty":4}') throw new Error(`the entry's sheet sent ${sheetSaves}`);
  await page.click('#pack-sheet [data-close]');
  if (!/Steve's carry-on/.test(await tee.textContent())) throw new Error("the row doesn't show its new bag");
  step("an entry's sheet: a bag and how many, each saved at once as a PATCH of that entry");
  await page.click('#pack-from-plan');
  await until(page, () => /^1 of 7/.test(document.getElementById('pack-count').textContent));
  const fromPlan = asked.find((a) => a.method === 'POST' && a.path.includes('/rest/v1/trip_packing'));
  if (JSON.stringify(fromPlan?.body) !== '[{"trip_id":"t1","qty":1,"status":"needed","item_id":"w3","category":"shoes","traveler_key":"steve"}]') throw new Error(`adding from the planned outfits sent ${JSON.stringify(fromPlan?.body)}`);
  await page.click('#pack-who button[data-value="lexi"]');
  if ((await page.inputValue('#pack-add-who')) !== 'lexi') throw new Error("the add form doesn't start from the filters");
  await page.fill('#pack-add [name="label"]', 'Charger');
  await page.selectOption('#pack-add-cat', 'electronics');
  await page.click('#pack-add button');
  await until(page, () => /^1 of 8/.test(document.getElementById('pack-count').textContent) && !document.querySelector('#pack-add [name="label"]').value);
  const byHand = asked.filter((a) => a.method === 'POST' && a.path.includes('/rest/v1/trip_packing')).pop().body[0];
  if (byHand.label !== 'Charger' || byHand.traveler_key !== 'lexi' || byHand.category !== 'electronics' || byHand.status !== 'needed') throw new Error(`the add form sent ${JSON.stringify(byHand)}`);
  await page.locator('#pack-groups .pack-row', { hasText: 'Charger' }).locator('.pack-row__open').click();
  await page.click('#ps-remove');
  await until(page, () => /^1 of 7/.test(document.getElementById('pack-count').textContent) && document.querySelector('.app-toast__undo'));
  if (!asked.some((a) => a.method === 'DELETE' && /trip_packing\?id=eq\.new-p2/.test(a.path)) || asked.some((a) => a.method !== 'GET' && a.path.includes('wardrobe_items') && a.body?.deleted_at)) throw new Error('taking one off the list should delete the entry, and only that');
  await page.click('.app-toast__undo');
  await until(page, () => /^1 of 8/.test(document.getElementById('pack-count').textContent));
  if (asked.filter((a) => a.method === 'POST' && a.path.includes('/rest/v1/trip_packing')).pop().body[0].id !== 'new-p2') throw new Error('Undo should put the same entry back');
  await page.click('#pack-who button[data-value=""]');
  await page.click('#pack-status button[data-value="all"]');
  await until(page, () => document.querySelectorAll('#pack-groups .pack-row').length === 8);
  // packed against worn, the trip begun: the shirt packed and never worn stands out (in words); the tee says how often
  const oxfordRow = page.locator('#pack-groups .pack-row', { hasText: 'Navy oxford shirt' }), teeRow = page.locator('#pack-groups .pack-row', { hasText: 'White crew tee' });
  if ((await oxfordRow.locator('.pack-row__unworn').textContent()) !== 'Not worn yet' || (await teeRow.locator('.pack-row__worn').textContent()) !== 'Worn 1 day' || (await page.textContent('#pack-worn')) !== '0 of 1 packed garment worn so far' || (await page.locator('#pack-groups .pack-row__unworn').count()) !== 1 || !/Worn 1 day/.test(await page.locator('#pack-groups .pack-row', { hasText: 'Brown suede loafers' }).textContent())) throw new Error(`packed versus worn: ${flatText(await oxfordRow.textContent())} / ${flatText(await teeRow.textContent())} / ${await page.textContent('#pack-worn')}`);
  await shot('packing');
  await page.setViewportSize({ width: 1100, height: 900 });
  await shot('packing-wide');
  await page.setViewportSize({ width: 390, height: 844 });
  step('adding from the planned outfits and by hand (from the filters) POST entries; one taken off and put back; packed against worn: how many days each garment\'s been worn on the trip, "Not worn yet" where it hasn\'t');
  if ((await page.textContent('#app-title')) !== 'Packing' || !/Europe, autumn/.test(await page.textContent('#app-back'))) throw new Error("the board's title, or the way back to the trip, is wrong");
  await page.goBack();
  await until(page, () => location.hash === '#trip/t1' && !document.getElementById('trip').hidden);
  await page.click('#app-back');
  await page.click('#new-trip');
  await page.fill('#trip-dialog [name="name"]', 'Smoke weekend');
  await page.fill('#leg-rows [data-k="place"]', 'Lisbon, Portugal');
  await page.fill('#leg-rows [data-k="from"]', '2026-12-01');
  await page.fill('#leg-rows [data-k="to"]', '2026-12-03');
  await page.click('#trip-dialog [type="submit"]');
  await until(page, () => document.getElementById('app-title').textContent === 'Smoke weekend');
  const made = asked.find((a) => a.method === 'POST' && a.path.includes('/rest/v1/trips'));
  if (!made || made.body[0].legs[0].place !== 'Lisbon' || made.body[0].legs[0].lat !== 45 || 'packing' in made.body[0]) throw new Error(`a new trip saved ${JSON.stringify(made)}`);
  // deleting it moves it to the trash (an update, never a delete)
  page.once('dialog', (d) => d.accept());
  await page.click('#trip-edit');
  await page.click('#trip-remove');
  await until(page, () => location.hash === '#trips');
  if (asked.some((a) => a.method === 'DELETE' && a.path.includes('/rest/v1/trips')) || !asked.some((a) => a.method === 'PATCH' && a.path.includes('/rest/v1/trips') && a.body?.deleted_at)) throw new Error('deleting a trip didn\'t move it to the trash');
  step('Back goes back; a new trip (no packing column sent), then to the trash');

  // Today, mid-trip: where you are, the weather and what you're wearing, with a word about the rain
  // (and the suede); the next day is a tap away; an item opens over it and Back closes it
  await page.clock.setFixedTime(new Date('2026-10-15T11:00:00+02:00'));
  await page.goto(base + '/apps/');
  await until(page, () => document.querySelector('.today-card .hours') && location.hash === '');
  const flat = (x) => x.replace(/\s/g, ' '); // times keep their words together with a no-break space
  const today = flat(await page.textContent('#today-view'));
  if (!/Florence/.test(await page.textContent('.today-card__place')) || !/Uffizi/.test(today) || (await page.locator('.today-card .flatlay .outfit__item').count()) !== 2) throw new Error(`Today doesn't show the day, its outfit laid flat: ${today.slice(0, 200)}`);
  if ((await page.textContent('#app-title')) !== 'Good morning, Steve' || !/Thursday/.test(await page.textContent('#app-over')) || !/Your trip\s*Europe, autumn/.test(today)) throw new Error(`Today on the trip: the greeting, the date, the trip: ${await page.textContent('#app-title')} / ${today.slice(0, 200)}`);
  // the order: the next journey, what you're wearing, the weather there, then the trip
  const order = await page.locator('#today-view .today__main > *').evaluateAll((els) => els.map((e) => (e.classList.contains('journey') ? 'journey' : e.classList.contains('today-card--wx') ? 'weather' : 'outfit')));
  if (order.join() !== 'journey,outfit,weather') throw new Error(`Today's order: ${order}`);
  if (!/day 9 of 42/.test(today) || !/Rain likely from about 2 PM \(70%\), and nothing in this outfit is for rain/.test(today) || !/Maybe not Brown suede loafers/.test(today) || !/Dinner at Buca Mario at 20:00: about 51°, and nothing warm in this outfit/.test(today)) throw new Error(`Today's trip line or advice (the rain's timing, the evening plan's chill) is wrong: ${today.slice(0, 600)}`);
  // the weather now, there (11 AM in Florence: 14°C), its sky in words from the code, the day in a
  // sentence, and the hours: Now first, the rain's chance where it's likely, the sunset in its place
  const panel = page.locator('.today-card .sky-panel');
  if ((await page.textContent('.today-card__temp')).trim() !== '57°' || (await page.textContent('.today-card__word')) !== 'Cloudy' || (await panel.getAttribute('data-sky')) !== 'cloudy' || (await panel.getAttribute('data-time')) !== 'day') throw new Error(`the weather now: ${await page.textContent('.today-card__wx')} (${await panel.getAttribute('data-sky')}, ${await panel.getAttribute('data-time')})`);
  if (!/^Rain from about 2 PM, heaviest at 4 PM\. Cool evening, down to 4\d°\.$/.test(flat(await page.textContent('.today-card__story')))) throw new Error(`the day in a sentence: ${await page.textContent('.today-card__story')}`);
  const hourWords = (await page.locator('.hours .hour .visually-hidden').allTextContents()).map(flat);
  if (hourWords.length !== 27 || hourWords[0] !== 'Now: cloudy, 57°' || !hourWords.includes('4 PM: rain, 62°, 80% chance of rain') || !hourWords.includes('Sunset at 6:39 PM') || !hourWords.includes('Sunrise at 7:21 AM') || !(await page.locator('.hours .hour--moment').count()) || (await page.getAttribute('.hours__list', 'aria-label')) !== 'Hour by hour, the next 24 hours') throw new Error(`the hours: ${hourWords.join(' | ')}`);
  await shot('today');
  // the train tomorrow, as a card above the day (it leaves within 48 hours): counting down, its
  // reference a tap to copy, and Google Calendar gets it with its times in UTC; tonight's stay with its map;
  // home and away in one line, the rate a tap to turn round
  const journey = page.locator('#today-view .journey--today');
  if ((await journey.count()) !== 1 || !(await journey.evaluate((j) => j.nextElementSibling?.classList.contains('today-card'))) || flatText(await journey.locator('.journey__soon').textContent()) !== 'Train to Siena in 22 h 10 min') throw new Error(`Today's next journey, above the day, counting down: ${await page.locator('#today-view').innerHTML().then((h) => h.slice(0, 400))}`);
  await journey.locator('.chip--ref').click();
  await until(page, () => /Copied PZ4K7M/.test(document.getElementById('app-toast').textContent));
  if ((await page.evaluate(() => navigator.clipboard.readText())) !== 'PZ4K7M') throw new Error("the reference wasn't copied");
  const cal = journey.locator('.chip', { hasText: 'Add to Google Calendar' });
  const calUrl = new URL(await cal.getAttribute('href')), calQ = Object.fromEntries(calUrl.searchParams);
  if (calUrl.origin + calUrl.pathname !== 'https://calendar.google.com/calendar/render' || (await cal.getAttribute('target')) !== '_blank' || calQ.action !== 'TEMPLATE' || calQ.dates !== '20261016T071000Z/20261016T083800Z' || calQ.text !== 'Train to Siena (Trenitalia R 3127)' || calQ.location !== 'Firenze Santa Maria Novella' || !/Booking reference PZ4K7M/.test(calQ.details)) throw new Error(`Google Calendar gets the journey, its times in UTC: ${calUrl}`);
  const tonight = page.locator('#today-view .stay--today');
  if (!/^Tonight\s*Florence Airbnb\s*Check out Saturday/.test(flatText(await tonight.textContent())) || !/^https:\/\/maps\.apple\.com\/\?q=Florence%20Airbnb&address=Lungarno/.test(await tonight.locator('.map-link').getAttribute('href'))) throw new Error(`tonight's stay on Today: ${await tonight.textContent()}`);
  if (flatText(await page.textContent('.home-away')) !== 'Florence 11:00 AM · Philadelphia 5:00 AM · €1 = $1.13') throw new Error(`home and away: ${await page.textContent('.home-away')}`);
  await page.click('.home-away__rate');
  if (flatText(await page.textContent('.home-away__rate')) !== '$1 = €0.89') throw new Error(`the rate, turned round: ${await page.textContent('.home-away__rate')}`);
  await page.click('.home-away__rate');
  await page.reload();
  await until(page, () => document.querySelector('.home-away__rate'));
  const rates = asked.filter((a) => a.path.startsWith('frankfurter:'));
  if (rates.length !== 1 || rates[0].path !== 'frankfurter:?base=EUR&symbols=USD') throw new Error(`the rate is asked for once a day: ${rates.map((a) => a.path)}`);
  await shot('today-journey');
  step('Today: the train tomorrow above the day, counting down; its reference copies; Calendar gets it in UTC; tonight\'s stay opens Maps; home and away, the rate asked once a day and turned round by a tap');
  // pull to refresh on Today: the data and the weather again; nothing else changed, so it says the weather did
  const meteoNow = asked.filter((a) => a.path.startsWith('open-meteo:api')).length, closetNow = asked.filter((a) => a.method === 'GET' && a.path.startsWith('/rest/v1/wardrobe_closet')).length;
  await pullDown(page);
  await until(page, () => /^Weather updated/.test(document.getElementById('app-toast').textContent) && !document.getElementById('app-toast').hidden);
  if (asked.filter((a) => a.path.startsWith('open-meteo:api')).length !== meteoNow + 1 || asked.filter((a) => a.method === 'GET' && a.path.startsWith('/rest/v1/wardrobe_closet')).length !== closetNow + 1) throw new Error('pulling down on Today should ask for the data and the weather again, once each');
  step('pull to refresh on Today: the data and the weather again, "Weather updated"');
  // Settings, from the badge: who's signed in, the theme (the site's own), °F or °C, the way to the site
  await page.click('#app-me');
  await until(page, () => document.getElementById('settings').open);
  if ((await page.textContent('#app-name')) !== 'Steve' || (await page.textContent('#app-email')) !== 'member@example.com' || (await page.getAttribute('.settings__site a', 'href')) !== '/' || !(await page.isVisible('#app-signout'))) throw new Error('Settings should say who\'s signed in, offer Sign out and link to the site');
  if ((await page.getAttribute('#settings-theme button[data-value=""]', 'aria-pressed')) !== 'true' || (await page.getAttribute('#settings-units button[data-value="F"]', 'aria-pressed')) !== 'true') throw new Error('Settings should show the theme (auto) and the unit (°F) in use');
  await shot('settings');
  await page.click('#settings-theme button[data-value="dark"]');
  if ((await page.evaluate(() => [document.documentElement.dataset.theme, localStorage.getItem('theme')].join())) !== 'dark,dark') throw new Error('the theme in Settings should set the site\'s theme, and keep it');
  // °C from Settings: every temperature at once, and it's remembered
  await page.click('#settings-units button[data-value="C"]');
  await page.click('#settings [data-close]');
  await until(page, () => !document.getElementById('settings').open && document.querySelector('.today-card__temp')?.textContent.trim() === '14°');
  if (!/about 11°, and nothing warm/.test(await page.textContent('#today-view')) || (await page.evaluate(() => localStorage.getItem('wardrobe-units'))) !== 'C' || !(await page.locator('.hours .hour').first().textContent()).includes('14°')) throw new Error('switching to °C didn\'t reach every temperature, or wasn\'t kept');
  await shot('today-dark');
  await page.click('#app-me');
  await page.click('#settings-theme button[data-value=""]');
  await page.keyboard.press('Escape');
  if (await page.evaluate(() => document.documentElement.dataset.theme || localStorage.getItem('theme'))) throw new Error('Auto should clear the theme');
  step('Settings from the badge: who\'s signed in, the theme (dark, then auto), °C everywhere, the site');
  await page.locator('.today-card .outfit__item').first().click();
  await until(page, () => document.getElementById('sheet').open);
  await page.goBack();
  await until(page, () => !document.getElementById('sheet').open && !document.getElementById('today-view').hidden);
  await page.click('.today-card__step button:last-child');
  await until(page, () => /Friday/.test(document.querySelector('.today-card__kicker').textContent));
  step('Today: the day, its weather and outfit, the rain and the suede; the next day; Back closes an item');
  // Wore it, mid-trip: one tap logs the day's planned outfit (one POST: the day, its pieces, the
  // trip, as planned, who); it reads as done, and Undo takes it back
  await page.reload();
  await until(page, () => document.querySelector('.today-card .wore__btn') && /Thursday/.test(document.getElementById('app-over').textContent));
  if ((await page.textContent('.today-card .wore')) !== 'Wore itSomething else' || (await page.locator('.today-card .wore button').evaluateAll((bs) => bs.map((b) => b.getBoundingClientRect().height).filter((h) => h < 44))).length) throw new Error(`under the outfit: Wore it and Something else, each 44px tall: ${await page.textContent('.today-card .wore')}`);
  await page.evaluate(() => { const c = document.querySelector('.today-card'); scrollTo(0, c.getBoundingClientRect().top + scrollY - 70); });
  await shot('today-wore-before');
  const before1 = dayPosts().length, patches1 = dayPatches().length;
  await page.click('.today-card .wore__btn');
  await until(page, () => document.querySelector('.wore__done')?.textContent === 'Worn today ✓' && document.querySelector('.app-toast__undo'));
  await landed(() => dayPosts().length, before1 + 1, 'Wore it');
  const tapped = dayPosts().pop().body;
  if (tapped.kind !== 'wore' || tapped.date !== '2026-10-15' || tapped.item_ids.join() !== 'w1,w3' || tapped.trip_id !== 't1' || tapped.evidence.as_planned !== true || tapped.evidence.planned.join() !== 'w1,w3' || tapped.evidence.how !== 'tapped Wore it' || tapped.recorded_by !== 'Steve' || tapped.source !== 'app') throw new Error(`Wore it sent ${JSON.stringify(tapped)}`);
  await page.click('.app-toast__undo');
  await until(page, () => document.querySelector('.today-card .wore__btn'));
  await landed(() => dayPatches().length, patches1 + 1, 'Undo');
  if (!dayPatches().pop().path.includes(`id=eq.${tapped.id}`)) throw new Error('Undo should take back what Wore it logged');
  await page.click('.today-card .wore__btn');
  await until(page, () => document.querySelector('.wore__done')?.textContent === 'Worn today ✓');
  await landed(() => dayPosts().length, before1 + 2, 'Wore it again');
  step('Wore it, on a trip: one tap logs the planned outfit (the day, the pieces, the trip, as planned), it reads "Worn today ✓", and Undo takes it back');
  // changed: the sheet starts from what's logged; a tap takes a piece out, another puts one in
  await page.click('.today-card .wore__change');
  await until(page, () => document.getElementById('wore-sheet').open);
  const pickedFirst = await page.locator('#wore-grid [aria-pressed="true"] .wore-pick__name').allTextContents();
  if (pickedFirst.join() !== 'Navy oxford shirt,Brown suede loafers' || !(await page.isVisible('#wore-clear'))) throw new Error(`Change should start from what's logged: ${pickedFirst}`);
  await page.locator('#wore-grid .wore-pick', { hasText: 'Brown suede loafers' }).click();
  await page.locator('#wore-grid .wore-pick', { hasText: 'White crew tee' }).click();
  if ((await page.textContent('#wore-count')) !== '2 pieces picked') throw new Error(`the sheet's count: ${await page.textContent('#wore-count')}`);
  await shot('wore-sheet');
  await page.click('#wore-ok');
  await until(page, () => !document.getElementById('wore-sheet').open && /Planned: Navy oxford shirt · Brown suede loafers/.test(document.querySelector('.today-card').textContent));
  await landed(() => dayPosts().length, before1 + 3, 'The change');
  const changedTo = dayPosts().pop().body;
  if (changedTo.item_ids.join() !== 'w1,w2' || changedTo.evidence.as_planned !== false || changedTo.evidence.how !== 'picked the pieces' || changedTo.id === tapped.id || (await page.locator('.today-card .flatlay .outfit__item').count()) !== 2 || !/White crew tee/.test(await page.textContent('.today-card .flatlay__names'))) throw new Error(`changing what was worn sent ${JSON.stringify(changedTo)}`);
  step('Change: the sheet starts from what\'s logged; the pieces changed are logged as a new record (the plan named under the outfit)');
  // a line about the day: saved when you leave it (Done on the keyboard), tidied, and shown
  await page.fill('#journal-line', '  Uffizi in the morning,  rain all afternoon. ');
  await page.press('#journal-line', 'Enter');
  await until(page, () => document.getElementById('journal-line')?.dataset.save === 'saved');
  await landed(() => dayPosts().length, before1 + 4, 'The line');
  const line = dayPosts().pop().body;
  if (line.kind !== 'journal' || line.text !== 'Uffizi in the morning, rain all afternoon.' || line.date !== '2026-10-15' || line.trip_id !== 't1' || (await page.inputValue('#journal-line')) !== 'Uffizi in the morning, rain all afternoon.') throw new Error(`the day's line sent ${JSON.stringify(line)}`);
  const posts = dayPosts().length;
  await page.focus('#journal-line');
  await page.press('#journal-line', 'Enter');
  await page.waitForTimeout(300);
  if (dayPosts().length !== posts) throw new Error('leaving the line unchanged logged it again');
  await page.evaluate(() => { document.getElementById('app-toast').hidden = true; const c = document.querySelector('.today-card'); scrollTo(0, c.getBoundingClientRect().top + scrollY - 70); });
  await shot('today-wore-after');
  await page.locator('#journal-line').scrollIntoViewIfNeeded();
  await shot('today-line');
  step('a line about the day saves when you leave it, tidied, and shows; unchanged, it isn\'t sent again');
  // cost per wear, from what's logged: the oxford, $79.50, worn twice
  await page.locator('.today-card .outfit__item[aria-label="Navy oxford shirt"]').click();
  await until(page, () => document.getElementById('sheet').open);
  if ((await page.textContent('#sv-wear')) !== 'Worn 2 times · $39.75 a wear') throw new Error(`cost per wear: ${await page.textContent('#sv-wear')}`);
  await shot('item-cost');
  await page.goBack();
  await until(page, () => !document.getElementById('sheet').open);
  step('a garment says how often it\'s been worn and what that makes each wear cost');

  // the consent page ChatGPT sends you to: it can be allowed; a request that would send you
  // anywhere but ChatGPT can't
  await page.goto(base + '/apps/authorize?authorization_id=other');
  await until(page, () => !document.getElementById('consent').hidden);
  if (await page.isVisible('#consent-allow') || !(await page.isVisible('#consent-warn'))) throw new Error('the consent page would let a non-ChatGPT client in');
  await page.goto(base + '/apps/authorize?authorization_id=claude');
  await until(page, () => !document.getElementById('consent').hidden);
  if (!(await page.isVisible('#consent-allow')) || (await page.textContent('#consent-host')) !== 'claude.ai') throw new Error("the consent page won't let Claude in");
  await page.goto(base + '/apps/authorize?authorization_id=gpt');
  await until(page, () => !document.getElementById('consent').hidden);
  if (!(await page.textContent('#consent-client')).includes('ChatGPT') || (await page.textContent('#consent-host')) !== 'chatgpt.com') throw new Error("the consent page doesn't say who's asking");
  if (await page.$('.site-head, .site-foot') || await page.isVisible('#tabs') || !(await page.isVisible('#app-me'))) throw new Error('the consent page should be in the app\'s own frame, with no tabs');
  await shot('consent');
  await page.route('https://chatgpt.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<p>ChatGPT, standing in</p>' }));
  await page.click('#consent-allow');
  await page.waitForURL(/^https:\/\/chatgpt\.com\/connector_platform_oauth_redirect\?code=c/);
  if (!asked.some((a) => a.method === 'POST' && a.path.endsWith('/oauth/authorizations/gpt/consent') && a.body?.action === 'approve')) throw new Error("Allow didn't approve the request");
  await page.unroute('https://chatgpt.com/**');
  step('consent page: ChatGPT and Claude can be allowed (and you go back), anyone else can\'t');

  // SJPJr's old address (/apps/wardrobe) goes there, a link's hash kept. The site's nav has it, signed in
  await page.goto(base + '/apps/#closet');
  await page.waitForURL(/\/apps\/#closet$/);
  await until(page, () => document.getElementById('app').dataset.state === 'in' && !document.getElementById('closet-view').hidden);
  await page.goto(base + '/apps/');
  await page.waitForURL(/\/apps\/$/);
  await until(page, () => document.getElementById('app').dataset.state === 'in' && !document.getElementById('today-view').hidden);
  await page.goto(base + '/about');
  if (!(await page.isVisible('.site-nav [data-members]')) || (await page.getAttribute('.site-nav [data-members]', 'href')) !== '/apps/') throw new Error("the site's nav has no Apps link to SJPJr for someone signed in");
  step('/apps/wardrobe goes to SJPJr at /apps (Today, or the tab in its link), and the site\'s nav has Apps');
}

// Someone who isn't Steve (Lexi, say): the wardrobe and trips are Steve's own, so they see what
// they can use, Recipes, with no tab bar for one section, greeted by the start of their email
// (no name stored yet); nothing of the wardrobe is even asked for
async function another(page, shot) {
  await page.goto(base + '/apps/');
  const asked = await member(page, page, { email: 'lexi@example.com', me: { name: null, sections: ['recipes'] } });
  await page.goto(base + '/apps/#today');
  await page.reload(); // (the same page with another hash isn't loaded again)
  await until(page, () => !document.getElementById('recipes-view').hidden && document.querySelectorAll('#recipe-cards .item').length === 3);
  if ((await page.textContent('#app-title')) !== 'Recipes' || await page.isVisible('#tabs') || await page.isVisible('#today-view')) throw new Error('another member should land on Recipes, with no tabs and no Today');
  if (asked.some((a) => /wardrobe_|\/trips|trip_/.test(a.path))) throw new Error(`the wardrobe was asked for, for someone who doesn't see it: ${asked.map((a) => a.path).filter((p) => /wardrobe_|trip/.test(p))}`);
  await page.click('#app-me');
  await until(page, () => document.getElementById('settings').open);
  if ((await page.textContent('#app-name')) !== 'Lexi' || (await page.textContent('#app-email')) !== 'lexi@example.com' || await page.isVisible('#settings-units')) throw new Error(`Settings for another member: their name from the email, and no °F or °C (no weather): ${await page.textContent('#app-name')}`);
  await page.keyboard.press('Escape');
  await page.goto(base + '/apps/#closet');
  await until(page, () => !document.getElementById('recipes-view').hidden);
  await shot('recipes-only');
  step('another member: Recipes only, no tab bar, named from their email; the wardrobe is never asked for, and its address leads to Recipes');
}

// With no connection: the wardrobe opens on the copy it kept (through its service worker), a
// change to a packing entry is kept, and it's sent when the connection's back
async function offline(page, shot) {
  await page.clock.setFixedTime(new Date('2026-10-15T11:00:00+02:00'));
  await page.goto(base + '/apps/');
  const asked = await member(page, page.context());
  await page.goto(base + '/apps/');
  await until(page, () => document.querySelector('.today-card'));
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now through the service worker, which keeps the page and its scripts as they pass
  await until(page, () => navigator.serviceWorker.controller && document.querySelector('.today-card'));
  await page.context().setOffline(true);
  await page.reload();
  await until(page, () => document.querySelector('.today-card') && !document.getElementById('offline-note').hidden);
  if (!/Florence/.test(await page.textContent('.today-card__place'))) throw new Error("offline, Today isn't there");
  if ((await page.textContent('.today-card__temp')).trim() !== '57°' || !/^Rain from about\s2\sPM/.test(await page.textContent('.today-card__story')) || (await page.locator('.hours .hour').count()) < 25) throw new Error(`offline, Today doesn't show the last weather kept (now, the sentence, the hours): ${await page.textContent('.today-card .sky-panel')}`);
  if (!/€1 = \$1\.13/.test(flatText(await page.textContent('.home-away'))) || asked.filter((a) => a.path.startsWith('frankfurter:')).length !== 1) throw new Error(`offline, the rate kept on the phone isn't shown: ${await page.textContent('#today-view .today__trip')}`);
  await shot('offline');
  step('offline: the page, its scripts and the data come from the copy on the phone, and the rate from the one kept');
  // what you wore and a line about the day, offline: logged on the phone, the line under the tabs
  // counting what's waiting; nothing goes out until the connection's back
  await page.click('.today-card .wore__btn');
  await until(page, () => document.querySelector('.wore__done') && /1 change waiting to send/.test(document.getElementById('offline-note').textContent));
  await page.fill('#journal-line', 'A slow day, offline.');
  await page.press('#journal-line', 'Enter');
  await until(page, () => /2 changes waiting to send/.test(document.getElementById('offline-note').textContent));
  if (asked.some((a) => a.path.startsWith('/rest/v1/events') && a.method !== 'GET')) throw new Error('a day logged with no connection went out');
  await page.evaluate(() => scrollTo(0, 0));
  await shot('offline-wore');
  step('offline, Wore it and the day\'s line are kept on the phone, and the line under the tabs counts them');
  await page.click('.today__part a[href$="/pack"]');
  await until(page, () => document.querySelectorAll('#pack-groups .pack-row').length === 5);
  const before = asked.length;
  // two taps on the tee: needed → ready → packed, kept as one change to that entry
  const tee = page.locator('#pack-groups .pack-row', { hasText: 'White crew tee' }).locator('.pack-row__status');
  await tee.click();
  await until(page, () => /Ready/.test([...document.querySelectorAll('#pack-groups .pack-row')].find((r) => /White crew tee/.test(r.textContent))?.textContent));
  await tee.click();
  await until(page, () => document.getElementById('pack-count').textContent.startsWith('2 of 6'));
  if (asked.slice(before).some((a) => a.method === 'PATCH')) throw new Error('a change went out with no connection');
  await page.click('#pack-from-plan');
  await until(page, () => /offline/i.test(document.getElementById('app-toast').textContent));
  if (asked.slice(before).some((a) => a.method === 'POST')) throw new Error('adding went out with no connection');
  await shot('offline-packing');
  // a home-screen app installed from the old recipes page still lands on Recipes, which say they need a connection
  await page.goto(base + '/apps/recipes');
  await until(page, () => location.hash === '#recipes' && !document.getElementById('recipes-view').hidden && /offline/.test(document.getElementById('recipe-empty').textContent));
  step('offline, /apps/recipes still lands on the Recipes tab (through the service worker), which says it needs a connection');
  await page.context().setOffline(false);
  await until(page, () => document.getElementById('offline-note').hidden);
  const sent = asked.slice(before).filter((a) => a.method === 'PATCH');
  if (sent.length !== 1 || !/trip_packing\?(.*&)?id=eq\.p2(&|$)/.test(sent[0].path) || JSON.stringify(sent[0].body) !== '{"status":"packed"}') throw new Error(`the change made offline sent ${JSON.stringify(sent)}`);
  step('a status change made offline is kept (adding says it has to wait), and sent as one PATCH of that entry when the connection is back');
  const sentDays = asked.filter((a) => a.method === 'POST' && a.path.startsWith('/rest/v1/events')).map((a) => a.body);
  if (sentDays.length !== 2 || sentDays[0].kind !== 'wore' || sentDays[0].item_ids.join() !== 'w1,w3' || sentDays[0].date !== '2026-10-15' || sentDays[1].kind !== 'journal' || sentDays[1].text !== 'A slow day, offline.' || 'unsent' in sentDays[0]) throw new Error(`what was logged offline sent ${JSON.stringify(sentDays)}`);
  step('and what was logged of the day goes too, one POST each, as it was made');
}

// The home-screen app, on an iPhone in Safari: the app pages (and only they) link a manifest that
// installs full screen with its icons; the one hint says how, until it's dismissed; and signing in
// works by the code from the email, which is how the installed app (whose storage the emailed
// link, opening in Safari, can't reach) signs in. Against a made-up Supabase Auth.
async function install(page, shot) {
  await page.goto(base + '/about');
  if (await page.$('link[rel="manifest"], meta[name="apple-mobile-web-app-capable"]')) throw new Error('a public page links the apps\' manifest');
  await page.goto(base + '/apps/');
  const href = await page.getAttribute('link[rel="manifest"]', 'href');
  const manifest = await page.evaluate((h) => fetch(h).then((r) => r.json()), href);
  if (href !== '/apps/wardrobe.webmanifest' || manifest.name !== 'SJPJr' || manifest.start_url !== '/apps/' || manifest.scope !== '/apps/' || manifest.display !== 'standalone' || !/^#[0-9a-f]{6}$/.test(manifest.theme_color)) throw new Error(`the wardrobe's manifest: ${href} ${JSON.stringify(manifest)}`);
  const sizes = manifest.icons.map((i) => `${i.sizes} ${i.purpose}`).join();
  if (sizes !== '192x192 any,512x512 any,512x512 maskable') throw new Error(`the manifest's icons: ${sizes}`);
  for (const src of [...manifest.icons.map((i) => i.src), await page.getAttribute('link[rel="apple-touch-icon"]', 'href')]) {
    const [ok, w] = await page.evaluate((u) => new Promise((r) => { const i = new Image(); i.onload = () => r([true, i.naturalWidth]); i.onerror = () => r([false, 0]); i.src = u; }), src);
    if (!ok || !src.includes(`-${w}.png`)) throw new Error(`the icon ${src} doesn't load at its size (${w})`);
  }
  for (const [name, content] of [['apple-mobile-web-app-capable', 'yes'], ['apple-mobile-web-app-status-bar-style', 'black-translucent'], ['apple-mobile-web-app-title', 'SJPJr']]) {
    if ((await page.getAttribute(`meta[name="${name}"]`, 'content')) !== content) throw new Error(`the page's ${name} isn't ${content}`);
  }
  if ((await page.locator('meta[name="theme-color"][media]').count()) !== 2) throw new Error('no theme colour for light and dark');
  step('manifest on the app pages only: SJPJr, full screen from /apps, its icons at their sizes; the iPhone tags');

  // Supabase Auth, made up: the email goes; the code 123456 is right, any other isn't
  const db = new URL(await page.getAttribute('meta[name="supabase-url"]', 'content'));
  const asked = [];
  const jwt = [{ alg: 'HS256', typ: 'JWT' }, { sub: 'u1', email: 'member@example.com', role: 'authenticated', exp: 4102444800 }, 'x'].map((p) => Buffer.from(JSON.stringify(p)).toString('base64url')).join('.');
  await page.context().route(`${db.origin}/**`, (route) => {
    const req = route.request(), url = new URL(req.url()), json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const body = (() => { try { return req.postDataJSON(); } catch (e) { return null; } })();
    asked.push({ path: url.pathname, body });
    if (url.pathname.endsWith('/auth/v1/otp')) return json({});
    if (url.pathname.endsWith('/auth/v1/verify')) return body?.token === '123456' ? json({ access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'r', user: { id: 'u1', email: 'member@example.com', aud: 'authenticated', role: 'authenticated' } }) : json({ code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' }, 403);
    if (url.pathname.endsWith('/rpc/is_member')) return json(true);
    return json([]);
  });
  await page.reload();
  await until(page, () => document.getElementById('app').dataset.state === 'out');
  if (!(await page.isVisible('#install-hint')) || !(await page.isHidden('#gate-code'))) throw new Error('signed out on an iPhone: the hint should show, and the code field not yet');
  await page.fill('#gate-form [name="email"]', 'member@example.com');
  await page.click('#gate-form button');
  await until(page, () => !document.getElementById('gate-code').hidden);
  const field = page.locator('#gate-code [name="code"]');
  if ((await field.getAttribute('autocomplete')) !== 'one-time-code' || (await field.getAttribute('inputmode')) !== 'numeric' || !/type the code here/.test(await page.textContent('#gate-note')) || !(await field.evaluate((f) => f === document.activeElement))) throw new Error(`after sending, the code field (one-time-code, numeric, focused) and what to do: ${await page.textContent('#gate-note')}`);
  const sent = asked.find((a) => a.path.endsWith('/otp'));
  if (sent?.body?.email !== 'member@example.com' || sent.body.create_user !== false) throw new Error(`sending the email asked ${JSON.stringify(sent)}`);
  await shot('gate-code');
  await field.fill('654321');
  await until(page, () => /didn't work/.test(document.getElementById('gate-note').textContent));
  if ((await page.getAttribute('#app', 'data-state')) !== 'out') throw new Error('a wrong code signed in');
  await field.fill('123456'); // six digits: it goes by itself
  await until(page, () => document.getElementById('app').dataset.state === 'in');
  const verify = asked.filter((a) => a.path.endsWith('/verify')).pop();
  if (JSON.stringify([verify.body.email, verify.body.token, verify.body.type]) !== '["member@example.com","123456","email"]') throw new Error(`the code was checked with ${JSON.stringify(verify.body)}`);
  step('signed in by the code from the email: a wrong one says so, six digits go by themselves (email, token, type email)');

  await shot('hint');
  await page.click('#install-hint-x');
  await page.reload();
  await until(page, () => document.getElementById('app').dataset.state === 'in');
  if (await page.isVisible('#install-hint')) throw new Error('the hint came back after it was dismissed');
  // signing out is in Settings, and asks first; after it (and on any later visit) the gate has the
  // email filled in, so coming back is one tap and the code
  await page.click('#app-me');
  await until(page, () => document.getElementById('settings').open);
  page.once('dialog', (d) => d.dismiss());
  await page.click('#app-signout');
  if ((await page.getAttribute('#app', 'data-state')) !== 'in') throw new Error('Sign out should ask first');
  page.once('dialog', (d) => d.accept());
  await page.click('#app-signout');
  await until(page, () => document.getElementById('app').dataset.state === 'out');
  await page.reload();
  await until(page, () => document.getElementById('app').dataset.state === 'out');
  if (!asked.some((a) => a.path.endsWith('/logout')) || (await page.inputValue('#gate-form [name="email"]')) !== 'member@example.com' || (await page.textContent('#gate-title')) !== 'Welcome back') throw new Error(`after signing out, the gate should remember the email: ${await page.inputValue('#gate-form [name="email"]')} / ${await page.textContent('#gate-title')}`);
  await shot('gate-back');
  step('Sign out, in Settings, asks first; then the gate remembers the email ("Welcome back")');
  // installed, there's no hint, and the email's link can't be used: the note says only the code
  const installed = await page.context().newPage();
  await installed.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { value: true }); localStorage.clear(); });
  await installed.goto(base + '/apps/');
  await until(installed, () => document.getElementById('app').dataset.state === 'out');
  await installed.fill('#gate-form [name="email"]', 'member@example.com');
  await installed.click('#gate-form button');
  await until(installed, () => !document.getElementById('gate-code').hidden);
  if (await installed.isVisible('#install-hint') || (await installed.textContent('#gate-note')) !== 'Check member@example.com for the code.') throw new Error(`installed: no hint, and the note asks for the code: ${await installed.textContent('#gate-note')}`);
  step('the hint shows on an iPhone until dismissed, never in the installed app, where the note asks for the code');
}

// The wardrobe's in-chat card, the way ChatGPT and Claude show it: the page the MCP server serves
// (resources/read) in a sandboxed frame, driven by the MCP Apps SDK's own host side (AppBridge),
// with every tool the card calls answered by the real server on the real schema (PGlite). Photos
// are stand-ins from the site.
async function card(page, shot) {
  const w = await wardrobeDb();
  await w.signIn();
  // as data: links, since Chrome won't let the sandboxed frame load from localhost (real photos come from Storage)
  const pics = ['astronaut-500.webp', 'rockets-thumb.webp', 'saturn-v-800.webp', 'me-500.webp'].map((f) => `data:image/webp;base64,${readFileSync(join(root, 'assets/images', f)).toString('base64')}`);
  const ctx = { ...w.ctx, siteOrigin: base, storageOrigin: base, cardScript: async () => readFileSync(join(root, 'assets/js/dist/mcp-app.js'), 'utf8'), photoUrls: async (paths) => new Map(paths.map((p) => [p, pics[[...p].reduce((n, c) => n + c.charCodeAt(0), 0) % pics.length]])) };
  const call = async (name, args) => (await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, ctx)).result;
  const html = (await rpc({ jsonrpc: '2.0', id: 1, method: 'resources/read', params: { uri: APP_URI } }, ctx)).result.contents[0].text;
  const host = (await esbuild.build({ stdin: { resolveDir: resolve('.'), loader: 'js', contents: `
    import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';
    window.showCard = async (html, input, result, theme) => {
      const frame = document.getElementById('card');
      const bridge = new AppBridge(null, { name: 'smoke-host', version: '1.0.0' }, { serverTools: {}, openLinks: {} }, { hostContext: { theme, displayMode: 'inline', availableDisplayModes: ['inline', 'fullscreen'], locale: 'en-US' } });
      window.bridge = bridge;
      bridge.onrequestdisplaymode = async ({ mode }) => { bridge.setHostContext({ theme, displayMode: mode, availableDisplayModes: ['inline', 'fullscreen'], locale: 'en-US' }); return { mode }; }; // a host that has full screen gives it
      bridge.oncalltool = (params) => window.callTool(params.name, params.arguments || {});
      bridge.onsizechange = ({ height }) => { if (height) frame.style.height = height + 'px'; };
      bridge.oninitialized = () => { bridge.sendToolInput({ arguments: input }); bridge.sendToolResult(result); };
      await bridge.connect(new PostMessageTransport(frame.contentWindow, frame.contentWindow));
      frame.srcdoc = html;
    };` }, bundle: true, write: false, format: 'iife', logLevel: 'error' })).outputFiles[0].text;
  await page.exposeFunction('callTool', call);
  await page.route(`${base}/__host`, (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta name="viewport" content="width=device-width"><body style="margin:0;padding:12px;background:#f4f4f2"><div style="max-width:440px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px #0002"><iframe id="card" sandbox="allow-scripts" style="display:block;width:100%;height:120px;border:0"></iframe></div><script>${host}</script>` }));
  const frame = page.frameLocator('#card');
  const show = async (input, result, theme = 'light') => { await page.goto(`${base}/__host`); await page.evaluate(([h, i, r, t]) => window.showCard(h, i, r, t), [html, input, result, theme]); };
  const file = (id) => ({ download_url: `https://files.example/${id}`, file_id: id, mime_type: 'image/jpeg' });

  // the closet: a row of photos; the same shirt in three colours is told apart by colour
  await call('ingest_item', { product: { brand: 'Everlane', name: 'The Organic Cotton Crew', style_number: 'EV-1042', material: '100% organic cotton', sources: { brand: 'garment_label', name: 'hang_tag', style_number: 'hang_tag', material: { source: 'care_label', raw: '100% ORGANIC COTTON' } } }, variant: { manufacturer_colour: 'White', manufacturer_size: 'M', price: 30, currency: 'USD', sources: { manufacturer_colour: 'hang_tag', price: 'hang_tag' } }, item: { category: 'tops', subcategory: 't_shirt', warmth: 'light', dressiness: 'casual', dressiness_also: ['smart casual'], sources: { warmth: { source: 'vision_inference', confidence: 0.7 } } }, garment_photo: file('crew-front'), tag_photo: file('crew-tag'), care_label_photo: file('crew-care'), client_ref: 'smoke-crew' });
  const crewId = (await call('find_items', { query: 'organic cotton crew' })).structuredContent.items[0].id;
  await call('add_photo', { id: crewId, url: 'https://shop.example/crew-shop.jpg' }); // a shop's picture, kept as a reference
  const closet = await call('find_items', {});
  await show({}, closet);
  await frame.locator('.w-row .w-tile').first().waitFor();
  if (!(await frame.locator('.w-row img[src^="data:image"]').count())) throw new Error("the card's photos (sent in the result's _meta) don't show");
  if ((await frame.locator('.w-tile').count()) !== closet.structuredContent.count) throw new Error("the card's closet row doesn't show every garment");
  const names = await frame.locator('.w-tile__name').allTextContents();
  if (!names.includes('Dark Brown') || names.filter((n) => /Soft Brushed/.test(n)).length) throw new Error(`garments sharing a name aren't told apart by colour: ${names.join(', ')}`);
  await shot('closet');
  step(`the closet: a row of ${closet.structuredContent.count} photos, twins named by colour, in the official MCP Apps host`);

  // a garment opens full screen: photo, what it is, the facts; provenance only where guessed, and on tap
  await frame.locator('.w-tile', { hasText: 'Organic Cotton Crew' }).click();
  await frame.locator('.w-garment').waitFor();
  if (!(await frame.locator('html.is-full').count())) throw new Error("opening a garment didn't go full screen");
  if ((await frame.locator('.w-thumb').count()) !== 4 || (await frame.locator('.w-seg').count()) || !(await frame.locator('.w-badge', { hasText: 'Care' }).count()) || !(await frame.locator('.w-badge', { hasText: 'Shop' }).count())) throw new Error("a garment's photos: four, badged (the shop's says so), and no role picker until asked");
  if ((await frame.locator('.w-guess').count()) || /hang tag|care label/i.test(await frame.locator('.w-facts').first().innerText())) throw new Error('facts read off a label should carry no source until tapped');
  await frame.locator('.w-fact', { hasText: '100% organic cotton' }).click();
  await frame.locator('.w-why', { hasText: 'Care label: “100% ORGANIC COTTON”' }).waitFor();
  await shot('garment');
  // saying what a photo is comes up when you tap one: the tag is really the garment, and the main one
  await frame.locator('.w-thumb[data-role="tag"]').click();
  await frame.getByRole('button', { name: 'Change' }).click();
  await frame.locator('.w-seg__b', { hasText: /^Garment$/ }).click();
  await frame.getByRole('button', { name: 'Make it the main photo' }).click();
  await frame.locator('.w-tools:empty').waitFor({ state: 'attached' });
  const [crew] = await w.q(`select photo_path from public.wardrobe_items where ingest_key = 'smoke-crew'`);
  if (!/crew-tag/.test(crew.photo_path)) throw new Error(`the role and "Make it the main photo" in the card didn't save: ${crew.photo_path}`);
  // the shop's picture, wrong: two taps move it to the trash
  await frame.locator('.w-thumb', { has: frame.locator('.w-badge', { hasText: 'Shop' }) }).click();
  await frame.getByRole('button', { name: 'Delete' }).click();
  await frame.getByRole('button', { name: 'Move to trash?' }).click();
  await frame.locator('.w-thumb').nth(3).waitFor({ state: 'detached' }); // four thumbs until the card redraws
  if ((await frame.locator('.w-thumb').count()) !== 3 || (await w.q(`select count(*)::int as n from public.wardrobe_photos where item_id = $1 and origin = 'reference' and deleted_at is null`, [crewId]))[0].n) throw new Error('deleting the shop picture in the card left it showing');
  await frame.getByRole('button', { name: '‹ Back' }).click();
  await frame.locator('.w-grid').waitFor();
  await page.evaluate(() => window.bridge.setHostContext({ theme: 'light', displayMode: 'inline', availableDisplayModes: ['inline', 'fullscreen'], locale: 'en-US' }));
  await frame.locator('.w-row').waitFor();
  step('a garment opens full screen: guessed facts marked, a source on tap; a photo\'s role and the main photo save; Back; closing full screen returns to the row');

  // filing: what it is and that it's new, only the guesses up front, then Add
  const input = { product: { brand: 'Uniqlo', name: 'Soft Brushed Crew Neck Long Sleeve T', style_number: 'HT00189AD-US', sources: { style_number: 'hang_tag' } }, variant: { manufacturer_colour: '09 Black', manufacturer_size: 'M', price: 29.9, currency: 'USD', sources: { manufacturer_colour: 'hang_tag', manufacturer_size: 'hang_tag', price: 'hang_tag' } }, item: { category: 'tops', subcategory: 'long_sleeve_t_shirt', warmth: 'mid', dressiness: 'casual', sources: { warmth: { source: 'vision_inference', confidence: 0.8 } } }, client_ref: 'smoke-black', dry_run: true };
  await show(input, await call('ingest_item', input));
  await frame.getByRole('button', { name: 'Add to wardrobe' }).waitFor();
  const preview = await frame.locator('#app').textContent();
  if (!/New colour or size/.test(preview) || !/Long sleeve t shirt · Black · M/.test(preview) || !/Warmth.*from the photo/.test(preview) || /product\.|No source given/.test(preview) || !/No photo yet/.test(preview)) throw new Error(`the card's dry run preview: ${preview.slice(0, 400)}`);
  await shot('ingest-preview');
  await frame.getByRole('button', { name: 'Add to wardrobe' }).click();
  await frame.locator('.w-done', { hasText: 'Added to your wardrobe' }).waitFor();
  if (!(await w.q(`select id from public.wardrobe_items where ingest_key = 'smoke-black'`)).length) throw new Error('"Add to wardrobe" in the card filed nothing');
  await shot('ingest-filed');
  step('filing: what it is and that it\'s a new colour, only the guesses up front, the tag\'s facts folded, then "Add to wardrobe" files it');

  // a trip: a glance (legs, who, next outfit, packing so far); Open trip for the days and packing, by who it's for
  const t = (await call('create_trip', { name: 'Europe, autumn', legs: [{ place: 'London', from: '2026-10-07', to: '2026-10-14' }, { place: 'Florence', from: '2026-10-14', to: '2026-11-14' }], travelers: [{ key: 'steve', name: 'Steve', type: 'adult' }, { key: 'dominic', name: 'Dominic', type: 'child' }] })).structuredContent;
  const ids = (await call('find_items', {})).structuredContent.items.map((i) => i.id);
  await call('plan_days', { trip_id: t.id, days: [{ date: '2026-10-08', items: ids.slice(0, 3), occasion: 'Tate Modern, then dinner' }, { date: '2026-10-15', items: ids.slice(2, 5), occasion: 'Uffizi', activities: [{ title: 'Uffizi', type: 'sightseeing', start_time: '10:00' }] }] });
  await call('set_packing', { trip_id: t.id, items: [...ids.slice(0, 4).map((item_id) => ({ item_id, traveler: 'steve' })), { label: 'Plug adapter', qty: 2, traveler: 'shared' }] });
  await call('add_packing_items', { trip_id: t.id, items: [{ label: 'Sleep sack', traveler: 'dominic', category: 'baby' }] });
  await show({ id: t.id }, await call('get_trip', { id: t.id }));
  await frame.locator('.w-next .w-sq').first().waitFor();
  if ((await frame.locator('.w-next .w-sq').count()) !== 3 || !/0 of 6 packed/.test(await frame.locator('.w-count').textContent()) || (await frame.locator('.w-day').count())) throw new Error("the trip's glance: the next outfit and packing so far, no day list");
  await shot('trip');
  await frame.getByRole('button', { name: 'Packing list' }).click();
  await frame.locator('.w-pack input').first().check();
  await frame.locator('.w-count', { hasText: '1 of 6 packed' }).waitFor();
  await frame.getByRole('button', { name: 'Dominic' }).click();
  if ((await frame.locator('.w-pack li').count()) !== 1 || !/Sleep sack/.test(await frame.locator('.w-pack').textContent())) throw new Error('the packing list should narrow to one traveler');
  await frame.getByRole('button', { name: 'Everyone' }).click();
  if (!/Dark Brown/.test(await frame.locator('.w-pack').textContent())) throw new Error('the packing list should tell the same shirt in different colours apart');
  const packing = await w.q(`select status from public.trip_packing where trip_id = $1`, [t.id]);
  if (packing.filter((p) => p.status === 'packed').length !== 1) throw new Error(`ticking in the card saved ${JSON.stringify(packing)}`);
  await shot('trip-packing');
  await frame.getByRole('tab', { name: /^Days/ }).click();
  if ((await frame.locator('.w-day').count()) !== 2 || (await frame.locator('.w-day .w-sq').count()) !== 6 || !/10:00 Uffizi/.test(await frame.locator('.w-acts').textContent())) throw new Error("the trip's days: activities, and each outfit as photos");
  await shot('trip-days');
  step('a trip: a glance, then full screen: packing by traveler, ticked off (saved), and each day\'s activities and outfit as photos');

  await show({}, closet, 'dark');
  await frame.locator('.w-tile').first().waitFor();
  await shot('closet-dark');
  step('in the host\'s dark theme');
}

// Without WebGL the menu is the page, and its links are real
async function noWebGL(page, shot) {
  await page.goto(base + '/');
  await until(page, () => document.getElementById('world').dataset.state === 'fallback', null, 60000);
  if (await page.isHidden('#menu')) throw new Error('the menu is hidden without WebGL');
  await shot('fallback');
  step('the menu is the page');
}

const want = (k) => !only || only === k;
if (want('pages')) await session('pages', { viewport: { width: 1280, height: 800 } }, pages);
if (want('apps')) await session('apps', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: 'en-US', timezoneId: 'Europe/Rome', permissions: ['clipboard-read', 'clipboard-write'] }, apps);
if (want('apps')) await session('another member', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: 'en-US' }, another);
if (want('apps')) await session('card in chat', { viewport: { width: 440, height: 900 }, deviceScaleFactor: 2 }, card);
if (want('apps')) await session('home-screen app', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: 'en-US', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' }, install);
if (want('apps')) await session('offline wardrobe', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-US', timezoneId: 'Europe/Rome' }, offline);
if (want('desktop')) await session('desktop planet', { viewport: { width: 1280, height: 800 } }, (p, s) => planet(p, s));
if (want('phone')) await session('phone planet', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, (p, s) => planet(p, s, { phone: true }));
if (want('nogl')) await session('nogl fallback', { viewport: { width: 1280, height: 800 } }, noWebGL, [...browserArgs, '--disable-webgl', '--disable-webgl2', '--disable-3d-apis']);

server.close();
if (failures.length) {
  console.error(`\n${failures.length} failed:\n${failures.map((f) => `✗ ${f}`).join('\n')}`);
  process.exit(1);
}
console.log('\n✓ smoke test passed');
