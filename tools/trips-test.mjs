// Trips in detail, tested against the real schema like the wardrobe (tools/wardrobe-db.mjs: every
// migration in PGlite): travelers, packing entries, bags, transport, lodging, links, each day's
// activities, get_trip whole and analyze_trip_packing, through SJPJr's tools as Steve. The
// acceptance case is the real trip: London and Florence, autumn 2026, Steve, Lexi and Dominic.
// Then what older calls sent still works, nothing points at the wrong thing, and removing or
// deleting takes only what it says; and days: what Steve wore and a line about each, through
// get_today, log_day and get_history. Offline, a few seconds.
//
//   node tools/trips-test.mjs
import { rpc } from '../supabase/functions/mcp/server.js';
import { wardrobeDb, STEVE, OTHER, IDS } from './wardrobe-db.mjs';
import { legWeather, conditionOf } from '../supabase/functions/_shared/weather.js';

let passed = 0;
const ok = (cond, what, detail) => { if (!cond) throw new Error(`trips: ${what}${detail !== undefined ? `\n  got ${JSON.stringify(detail).slice(0, 900)}` : ''}`); passed++; };
const { db, q, signIn, ctx } = await wardrobeDb();

// ---------- The migration: the packing kept on the trip became entries ----------
{
  const rows = await q(`select * from public.trip_packing`);
  ok(rows.length === 1 && rows[0].item_id === IDS.darkBrown && rows[0].status === 'packed' && rows[0].category === 'clothing' && rows[0].qty === 1 && !rows[0].traveler_key && !rows[0].bag_id, 'migration: the old list is an entry, ticked = packed, a garment = clothing, nobody\'s, in no bag', rows);
  ok(!(await q(`select 1 from information_schema.columns where table_name = 'trips' and column_name = 'packing'`)).length, 'migration: the old column is gone');
}

const as = await signIn();
const tool = async (name, args) => { const m = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, ctx); if (m.error) return { error: true, code: m.error.code }; const r = m.result; return { ...r.structuredContent, text: r.content[0].text, error: r.isError }; };
const bad = async (name, args, re, what) => { const r = await tool(name, args); ok(r.error && (!re || re.test(r.text)), what, r.text); };

// Steve's garments for the trip
const pants = (await tool('add_item', { name: 'Navy chinos', category: 'bottoms', colour: 'navy' })).item.id;
const shirtA = IDS.darkBrown, shirtB = IDS.darkGray, loafers = '33333333-3333-4333-8333-333333333333';

// ---------- 1. The trip, with travelers and legs ----------
const made = await tool('create_trip', {
  name: 'London + Florence 2026',
  legs: [{ place: 'London, United Kingdom', from: '2026-10-07', to: '2026-10-13' }, { place: 'Florence, Italy', from: '2026-10-13', to: '2026-11-13' }],
  travelers: [{ key: 'steve', name: 'Steve', type: 'adult' }, { key: 'lexi', name: 'Lexi', type: 'adult' }, { name: 'Dominic', type: 'child' }],
});
ok(!made.error && made.travelers.map((x) => x.key).join() === 'steve,lexi,dominic' && made.travelers.every((x) => /^[0-9a-f-]{36}$/.test(x.id)), '1: a trip with three travelers, each with a key (made from the name when not given) and an id', made);
const T = made.id;
await bad('create_trip', { name: 'x', legs: [{ place: 'Rome', from: '2026-11-01', to: '2026-11-02' }], travelers: [{ name: 'A', type: 'adult' }, { key: 'a', name: 'B', type: 'adult' }] }, /Two travelers/, '1: two travelers can\'t share a key');
await bad('create_trip', { name: 'x', legs: [{ place: 'Rome', from: '2026-11-01', to: '2026-11-02' }], travelers: [{ name: 'Shared', type: 'adult' }] }, /shared/, '1: "shared" is no traveler\'s key');
await bad('create_trip', { name: 'x', legs: [{ place: 'Rome', from: '2026-11-01', to: '2026-11-02' }], travelers: [{ name: 'A', type: 'toddler' }] }, /adult, child, infant, other/, '1: a traveler\'s type is one of the four');

