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

// Signed in as a member, against a made-up Supabase (routed on `target`: the page, or its whole
// context so the service worker's requests are caught too) and a made-up Open-Meteo where every
// day is 18° / 9° with a 40% chance of rain (70% on 15 October). Returns what was asked of it.
async function member(page, target) {
  const db = new URL(await page.getAttribute('meta[name="supabase-url"]', 'content'));
  const jwt = [{ alg: 'HS256', typ: 'JWT' }, { sub: 'u1', email: 'member@example.com', role: 'authenticated', exp: 4102444800 }, 'x'].map((p) => Buffer.from(JSON.stringify(p)).toString('base64url')).join('.');
  await page.addInitScript(([key, token]) => localStorage.setItem(key, JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: 4102444800, user: { id: 'u1', email: 'member@example.com', aud: 'authenticated', role: 'authenticated' } })), [`sb-${db.host.split('.')[0]}-auth-token`, jwt]);
  const table = JSON.parse(readFileSync(new URL('./fixtures/recipes.json', import.meta.url)));
  const closet = JSON.parse(readFileSync(new URL('./fixtures/wardrobe.json', import.meta.url)));
  const tripTable = JSON.parse(readFileSync(new URL('./fixtures/trips.json', import.meta.url)));
  const photoTable = JSON.parse(readFileSync(new URL('./fixtures/wardrobe-photos.json', import.meta.url)));
  const asked = [];
  await target.route(`${db.origin}/**`, (route) => {
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

  // Open-Meteo, made up: a place is wherever you ask
  await target.route(/open-meteo\.com/, (route) => {
    const u = new URL(route.request().url()), json = (b) => route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(b) });
    if (u.hostname.startsWith('geocoding')) return json({ results: [{ name: u.searchParams.get('name').split(',')[0], country: 'Somewhere', latitude: 45, longitude: 9, timezone: 'Europe/Rome' }] });
    const from = new Date(u.searchParams.get('start_date') + 'T12:00:00Z'), to = new Date(u.searchParams.get('end_date') + 'T12:00:00Z'), time = [];
    for (let d = from; d <= to; d = new Date(d.getTime() + 864e5)) time.push(d.toISOString().slice(0, 10));
    const fill = (v) => time.map(() => v);
    return json({ daily: { time, temperature_2m_max: fill(18), temperature_2m_min: fill(9), precipitation_probability_max: time.map((d) => (d === '2026-10-15' ? 70 : 40)), precipitation_sum: fill(u.searchParams.get('start_date').endsWith('5') ? 3 : 0) } });
  });
  return asked;
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

  const asked = await member(page, page);
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

  // the wardrobe: the closet, a chip, an item's sheet saving as it's typed, adding from a store
  // link and from a photo (offline the cut-out can't load, so the photo is kept as taken), retiring.
  // The clock is set to before the fixture's trip, so the wardrobe opens on the closet.
  await page.clock.setFixedTime(new Date('2026-09-01T10:00:00'));
  await page.goto(base + '/apps/wardrobe');
  await until(page, () => document.querySelectorAll('#grid .tile:not([hidden])').length === 3);
  if (!(await page.textContent('#cats')).includes('Shoes1')) throw new Error("the wardrobe's chips don't count the shoes");
  await shot('wardrobe');
  step('wardrobe: 3 in the closet (the retired one hidden), chips counted');
  await page.click('#cats button[data-value="shoes"]');
  if ((await page.locator('#grid .tile:visible').count()) !== 1) throw new Error("the Shoes chip didn't narrow the closet");
  await page.click('#cats button[data-value=""]');
  await page.locator('#grid .tile:visible .tile__open').first().click();
  await until(page, () => document.getElementById('sheet').open && /^#item\//.test(location.hash));
  if (!(await page.isVisible('#sv-name')) || await page.isVisible('#sheet [data-is="brand"]')) throw new Error("an item doesn't open on what it is");
  await shot('item');
  // its photos: the tag is kept beside the garment photo; a garment photo that becomes a "detail"
  // stops being shown, and the tag never takes its place; any photo can be shown on purpose
  await until(page, () => document.querySelectorAll('#sheet-photos .photo-thumb').length === 2);
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
  await page.click('#sheet [data-close]');
  step('added one from a store link: name, brand, price and the buy link');
  await page.click('#add');
  await page.locator('#add-photo input').setInputFiles({ name: 'shirt.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
  await page.fill('#add-dialog [name="name"]', 'Smoke linen shirt');
  await until(page, () => !document.getElementById('add-ok').disabled, null, 60000);
  await page.click('#add-ok');
  await until(page, () => document.getElementById('sheet').open);
  const shirtUpload = asked.find((a) => a.method === 'POST' && a.path.includes('/object/photos/wardrobe/u1/'));
  const withPhoto = asked.filter((a) => a.method === 'POST' && a.path.includes('/rest/v1/wardrobe_items')).pop();
  if (!shirtUpload || !/^wardrobe\/u1\//.test(withPhoto.body[0].photo_path || '')) throw new Error(`adding a photo sent ${JSON.stringify(shirtUpload)} / ${JSON.stringify(withPhoto)}`);
  await page.click('#retire');
  await until(page, () => !document.getElementById('sheet').open);
  if (!asked.some((a) => a.method === 'PATCH' && a.path.includes('wardrobe_items') && a.body?.retired === true)) throw new Error("retiring didn't save");
  await shot('wardrobe-added');
  step('added one from a photo, into its own folder; retired it');

  // trips: the list, a trip with its legs and weather, its days; packing: ticking something off
  // (and undoing it) and adding to the list save; a new trip looks its places up
  await page.goto(base + '/apps/wardrobe');
  await until(page, () => document.getElementById('app').dataset.state === 'in');
  await page.click('#tabs a[data-value="trips"]');
  await until(page, () => document.querySelectorAll('#trip-list .trip-card').length === 1);
  await page.click('#trip-list .trip-card');
  await until(page, () => document.querySelectorAll('#legs .leg__days li').length > 30);
  if ((await page.locator('#legs .leg').count()) !== 3 || (await page.locator('#days .day').count()) !== 2 || !(await page.textContent('#pack-sum')).includes('1 of 3')) throw new Error("the trip doesn't show its legs, days and packing");
  if (!/highs 18°, lows 9°/.test(await page.textContent('#legs'))) throw new Error("the trip's weather isn't shown");
  await shot('trip');
  await page.click('#pack-open');
  await until(page, () => location.hash === '#trip/t1/pack' && document.querySelectorAll('#pack-groups .pack-row').length === 2);
  if (!(await page.textContent('#pack-left')).includes('2') || !(await page.isVisible('#pack-from-plan'))) throw new Error("the packing list doesn't show what's left, or the planned outfits' things");
  await page.locator('#pack-groups .pack-row__box').first().click();
  await until(page, () => document.getElementById('pack-count').textContent.startsWith('2 of 3') && document.querySelector('.app-toast__undo'));
  await page.click('.app-toast__undo');
  await until(page, () => document.getElementById('pack-count').textContent.startsWith('1 of 3'));
  await page.locator('#pack-groups .pack-row__box').first().click();
  await page.fill('#pack-add [name="label"]', 'Charger');
  await page.click('#pack-add button');
  await until(page, () => /^2 of 4/.test(document.getElementById('pack-count').textContent));
  await page.click('#pack-show button[data-value="all"]');
  await until(page, () => document.querySelectorAll('#pack-groups .pack-row').length === 4);
  await shot('packing');
  const packs = asked.filter((a) => a.method === 'PATCH' && a.path.includes('/rest/v1/trips')).map((a) => a.body.packing.filter((x) => x.packed).length);
  if (packs.join() !== '2,1,2,2' || !asked.some((a) => a.body?.packing?.some((x) => x.label === 'Charger'))) throw new Error(`packing saved ${JSON.stringify(packs)}`);
  await page.goBack();
  await until(page, () => location.hash === '#trip/t1' && !document.getElementById('trip').hidden);
  await page.click('#trip-back');
  await page.click('#new-trip');
  await page.fill('#trip-dialog [name="name"]', 'Smoke weekend');
  await page.fill('#leg-rows [data-k="place"]', 'Lisbon, Portugal');
  await page.fill('#leg-rows [data-k="from"]', '2026-12-01');
  await page.fill('#leg-rows [data-k="to"]', '2026-12-03');
  await page.click('#trip-dialog [type="submit"]');
  await until(page, () => document.getElementById('trip-name').textContent === 'Smoke weekend');
  const made = asked.find((a) => a.method === 'POST' && a.path.includes('/rest/v1/trips'));
  if (!made || made.body[0].legs[0].place !== 'Lisbon' || made.body[0].legs[0].lat !== 45) throw new Error(`a new trip saved ${JSON.stringify(made)}`);
  step('trips: legs with weather, days; packing ticked, undone and added to; Back goes back; a new trip');

  // Today, mid-trip: where you are, the weather and what you're wearing, with a word about the rain
  // (and the suede); the next day is a tap away; an item opens over it and Back closes it
  await page.clock.setFixedTime(new Date('2026-10-15T09:00:00'));
  await page.goto(base + '/apps/wardrobe');
  await until(page, () => document.querySelector('.today-card') && location.hash === '');
  const today = await page.textContent('#today-view');
  if (!/Florence/.test(await page.textContent('.today-card__place')) || !/Uffizi/.test(today) || (await page.locator('.outfit__item').count()) !== 2) throw new Error(`Today doesn't show the day: ${today.slice(0, 200)}`);
  if (!/day 9 of 42/.test(today) || !/Rain likely \(70%\), and nothing in this outfit is for rain/.test(today) || !/Maybe not Brown suede loafers/.test(today)) throw new Error(`Today's trip line or advice is wrong: ${today.slice(0, 400)}`);
  await shot('today');
  await page.locator('.outfit__item').first().click();
  await until(page, () => document.getElementById('sheet').open);
  await page.goBack();
  await until(page, () => !document.getElementById('sheet').open && !document.getElementById('today-view').hidden);
  await page.click('.today-card__step button:last-child');
  await until(page, () => /Friday/.test(document.querySelector('.today-card__kicker').textContent));
  step('Today: the day, its weather and outfit, the rain and the suede; the next day; Back closes an item');

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
  await shot('consent');
  await page.route('https://chatgpt.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<p>ChatGPT, standing in</p>' }));
  await page.click('#consent-allow');
  await page.waitForURL(/^https:\/\/chatgpt\.com\/connector_platform_oauth_redirect\?code=c/);
  if (!asked.some((a) => a.method === 'POST' && a.path.endsWith('/oauth/authorizations/gpt/consent') && a.body?.action === 'approve')) throw new Error("Allow didn't approve the request");
  await page.unroute('https://chatgpt.com/**');
  step('consent page: ChatGPT and Claude can be allowed (and you go back), anyone else can\'t');

  await page.goto(base + '/apps/');
  await until(page, () => document.getElementById('app').dataset.state === 'in');
  if (!(await page.isVisible('#app-main a[href="/apps/wardrobe"]'))) throw new Error("/apps doesn't list the wardrobe");
  if (!(await page.isVisible('#app-main a[href="/apps/recipes"]')) || !(await page.isVisible('.site-nav [data-members]'))) throw new Error("/apps doesn't list the recipe tracker, or the nav has no Apps link");
  await shot('home');
  step('/apps lists it, and the nav has Apps');
}

// With no connection: the wardrobe opens on the copy it kept (through its service worker), a
// packing tick is kept, and it's sent when the connection's back
async function offline(page, shot) {
  await page.clock.setFixedTime(new Date('2026-10-15T09:00:00'));
  await page.goto(base + '/apps/wardrobe');
  const asked = await member(page, page.context());
  await page.goto(base + '/apps/wardrobe');
  await until(page, () => document.querySelector('.today-card'));
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now through the service worker, which keeps the page and its scripts as they pass
  await until(page, () => navigator.serviceWorker.controller && document.querySelector('.today-card'));
  await page.context().setOffline(true);
  await page.reload();
  await until(page, () => document.querySelector('.today-card') && !document.getElementById('offline-note').hidden);
  if (!/Florence/.test(await page.textContent('.today-card__place'))) throw new Error("offline, Today isn't there");
  await shot('offline');
  step('offline: the page, its scripts and the data come from the copy on the phone');
  await page.click('.today__part a[href$="/pack"]');
  await until(page, () => document.querySelectorAll('#pack-groups .pack-row').length === 2);
  const before = asked.length;
  await page.locator('#pack-groups .pack-row__box').first().click();
  await until(page, () => document.getElementById('pack-count').textContent.startsWith('2 of 3'));
  if (asked.slice(before).some((a) => a.method === 'PATCH')) throw new Error('a tick went out with no connection');
  await page.context().setOffline(false);
  await until(page, () => document.getElementById('offline-note').hidden);
  const sent = asked.slice(before).find((a) => a.method === 'PATCH' && a.path.includes('/rest/v1/trips'));
  if (!sent || sent.body.packing.filter((x) => x.packed).length !== 2) throw new Error(`the tick made offline sent ${JSON.stringify(sent)}`);
  step('a tick made offline is kept, and sent when the connection is back');
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

  // the closet: a grid, photos first; a garment opens in the card, with its photos and their roles
  await call('ingest_item', { product: { brand: 'Everlane', name: 'The Organic Cotton Crew', style_number: 'EV-1042', material: '100% organic cotton', sources: { brand: 'garment_label', name: 'hang_tag', style_number: 'hang_tag', material: { source: 'care_label', raw: '100% ORGANIC COTTON' } } }, variant: { manufacturer_colour: 'White', manufacturer_size: 'M', price: 30, currency: 'USD', sources: { manufacturer_colour: 'hang_tag', price: 'hang_tag' } }, item: { category: 'tops', subcategory: 't_shirt', warmth: 'light', dressiness: 'casual', dressiness_also: ['smart casual'] }, garment_photo: file('crew-front'), tag_photo: file('crew-tag'), care_label_photo: file('crew-care'), client_ref: 'smoke-crew' });
  const closet = await call('find_items', {});
  await show({}, closet);
  await frame.locator('.w-card').first().waitFor();
  if ((await frame.locator('.w-card').count()) !== closet.structuredContent.count) throw new Error("the card's closet doesn't show every garment");
  await shot('closet');
  step(`the closet: ${closet.structuredContent.count} garments in a grid, in the official MCP Apps host`);
  await frame.locator('.w-card', { hasText: 'Organic Cotton Crew' }).click();
  await frame.locator('.w-garment').waitFor();
  if ((await frame.locator('.w-thumb').count()) !== 3 || !/Garment · shown/.test(await frame.locator('.w-thumbs').textContent()) || !/care label/.test(await frame.locator('.w-sources').textContent())) throw new Error("a garment in the card doesn't show its photos and roles, or where its facts came from");
  await shot('garment');
  await frame.locator('.w-thumb', { hasText: 'Tag' }).click();
  await frame.getByRole('button', { name: 'Show this one' }).click();
  await frame.locator('.w-thumb', { hasText: 'Tag · shown' }).waitFor();
  const [crew] = await w.q(`select photo_path from public.wardrobe_items where ingest_key = 'smoke-crew'`);
  if (!/crew-tag/.test(crew.photo_path)) throw new Error(`"Show this one" in the card didn't change the photo shown: ${crew.photo_path}`);
  await frame.locator('.w-thumb', { hasText: 'Tag' }).click();
  await frame.locator('.w-seg__b', { hasText: /^Garment$/ }).click();
  await frame.locator('.w-thumb', { hasText: 'Garment · shown' }).waitFor({ timeout: 10000 }).catch(() => {}); // the tag back to being a garment photo, if Steve says so
  await frame.getByRole('button', { name: '‹ Back' }).click();
  await frame.locator('.w-grid').waitFor();
  step('a garment opens in the card: photos with roles, facts and their sources; "Show this one" and the roles save; Back');

  // filing: a dry run's preview, then "File it" from the card
  const input = { product: { brand: 'Uniqlo', name: 'Soft Brushed Crew Neck Long Sleeve T', style_number: 'HT00189AD-US', sources: { style_number: 'hang_tag' } }, variant: { manufacturer_colour: '09 Black', manufacturer_size: 'M', price: 29.9, currency: 'USD', sources: { manufacturer_colour: 'hang_tag', manufacturer_size: 'hang_tag', price: 'hang_tag' } }, item: { category: 'tops', subcategory: 'long_sleeve_t_shirt', warmth: 'mid', dressiness: 'casual', sources: { warmth: { source: 'vision_inference', confidence: 0.8 } } }, client_ref: 'smoke-black', dry_run: true };
  await show(input, await call('ingest_item', input));
  await frame.getByRole('button', { name: 'File it' }).waitFor();
  const preview = await frame.locator('#app').textContent();
  if (!/Ready to file/.test(preview) || !/Product: already here \(matched on brand and style number\)/.test(preview) || !/09 Black \/ M: new/.test(preview) || !/hang tag/.test(preview)) throw new Error(`the card's dry run preview: ${preview.slice(0, 300)}`);
  await shot('ingest-preview');
  await frame.getByRole('button', { name: 'File it' }).click();
  await frame.locator('.w-banner', { hasText: 'Filed: existing product · new variant · 1 new item' }).waitFor();
  if (!(await w.q(`select id from public.wardrobe_items where ingest_key = 'smoke-black'`)).length) throw new Error('"File it" in the card filed nothing');
  await shot('ingest-filed');
  step('filing: the dry run\'s preview (each level, every value\'s source, warnings), then "File it" files it');

  // a trip: legs and weather, each day's outfit with photos, packing ticked off from the card
  const t = (await call('create_trip', { name: 'Europe, autumn', legs: [{ place: 'London', from: '2026-10-07', to: '2026-10-14' }, { place: 'Florence', from: '2026-10-14', to: '2026-11-14' }] })).structuredContent;
  const ids = (await call('find_items', {})).structuredContent.items.map((i) => i.id);
  await call('plan_days', { trip_id: t.id, days: [{ date: '2026-10-08', items: ids.slice(0, 3), occasion: 'Tate Modern, then dinner' }, { date: '2026-10-15', items: ids.slice(2, 5), occasion: 'Uffizi' }] });
  await call('set_packing', { trip_id: t.id, items: [...ids.slice(0, 4).map((item_id) => ({ item_id })), { label: 'Plug adapter', qty: 2 }] });
  await show({ id: t.id }, await call('get_trip', { id: t.id }));
  await frame.locator('.w-day').first().waitFor();
  if ((await frame.locator('.w-day').count()) !== 2 || (await frame.locator('.w-fit__item').count()) !== 6 || !/0 of 5 packed/.test(await frame.locator('.w-count').textContent())) throw new Error("the card's trip board doesn't show the days, outfits and packing");
  await shot('trip');
  await frame.locator('.w-pack input').first().check();
  await frame.locator('.w-count', { hasText: '1 of 5 packed' }).waitFor();
  const [{ packing }] = await w.q(`select packing from public.trips where id = $1`, [t.id]);
  if (packing.filter((p) => p.packed).length !== 1) throw new Error(`ticking in the card saved ${JSON.stringify(packing)}`);
  step('a trip: legs, each day\'s outfit with photos, and packing ticked off from the card (saved)');

  await show({}, closet, 'dark');
  await frame.locator('.w-card').first().waitFor();
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
if (want('apps')) await session('apps', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' }, apps);
if (want('apps')) await session('card in chat', { viewport: { width: 440, height: 900 }, deviceScaleFactor: 2 }, card);
if (want('apps')) await session('offline wardrobe', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, offline);
if (want('desktop')) await session('desktop planet', { viewport: { width: 1280, height: 800 } }, (p, s) => planet(p, s));
if (want('phone')) await session('phone planet', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, (p, s) => planet(p, s, { phone: true }));
if (want('nogl')) await session('nogl fallback', { viewport: { width: 1280, height: 800 } }, noWebGL, [...browserArgs, '--disable-webgl', '--disable-webgl2', '--disable-3d-apis']);

server.close();
if (failures.length) {
  console.error(`\n${failures.length} failed:\n${failures.map((f) => `✗ ${f}`).join('\n')}`);
  process.exit(1);
}
console.log('\n✓ smoke test passed');
