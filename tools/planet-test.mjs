// Planet specs (supabase/functions/_shared/planet.js): Steve's, built from _data/ (tools/planet.mjs),
// passes; a small planet of someone else's passes; and each way a spec can go wrong is caught, with
// where and what. Then what the world draws from a spec (planetParts), a spec packed into an address
// and back, and the Planets connector (supabase/functions/planets/server.js): its tools, its card,
// a preview, and a spec with mistakes said back. Offline, well under a second.
//
//   node tools/planet-test.mjs
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { checkPlanet, planetParts, planetHas, packPlanet, unpackPlanet, PREVIEW_PAGE, LIMITS } from '../supabase/functions/_shared/planet.js';
import * as planets from '../supabase/functions/planets/server.js';
import { buildPlanet } from './planet.mjs';

let passed = 0;
const ok = (cond, what, detail) => { if (!cond) throw new Error(`planet: ${what}${detail !== undefined ? `\n  got ${JSON.stringify(detail).slice(0, 900)}` : ''}`); passed++; };
const clone = (o) => JSON.parse(JSON.stringify(o));
// the spec with one change made, and what checkPlanet says about it
const errorsWith = (spec, change) => { const s = clone(spec); change(s); return checkPlanet(s); };
const caught = (spec, change, re, what) => { const e = errorsWith(spec, change); ok(e.some((x) => re.test(x)), what, e); };

// ---------- Steve's ----------
const read = (f) => readFileSync(new URL(`../_data/${f}`, import.meta.url), 'utf8');
const steve = buildPlanet(read('bar.yml'), read('drinks.yml'));
ok(checkPlanet(steve).length === 0, "Steve's planet passes", checkPlanet(steve));
ok(steve.collections.drinks.items.length > 0 && steve.robot.lines.length > 0 && steve.collections.thoughts.items.length > 0, 'it carries his drinks, the bartender and the campfire');
ok(steve.links.length === parse(read('bar.yml')).menu.length, 'every menu item is a link');
ok(JSON.stringify(steve).length < LIMITS.bytes / 4, 'it leaves plenty of room', JSON.stringify(steve).length);

// ---------- someone else's: the least a planet needs, then a fuller one ----------
const least = { version: 1, slug: 'sam', who: { name: 'Sam' } };
ok(checkPlanet(least).length === 0, 'a planet needs only a version, a slug and a name', checkPlanet(least));
const sam = {
  ...least,
  who: { name: 'Sam', sign: "Sam's" },
  links: [{ id: 'music', label: 'My band', note: 'Live dates and recordings', href: 'https://example.com' }, { id: 'mail', label: 'Write to me', href: 'mailto:sam@example.com' }],
  look: { theme: 'tiki-night', home: 'Austin' },
  collections: {
    records: { title: 'Records I love', items: [{ name: 'Kind of Blue', by: 'Miles Davis', year: 1959 }, 'Blue Train'] },
    setlist: { title: 'Tonight', items: ['Opener', 'Ballad', 'Closer'] },
  },
  places: [{ id: 'garage', kind: 'tiki-bar', displays: [{ kind: 'chalkboard', collection: 'setlist' }, { kind: 'star-sky', collection: 'records' }] }],
  robot: { lines: ['Welcome in.'], ask: ['What are you playing?'] },
  telescope: { engraving: 'Sam', pins: [{ city: 'Austin', lat: 30.27, lon: -97.74, zone: 'America/Chicago', note: 'Home', home: true }, { city: 'New Orleans', lat: 29.95, lon: -90.07, zone: 'America/Chicago' }], sights: ['moon', 'earth'] },
  launchPad: { countdowns: [{ name: 'Album out', on: '2027-03-01' }], launches: { provider: 'Rocket Lab' }, rocket: { name: 'Sam I', colors: ['#c0392b', '#f5f0e6'] } },
};
ok(checkPlanet(sam).length === 0, 'a fuller planet of their own passes', checkPlanet(sam));

