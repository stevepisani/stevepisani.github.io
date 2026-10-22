// Planet specs (supabase/functions/_shared/planet.js): Steve's, built from _data/ (tools/planet.mjs),
// passes; a small planet of someone else's passes; and each way a spec can go wrong is caught, with
// where and what. Offline, well under a second.
//
//   node tools/planet-test.mjs
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { checkPlanet, LIMITS } from '../supabase/functions/_shared/planet.js';
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
  telescope: { engraving: 'Sam', pins: [{ city: 'Austin', note: 'Home', home: true }, { city: 'New Orleans' }], sights: ['moon', 'earth'] },
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
caught(sam, (s) => { s.telescope.sights.push('mars'); }, /sights\[2\]: should be one of moon, sun, earth/, 'a sight there\'s no art for yet');
caught(sam, (s) => { s.launchPad.countdowns[0].on = 'March 1'; }, /countdowns\[0\]\.on: should be a date/, 'a countdown with no date');
caught(sam, (s) => { s.launchPad.countdowns[0].on = '2027-02-31'; }, /countdowns\[0\]\.on: should be a date/, 'a date that isn\'t one');
caught(sam, (s) => { s.launchPad.launches = 'some'; }, /^launchPad\.launches:/, 'launches that aren\'t all, none or a provider');
caught(sam, (s) => { s.launchPad.rocket.colors = ['red']; }, /colors\[0\]: should be a colour/, 'a colour that isn\'t a hex colour');
caught(sam, (s) => { s.collections.records.items = Array(LIMITS.items).fill('x'.repeat(LIMITS.text)); }, /^spec: larger than 64 KB/, 'a spec over 64 KB');

console.log(`planet: ${passed} checks passed`);
