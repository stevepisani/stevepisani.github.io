// Places, tested like the wardrobe and trips (tools/wardrobe-db.mjs: every migration in PGlite):
// the Takeout reader on a made-up export (tools/fixtures/takeout/: starred places, reviews,
// labeled places, a saved list and a map of one's own), then the import into the real schema as
// Steve, what can never be public (home, work, labeled places, lodging, near home) and what the
// site may read, each person's own, the inbox, the Places API's cap, and SJPJr's find_places and
// get_today's saved nearby. Offline, a few seconds.
//
//   node tools/places-test.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { rpc, TOOLS } from '../supabase/functions/mcp/server.js';
import { readTakeout, cidOf, csvRows, wanted, pathFor } from '../supabase/functions/_shared/takeout.js';
import { wardrobeDb, STEVE, OTHER } from './wardrobe-db.mjs';

let passed = 0;
const ok = (cond, what, detail) => { if (!cond) throw new Error(`places: ${what}${detail !== undefined ? `\n  got ${JSON.stringify(detail).slice(0, 900)}` : ''}`); passed++; };
const refused = async (fn, re, what) => { let err = null; try { await fn(); } catch (e) { err = e; } ok(err && (!re || re.test(err.message)), what, err?.message || 'it went through'); };

// ---------- 1. Reading the export ----------
const root = new URL('./fixtures/takeout/', import.meta.url);
const walk = (dir) => readdirSync(new URL(dir, root)).flatMap((f) => (statSync(new URL(dir + f, root)).isDirectory() ? walk(`${dir}${f}/`) : [`${dir}${f}`]));
const files = walk('').map((path) => ({ path, text: readFileSync(new URL(path, root), 'utf8') }));
ok(files.length === 5 && files.every((f) => wanted(f.path)), 'the five kinds of file are the ones read', files.map((f) => f.path));
ok(!wanted('Takeout/Maps/Answers to automated questions/1.json') && !wanted('Takeout/Maps/Commute routes/Commute routes.json'), 'the rest of an export is left out');
ok(pathFor('Reviews.json') === 'Maps (your places)/Reviews.json' && wanted(pathFor('Want to go.csv')) && wanted(pathFor('Bars.kmz')) && wanted(pathFor('Saved Places.json')), 'a file dropped on its own is read as if it were in its zip');
ok(cidOf('http://maps.google.com/?cid=222') === '222' && cidOf('https://www.google.com/maps/place//data=!4m2!3m1!1s0x0:0xde') === '222' && cidOf('https://example.com') === null, "Google's id for a place, from either kind of link");
ok(JSON.stringify(csvRows('a,"b, ""c""",d\r\n\r\n1,2,3\n')) === JSON.stringify([['a', 'b, "c"', 'd'], ['1', '2', '3']]), 'a CSV with quotes, commas and blank lines');

const read = readTakeout(files, { inboxId: 'in-1' });
const by = (name) => read.places.find((p) => p.name === name);
ok(read.places.length === 11 && read.skipped === 2, 'eleven places; the two with no location at all are skipped', { n: read.places.length, skipped: read.skipped, names: read.places.map((p) => p.name) });
const caffe = by('Caffè Stand-in');
ok(caffe.lists.join() === 'Reviewed,Starred' && caffe.rating === 5 && caffe.review === 'Best cappuccino on the square.' && caffe.saved_on === '2026-09-02' && caffe.reviewed_on === '2026-10-15' && caffe.import_key === 'cid:222', 'a starred place and its review are one place: both lists, the stars, the words, both dates', caffe);
ok(caffe.sources.length === 2 && caffe.sources.every((s) => s.inbox_id === 'in-1' && s.file && s.kind) && caffe.data.review_questions?.[0]?.answer === 'Dine in', 'each file it came from is kept, with the import, and what the review was asked', caffe);
ok(by('Home').lists.join() === 'Labeled' && by('Home').label === 'Home' && by('Home').import_key === 'label:home', 'a labeled place, by its label');
const trat = by('Trattoria Made Up'), gel = by('Gelateria "Finta"');
ok(trat && trat.lists.join() === 'Want to go' && trat.lat === null && trat.note === 'Try the ribollita, and the wine' && trat.import_key === 'cid:333', 'a saved list: its name is the list; no coordinates; the note as written', trat);
ok(gel && gel.note === 'Go at night' && gel.data.tags?.join() === 'sweet,cold', 'quotes in a name, a comment and tags', gel);
const lava = by('Lava & Bamboo');
ok(lava && lava.lists.join() === 'Bars We Like' && lava.category === 'Tiki Bars' && lava.note === 'Bar Open late' && lava.lat === 43.771, "a map of one's own: its name is the list, a layer is the category", lava);
ok(by('Harbour Bar & Grill')?.category === null && !by('A walk, not a place'), 'an untitled layer is no category, and a line is no place');