// ---------- what's caught ----------
ok(checkPlanet(null)[0] === 'spec: should be an object' && checkPlanet([]).length === 1, 'something that isn\'t a spec at all');
caught(least, (s) => { s.version = 2; }, /^version: should be 1/, 'a version this code doesn\'t know');
for (const slug of ['', 'a', 'Sam', '-sam', 'sam-', 'sam steve', 'x'.repeat(33), 7]) caught(least, (s) => { s.slug = slug; }, /^slug:/, `a bad slug: ${JSON.stringify(slug)}`);
caught(least, (s) => { delete s.who; }, /^who: missing/, 'no who');
caught(least, (s) => { s.who.name = '  '; }, /^who\.name: empty/, 'an empty name');
caught(sam, (s) => { s.who.sign = 'Samantha Jones'; }, /^who\.sign: longer than 12/, 'a sign too long for the neon');
caught(least, (s) => { s.colour = 'red'; }, /^spec\.colour: not part of a planet spec/, 'a field that isn\'t part of a spec');
caught(sam, (s) => { s.who.age = 30; }, /^who\.age: not part/, 'a field that isn\'t part of who');
caught(sam, (s) => { s.links = Array.from({ length: LIMITS.links + 1 }, (_, i) => ({ id: `l${i}`, label: 'x', href: '/x' })); }, /^links: more than 8/, 'too many links');
caught(sam, (s) => { s.links[1].id = 'music'; }, /^links\[1\]\.id: "music" is used twice/, 'two links with one id');
for (const href of ['http://example.com', 'javascript:alert(1)', '//evil.example', 'example.com', ''])
  caught(sam, (s) => { s.links[0].href = href; }, /^links\[0\]\.href:/, `a link that isn't https, mailto or a site path: ${JSON.stringify(href)}`);
caught(sam, (s) => { s.look.theme = 'beach'; }, /^look\.theme: should be one of tiki-night/, 'a theme there\'s no art for yet');
caught(sam, (s) => { s.collections.Records = s.collections.records; }, /^collections\.Records: should be a short id/, 'a collection id with capitals');
caught(sam, (s) => { s.collections.records.src = '/records.json'; }, /^collections\.records: should have items or src, not both/, 'items and src both');
caught(sam, (s) => { s.collections.records = { title: 'Records', src: 'https://example.com/r.json' }; }, /^collections\.records\.src: should be a site path/, 'a list from another site');
caught(sam, (s) => { s.collections.records.items = Array(LIMITS.items + 1).fill('x'); }, /^collections\.records\.items: more than 200/, 'too many items');
caught(sam, (s) => { s.collections.records.items[0].notes = 'x'.repeat(LIMITS.text + 1); }, /^collections\.records\.items\[0\]\.notes: longer than 600/, 'an item\'s text too long');
caught(sam, (s) => { s.collections.records.items[0].a = { b: { c: { d: { e: 1 } } } }; }, /nested more than 4 deep/, 'an item nested too deep');
caught(sam, (s) => { s.collections.records.items[0].x = null; }, /items\[0\]\.x: should be text/, 'a null in an item');
caught(sam, (s) => { s.places[0].kind = 'castle'; }, /^places\[0\]\.kind: should be one of tiki-bar, campfire, hammock/, 'a place there\'s nothing to build it with');
caught(sam, (s) => { s.places[0].displays[0].kind = 'jukebox'; }, /^places\[0\]\.displays\[0\]\.kind:/, 'a display that doesn\'t exist yet');
caught(sam, (s) => { s.places[0].displays[0].collection = 'films'; }, /^places\[0\]\.displays\[0\]\.collection: no collection "films"/, 'a display of a collection that isn\'t there');
caught(sam, (s) => { delete s.places[0].displays[0].collection; }, /displays\[0\]\.collection: missing/, 'a display of nothing');
caught(sam, (s) => { s.places.push(clone(s.places[0])); }, /^places\[1\]\.id: "garage" is used twice/, 'two places with one id');
caught(sam, (s) => { s.robot.lines.push(''); }, /^robot\.lines\[1\]: empty/, 'an empty line for the robot');
caught(sam, (s) => { s.telescope.pins[0].home = 'yes'; }, /pins\[0\]\.home: should be true or false/, 'home that isn\'t true or false');
caught(sam, (s) => { s.telescope.pins[0].street = '1 Main St'; }, /pins\[0\]\.street: not part/, 'an address on a pin');
caught(sam, (s) => { delete s.telescope.pins[1].lat; }, /pins\[1\]\.lat: should be a latitude/, 'a pin with no latitude');
caught(sam, (s) => { s.telescope.pins[1].lon = 200; }, /pins\[1\]\.lon: should be a longitude/, 'a longitude off the globe');
caught(sam, (s) => { s.telescope.pins[1].zone = 'Central Time'; }, /pins\[1\]\.zone: should be a time zone/, 'a time zone that isn\'t one');
caught(sam, (s) => { s.telescope.sights.push('mars'); }, /sights\[2\]: should be one of moon, sun, earth/, 'a sight there\'s no art for yet');
caught(sam, (s) => { s.launchPad.countdowns[0].on = 'March 1'; }, /countdowns\[0\]\.on: should be a date/, 'a countdown with no date');
caught(sam, (s) => { s.launchPad.countdowns[0].on = '2027-02-31'; }, /countdowns\[0\]\.on: should be a date/, 'a date that isn\'t one');
caught(sam, (s) => { s.launchPad.launches = 'some'; }, /^launchPad\.launches:/, 'launches that aren\'t all, none or a provider');
caught(sam, (s) => { s.launchPad.rocket.colors = ['red']; }, /colors\[0\]: should be a colour/, 'a colour that isn\'t a hex colour');
caught(sam, (s) => { s.collections.records.items = Array(LIMITS.items).fill('x'.repeat(LIMITS.text)); }, /^spec: larger than 64 KB/, 'a spec over 64 KB');

