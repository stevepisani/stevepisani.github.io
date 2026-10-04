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
import { readFileSync, existsSync, statSync, mkdirSync, readdirSync } from 'node:fs';
import { join, extname, resolve, relative } from 'node:path';
import { buildLibrary } from './library.mjs';

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
  page.on('pageerror', (e) => errors.push(`page error: ${e.message}`));
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

  // the robot makes a drink, skipped to the end
  await page.evaluate(() => window.__world.make(0));
  await until(page, () => window.__world.making);
  await page.keyboard.press('Escape');
  await until(page, () => !window.__world.making, null, 60000);
  step('the robot made a drink');

  // ask the bartender: your question shows in the transcript and, with every request outside the
  // site refused here, the robot says the bar's closed
  await until(page, () => !document.getElementById('chat').hidden);
  await page.fill('#chat-input', "What's on the chalkboard?");
  await page.click('#chat button[type="submit"]');
  await until(page, () => { const l = document.querySelectorAll('#chat-log li'); return l.length === 2 && /closed/.test(l[1].textContent); }, null, 60000);
  await shot('asked');
  step('asked the bartender: the question showed, and offline the bar said it was closed');

  await page.click('#seat-leave');
  await expectState(page, 'walk', 120000);
  step('left the bar');

  // the campfire: sit, roast, eat, leave
  await page.evaluate(() => window.__world.sitAtFire());
  await expectState(page, 'camp');
  await page.evaluate(() => { window.__world.roaster.state.toast = 0.5; });
  await page.evaluate(() => window.__world.eatIt());
  await shot('fire');
  await page.evaluate(() => window.__world.leaveFire());
  await expectState(page, 'walk');
  step('campfire: sat, ate one, left');

  // the hammock: lie in it, the reading list, get up
  await page.evaluate(() => window.__world.lieInHammock());
  await until(page, () => window.__world.state === 'hammock' && window.__world.lying, null, 120000);
  await shot('hammock');
  // the book sky: the stars gather once the list closes; lean in on a shelf (the view narrows, its titles come up, the strip names it),
  // step to the next shelf, open a book and step to the next one; Esc puts the card away, Esc
  // again leans out; Back leans out too
  await until(page, () => window.__world.stars > 0 && !document.getElementById('panel').hidden, null, 60000); // the reading list opens out of the book
  await page.keyboard.press('Escape');
  await until(page, () => document.getElementById('panel').hidden);
  await until(page, () => window.__world.sky.settled, null, 60000); // the loose stars gather into their shelves once the list closes
  const fov0 = await page.evaluate(() => window.__world.camera.fov);
  await page.evaluate(() => window.__world.zoom('science-fiction'));
  await until(page, (f) => window.__world.zoomK === 1 && window.__world.camera.fov < f - 10 && document.querySelector('.sky-label:not([hidden])'), fov0, 60000);
  if (await page.isHidden('#sky-shelf') || !(await page.textContent('#sky-name')).includes('Science Fiction')) throw new Error("leaning in on a shelf didn't show its name");
  await shot('shelf');
  await page.evaluate(() => window.__world.stepShelf(1));
  await until(page, () => window.__world.zoomed === 'fiction');
  await page.evaluate(() => { const W = window.__world, r = W.sky.regions.find((x) => x.slug === 'fiction'); W.openStar(W.sky.books.indexOf(r.books[0])); });
  if (await page.isHidden('#star-card')) throw new Error("a star's card didn't open");
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
  await page.evaluate(() => window.__world.getOutOfHammock());
  await expectState(page, 'walk');
  step(`hammock: lay down, leaned in on a shelf and stepped through it (${await page.evaluate(() => window.__world.stars)} stars), got up`);

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
}