// ---------- 2. Into the database, as Steve ----------
const { db, q, signIn, ctx } = await wardrobeDb();
const exec = (text) => db.exec(text);
const as = await signIn();
const sql = async (text, params) => q(text, params);
const one = async (text, params) => (await q(text, params))[0];
const inbox = await one(`insert into public.inbox (kind, source, name) values ('file', 'takeout', 'takeout-1.zip') returning *`);
ok(inbox.owner === STEVE && inbox.status === 'new', 'the inbox keeps what came in, as its owner');
const places = readTakeout(files, { inboxId: inbox.id }).places;
const first = (await one(`select public.places_import($1, $2::jsonb) as r`, [inbox.id, JSON.stringify(places)])).r;
ok(first.added === 11 && first.merged === 0, 'all eleven added', first);
const after = await one(`select status, result, processed_at from public.inbox where id = $1`, [inbox.id]);
ok(after.status === 'done' && after.result.places.added === 11 && after.processed_at, 'the inbox row says what came of it', after);
const row = async (name) => one(`select * from public.places where name = $1`, [name]);
ok((await row('Caffè Stand-in')).status === 'review' && (await row('Caffè Stand-in')).visibility === 'private' && (await row('Caffè Stand-in')).located_by === 'takeout', 'every place waits in review, private');

// what can never be public, worked out in the database
const sens = Object.fromEntries((await sql(`select name, sensitive from public.places`)).map((r) => [r.name, r.sensitive]));
ok(sens.Home === 'home' && sens["Aunt's House"] === 'personal' && sens['Hotel Example Firenze'] === 'lodging' && sens['Corner Tiki'] === 'near_home', 'home, a labeled house, a hotel, and a bar a few doors from home are marked', sens);
ok(sens['Far Diner'] === null && sens['Caffè Stand-in'] === null && sens['Harbour Bar & Grill'] === null, "what's further away isn't", sens);

// again, the same export: nothing added, what's there kept as it was decided
await sql(`update public.places set status = 'kept' where name = 'Caffè Stand-in'`);
const inbox2 = await one(`insert into public.inbox (kind, source) values ('file', 'takeout') returning id`);
const again = (await one(`select public.places_import($1, $2::jsonb) as r`, [inbox2.id, JSON.stringify(readTakeout(files, { inboxId: inbox2.id }).places)])).r;
const caffe2 = await row('Caffè Stand-in');
ok(again.added === 0 && again.merged === 11 && caffe2.status === 'kept' && caffe2.lists.join() === 'Reviewed,Starred' && caffe2.sources.length === 4, 'importing again merges: the decision stays, the lists don\'t double, both imports are its sources', { again, caffe2 });
// home coming in after what's near it still marks it
await sql(`insert into public.places (import_key, name, lat, lon, lists) values ('name:x', 'Next Door Cafe', 39.9001, -75.2001, '{Starred}')`);
ok((await row('Next Door Cafe')).sensitive === null, 'nowhere near home, yet');
const inbox3 = await one(`insert into public.inbox (kind, source) values ('file', 'takeout') returning id`);
await one(`select public.places_import($1, $2::jsonb) as r`, [inbox3.id, JSON.stringify([{ import_key: 'label:work', name: 'Work', label: 'Work', lat: 39.9003, lon: -75.2003, lists: ['Labeled'], sources: [] }])]);
ok((await row('Work')).sensitive === 'work' && (await row('Next Door Cafe')).sensitive === 'near_home', 'work, labeled later, marks what was already near it');