// ---------- what the world draws ----------
const parts = planetParts(steve);
ok(parts.sign === "Steve's" && parts.engraving === "STEVE'S" && parts.board.title === 'Favorite drinks' && parts.board.recipes && parts.board.items[0].build, "Steve's: his sign, and his drinks with their recipes on the chalkboard");
ok(parts.thoughts.length === steve.collections.thoughts.items.length && parts.robot.lines === steve.robot.lines, "Steve's: the campfire's thoughts and the robot's lines");
const samParts = planetParts(sam);
ok(samParts.board.title === 'Tonight' && samParts.board.items.map((x) => x.name).join() === 'Opener,Ballad,Closer' && !samParts.board.recipes, 'a chalkboard of plain names', samParts.board);
const leastParts = planetParts(least);
ok(leastParts.sign === 'Sam' && leastParts.board.items.length === 0 && leastParts.thoughts.length === 0 && leastParts.robot.lines.length === 1, 'the least planet: its name on the sign, and a robot that says hello', leastParts);
ok(parts.pins[0].city === 'Philadelphia' && parts.pins[0].home && parts.pins.length === 7, "Steve's: Philadelphia ringed on the telescope's Earth, and the world's cities", parts.pins);
ok(samParts.pins.map((p) => p.city).join() === 'Austin,New Orleans' && leastParts.pins.length === 6 && !leastParts.pins.some((p) => p.home), "their own cities, or a few round the world and no one's home");
ok(planetParts({ ...least, collections: { r: { title: 'R', items: [{ title: 'Dune', by: 'Herbert' }, { by: 'Anon' }, 3] } }, places: [{ id: 'b', kind: 'tiki-bar', displays: [{ kind: 'chalkboard', collection: 'r' }] }] }).board.items.map((x) => x.name).join() === 'Dune,Anon,3', 'an item is named by its name, title or first text');

ok([...planetHas(steve)].sort().join() === 'campfire,hammock,telescope,tiki-bar' && [...planetHas(sam)].sort().join() === 'launch-pad,telescope,tiki-bar' && planetHas(least).size === 0 && planetHas({ ...least, launchPad: {} }).has('launch-pad'), "what's on a planet: its places by kind, a telescope and a launch pad if it has them, and nothing on the least one");

// ---------- a planet in an address ----------
const packed = await packPlanet(steve);
ok(JSON.stringify(await unpackPlanet(packed)) === JSON.stringify(steve), "Steve's planet packs into an address and back");
ok(/^[\w-]+$/.test(packed) && packed.length < JSON.stringify(steve).length * 0.6, 'packed: address-safe and smaller', packed.length);
for (const bad of ['', 'not a planet', '%%%', 'A'.repeat(LIMITS.bytes * 2 + 1)]) ok(await unpackPlanet(bad) === null, `not a planet: ${bad.slice(0, 20) || '(empty)'}`);