// ---------- 2. Transport ----------
const tr = await tool('add_transport', { trip_id: T, transport: [
  { type: 'flight', carrier: 'British Airways', number: 'BA3279', origin: 'London City', origin_code: 'lcy', destination: 'Florence', destination_code: 'FLR', date: '2026-10-13', departure_time: '11:15', arrival_time: '14:25' },
  { type: 'flight', carrier: 'British Airways', number: 'BA184', origin: 'Newark', origin_code: 'EWR', destination: 'Heathrow', destination_code: 'LHR', departure_time: '2026-10-06T21:00:00-04:00', arrival_time: '2026-10-07T09:05:00+01:00', confirmation: 'ABC123' },
  { type: 'transfer', origin: 'Heathrow', destination: 'South Kensington', date: '2026-10-07' },
] });
ok(!tr.error && tr.transport.length === 3 && tr.transport.every((x) => x.id), '2: three journeys added, with ids', tr);
const ba3279 = tr.transport.find((x) => x.number === 'BA3279'), ba184 = tr.transport.find((x) => x.number === 'BA184');
ok(ba3279.departure_time === '2026-10-13T11:15' && ba3279.arrival_time === '2026-10-13T14:25' && ba3279.origin_code === 'LCY', '2: a local time stays local (no time zone made up), on its date; codes in capitals', ba3279);
ok(ba184.date === '2026-10-06' && ba184.departure_time === '2026-10-06T21:00:00-04:00' && ba184.arrival_time === '2026-10-07T09:05:00+01:00', '2: the date comes from the departure; each time keeps its own UTC offset', ba184);
await bad('add_transport', { trip_id: T, transport: [{ type: 'flight', origin: 'A', destination: 'B', departure_time: '2026-10-07T10:00:00+01:00', arrival_time: '2026-10-07T08:00:00+01:00' }] }, /before it departs/, '2: arriving before departing is refused');
await bad('add_transport', { trip_id: T, transport: [{ type: 'flight', origin: 'A', destination: 'B', date: '2026-10-08', departure_time: '2026-10-07T10:00' }] }, /isn't on date/, '2: a departure on another day than its date is refused');
await bad('add_transport', { trip_id: T, transport: [{ type: 'rocket', origin: 'A', destination: 'B', date: '2026-10-08' }] }, /flight, train/, '2: a type outside the list is refused, with the list');
await bad('add_transport', { trip_id: T, transport: [{ type: 'train', origin: 'A', destination: 'B', date: '2026-10-08', departure_time: '10am' }] }, /ISO 8601/, '2: a time that isn\'t ISO 8601 is refused');
const moved = await tool('update_transport', { id: ba3279.id, confirmation: 'XYZ9' });
ok(!moved.error && moved.confirmation === 'XYZ9' && moved.departure_time === '2026-10-13T11:15', '2: update_transport changes only what\'s given', moved);

// ---------- 3. Lodging, and links ----------
const lo = await tool('add_lodging', { trip_id: T, lodging: [{ name: 'St James House', place: 'London', address: '5 Cornwall Gardens, London SW7 4AJ', check_in: '2026-10-07', check_out: '2026-10-13' }] });
ok(!lo.error && lo.lodging[0].id && lo.lodging[0].check_out === '2026-10-13', '3: lodging added', lo);
await bad('add_lodging', { trip_id: T, lodging: [{ name: 'Backwards', check_in: '2026-10-13', check_out: '2026-10-07' }] }, /before check_in/, '3: a check-out before the check-in is refused');
await bad('update_lodging', { id: lo.lodging[0].id, check_out: '2026-10-01' }, /before check_in/, '3: and so is a change that makes one');
const links = await tool('add_trip_resources', { trip_id: T, resources: [{ type: 'insurance', label: 'Travel insurance', url: 'https://insurer.example/policy' }, { label: 'Uffizi booking' }] });
ok(!links.error && links.resources[1].type === 'other', '3: links added; a type left out is other', links);
await bad('add_trip_resources', { trip_id: T, resources: [{ label: 'x', url: 'not a link' }] }, /https/, '3: a link has to be a web address');
ok((await tool('update_trip_resource', { id: links.resources[1].id, type: 'reservation', url: 'https://uffizi.example/b/1' })).type === 'reservation', '3: update_trip_resource');
ok(!(await tool('remove_trip_resource', { id: links.resources[1].id })).error, '3: remove_trip_resource');

// ---------- 4. Bags ----------
const bagKeys = ['checked_1', 'checked_2', 'checked_3', 'steve_carry_on', 'lexi_carry_on', 'backpack_1', 'backpack_2', 'stroller'];
const bags = await tool('add_trip_bags', { trip_id: T, bags: bagKeys.map((key) => ({ key, label: key.replace(/_/g, ' '), type: key.startsWith('checked') ? 'checked' : key.includes('carry_on') ? 'carry_on' : key === 'stroller' ? 'stroller' : 'day_bag', ...(key.startsWith('steve') && { traveler: 'steve' }), ...(key.startsWith('lexi') && { traveler: 'lexi' }) })) });
ok(!bags.error && bags.bags.length === 8 && bags.bags.find((b) => b.key === 'steve_carry_on').traveler === 'steve', '4: eight bags, a carry-on each', bags);
const bag = Object.fromEntries(bags.bags.map((b) => [b.key, b.id]));
await bad('add_trip_bags', { trip_id: T, bags: [{ key: 'checked_1', label: 'Again' }] }, /already a bag "checked_1"/, '4: a bag key is unique on the trip');
await bad('add_trip_bags', { trip_id: T, bags: [{ label: 'Nana bag', traveler: 'nana' }] }, /isn't on this trip.*steve, lexi, dominic/, '4: a bag for someone not on the trip is refused, with who is');
ok((await tool('add_trip_bags', { trip_id: T, bags: [{ label: "Dominic's diaper bag", traveler: 'Dominic' }] })).bags[0].key === 'dominic_s_diaper_bag', '4: a key made from the label; a traveler by name');

// ---------- 5–8. Packing: things for each traveler and everyone, garments, bags ----------
const things = await tool('add_packing_items', { trip_id: T, items: [
  { label: 'Diapers', traveler: 'dominic', category: 'baby', qty: 40, essential: true },
  { label: 'Sleep sack', traveler: 'dominic', category: 'baby' },
  { label: 'Stroller rain cover', traveler: 'dominic', category: 'baby', bag: 'stroller' },
  { label: 'UK adapter', traveler: 'shared', category: 'electronics', qty: 2 },
  { label: 'Passports', traveler: 'shared', category: 'documents', essential: true, bag: 'steve_carry_on' },
  { label: 'Chargers', traveler: 'shared', category: 'electronics' },
  { label: 'Travel insurance documents', traveler: 'shared', category: 'documents' },
] });
ok(!things.error && things.created.length === 7 && things.created.every((p) => p.status === 'needed' && p.id) && things.created.find((p) => p.label === 'Diapers').essential && things.created.find((p) => p.label === 'Passports').bag === 'steve_carry_on', '5: things that aren\'t garments, per traveler and shared, needed, in bags by key', things.created);
const wear = await tool('add_packing_items', { trip_id: T, items: [{ item_id: shirtA, traveler: 'steve' }, { item_id: shirtB, traveler: 'steve' }, { item_id: pants, traveler: 'steve', qty: 2 }, { item_id: loafers, traveler: 'steve' }] });
ok(!wear.error && wear.created.length === 4 && wear.created.filter((p) => p.category === 'clothing').length === 3 && wear.created.find((p) => p.item_id === loafers).category === 'shoes' && !wear.created.some((p) => p.label), '6: garments by id, the category from the wardrobe (shoes are shoes), nothing copied', wear.created);
const again = await tool('add_packing_items', { trip_id: T, items: [{ label: 'diapers', traveler: 'dominic', qty: 50 }] });
ok(again.created.length === 0 && again.updated.length === 1 && again.updated[0].qty === 50 && (await q(`select count(*)::int as n from public.trip_packing where trip_id = $1 and lower(label) = 'diapers'`, [T]))[0].n === 1, '5: the same thing for the same traveler is updated, not added twice', again);
await bad('add_packing_items', { trip_id: T, items: [{ label: 'Teddy', traveler: 'nana' }] }, /isn't on this trip/, '7: a traveler not on the trip is refused');
await bad('add_packing_items', { trip_id: T, items: [{ label: 'Teddy', category: 'toys' }] }, /clothing, shoes/, '5: a category outside the list is refused, with the list');
await bad('add_packing_items', { trip_id: T, items: [{ item_id: '99999999-9999-4999-8999-999999999999' }] }, /Not in the wardrobe/, '6: a garment not in the wardrobe is refused');
await bad('add_packing_items', { trip_id: T, items: [{ qty: 2 }] }, /item_id or a label/, '5: an entry is a garment or a label');
const P = Object.fromEntries([...things.created, ...wear.created].map((p) => [p.label || p.item_id, p.id]));
const reassigned = await tool('update_packing_item', { packing_item_id: P['Sleep sack'], traveler: 'shared', notes: 'the warm one' });
ok(reassigned.traveler === 'shared' && reassigned.notes === 'the warm one' && reassigned.category === 'baby', '7: update_packing_item changes only what\'s given', reassigned);
await bad('update_packing_item', { packing_item_id: P[shirtA], label: 'A shirt' }, /wardrobe garment/, '7: a garment entry keeps the garment\'s name');
const bagged = await tool('move_packing_items', { packing_item_ids: [P[shirtA], P[shirtB], P[pants]], bag: 'checked_1' });
ok(!bagged.error && (await q(`select count(*)::int as n from public.trip_packing where bag_id = $1`, [bag.checked_1]))[0].n === 3, '8: move_packing_items puts entries in a bag, by its key', bagged);
ok((await tool('move_packing_items', { packing_item_ids: [P[loafers]], bag: bag.checked_2 })).bag === 'checked_2', '8: or by its id');
ok((await tool('move_packing_items', { packing_item_ids: [P[loafers]], bag: null })).bag === null && !(await q(`select bag_id from public.trip_packing where id = $1`, [P[loafers]]))[0].bag_id, '8: null takes it out of its bag');
await bad('move_packing_items', { packing_item_ids: [P[loafers]], bag: 'the_moon' }, /no bag "the_moon".*checked_1/, '8: a bag not on the trip is refused, with the bags there are');

// ---------- 9. Statuses ----------
ok((await tool('set_packing_status', { packing_item_ids: [P[shirtA], P['Passports']], status: 'ready' })).status === 'ready', '9: needed → ready, several at once');
const packed = await tool('set_packing_status', { packing_item_ids: [P[shirtA]], status: 'packed' });
ok(packed.summary.packed === 1 && (await q(`select status from public.trip_packing where id = $1`, [P[shirtA]]))[0].status === 'packed', '9: ready → packed', packed);
ok((await tool('update_packing_item', { packing_item_id: P['Chargers'], status: 'to_buy' })).status === 'to_buy', '9: to buy');
await bad('set_packing_status', { packing_item_ids: [P[shirtA]], status: 'lost' }, /needed, to_buy, ready, packed/, '9: a status outside the four is refused');

// ---------- 10. Days: activities and outfits ----------
const planned = await tool('plan_days', { trip_id: T, days: [
  { date: '2026-10-07', occasion: 'Arrive, settle in', activities: [{ title: 'Land at Heathrow', type: 'travel', start_time: '09:05' }], items: [shirtA, pants] },
  { date: '2026-10-08', occasion: 'Museums', items: [shirtA, pants, loafers] },
  { date: '2026-10-09', occasion: 'sightseeing + work', activities: [{ title: 'Work', type: 'work', start_time: '14:00', end_time: '18:00' }, { title: "Buckingham Palace / St James's / Westminster", type: 'sightseeing', start_time: '09:30', end_time: '13:00', location: 'Westminster' }] },
  { date: '2026-10-12', items: [shirtB, pants], note: 'Dinner out' },
] });
const d9 = planned.days.find((d) => d.date === '2026-10-09');
ok(!planned.error && d9.activities.length === 2 && d9.activities[0].type === 'sightseeing' && d9.activities.every((x) => x.id) && d9.occasion === 'sightseeing + work' && !d9.items.length, '10: a day with several activities, in time order, each with an id, and its summary', d9);
const keepId = d9.activities[1].id;
const replanned = await tool('plan_days', { trip_id: T, days: [{ date: '2026-10-09', occasion: 'sightseeing + work', activities: [{ id: keepId, title: 'Work', type: 'work', start_time: '14:00', end_time: '18:00' }], items: [shirtB, pants] }] });
ok(replanned.days[0].activities.length === 1 && replanned.days[0].activities[0].id === keepId && replanned.days[0].items.length === 2, '10: a day given again is replaced whole; an activity keeps its id', replanned.days[0]);
await bad('plan_days', { trip_id: T, days: [{ date: '2026-10-10', activities: [{ title: 'Lunch', type: 'brunch' }] }] }, /travel, work/, '10: an activity type outside the list is refused');
await bad('plan_days', { trip_id: T, days: [{ date: '2026-10-10', activities: [{ title: 'Late', start_time: '18:00', end_time: '17:00' }] }] }, /ends before it starts/, '10: an activity that ends before it starts is refused');
await bad('plan_days', { trip_id: T, days: [{ date: '2026-12-01', occasion: 'x' }] }, /isn't a day of this trip/, '10: a day outside the trip is refused');

// ---------- 11. get_trip: the whole trip, coherent ----------
const g = await tool('get_trip', { id: T });
ok(g.view === 'trip' && g.trip.id === T && g.trip.start === '2026-10-07' && g.trip.end === '2026-11-13', '11: the trip and its span', g.trip);
ok(g.travelers.length === 3 && g.legs.length === 2 && g.legs.every((l) => l.weather?.summary), '11: travelers and legs with their weather', g.legs);
ok(g.transport.map((x) => x.number || x.type).join() === 'BA184,transfer,BA3279', '11: transport in the order it happens', g.transport);
ok(g.lodging.length === 1 && g.resources.length === 1 && g.bags.length === 9 && g.bags.find((b) => b.key === 'checked_1').entries === 3, '11: lodging, links, and bags with what\'s in them', g.bags);
ok(g.days.find((d) => d.date === '2026-10-07').travel && g.days.find((d) => d.date === '2026-10-09').activities.length === 1 && g.days.find((d) => d.date === '2026-10-09').place === 'London', '11: days carry their place, activities, and whether they\'re travel days', g.days);
ok(g.packing.summary.total_entries === 11 && g.packing.summary.packed === 1 && g.packing.summary.ready === 1 && g.packing.summary.to_buy === 1 && g.packing.summary.total_units === 50 + 1 + 1 + 2 + 1 + 1 + 1 + 1 + 1 + 2 + 1, '11: the packing list and its count', g.packing.summary);
ok(g.packing.items.find((p) => p.id === P[shirtA]).bag === 'checked_1' && g.garments[shirtA].name && g.garments[pants].name === 'Navy chinos' && !JSON.stringify(g.packing.items).includes('Navy chinos'), '11: garments named once, in garments; entries point at them by id', g.packing.items);
ok(/Travelers: Steve \(adult, key steve\)/.test(g.text) && /BA184.*departs 2026-10-06T21:00:00-04:00/.test(g.text) && /St James House, London: 2026-10-07 to 2026-10-13/.test(g.text) && /sightseeing \+ work\. 14:00–18:00 Work \(work\)/.test(g.text) && /50× Diapers \[needed, dominic, baby, essential; id /.test(g.text), '11: and the text says it all, with ids', g.text);

// ---------- 12. analyze_trip_packing: facts by fixed rules ----------
let a = await tool('analyze_trip_packing', { trip_id: T });
ok(a.summary.total_entries === 11 && a.summary.packed_entries === 1 && a.summary.needed_entries === 8 && a.by_traveler.dominic.entries === 2 && a.by_traveler.shared.entries === 5 && a.by_traveler.steve.entries === 4 && a.by_traveler.steve.packed === 1 && a.by_category.baby.entries === 3 && a.by_bag.checked_1.entries === 3 && a.by_bag.unassigned.entries === 6, '12: counts by status, traveler, category and bag', { s: a.summary, t: a.by_traveler, b: a.by_bag });
const notPacked = a.wardrobe_analysis.planned_but_not_packed;
ok(notPacked.some((x) => x.item_id === pants && x.status === 'needed' && x.on_list) && notPacked.some((x) => x.item_id === shirtB) && !notPacked.some((x) => x.item_id === shirtA), '12: planned garments not packed yet, with where they are', notPacked);
ok(a.wardrobe_analysis.repeated_item_usage[0].item_id === pants && a.wardrobe_analysis.repeated_item_usage[0].count === 4, '12: the garment planned most, and how often', a.wardrobe_analysis.repeated_item_usage);
ok(a.day_analysis.travel_days.join() === '2026-10-06,2026-10-07,2026-10-13' && a.day_analysis.work_days.join() === '2026-10-09' && a.day_analysis.days_without_plan.length === 38 - 4 && a.day_analysis.trip_days === 38, '12: travel days, work days and days with no plan', a.day_analysis);
ok(a.day_analysis.nights_without_lodging[0] === '2026-10-13' && !a.day_analysis.nights_without_lodging.includes('2026-10-12'), '12: nights with nowhere to sleep yet', a.day_analysis.nights_without_lodging.slice(0, 3));
const codes = a.warnings.map((w) => w.code);
ok(codes.filter((c) => c === 'essential_not_packed').length === 2 && !codes.includes('planned_not_on_list') && !codes.includes('transport_outside_trip'), '12: essentials not packed are warned; an overnight flight the day before is inside the trip', a.warnings);
// a planned garment not on the list at all, retired and deleted garments, a day with plans and no outfit, things outside the trip
await tool('remove_packing_item', { packing_item_id: P[loafers] });
await tool('retire_item', { id: pants });
await tool('plan_days', { trip_id: T, days: [{ date: '2026-10-10', activities: [{ title: 'Borough Market', type: 'dining' }] }] });
await tool('add_transport', { trip_id: T, transport: [{ type: 'train', origin: 'Florence', destination: 'Rome', date: '2026-12-01' }] });
await tool('add_lodging', { trip_id: T, lodging: [{ name: 'Overlap Inn', check_in: '2026-10-12', check_out: '2026-10-14' }] });
const gone = (await tool('add_item', { name: 'Linen scarf', category: 'accessories' })).item.id;
await tool('add_packing_items', { trip_id: T, items: [{ item_id: gone, traveler: 'lexi' }] });
await tool('delete_item', { id: gone });
a = await tool('analyze_trip_packing', { trip_id: T });
const has = (code, f = () => true) => a.warnings.some((w) => w.code === code && f(w));
ok(has('planned_not_on_list', (w) => w.item_id === loafers) && a.wardrobe_analysis.planned_but_not_packed.find((x) => x.item_id === loafers).on_list === false, '12: a planned garment taken off the list is caught', a.warnings);
ok(has('item_retired', (w) => w.item_id === pants) && has('item_missing', (w) => w.item_id === gone), '12: a garment retired or deleted since is caught', a.warnings);
ok(has('no_outfit', (w) => w.date === '2026-10-10') && a.day_analysis.days_with_activities_but_no_outfit.includes('2026-10-10'), '12: a day with activities and no outfit is caught');
ok(has('transport_outside_trip') && has('lodging_overlap'), '12: transport outside the trip and lodging that overlaps are caught', a.warnings);
ok(a.warnings.every((w) => w.code && w.message) && !/should|bring|enough/i.test(JSON.stringify(a.warnings)), '12: warnings are facts, not advice');
const g2 = await tool('get_trip', { id: T });
ok(g2.garments[gone].missing && g2.garments[pants].retired && g2.packing.items.some((p) => p.item_id === gone), '11: get_trip keeps a deleted garment\'s entry and says it\'s gone, and marks a retired one', g2.garments);

// ---------- Travelers changed: what still points at one who's gone is kept, and said ----------
const less = await tool('update_trip', { id: T, travelers: [{ key: 'steve', name: 'Steve', type: 'adult' }, { key: 'dominic', name: 'Dominic', type: 'child' }], laundry: { available: true, frequency_days: 4, notes: 'Washer in the Florence flat' } });
ok(less.travelers.find((x) => x.key === 'steve').id === made.travelers[0].id && /lexi/.test(less.text), 'update_trip: travelers replaced, each keeping its id; what still points at one who\'s gone is said', less.text);
a = await tool('analyze_trip_packing', { trip_id: T });
ok(has('unknown_traveler', (w) => w.bag_id === bag.lexi_carry_on) && has('unknown_traveler', (w) => w.packing_item_id), 'analyze: entries and bags for a traveler no longer on the trip are caught', a.warnings);
ok((await tool('get_trip', { id: T })).trip.laundry.frequency_days === 4, 'update_trip: laundry');
await tool('update_trip', { id: T, travelers: made.travelers.map(({ key, name, type }) => ({ key, name, type })) });

// ---------- Removing takes only what it says ----------
const before = (await q(`select count(*)::int as n from public.trip_packing where trip_id = $1`, [T]))[0].n;
const rm = await tool('remove_trip_bag', { id: bag.checked_1 });
ok(!rm.error && rm.unassigned === 3 && (await q(`select count(*)::int as n from public.trip_packing where trip_id = $1`, [T]))[0].n === before && (await q(`select bag_id from public.trip_packing where id = $1`, [P[shirtA]]))[0].bag_id === null, 'remove_trip_bag: the bag goes, its entries stay, out of any bag', rm);
const off = await tool('remove_packing_item', { packing_item_id: P[shirtB] });
ok(!off.error && /still in the wardrobe/.test(off.text) && (await q(`select count(*)::int as n from public.wardrobe_items where id = $1 and deleted_at is null and not retired`, [shirtB]))[0].n === 1 && (await tool('get_trip', { id: T })).days.find((d) => d.date === '2026-10-12').items.includes(shirtB), 'remove_packing_item: only the entry; the garment and the days that plan it stay', off.text);
await bad('remove_packing_item', { packing_item_id: P[shirtB] }, /no packing entry/, 'remove_packing_item: once');
ok(!(await tool('remove_transport', { id: ba3279.id })).error && !(await tool('remove_lodging', { id: lo.lodging[0].id })).error && (await tool('get_trip', { id: T })).transport.length === 3, 'remove_transport and remove_lodging take that one alone');

// ---------- 13. What older calls sent still works, unchanged ----------
{
  const old = await tool('create_trip', { name: 'Weekend', legs: [{ place: 'Lisbon, Portugal', from: '2026-12-04', to: '2026-12-06' }], notes: 'Old style' });
  ok(!old.error && old.travelers.length === 0, '13: create_trip with name, legs and notes, and no travelers');
  ok(!(await tool('plan_days', { trip_id: old.id, days: [{ date: '2026-12-05', items: [shirtA], occasion: 'Walk', note: 'Light' }] })).error, '13: plan_days with date, items, occasion and note');
  const sp = await tool('set_packing', { trip_id: old.id, items: [{ item_id: shirtA, qty: 1 }, { label: 'Charger', qty: 2 }] });
  const rows = await q(`select * from public.trip_packing where trip_id = $1 order by created_at`, [old.id]);
  ok(!sp.error && sp.count === 2 && rows[0].status === 'needed' && rows[0].category === 'clothing' && rows[1].category === 'misc' && rows[1].qty === 2 && rows.every((r) => !r.traveler_key && !r.bag_id), '13: set_packing with item_id or label and qty: needed, clothing or misc, nobody\'s, no bag', rows);
  await tool('set_packing_status', { packing_item_ids: [rows[0].id], status: 'packed' });
  const sp2 = await tool('set_packing', { trip_id: old.id, items: [{ item_id: shirtA }, { label: 'Umbrella' }] });
  const rows2 = await q(`select * from public.trip_packing where trip_id = $1 order by created_at`, [old.id]);
  ok(sp2.removed === 1 && rows2.length === 2 && rows2.find((r) => r.item_id === shirtA).status === 'packed' && rows2.find((r) => r.item_id === shirtA).id === rows[0].id && rows2.some((r) => r.label === 'Umbrella'), '13: set_packing replaces the list; what was on it keeps its id and status', rows2);
  const sp3 = await tool('set_packing', { trip_id: old.id, items: [{ label: 'Sunglasses', category: 'accessories', traveler: null }], mode: 'add' });
  ok(sp3.count === 3 && sp3.removed === 0, '13: mode add appends');
  const rich = await tool('set_packing', { trip_id: T, items: [{ label: 'Diapers', traveler: 'dominic', status: 'ready', bag: 'stroller' }], mode: 'add' });
  ok(rich.updated[0].status === 'ready' && rich.updated[0].bag === 'stroller', '13: set_packing takes the richer fields too', rich);
  const g3 = await tool('get_trip', { id: old.id });
  ok(g3.packing.items.length === 3 && !g3.travelers.length && !g3.bags.length && /Outfit: Soft Brushed Crew Neck/.test(g3.text), '13: an old-style trip reads whole', g3.text);
}

// ---------- Nothing points at the wrong thing ----------
{
  const other = await tool('create_trip', { name: 'Elsewhere', legs: [{ place: 'Rome', from: '2026-12-10', to: '2026-12-12' }] });
  const ob = (await tool('add_trip_bags', { trip_id: other.id, bags: [{ key: 'other_bag', label: 'Other' }] })).bags[0];
  await bad('move_packing_items', { packing_item_ids: [P['Diapers']], bag: ob.id }, /no bag/, 'a bag of another trip is refused');
  ok(await q(`update public.trip_packing set bag_id = $1 where id = $2`, [ob.id, P['Diapers']]).then(() => false, () => true), 'the database itself refuses a bag of another trip');
  const theirs = (await tool('add_packing_items', { trip_id: other.id, items: [{ label: 'Hat' }] })).created[0];
  await bad('set_packing_status', { packing_item_ids: [P['Diapers'], theirs.id], status: 'packed' }, /different trips/, 'entries of two trips at once are refused');
  await bad('get_trip', { id: 'not-an-id' }, /no trip/, 'a trip that isn\'t there');
  await bad('update_transport', { id: lo.lodging[0].id, notes: 'x' }, /no transport/, 'an id of another kind of part isn\'t taken for this one');
}

// ---------- Deleting the trip: its parts go with it, and come back with it ----------
{
  await tool('delete_trip', { id: T });
  await bad('get_trip', { id: T }, /trash/, 'a trip in the trash is gone from get_trip');
  await bad('update_packing_item', { packing_item_id: P['Diapers'], qty: 3 }, /no packing entry/, 'and its packing can\'t be changed');
  await bad('add_trip_bags', { trip_id: T, bags: [{ label: 'x' }] }, /trash/, 'nor anything added to it');
  ok(!(await tool('restore', { id: T })).error && (await tool('get_trip', { id: T })).packing.items.length > 5, 'restore brings it back with everything on it');
  await tool('delete_trip', { id: T });
  await db.exec(`reset role; set request.jwt.claims = ''`);
  await q(`update public.trips set deleted_at = now() - interval '31 days' where id = $1`, [T]);
  await q(`select * from public.empty_trash()`);
  ok(!(await q(`select 1 from public.trip_packing where trip_id = $1 union all select 1 from public.trip_bags where trip_id = $1 union all select 1 from public.trip_transport where trip_id = $1`, [T])).length, 'emptying the trash takes a trip\'s parts with it');
  await db.exec(`set role authenticated`);
  await as(STEVE, 'steve@example.com');
}

// ---------- Each person's own ----------
{
  const mine = (await tool('list_trips', {})).trips.find((x) => x.name === 'Elsewhere');
  await as(OTHER, 'other@example.com');
  ok(!(await ctx.parts.list('trip_packing', mine.id)).length && !(await ctx.trips.get(mine.id)), 'someone else sees none of Steve\'s trip or its parts');
  ok(await ctx.parts.add('trip_packing', [{ trip_id: mine.id, label: 'Sneaky' }]).then(() => false, () => true), 'and can\'t add to it');
  await bad('get_trip', { id: mine.id }, /no trip/, 'nor through SJPJr');
  await as(STEVE, 'steve@example.com');
}

// ---------- Days: what happened, a day at a time (public.events; areas/days.js) ----------
// The Europe trip as Steve has it (London, Florence, Paris), with each leg's own clock: get_today
// in the leg's time zone, log_day (as planned, by name, changed, cleared, the journal, retries, dry
// runs), get_history with how often each garment was worn, the newest standing and the trash
// taking an undo; and none of it anyone else's.
{
  const realWeather = ctx.weather, realNow = ctx.now;
  // the weather: one day, with the place's time zone (as Open-Meteo gives it), by longitude
  const zone = (lon) => (lon < -30 ? 'America/New_York' : lon < 1 ? 'Europe/London' : lon < 5 ? 'Europe/Paris' : 'Europe/Rome');
  const asked = [];
  ctx.weather = async (leg) => { asked.push(leg); return { kind: 'forecast', timezone: zone(leg.lon), days: [{ date: leg.from, hi: 18.4, lo: 9.2, rain: 70, kind: 'forecast', code: 61, feelsHi: 17, feelsLo: 6 }], summary: { hi: 18, lo: 9, wet: 1 } }; };
  const at = (iso) => { ctx.now = () => new Date(iso); };
  // the trip seeded with the old rows has the same dates; to the trash with it, so this one is the trip on
  for (const x of (await tool('list_trips', {})).trips.filter((x) => x.name === 'Europe, autumn')) await tool('delete_trip', { id: x.id });
  const trip = await ctx.trips.add({ name: 'Europe, autumn', legs: [
    { place: 'London', country: 'United Kingdom', lat: 51.5, lon: -0.12, from: '2026-10-07', to: '2026-10-14' },
    { place: 'Florence', country: 'Italy', lat: 43.78, lon: 11.25, from: '2026-10-14', to: '2026-11-14' },
    { place: 'Paris', country: 'France', lat: 48.85, lon: 2.35, from: '2026-11-14', to: '2026-11-17' },
  ], days: [] });
  const E = trip.id;
  await tool('plan_days', { trip_id: E, days: [
    { date: '2026-10-15', occasion: 'Uffizi, then dinner out', items: [shirtA, pants, loafers], activities: [{ title: 'Uffizi', type: 'sightseeing', start_time: '09:30', end_time: '12:00' }, { title: 'Dinner at Buca Mario', type: 'dining', start_time: '20:00' }] },
    { date: '2026-10-16', items: [shirtB, pants] },
  ] });
  await tool('add_transport', { trip_id: E, transport: [{ type: 'train', origin: 'Florence', destination: 'Paris', date: '2026-11-14', departure_time: '2026-11-14T08:00:00+01:00', carrier: 'Frecciarossa', number: '9581' }, { type: 'train', origin: 'London', destination: 'Florence', date: '2026-10-14', departure_time: '2026-10-14T07:01:00+01:00', arrival_time: '2026-10-14T19:30:00+02:00' }] });
  await tool('add_lodging', { trip_id: E, lodging: [{ name: 'Florence flat', place: 'Florence', check_in: '2026-10-14', check_out: '2026-11-14' }] });
  const packed = await tool('add_packing_items', { trip_id: E, items: [{ item_id: shirtA, status: 'packed' }, { item_id: shirtB, status: 'packed' }, { item_id: pants, status: 'packed' }, { item_id: loafers, status: 'packed' }, { label: 'Umbrella', status: 'packed' }] });
  ok(!packed.error && packed.created.length === 5, 'days: the trip, planned and packed', packed);

  // get_today: by the leg's own clock
  at('2026-10-15T09:00:00Z'); // 11:00 in Florence, 05:00 at home
  let d = await tool('get_today', {});
  ok(!d.error && d.date === '2026-10-15' && d.today === true && d.where.at === 'trip' && d.where.place === 'Florence' && d.where.timezone === 'Europe/Rome' && d.where.local_time === '11:00' && d.where.trip.id === E && d.where.trip.day === 9 && d.where.trip.days === 42, 'get_today: the date and where he is, the leg on that day, by its own clock', d.where);
  ok(d.weather.hi === 18 && d.weather.lo === 9 && d.weather.rain === 70 && d.weather.condition === 'Light rain' && d.weather.kind === 'forecast', 'get_today: the weather that day, its sky in words', d.weather);
  ok(d.planned.occasion === 'Uffizi, then dinner out' && d.planned.items.map((i) => i.id).join() === [shirtA, pants, loafers].join() && d.planned.items.every((i) => i.name) && d.planned.items.find((i) => i.id === shirtA).hero_photo_id, 'get_today: the planned outfit, with names and photo ids', d.planned);
  ok(d.activities.map((a) => a.title).join() === 'Uffizi,Dinner at Buca Mario' && d.worn === null && d.journal === null, 'get_today: the day\'s activities; nothing logged yet', d);
  ok(d.next_journey?.destination === 'Paris' && d.tonight?.name === 'Florence flat' && d.link === 'https://stevenpisani.com/apps/#today', 'get_today: the next journey (not the one already made), tonight\'s stay, the link into the app', [d.next_journey, d.tonight, d.link]);
  ok(/^Today: Thursday 15 October 2026, in Florence, Italy \(day 9 of 42 of Europe, autumn; 11:00 there\)\./.test(d.text) && /Worn: not logged yet/.test(d.text) && /In the app: https:\/\/stevenpisani\.com\/apps\/#today/.test(d.text), 'get_today: says it in a few lines', d.text);
  ok(asked.every((l) => l.from === l.to), 'get_today: asks the weather for one day, not the whole leg', asked);
  at('2026-10-15T22:30:00Z'); // 00:30 on the 16th in Florence, still the 15th at home
  d = await tool('get_today', {});
  ok(d.date === '2026-10-16' && d.where.local_time === '00:30' && d.planned.items.length === 2, 'get_today: past midnight in Florence it\'s the next day, though it isn\'t yet at home', d.where);
  at('2026-10-06T23:30:00Z'); // 19:30 at home on the 6th; already the 7th in London, the trip's first day
  ok((await tool('get_today', {})).where.place === 'London', 'get_today: a trip that starts tomorrow at home but today where it is');
  at('2026-10-05T12:00:00Z');
  d = await tool('get_today', {});
  ok(d.date === '2026-10-05' && d.where.at === 'home' && d.where.place === 'Philadelphia' && d.where.timezone === 'America/New_York' && d.where.local_time === '08:00' && d.planned === null && d.next_journey?.origin === 'London' && d.tonight === null && /at home in Philadelphia/.test(d.text), 'get_today: at home before the trip, by home\'s clock; the trip\'s first journey is next', d);
  ok((await tool('get_today', { date: '2026-11-15' })).where.place === 'Paris' && (await tool('get_today', { date: '2026-11-15' })).today === false, 'get_today: another day, where he\'ll be then');
  await bad('get_today', { date: '15/10/2026' }, /YYYY-MM-DD/, 'get_today: a date is YYYY-MM-DD');

  // log_day: as planned, then changed, by name; the journal; retries and dry runs
  at('2026-10-15T09:00:00Z');
  ctx.client = 'client-chatgpt';
  const dry = await tool('log_day', { as_planned: true, dry_run: true, client_ref: 'dry-1' });
  ok(!dry.error && dry.dry_run && dry.would_store[0].item_ids.length === 3 && !(await q(`select 1 from public.events`)).length, 'log_day: a dry run stores nothing', dry);
  const one = await tool('log_day', { as_planned: true, said: 'Wore the plan today', client_ref: 'wore-15' });
  const row = (await q(`select * from public.events`))[0];
  ok(!one.error && one.date === '2026-10-15' && one.stored.length === 1 && row.kind === 'wore' && row.item_ids.join() === [shirtA, pants, loafers].join() && row.trip_id === E && row.owner === STEVE && row.source === 'mcp' && row.recorded_by === 'assistant (client-chatgpt)' && row.evidence.as_planned === true && row.evidence.said === 'Wore the plan today' && row.evidence.planned.length === 3, 'log_day as_planned: the planned outfit, on the trip, with who sent it, how, and his words', row);
  ok(/Logged for 15 Oct \(Florence, Europe, autumn\): wore .* \(as planned\)/.test(one.text), 'log_day: says what it stored', one.text);
  const again = await tool('log_day', { as_planned: true, client_ref: 'wore-15' });
  ok(again.repeated && again.stored[0].id === one.stored[0].id && (await q(`select count(*)::int as n from public.events`))[0].n === 1, 'log_day: a retry with the same client_ref returns what was stored, adding nothing', again);
  d = await tool('get_today', {});
  ok(d.worn.as_planned === true && d.worn.items.length === 3 && d.worn.source === 'mcp' && /Worn: .* \(as planned\)/.test(d.text), 'get_today: what\'s logged as worn', d.worn);
  await bad('log_day', { wore: ['Soft Brushed'] }, /could be:(?=.*Dark Brown)(?=.*Dark Gray).*Pass the id/, 'log_day: a name that fits several garments is refused, with them');
  await bad('log_day', { wore: ['purple cape'] }, /No garment matches "purple cape"/, 'log_day: a name that fits none is refused');
  await bad('log_day', { wore: ['00000000-0000-4000-8000-000000000000'] }, /Not in the wardrobe/, 'log_day: an id that isn\'t a garment is refused');
  await bad('log_day', { date: '2026-10-16', as_planned: true }, /hasn't happened yet/, 'log_day: not a day still to come');
  await bad('log_day', { date: '2026-10-14', as_planned: true }, /Nothing was planned/, 'log_day: as_planned needs a plan');
  await bad('log_day', {}, /Nothing to log/, 'log_day: something to log');
  await bad('log_day', { wore: [shirtA], as_planned: true }, /not both/, 'log_day: wore or as_planned, not both');
  const changed = await tool('log_day', { wore: ['navy chinos', shirtB, 'the brown suede loafers'], journal: '  Uffizi in the rain,   then pici.  ', said: 'Actually the grey one, and the chinos' });
  const wore2 = changed.stored.find((e) => e.kind === 'wore');
  ok(!changed.error && changed.stored.length === 2 && wore2.item_ids.join() === [pants, shirtB, loafers].join() && wore2.evidence.as_planned === false && wore2.evidence.named.map((n) => n.by).join() === 'name,id,name' && changed.stored.find((e) => e.kind === 'journal').text === 'Uffizi in the rain, then pici.', 'log_day: changed, by names and an id (each name kept with what it matched), with a journal line, tidied', changed.stored);
  d = await tool('get_today', {});
  ok(d.worn.items.map((i) => i.id).join() === [pants, shirtB, loafers].join() && d.worn.as_planned === false && d.journal.text === 'Uffizi in the rain, then pici.' && (await q(`select count(*)::int as n from public.events where kind = 'wore' and date = '2026-10-15'`))[0].n === 2, 'logging again replaces what the day says; the earlier row stays as its history', d.worn);
  ok((await tool('log_day', { journal: '' })).stored[0].text === undefined && (await tool('get_today', {})).journal === null, 'log_day journal "": the line cleared');
  await tool('log_day', { journal: 'Uffizi in the rain, then pici.' });
  ok((await tool('log_day', { date: '2026-10-14', wore: [shirtA, pants] })).stored[0].trip_id === E, 'log_day: an earlier day, on the trip that day was on');
  await tool('log_day', { date: '2026-10-12', wore: [shirtA] });
  await tool('log_day', { date: '2026-10-11', wore: [shirtB] });
  ok((await tool('log_day', { date: '2026-10-11', wore: [] })).stored[0].item_ids.length === 0 && (await tool('get_today', { date: '2026-10-11' })).worn.items.length === 0, 'log_day wore []: cleared (a row that says so; nothing deleted)');
  ok((await tool('log_day', { date: '2026-10-02', wore: [shirtA] })).stored[0].trip_id === undefined, 'log_day: a day at home is on no trip');

  // get_history: the days and how often each garment was worn
  let h = await tool('get_history', { trip_id: E });
  const count = (id) => h.worn.find((x) => x.item_id === id)?.days;
  ok(!h.error && h.from === '2026-10-07' && h.to === '2026-10-15' && h.days_with_wear === 3, 'get_history trip_id: from the trip\'s first day to today; three days with something worn (a cleared day isn\'t one)', h);
  ok(count(shirtA) === 2 && count(pants) === 2 && count(shirtB) === 1 && count(loafers) === 1 && h.worn[0].days === 2, 'get_history: days worn per garment, on the trip (once a day, the standing record only), most first', h.worn);
  ok(h.packed_not_worn.length === 0 && h.events.filter((e) => e.kind === 'wore').length === 4 && h.events.filter((e) => e.kind === 'journal').length === 1 && h.events.every((e) => e.source && e.logged_at), 'get_history: each day\'s standing wore and journal, with how each was recorded', h.events);
  await tool('add_packing_items', { trip_id: E, items: [{ label: 'Rain jacket', status: 'packed' }] });
  const jacket = (await tool('add_item', { name: 'Rain shell', category: 'outerwear' })).item.id;
  await tool('add_packing_items', { trip_id: E, items: [{ item_id: jacket, status: 'packed' }] });
  h = await tool('get_history', { trip_id: E });
  ok(h.packed_not_worn.map((x) => x.name).join() === 'Rain shell' && /Packed but not worn yet: Rain shell/.test(h.text), 'get_history: the packed garments not worn yet on the trip (garments only)', h.packed_not_worn);
  h = await tool('get_history', {});
  ok(h.from === '2026-09-16' && h.to === '2026-10-15' && count(shirtA) === 3, 'get_history: the last 30 days by default, home days included', [h.from, h.to, h.worn]);
  h = await tool('get_history', { kind: 'journal', from: '2026-10-01', to: '2026-10-31' });
  ok(h.events.length === 1 && h.events[0].text === 'Uffizi in the rain, then pici.', 'get_history kind: only that kind', h.events);
  await bad('get_history', { from: '2026-10-10', to: '2026-10-01' }, /after/, 'get_history: from before to');
  await bad('get_history', { from: '2024-01-01', to: '2026-10-01' }, /shorter/, 'get_history: at most 400 days');

  // undo: the newest row goes to the trash (what the app's Undo does); the one before stands again
  const newest = (await q(`select id from public.events where kind = 'wore' and date = '2026-10-15' order by created_at desc limit 1`))[0].id;
  ok((await q(`update public.events set deleted_at = now() where id = $1 returning id`, [newest])).length === 1 && (await tool('get_today', {})).worn.as_planned === true, 'undo: the newest row to the trash, and the one before is what the day says again');
  await db.exec(`reset role; set request.jwt.claims = ''`);
  await q(`update public.events set deleted_at = now() - interval '31 days' where id = $1`, [newest]);
  await q(`select * from public.empty_trash()`);
  ok(!(await q(`select 1 from public.events where id = $1`, [newest])).length && (await q(`select count(*)::int as n from public.events`))[0].n > 5, 'emptying the trash takes an event in it after 30 days, and only that');
  await db.exec(`set role authenticated`);
  await as(STEVE, 'steve@example.com');

  // the shared rules (_shared/days.js), as the app uses them
  const { standing, wears } = await import('../supabase/functions/_shared/days.js');
  const ev = [
    { id: 'a', date: '2026-10-15', kind: 'wore', item_ids: ['x'], created_at: '2026-10-15 08:00:00.1+00' },
    { id: 'b', date: '2026-10-15', kind: 'wore', item_ids: ['y', 'y'], created_at: '2026-10-15T09:00:00.000Z' },
    { id: 'c', date: '2026-10-15', kind: 'visited', created_at: '2026-10-15T07:00:00Z' },
    { id: 'd', date: '2026-10-15', kind: 'visited', created_at: '2026-10-15T07:30:00Z' },
    { id: 'e', date: '2026-10-16', kind: 'wore', item_ids: ['y'], created_at: '2026-10-16T09:00:00Z', deleted_at: '2026-10-16T09:01:00Z' },
  ];
  ok(standing(ev).map((e) => e.id).join() === 'b,d,c' && wears(ev).get('y').times === 1 && !wears(ev).has('x'), 'the newest wore stands (Postgres and browser times compared as times); other kinds all count; the trash never does', standing(ev));

  // someone else: sees none of it, can't add to Steve's days or change them
  await as(OTHER, 'other@example.com');
  ok(!(await ctx.events.list()).length && !(await q(`select 1 from public.events`)).length, 'someone else sees none of Steve\'s events');
  ok(await ctx.events.add([{ date: '2026-10-15', kind: 'wore', item_ids: [shirtA], owner: STEVE }]).then(() => false, () => true), 'and can\'t add one as Steve');
  ok(await ctx.events.add([{ date: '2026-10-15', kind: 'journal', text: 'x', trip_id: E }]).then(() => false, () => true), 'nor one of their own on Steve\'s trip');
  ok(!(await q(`update public.events set text = 'changed' returning id`)).length && !(await q(`update public.events set deleted_at = now() returning id`)).length, 'nor change or trash his');
  ok((await tool('get_today', { date: '2026-10-15' })).worn === null && (await tool('get_history', {})).events.length === 0, 'and SJPJr shows them nothing of his');
  const theirs = await tool('log_day', { date: '2026-10-05', journal: 'My own day' });
  ok(!theirs.error && (await ctx.events.list()).length === 1, 'their own day is theirs');
  await as(STEVE, 'steve@example.com');
  ok(!(await ctx.events.list()).some((e) => e.text === 'My own day'), 'and Steve doesn\'t see it');

  ctx.weather = realWeather;
  ctx.now = realNow;
  ctx.client = null;
}

// ---------- The weather (_shared/weather.js, against a made-up Open-Meteo) ----------
// What the MCP server has always had stays as it was, the conditions come with it, and the hours
// are only for whoever asks (the app): the server's answers stay short.
{
  const fetched = [], realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = new URL(url), P = u.searchParams, time = [];
    fetched.push(u);
    for (let d = new Date(`${P.get('start_date')}T12:00:00Z`); d <= new Date(`${P.get('end_date')}T12:00:00Z`); d = new Date(d.getTime() + 864e5)) time.push(d.toISOString().slice(0, 10));
    const fill = (v) => time.map(() => v), daily = { time, temperature_2m_max: fill(18), temperature_2m_min: fill(9), precipitation_sum: time.map((_, i) => (i % 3 ? 0 : 4)) };
    if (u.hostname.startsWith('archive')) return new Response(JSON.stringify({ timezone: 'Europe/Rome', daily }));
    Object.assign(daily, { weather_code: fill(61), precipitation_probability_max: fill(70), apparent_temperature_max: fill(17), apparent_temperature_min: fill(6), sunrise: time.map((d) => `${d}T07:21`), sunset: time.map((d) => `${d}T18:39`), uv_index_max: fill(3), wind_speed_10m_max: fill(20) });
    const out = { timezone: 'Europe/Rome', daily };
    if (P.get('hourly')) {
      const hours = [];
      for (let t = new Date(`${P.get('start_hour')}:00Z`); t <= new Date(`${P.get('end_hour')}:00Z`); t = new Date(t.getTime() + 36e5)) hours.push(t.toISOString().slice(0, 16));
      out.hourly = { time: hours, temperature_2m: hours.map(() => 12), apparent_temperature: hours.map(() => 10), precipitation_probability: hours.map(() => 40), precipitation: hours.map(() => 0.2), weather_code: hours.map(() => 61), is_day: hours.map((t) => (+t.slice(11, 13) >= 7 && +t.slice(11, 13) <= 18 ? 1 : 0)), wind_speed_10m: hours.map(() => 8) };
    }
    return new Response(JSON.stringify(out));
  };
  try {
    const leg = { lat: 43.78, lon: 11.25, from: '2026-10-14', to: '2026-11-14' };
    const w = await legWeather(leg, '2026-10-15');
    ok(w.kind === 'mixed' && w.days.length === 31 && w.days[0].date === '2026-10-15' && w.summary.hi === 18 && w.summary.lo === 9, 'weather: a leg past the forecast is forecast, then typical, from today', w.summary);
    const f = w.days[0], t = w.days[w.days.length - 1];
    ok(f.kind === 'forecast' && f.hi === 18 && f.lo === 9 && f.rain === 70 && f.code === 61 && f.feelsLo === 6 && f.sunset === '2026-10-15T18:39' && f.uv === 3 && f.wind === 20 && f.mm === 4, 'weather: a forecast day has its condition, feels-like, rain, sun times, UV and wind', f);
    ok(t.kind === 'typical' && t.code === undefined && t.rain != null && t.mm != null, 'weather: a typical day says what was usual, never a condition', t);
    ok(w.timezone === 'Europe/Rome' && !('hours' in w) && !fetched.some((u) => u.searchParams.has('hourly')), 'weather: no hours unless asked (the MCP server never asks)', fetched.map(String));
    fetched.length = 0;
    const h = await legWeather(leg, '2026-10-15', { hourly: true });
    const forecasts = fetched.filter((u) => u.hostname.startsWith('api'));
    ok(forecasts.length === 1 && forecasts[0].searchParams.get('start_hour') === '2026-10-15T00:00' && forecasts[0].searchParams.get('end_hour') === '2026-10-16T23:00', 'weather: the hours come in the same one request, today and tomorrow only', forecasts.map(String));
    ok(h.hours.length === 48 && h.hours[0].time === '2026-10-15T00:00' && h.hours[0].day === false && h.hours[12].day === true && h.hours[12].code === 61 && h.hours[12].feels === 10, 'weather: each hour has its temperature, feels-like, rain, sky and daylight', h.hours[12]);
    const later = await legWeather({ ...leg, from: '2026-10-20' }, '2026-10-15', { hourly: true });
    ok(!later.hours, 'weather: a leg that starts after tomorrow has no hours yet');
    ok(conditionOf(0) === 'Sunny' && conditionOf(0, false) === 'Clear' && conditionOf(61) === 'Light rain' && conditionOf(95) === 'Thunderstorms' && conditionOf(42) === null, 'weather: WMO codes in plain words');
  } finally { globalThis.fetch = realFetch; }
}

console.log(`trips: ${passed} checks against the real schema: the London and Florence trip end to end (travelers, transport, lodging, links, bags, packing per traveler and bag, statuses, days with activities, get_trip, analyze_trip_packing), older calls, references, removing and deleting, each person's own, days (get_today by the leg's clock, log_day, get_history's counts, the trash, and none of it anyone else's), and the weather (what the server has always had, the conditions, the hours only when asked)`);