// public only once kept, never if sensitive, and never unmarked
await refused(() => sql(`update public.places set visibility = 'public' where name = 'Far Diner'`), /places_public/, 'a place still in review can\'t be public');
await sql(`update public.places set status = 'kept' where name in ('Corner Tiki', 'Hotel Example Firenze', 'Far Diner', 'Home')`);
await refused(() => sql(`update public.places set visibility = 'public' where name = 'Corner Tiki'`), /places_public/, 'near home can never be public');
await refused(() => sql(`update public.places set visibility = 'public' where name = 'Hotel Example Firenze'`), /places_public/, 'nor a hotel');
await refused(() => sql(`update public.places set sensitive = null, visibility = 'public' where name = 'Home'`), /places_public/, 'and clearing the mark doesn\'t get round it');
ok((await row('Home')).sensitive === 'home', 'the mark stays');
await sql(`update public.places set visibility = 'shared' where name in ('Home', 'Far Diner')`);
ok((await row('Home')).visibility === 'shared', 'home can be shared with Lexi');
await sql(`update public.places set visibility = 'public' where name = 'Caffè Stand-in'`);

// the site reads only what's public, and only what it needs
await exec(`reset role; grant usage on schema public to anon; set role anon`);
const site = await sql(`select * from public.public_places`);
ok(site.length === 1 && site[0].name === 'Caffè Stand-in' && !('address' in site[0]) && !('review' in site[0]) && site[0].lat === 43.7702, 'the site sees the one public place: its name, where, the stars; no address or review', site);
await refused(() => sql(`select * from public.places`), /permission denied/, 'and never the table');
await refused(() => sql(`insert into public.public_places (name) values ('Sneaky')`), /permission denied/, 'nor writes through the view');
await refused(() => sql(`select public.places_api_take(5)`), /permission denied/, 'nor spends the Places API');
await exec(`reset role; set role authenticated`);

// each person's own: another member sees only what Steve kept and shared or made public
await as(OTHER, 'other@example.com');
const theirs = (await sql(`select name from public.places order by name`)).map((r) => r.name);
ok(theirs.join() === 'Caffè Stand-in,Far Diner,Home', 'another member sees what Steve shared or made public, kept, and nothing else', theirs);
ok(!(await sql(`update public.places set name = 'Mine now' returning id`)).length && !(await sql(`select 1 from public.inbox`)).length, 'and can change none of it, or see his inbox');
await refused(() => sql(`insert into public.places (owner, import_key, name) values ($1, 'x', 'Planted')`, [STEVE]), /row-level security/, 'nor put a place in his');
await as(STEVE, 'steve@example.com');

// the Places API's cap: what's left this month, never more
ok((await one(`select public.places_api_take(5) as n`)).n === 5, 'the Places API: five calls granted');
await exec(`reset role; update public.places_api_usage set calls = 998; set role authenticated`);
ok((await one(`select public.places_api_take(5) as n`)).n === 2 && (await one(`select public.places_api_take(5) as n`)).n === 0, 'then only what the month has left (1,000), then none');