// ---------- the Planets connector ----------
const call = async (method, params) => planets.rpc({ jsonrpc: '2.0', id: 1, method, params }, { cardScript: async () => 'window.card = 1; // </script> stays inside' });
const init = (await call('initialize', { protocolVersion: '2025-06-18' })).result;
ok(init.protocolVersion === '2025-06-18' && init.serverInfo.name === 'planets' && /get_kit/.test(init.instructions), 'it says who it is and how to use it');
const tools = (await call('tools/list')).result.tools;
ok(tools.map((t) => t.name).join() === 'get_kit,preview_planet,send_planet' && tools[0].annotations.readOnlyHint && tools[1].annotations.readOnlyHint && !tools[2].annotations.readOnlyHint && !tools[2].annotations.destructiveHint, 'three tools: two read-only, and send_planet, the one that saves something (and destroys nothing)');
ok(/never send it without their go-ahead/i.test(init.instructions), 'a planet is sent only when its person says so');
ok(tools[1]._meta.ui.resourceUri === planets.APP_URI && tools[1]._meta['openai/outputTemplate'] === planets.APP_URI, 'preview_planet shows the card');
const res = (await call('resources/read', { uri: planets.APP_URI })).result.contents[0];
ok(res.mimeType === 'text/html;profile=mcp-app' && res.text.includes('window.card = 1') && !res.text.includes('// </script>'), "the card's page carries its script, and the script can't close the tag early");
ok(res._meta.ui.csp.frameDomains.includes(new URL(PREVIEW_PAGE).origin) && res._meta['openai/widgetCSP'].frame_domains.includes(new URL(PREVIEW_PAGE).origin), 'the card may show the preview page in a frame, in both apps');
const kit = (await call('tools/call', { name: 'get_kit', arguments: {} })).result;
ok(checkPlanet(kit.structuredContent.example).length === 0 && kit.structuredContent.drawn_today.length >= 3, "get_kit: what's drawn today, and an example that passes", checkPlanet(kit.structuredContent.example));
ok(['places', 'robot', 'telescope', 'launchPad'].every((k) => !(k in kit.structuredContent.shape) && !(k in kit.structuredContent.example)) && !kit.structuredContent.shape.who.sign && !/tiki|campfire|hammock/i.test(JSON.stringify(kit.structuredContent) + init.instructions), "get_kit offers nothing of Steve's planet: no places, robot, telescope, launch pad or sign");
const shown = (await call('tools/call', { name: 'preview_planet', arguments: { spec: sam } })).result;
ok(!shown.isError && shown.structuredContent.view === 'planet' && shown.structuredContent.url.startsWith(`${PREVIEW_PAGE}#`) && shown.content[0].text.includes(shown.structuredContent.url), 'a preview: the card, and the link in the text for apps without cards', shown);
ok(JSON.stringify(await unpackPlanet(shown.structuredContent.url.split('#')[1])) === JSON.stringify(sam), "the preview's link is the planet");
const card = shown.structuredContent.planet;
ok(card.name === 'Sam' && card.home === 'Austin' && card.links.length === 2 && card.loves[0].title === 'Records I love' && card.loves[0].items.join() === 'Kind of Blue,Blue Train' && !('sign' in card) && !('board' in card), 'the plain card: who it is for, their links and what they love', card);
const wrong = (await call('tools/call', { name: 'preview_planet', arguments: { spec: { ...sam, who: { name: 'Sam', sign: 'Samantha Jones' }, slug: 'Sam' } } })).result;
ok(wrong.isError && /2 mistakes/.test(wrong.content[0].text) && /who\.sign: longer than 12/.test(wrong.content[0].text) && /^slug:/m.test(wrong.content[0].text), 'a spec with mistakes: each one said back, to fix', wrong.content[0].text);
const bare = (await call('tools/call', { name: 'preview_planet', arguments: { spec: least } })).result.structuredContent.planet;
ok(bare.name === 'Sam' && bare.links.length === 0 && bare.loves.length === 0, 'a planet with nothing on it: just their name on its plain card', bare);
ok((await call('tools/call', { name: 'preview_planet', arguments: {} })).result.isError, 'no spec at all');
ok((await call('tools/call', { name: 'delete_planet', arguments: {} })).error.code === -32602, 'a tool that isn\'t there');