// The private apps (/apps), on a phone, against a made-up Supabase: signed out there's only the
// sign-in form; signed in as a member, the recipe tracker lists, searches, marks one cooked,
// saves notes and a rating, and adds one, and each of those asks the database for the right thing.
async function apps(page, shot) {
  await page.goto(base + '/apps/recipes');
  await until(page, () => document.getElementById('app').dataset.state === 'out');
  if (await page.isVisible('#app-main')) throw new Error('the app shows without signing in');
  await shot('gate');
  step('signed out: only the sign-in form');

  const db = new URL(await page.getAttribute('meta[name="supabase-url"]', 'content'));
  const jwt = [{ alg: 'HS256', typ: 'JWT' }, { sub: 'u1', email: 'member@example.com', role: 'authenticated', exp: 4102444800 }, 'x'].map((p) => Buffer.from(JSON.stringify(p)).toString('base64url')).join('.');
  await page.addInitScript(([key, token]) => localStorage.setItem(key, JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, user: { id: 'u1', email: 'member@example.com', aud: 'authenticated', role: 'authenticated' } })), [`sb-${db.host.split('.')[0]}-auth-token`, jwt]);
  const table = JSON.parse(readFileSync(new URL('./fixtures/recipes.json', import.meta.url)));
  const asked = [];
  await page.route(`${db.origin}/**`, (route) => {
    const req = route.request(), url = new URL(req.url()), method = req.method();
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const body = (() => { try { return req.postDataJSON(); } catch (e) { return null; } })(); // a photo isn't JSON
    asked.push({ method, path: url.pathname + url.search, body });
    if (url.pathname.endsWith('/rpc/is_member')) return json(true);
    if (url.pathname.endsWith('/rest/v1/recipes')) {
      if (method === 'GET') return json(table);
      if (method === 'POST') return json(req.postDataJSON().map((r, i) => ({ id: `new-${i}`, cooked: false, rating: 0, created_at: new Date().toISOString(), ...r })), 201);
      return json(method === 'PATCH' ? [{ id: url.searchParams.get('id').slice(3) }] : []); // the row an update asks back for
    }
    return json([]); // signed links for photos: none
  });

  await page.goto(base + '/apps/recipes');
  await until(page, () => document.querySelectorAll('#cards .item').length === 3);
  if (!(await page.textContent('#tally')).includes('1 of 3')) throw new Error('the cooked count is wrong');
  await shot('recipes');
  step('signed in as a member: 3 recipes, 1 cooked');

  await page.fill('#search', 'noodles');
  if ((await page.locator('#cards .item:visible').count()) !== 1) throw new Error("search didn't narrow the list to one");
  await page.fill('#search', '');
  step('search narrows the list');

  await page.locator('#cards .item:visible [data-do="cook"]:visible').first().click();
  await until(page, () => document.getElementById('tally').textContent.includes('2 of 3'));
  const cooked = asked.find((a) => a.method === 'PATCH');
  if (!cooked || cooked.body.cooked !== true || !/^\d{4}-\d\d-\d\d$/.test(cooked.body.date_cooked)) throw new Error(`marking one cooked sent ${JSON.stringify(cooked)}`);
  step('marked one cooked');

  // notes save themselves a moment after the typing stops; a star saves at once
  const first = page.locator('#cards .item:visible').first();
  await first.locator('[data-is="notes"]').fill('Smoke test note');
  await until(page, () => !document.querySelector('[data-save="saving"]'));
  await first.locator('.rating button').nth(6).click();
  await until(page, () => /7\/10/.test(document.querySelector('#cards .item .rating output').textContent));
  const sent = asked.filter((a) => a.method === 'PATCH').map((a) => a.body);
  if (!sent.some((b) => b.notes === 'Smoke test note') || !sent.some((b) => b.rating === 7)) throw new Error(`notes and a rating sent ${JSON.stringify(sent)}`);
  step('notes saved as typed, and a rating');

  // a photo is shrunk to a JPEG, stored under recipes/<id>/, and the recipe points at it
  await first.locator('.photo-btn input').setInputFiles({ name: 'dinner.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
  await until(page, () => document.querySelector('#cards .item .item__photo:not([hidden])'));
  const upload = asked.find((a) => a.method === 'POST' && a.path.includes('/object/photos/recipes/'));
  if (!upload || !upload.path.endsWith('.jpg') || !asked.some((a) => a.method === 'PATCH' && /^recipes\/.+\.jpg$/.test(a.body?.photo_path))) throw new Error(`adding a photo sent ${JSON.stringify(upload)}`);
  step('added a photo');

  // Enter in the dialog adds it (a link without https:// is fine); Cancel adds nothing
  await page.click('#add');
  await page.click('#add-dialog [data-close]');
  await page.click('#add');
  await page.fill('#add-dialog [name="title"]', 'Smoke test soup');
  await page.fill('#add-dialog [name="link"]', 'example.com/soup');
  await page.keyboard.press('Enter');
  await until(page, () => document.querySelectorAll('#cards .item').length === 4);
  if (asked.filter((a) => a.method === 'POST' && a.path.includes('/rest/v1/recipes')).length !== 1) throw new Error('cancelling the dialog added a recipe');
  await shot('added');
  step('added one with Enter; Cancel added nothing');

  // an expired sign-in link says so
  await page.goto(base + '/apps/recipes#error=access_denied&error_code=otp_expired&error_description=expired');
  await page.reload();
  await until(page, () => document.getElementById('app').dataset.state === 'in');
  if (!/expired/.test(await page.textContent('#gate-note')) || (await page.evaluate(() => location.hash))) throw new Error("an expired sign-in link wasn't explained");
  step('an expired sign-in link says so');

  await page.goto(base + '/apps/');
  await until(page, () => document.getElementById('app').dataset.state === 'in');
  if (!(await page.isVisible('#app-main a[href="/apps/recipes"]')) || !(await page.isVisible('.site-nav [data-members]'))) throw new Error("/apps doesn't list the recipe tracker, or the nav has no Apps link");
  await shot('home');
  step('/apps lists it, and the nav has Apps');
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
if (want('apps')) await session('apps', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, apps);
if (want('desktop')) await session('desktop planet', { viewport: { width: 1280, height: 800 } }, (p, s) => planet(p, s));
if (want('phone')) await session('phone planet', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, (p, s) => planet(p, s, { phone: true }));
if (want('nogl')) await session('nogl fallback', { viewport: { width: 1280, height: 800 } }, noWebGL, [...browserArgs, '--disable-webgl', '--disable-webgl2', '--disable-3d-apis']);

server.close();
if (failures.length) {
  console.error(`\n${failures.length} failed:\n${failures.map((f) => `✗ ${f}`).join('\n')}`);
  process.exit(1);
}
console.log('\n✓ smoke test passed');