// ---------- 3. SJPJr: find_places, get_today ----------
const tool = async (name, args) => { const m = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, ctx); if (m.error) return { error: true, code: m.error.code, text: m.error.message }; const r = m.result; return { ...r.structuredContent, text: r.content[0].text, error: r.isError }; };
const find = TOOLS.find((t) => t.name === 'find_places');
ok(find && find.annotations.readOnlyHint && !TOOLS.some((t) => /place/.test(t.name) && !t.annotations.readOnlyHint), 'find_places is there, read-only; nothing writes places from a chat');
const florence = await tool('find_places', { lat: 43.7702, lon: 11.256, radius_km: 1 });
ok(!florence.error && florence.places.map((p) => p.name).join() === 'Caffè Stand-in,Lava & Bamboo,Hotel Example Firenze' && florence.places[0].distance_m === 0 && /google\.com\/maps|maps\.google\.com/.test(florence.places[0].map) && /query=43\.771,11\.258/.test(florence.places[1].map), 'near a point, nearest first, with how far and the Maps link', florence);
ok(!florence.places.some((p) => 'visibility' in p || 'sensitive' in p || 'sources' in p), 'who sees it and where it came from stay out of the answer');
const homeNear = await tool('find_places', { near: 'home' });
ok(homeNear.places.map((p) => p.name).join() === 'Corner Tiki,Harbour Bar & Grill', 'near home: by the labeled Home, leaving out the labeled places themselves', homeNear);
ok((await tool('find_places', { list: 'Labeled' })).places.length === 3, 'the labeled places when asked for by list');
ok((await tool('find_places', { q: 'cappuccino' })).places[0]?.name === 'Caffè Stand-in', 'by words in the review');
ok((await tool('find_places', { list: 'want to go' })).places.every((p) => p.not_located) && (await tool('find_places', { list: 'Want to go' })).total === 2, 'a saved list, its places marked not located yet');
await sql(`update public.places set status = 'dismissed' where name = 'Far Diner'`);
ok(!(await tool('find_places', { q: 'diner' })).places.length, "what's dismissed is left out");
ok((await tool('find_places', { lat: 91, lon: 0 })).error && (await tool('find_places', { lat: 1 })).error && (await tool('find_places', { radius_km: 0 })).error, 'a point not on Earth, half a point, or no radius is refused');

const trip = await tool('create_trip', { name: 'Florence', legs: [{ place: 'Florence, Italy', from: '2026-11-01', to: '2026-11-05' }] });
const onTrip = await tool('find_places', { trip_id: trip.id, date: '2026-11-02', radius_km: 10 });
ok(onTrip.near.startsWith('Florence') && onTrip.places.some((p) => p.name === 'Caffè Stand-in'), "around where a trip's day is", onTrip);
ok((await tool('find_places', { trip_id: trip.id, date: '2026-12-25' })).error, 'a date off the trip is refused');
const planned = await tool('plan_days', { trip_id: trip.id, days: [{ date: '2026-11-02', activities: [{ title: 'Caffè Stand-in', type: 'dining', place_id: florence.places[0].id }] }] });
ok(!planned.error && (await ctx.trips.get(trip.id)).days[0].activities[0].place_id === florence.places[0].id, 'plan_days keeps the place_id on the activity', planned);

const realNow = ctx.now;
ctx.now = () => new Date('2026-12-01T15:00:00Z');
const home = await tool('get_today', {});
ok(home.where.at === 'home' && home.saved_nearby.map((p) => p.name).join() === 'Corner Tiki' && /Saved nearby: Corner Tiki \(\d+ m, 4★\)/.test(home.text), "get_today at home: what's saved within 2 km of home", { s: home.saved_nearby, t: home.text });
// (the made-up map puts every city at 43.8, 11.2; the real Florence is where the caffè is)
await sql(`update public.trips set legs = jsonb_set(jsonb_set(legs, '{0,lat}', '43.7731'), '{0,lon}', '11.2560') where id = $1`, [trip.id]);
ctx.now = () => new Date('2026-11-02T09:00:00Z');
const away = await tool('get_today', {});
ok(away.where.at === 'trip' && away.saved_nearby.some((p) => p.name === 'Caffè Stand-in'), 'on the trip: around that day\'s place', away.saved_nearby);
ctx.now = realNow;

console.log(`places: ${passed} checks: the Takeout reader (starred, reviews, labeled, a saved list, a map of one's own; one place from two files), the import and importing again, what can never be public, what the site reads, each person's own, the inbox, the Places API's cap, find_places and get_today's saved nearby`);