// ---------- Sending a planet to be built: the connector, then the table on the real schema ----------
const { wardrobeDb } = await import('./wardrobe-db.mjs');
const w = await wardrobeDb();
const migration = ['20261026000100_planet_requests.sql', '20261026000200_planet_request_tests.sql'].map((f) => readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8')).join('\n');
// what Supabase grants on a new table, then the migration again (it's safe to re-run): what it takes back stays taken
await w.db.exec(`grant usage on schema public to anon, authenticated; grant all on public.planet_requests to anon, authenticated; grant execute on all functions in schema public to anon, authenticated;`);
await w.db.exec(migration);
// the ctx index.ts builds on supabase-js, here on SQL
const send = async ({ spec, note, contact }) => (await w.q('select public.planet_request_add($1::jsonb, $2, $3) as id', [JSON.stringify(spec), note, contact]))[0].id;
const sendIt = async (args) => (await planets.rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'send_planet', arguments: args } }, { send })).result;
const sent = await sendIt({ spec: sam, note: '  Make the porch glow.  ', contact: 'sam@example.com' });
ok(!sent.isError && sent.structuredContent.sent && sent.structuredContent.page === 'https://stevenpisani.com/p/sam/' && sent.content[0].text.includes(sent.structuredContent.page), 'sent: where it will be once it is built', sent);
const saved = (await w.q('select * from public.planet_requests'))[0];
ok(saved.slug === 'sam' && saved.name === 'Sam' && saved.spec.collections.records.items[0].name === 'Kind of Blue' && saved.note === 'Make the porch glow.' && saved.contact === 'sam@example.com' && saved.status === 'new', 'saved as sent: the spec, their note and how to reach them, waiting to be told', saved);
ok((await sendIt({ spec: { ...sam, slug: 'Sam' } })).isError && (await w.q('select count(*)::int as n from public.planet_requests'))[0].n === 1, 'a spec with mistakes is never sent');
ok((await sendIt({ spec: least, note: 'x'.repeat(1001) })).isError, 'nor a note past 1,000 characters');
ok(!(await sendIt({ spec: least })).isError && (await w.q("select note, contact from public.planet_requests where slug = 'sam' order by id desc"))[0].contact === null, 'the note and contact are optional');
await w.db.exec(`insert into public.planet_requests (slug, name, spec, at) select 'old-' || i, 'Old', '{}'::jsonb, now() - interval '2 days' from generate_series(1, 48) i`);
const full = await sendIt({ spec: least });
ok(!full.isError && full.structuredContent.sent === false && /as many planets waiting/.test(full.content[0].text), '50 waiting to be built: the next one isn\'t sent, and they\'re told so', full);
await w.db.exec(`update public.planet_requests set status = 'built' where slug like 'old-%'; insert into public.planet_requests (slug, name, spec) select 'day-' || i, 'Day', '{}'::jsonb from generate_series(1, 18) i`);
ok((await sendIt({ spec: least })).structuredContent.sent === false, '20 in a day: the next one waits for tomorrow');
const test = await sendIt({ spec: { ...least, slug: 'test-sam' } });
ok(test.structuredContent.sent && test.structuredContent.test && /test/.test(test.content[0].text) && (await w.q("select status from public.planet_requests where slug = 'test-sam'"))[0].status === 'test', "a test planet (slug test-…) is saved as a test, past the real planets' caps, and says so", test);
await w.db.exec(`insert into public.planet_requests (slug, name, spec, status) select 'test-' || i, 'T', '{}'::jsonb, 'test' from generate_series(1, 19) i`);
ok((await sendIt({ spec: { ...least, slug: 'test-more' } })).structuredContent.sent === false, 'tests have their own 20 a day');
const refused = async (role, sql, what) => {
  let error;
  try { await w.db.exec(`set role ${role}; ${sql}`); } catch (e) { error = e; } finally { await w.db.exec('reset role'); }
  ok(/permission denied/.test(error?.message), what, error?.message);
};
await refused('anon', 'select * from public.planet_requests', 'signed out, nobody reads them');
await refused('anon', `insert into public.planet_requests (slug, name, spec) values ('x', 'X', '{}')`, 'nor writes one straight in');
await refused('anon', `select public.planet_request_add('{}'::jsonb)`, 'nor gets round the caps');
await refused('authenticated', `select public.planet_request_add('{}'::jsonb)`, 'nor does anyone signed in');
await w.db.exec(`set role authenticated; set request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333","email":"nobody@example.com","role":"authenticated"}'`);
ok((await w.q('select * from public.planet_requests')).length === 0, 'someone signed in who isn\'t a member sees none of them');
await w.db.exec(`set request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","email":"steve@example.com","role":"authenticated"}'`);
ok((await w.q("update public.planet_requests set status = 'building' where slug = 'sam' returning id")).length === 2, 'Steve reads them and marks what he is building');
await w.db.exec('reset role');

console.log(`planet: ${passed} checks passed`);
