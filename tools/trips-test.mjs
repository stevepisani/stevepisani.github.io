// Trips in detail, tested against the real schema like the wardrobe (tools/wardrobe-db.mjs: every
// migration in PGlite): travelers, packing entries, bags, transport, lodging, links, each day's
// activities, get_trip whole and analyze_trip_packing, through SJPJr's tools as Steve. The
// acceptance case is the real trip: London and Florence, autumn 2026, Steve, Lexi and Dominic.
// Then what older calls sent still works, nothing points at the wrong thing, and removing or
// deleting takes only what it says. Offline, a few seconds.
//
//   node tools/trips-test.mjs
import { rpc } from '../supabase/functions/mcp/server.js';
import { wardrobeDb, STEVE, OTHER, IDS } from './wardrobe-db.mjs';

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

console.log(`trips: ${passed} checks against the real schema: the London and Florence trip end to end (travelers, transport, lodging, links, bags, packing per traveler and bag, statuses, days with activities, get_trip, analyze_trip_packing), older calls, references, removing and deleting, and each person's own`);
