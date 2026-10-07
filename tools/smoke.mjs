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
  await page.evaluate(() => window.__world.getOutOfHammock());
  await expectState(page, 'walk');
  step(`hammock: lay down, leaned in on a shelf and stepped through it (${await page.evaluate(() => window.__world.stars)} stars), got up`);

  // the telescope: bend to the eyepiece and the view narrows onto what it's pointed at, a card
  // says what; › swings it to the next; the launch panel is a button away; Esc steps back
  await page.evaluate(() => window.__world.scope.go());
  await until(page, () => window.__world.state === 'scope' && window.__world.scope.k === 1 && !document.getElementById('scope-card').hidden, null, 120000);
  const firstSight = await page.evaluate(() => window.__world.scope.target);
  if (!firstSight || await page.evaluate(() => window.__world.camera.fov >= 60)) throw new Error("the telescope didn't narrow onto anything");
  await shot('telescope');
  if (await page.evaluate(() => window.__world.scope.count) > 1) {
    await page.click('#scope-next');
    await until(page, (f) => window.__world.scope.target !== f, firstSight);
  }
  await page.click('#scope-more');
  await until(page, () => !document.getElementById('panel').hidden && document.getElementById('panel').dataset.id === 'launch');
  await page.click('#panel-close');
  await until(page, () => document.getElementById('panel').hidden);
  await page.keyboard.press('Escape');
  await expectState(page, 'walk');
  step(`telescope: looked through it at ${firstSight.toLowerCase()}, stepped back`);

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
// context so the service worker's requests are caught too) and a made-up Open-Meteo in Florence's
// timezone where every day is partly cloudy, 18° / 9° with a 40% chance of rain, except 15
// October: rain (70%), dry and cloudy until 2 PM, then rain, heaviest at 4, 10.5° by 8 PM. The trip has three travelers,
// two bags, a packing list (a garment, a baby's thing, a shared one, one nobody's, one of Lexi's,
// and one on a trip that isn't loaded, never shown), two journeys, a hotel and a link. Returns what was asked of it.
async function member(page, target) {
  const db = new URL(await page.getAttribute('meta[name="supabase-url"]', 'content'));
  const jwt = [{ alg: 'HS256', typ: 'JWT' }, { sub: 'u1', email: 'member@example.com', role: 'authenticated', exp: 4102444800 }, 'x'].map((p) => Buffer.from(JSON.stringify(p)).toString('base64url')).join('.');
  await page.addInitScript(([key, token]) => localStorage.setItem(key, JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: 4102444800, user: { id: 'u1', email: 'member@example.com', aud: 'authenticated', role: 'authenticated' } })), [`sb-${db.host.split('.')[0]}-auth-token`, jwt]);
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
    ],
    trip_lodging: [{ id: 'l1', name: 'Hotel Bloomsbury', place: 'London', check_in: '2026-10-07', check_out: '2026-10-14' }],
    trip_resources: [{ id: 'r1', type: 'insurance', label: 'Travel insurance', url: 'https://insurance.example/policy' }],
  };
  for (const [k, rows] of Object.entries(tripParts)) tripParts[k] = rows.map((r, i) => ({ ...mine, created_at: `2026-10-01T12:00:0${i}Z`, ...r }));
  let made = 0;
  const photoTable = JSON.parse(readFileSync(new URL('./fixtures/wardrobe-photos.json', import.meta.url)));
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
  if ((await page.textContent('#app-title')) !== 'Closet' || !(await page.isVisible('#tabs a[data-value="closet"][aria-current="page"]'))) throw new Error("the wardrobe doesn't say it's on the closet");
  await shot('wardrobe');
  step('wardrobe: 3 in the closet (the retired one hidden), chips counted, the title and tab say where it is');
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
  await page.goto(base + '/apps/wardrobe');
  await until(page, () => document.getElementById('app').dataset.state === 'in');
  await page.click('#tabs a[data-value="trips"]');
  await until(page, () => document.querySelectorAll('#trip-list .trip-card').length === 1);
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
  const goes = await page.locator('#trip-go .info-row').allTextContents();
  if (goes.length !== 2 || !/^Philadelphia PHL → London LHR.*British Airways BA 66.*18:30 – 06:45 \(.*7.*\).*ref XK7Q2B/.test(goes[0]) || !/London → Florence.*07:01 – 19:30/.test(goes[1])) throw new Error(`getting there, in order, times as given: ${goes.join(' / ')}`);
  if (!/Hotel Bloomsbury.*London/.test(await page.textContent('#trip-stay')) || (await page.getAttribute('#trip-links a', 'href')) !== 'https://insurance.example/policy') throw new Error("the trip's lodging or links aren't shown");
  if (!/09:30–12:00\s*Uffizi\s*sightseeing\s*20:00\s*Dinner at Buca Mario/.test(await page.textContent('#days'))) throw new Error(`a day's plans, in time order: ${await page.textContent('#days')}`);
  await page.locator('#trip-go-part').scrollIntoViewIfNeeded();
  await shot('trip');
  step('a trip: legs with weather, who\'s going, getting there in order with times as given, staying, links, each day\'s plans');

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
  await shot('packing');
  await page.setViewportSize({ width: 1100, height: 900 });
  await shot('packing-wide');
  await page.setViewportSize({ width: 390, height: 844 });
  step('adding from the planned outfits and by hand (from the filters) POST entries; one taken off and put back');
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
  await page.goto(base + '/apps/wardrobe');
  await until(page, () => document.querySelector('.today-card .hours') && location.hash === '');
  const flat = (x) => x.replace(/\s/g, ' '); // times keep their words together with a no-break space
  const today = flat(await page.textContent('#today-view'));
  if (!/Florence/.test(await page.textContent('.today-card__place')) || !/Uffizi/.test(today) || (await page.locator('.today-card .flatlay .outfit__item').count()) !== 2) throw new Error(`Today doesn't show the day, its outfit laid flat: ${today.slice(0, 200)}`);
  if (!/day 9 of 42/.test(today) || !/Rain likely from about 2 PM \(70%\), and nothing in this outfit is for rain/.test(today) || !/Maybe not Brown suede loafers/.test(today) || !/Dinner at Buca Mario at 20:00: about 51°, and nothing warm in this outfit/.test(today)) throw new Error(`Today's trip line or advice (the rain's timing, the evening plan's chill) is wrong: ${today.slice(0, 600)}`);
  // the weather now, there (11 AM in Florence: 14°C), its sky in words from the code, the day in a
  // sentence, and the hours: Now first, the rain's chance where it's likely, the sunset in its place
  const panel = page.locator('.today-card .sky-panel');
  if ((await page.textContent('.today-card__temp')).trim() !== '57°' || (await page.textContent('.today-card__word')) !== 'Cloudy' || (await panel.getAttribute('data-sky')) !== 'cloudy' || (await panel.getAttribute('data-time')) !== 'day') throw new Error(`the weather now: ${await page.textContent('.today-card__wx')} (${await panel.getAttribute('data-sky')}, ${await panel.getAttribute('data-time')})`);
  if (!/^Rain from about 2 PM, heaviest at 4 PM\. Cool evening, down to 4\d°\.$/.test(flat(await page.textContent('.today-card__story')))) throw new Error(`the day in a sentence: ${await page.textContent('.today-card__story')}`);
  const hourWords = (await page.locator('.hours .hour .visually-hidden').allTextContents()).map(flat);
  if (hourWords.length !== 27 || hourWords[0] !== 'Now: cloudy, 57°' || !hourWords.includes('4 PM: rain, 62°, 80% chance of rain') || !hourWords.includes('Sunset at 6:39 PM') || !hourWords.includes('Sunrise at 7:21 AM') || !(await page.locator('.hours .hour--moment').count()) || (await page.getAttribute('.hours__list', 'aria-label')) !== 'Hour by hour, the next 24 hours') throw new Error(`the hours: ${hourWords.join(' | ')}`);
  await shot('today');
  // a tap on a temperature switches to °C everywhere, and it's remembered
  await page.click('.today-card__temp');
  await until(page, () => document.querySelector('.today-card__temp')?.textContent.trim() === '14°' && /°C/.test(document.getElementById('app-toast').textContent));
  if (!/about 11°, and nothing warm/.test(await page.textContent('#today-view')) || (await page.evaluate(() => localStorage.getItem('wardrobe-units'))) !== 'C' || !(await page.locator('.hours .hour').first().textContent()).includes('14°')) throw new Error('switching to °C didn\'t reach every temperature, or wasn\'t kept');
  await page.locator('.today-card .outfit__item').first().click();
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
// change to a packing entry is kept, and it's sent when the connection's back
async function offline(page, shot) {
  await page.clock.setFixedTime(new Date('2026-10-15T11:00:00+02:00'));
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
  if ((await page.textContent('.today-card__temp')).trim() !== '57°' || !/^Rain from about\s2\sPM/.test(await page.textContent('.today-card__story')) || (await page.locator('.hours .hour').count()) < 25) throw new Error(`offline, Today doesn't show the last weather kept (now, the sentence, the hours): ${await page.textContent('.today-card .sky-panel')}`);
  await shot('offline');
  step('offline: the page, its scripts and the data come from the copy on the phone');
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
  await page.context().setOffline(false);
  await until(page, () => document.getElementById('offline-note').hidden);
  const sent = asked.slice(before).filter((a) => a.method === 'PATCH');
  if (sent.length !== 1 || !/trip_packing\?(.*&)?id=eq\.p2(&|$)/.test(sent[0].path) || JSON.stringify(sent[0].body) !== '{"status":"packed"}') throw new Error(`the change made offline sent ${JSON.stringify(sent)}`);
  step('a status change made offline is kept (adding says it has to wait), and sent as one PATCH of that entry when the connection is back');
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
if (want('apps')) await session('apps', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: 'en-US', timezoneId: 'Europe/Rome' }, apps);
if (want('apps')) await session('card in chat', { viewport: { width: 440, height: 900 }, deviceScaleFactor: 2 }, card);
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
