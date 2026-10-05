// Trips: where Steve's going and who with, the weather, each day's plans and outfit, and a check
// of the packing against them; one of SJPJr's areas (server.js has the protocol and the rules).
// The packing list is packing.js; bags, transport, lodging and links are trip-parts.js; what they
// share is trip-kit.js. SJPJr keeps the facts and checks them; the model does the suggesting.
import { WARDROBE_APP as APP, showsCard, read, write, Invalid, heroPhotos, trashed, goneOn, pick } from "../kit.js";
import {
  TRAVELER_TYPES, ACTIVITY_TYPES, SHARED, DATE, isDate, addDays, datesFrom, span, fmt, tripLine, plural, uuid, keyOf, str, oneOf, clock,
  whole, entryOut, tally, byWhen, transportLine, lodgingLine, timeDay,
} from "./trip-kit.js";

const LEG = { type: "object", properties: { place: { type: "string", description: "A city, with its country if it's ambiguous: \"Florence, Italy\"." }, from: DATE, to: DATE }, required: ["place", "from", "to"], additionalProperties: false };
const TRAVELER = {
  type: "object",
  properties: {
    key: { type: "string", description: "Short and stable, lowercase: \"steve\", \"lexi\", \"dominic\". Packing entries and bags point at it. Made from the name if left out." },
    name: { type: "string" },
    type: { type: "string", enum: TRAVELER_TYPES },
    notes: { type: "string", description: "Only what has no field of its own." },
  },
  required: ["name", "type"],
  additionalProperties: false,
};
const LAUNDRY = {
  type: ["object", "null"],
  description: "Whether clothes can be washed on the trip, for planning how much to pack. null clears it.",
  properties: { available: { type: "boolean" }, frequency_days: { type: "integer", minimum: 1, description: "About every how many days." }, notes: { type: "string" } },
  required: ["available"],
  additionalProperties: false,
};
const ACTIVITY = {
  type: "object",
  properties: {
    id: { type: "string", description: "Keep an activity's id (from get_trip) when giving the day again." },
    title: { type: "string", description: "\"Buckingham Palace, St James's, Westminster\"." },
    type: { type: "string", enum: ACTIVITY_TYPES },
    start_time: { type: "string", description: "HH:MM, local." },
    end_time: { type: "string", description: "HH:MM, local." },
    location: { type: "string" },
    notes: { type: "string" },
  },
  required: ["title"],
  additionalProperties: false,
};

const TOOLS = [
  {
    name: "list_trips",
    title: "List trips",
    description: "Steve's trips: name, where and when, with their ids.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: read,
  },
  {
    name: "get_trip",
    title: "Get a trip, whole",
    description: "Everything about one trip, the call to start with: travelers; legs with the weather (the forecast where it reaches, otherwise what those dates were like the last three years); lodging and transport in date order; links; bags; each planned day with its place, weather, activities and outfit (wardrobe item ids); and the packing list with its entries' ids, travelers, bags and statuses, and a count. Garments appear once, in garments, by id; one deleted or retired since is marked so. analyze_trip_packing checks the packing against the plans.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
    annotations: { ...read, openWorldHint: true },
    _meta: showsCard,
  },
  {
    name: "analyze_trip_packing",
    title: "Check a trip's packing",
    description: "Facts about a trip's packing, worked out by fixed rules (no suggestions): counts by status, traveler, category and bag; planned garments not packed or not on the list at all, garments on the list but never planned, garments planned on several days; days with no plan, days with activities but no outfit, travel and work days; and warnings (a planned garment not on the list, an essential not packed, a garment deleted or retired since, an unknown traveler, transport or lodging outside the trip, lodging that overlaps). What to bring is for you to suggest from these and the weather.",
    inputSchema: { type: "object", properties: { trip_id: { type: "string" } }, required: ["trip_id"], additionalProperties: false },
    annotations: read,
  },
  {
    name: "create_trip",
    title: "Create a trip",
    description: "Creates a trip from its legs, in order (a place and dates each; the last day of one leg can be the first of the next; the weather comes from them), and optionally who's going (travelers) and laundry. Lodging, transport, bags, links and packing are added after, with their own tools.",
    inputSchema: { type: "object", properties: { name: { type: "string" }, legs: { type: "array", items: LEG, minItems: 1 }, notes: { type: "string" }, travelers: { type: "array", items: TRAVELER }, laundry: LAUNDRY }, required: ["name", "legs"], additionalProperties: false },
    annotations: { ...write, openWorldHint: true },
  },
  {
    name: "update_trip",
    title: "Change a trip",
    description: "Changes a trip's own fields; only what's given changes. name; notes (\"\" clears); legs (replaces all of them, in order); travelers (replaces the whole list: give everyone who's going; a traveler keeps its id when its key is given again; packing entries and bags pointing at a key no longer there keep it, and analyze_trip_packing flags them); laundry (null clears). Lodging, transport, bags, links, days and packing have their own tools.",
    inputSchema: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, notes: { type: "string" }, legs: { type: "array", items: LEG, minItems: 1 }, travelers: { type: "array", items: TRAVELER }, laundry: LAUNDRY }, required: ["id"], additionalProperties: false },
    annotations: { ...write, idempotentHint: true, openWorldHint: true },
  },
  {
    name: "plan_days",
    title: "Plan days of a trip",
    description: "Sets given days of a trip, each whole: replaces what that date had and leaves other dates alone. Per day: activities (the structured plan: several a day, each with a title and optionally type, local start and end times, location; keep their ids from get_trip when giving a day again), occasion (a short summary: \"sightseeing + work\"), items (the outfit: wardrobe item ids from find_items), note. A day given with nothing is cleared. Older calls with only occasion, items and note work as before.",
    inputSchema: { type: "object", properties: { trip_id: { type: "string" }, days: { type: "array", minItems: 1, items: { type: "object", properties: { date: DATE, activities: { type: "array", items: ACTIVITY }, occasion: { type: "string", description: "A short summary of the day: \"Uffizi, then dinner out\"." }, items: { type: "array", items: { type: "string" }, description: "The outfit: wardrobe item ids." }, note: { type: "string" } }, required: ["date"], additionalProperties: false } } }, required: ["trip_id", "days"], additionalProperties: false },
    annotations: { ...write, idempotentHint: true },
  },
  {
    name: "delete_trip",
    title: "Delete a trip (to the trash)",
    description: "Moves a trip, with everything on it (days, packing, bags, transport, lodging, links), to the trash: hidden everywhere, and restore brings it back within 30 days; then it's gone for good. The garments it planned aren't touched.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
];

async function legsFrom(list, ctx) {
  if (!Array.isArray(list) || !list.length) throw new Invalid("A trip needs at least one leg: a place and dates.");
  const out = [];
  for (const l of list) {
    if (!l?.place || !isDate(l.from) || !isDate(l.to) || l.to < l.from) throw new Invalid(`Each leg needs a place and dates, from before to (YYYY-MM-DD): ${JSON.stringify(l)}`);
    if (out.length && l.from < out[out.length - 1].from) throw new Invalid("Give the legs in order.");
    const where = await ctx.locate(l.place);
    if (!where) throw new Invalid(`Couldn't find a place called ${l.place}. Try the city and country.`);
    out.push({ place: where.name, country: where.country, lat: where.lat, lon: where.lon, from: l.from, to: l.to });
  }
  return out;
}
// The travelers given, checked; each keeps its id if its key was there before
function travelersFrom(list, before = []) {
  if (!Array.isArray(list)) throw new Invalid("travelers is a list.");
  const out = [];
  for (const x of list) {
    const name = str(x?.name, 80, "A traveler's name", { required: true });
    const key = keyOf(x.key || name);
    if (!key || key === SHARED) throw new Invalid(`A traveler needs a key other than "${SHARED}": "${x.key || name}".`);
    if (out.some((y) => y.key === key)) throw new Invalid(`Two travelers have the key "${key}". Give each its own.`);
    out.push(pick({ id: before.find((y) => y.key === key)?.id || uuid(), key, name, type: oneOf(x.type, TRAVELER_TYPES, `${name}'s type`) || "other", notes: str(x.notes, 500, "notes") }, ["id", "key", "name", "type", "notes"]));
  }
  return out;
}
function laundryFrom(v) {
  if (v === null) return null;
  if (typeof v?.available !== "boolean") throw new Invalid("laundry needs available: true or false.");
  const every = v.frequency_days === undefined ? undefined : parseInt(v.frequency_days, 10);
  if (every !== undefined && !(every >= 1)) throw new Invalid("laundry's frequency_days is a whole number of days.");
  return pick({ available: v.available, frequency_days: every, notes: str(v.notes, 500, "laundry notes") }, ["available", "frequency_days", "notes"]);
}
const travelersLine = (t) => (t.travelers.length ? `Travelers: ${t.travelers.map((x) => `${x.name} (${x.type}, key ${x.key})`).join(", ")}` : "");

// The garments a trip names (in its days and packing), once each: what tells them apart, their
// photo, and whether they're still in the wardrobe
async function garmentsOf(ids, ctx) {
  const items = await ctx.items.list(), byId = new Map(items.map((i) => [i.id, i]));
  const heroes = await heroPhotos(ids.map((i) => byId.get(i)).filter(Boolean), ctx);
  const garments = {};
  for (const i of ids) {
    const r = byId.get(i);
    garments[i] = r ? pick({ name: r.name, brand: r.brand, category: r.category, colour: r.colour, manufacturer_colour: r.manufacturer_colour, hero_photo_id: heroes.get(i)?.id, retired: r.retired || undefined }, ["name", "brand", "category", "colour", "manufacturer_colour", "hero_photo_id", "retired"]) : { name: "(no longer in the wardrobe)", missing: true };
  }
  return garments;
}
const tripIds = (t, packing) => [...new Set([...t.days.flatMap((d) => d.items || []), ...packing.map((p) => p.item_id).filter(Boolean)])];

// ---------- The checks (analyze_trip_packing): fixed rules only, nothing suggested ----------
function analyze(w, garments) {
  const { t, packing, bags, transport, lodging } = w;
  const [a, b] = span(t);
  const tripDays = datesFrom(a, b);
  const bagsById = new Map(bags.map((x) => [x.id, x]));
  const name = (i) => garments[i]?.name || "(no longer in the wardrobe)";
  const nameOf = (p) => (p.item_id ? name(p.item_id) : p.label);
  const keys = new Set(t.travelers.map((x) => x.key));
  const warnings = [];
  const warn = (code, message, about) => warnings.push({ code, message, ...about });

  const statusCounts = (list) => ({ entries: list.length, units: list.reduce((n, p) => n + p.qty, 0), ...Object.fromEntries(["needed", "to_buy", "ready", "packed"].map((s) => [s, list.filter((p) => p.status === s).length])) });
  const groupBy = (f) => { const m = {}; for (const p of packing) (m[f(p)] ||= []).push(p); return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, statusCounts(v)])); };

  // the wardrobe: planned (in the days) against listed and packed
  const plannedOn = new Map();
  for (const d of t.days) for (const i of d.items || []) plannedOn.set(i, [...(plannedOn.get(i) || []), d.date]);
  const listed = new Map();
  for (const p of packing) if (p.item_id) listed.set(p.item_id, [...(listed.get(p.item_id) || []), p]);
  const isPacked = (i) => (listed.get(i) || []).some((p) => p.status === "packed");
  const statusOf = (i) => { const l = listed.get(i); return l ? (l.find((p) => p.status === "packed") || l.find((p) => p.status === "ready") || l[0]).status : null; };
  const planned_items = [...plannedOn].map(([item_id, dates]) => ({ item_id, name: name(item_id), dates }));
  const planned_but_not_packed = planned_items.filter((x) => !isPacked(x.item_id)).map((x) => ({ ...x, on_list: listed.has(x.item_id), status: statusOf(x.item_id) }));
  for (const x of planned_but_not_packed) if (!x.on_list) warn("planned_not_on_list", `${x.name} is planned (${x.dates.join(", ")}) but isn't on the packing list.`, { item_id: x.item_id });
  const packed_items = [...listed].map(([item_id, l]) => ({ item_id, name: name(item_id), status: statusOf(item_id), qty: l.reduce((n, p) => n + p.qty, 0), packing_item_ids: l.map((p) => p.id) }));
  const packed_but_not_planned = packed_items.filter((x) => !plannedOn.has(x.item_id));
  const unused_packed_wardrobe_items = packed_but_not_planned.filter((x) => isPacked(x.item_id));
  const repeated_item_usage = planned_items.filter((x) => x.dates.length > 1).map((x) => ({ ...x, count: x.dates.length })).sort((x, y) => y.count - x.count);
  for (const i of new Set([...plannedOn.keys(), ...listed.keys()])) {
    const where = [plannedOn.has(i) && "planned", listed.has(i) && "on the packing list"].filter(Boolean).join(" and ");
    if (garments[i]?.missing) warn("item_missing", `A garment ${where} is no longer in the wardrobe (deleted; it may be in the trash). Its id: ${i}.`, { item_id: i });
    else if (garments[i]?.retired) warn("item_retired", `${name(i)} is ${where} but has been retired.`, { item_id: i });
  }

  // the packing entries themselves
  for (const p of packing) {
    if (p.essential && p.status !== "packed") warn("essential_not_packed", `${nameOf(p)} is essential and not packed yet (${p.status}).`, { packing_item_id: p.id });
    if (p.traveler_key && p.traveler_key !== SHARED && !keys.has(p.traveler_key)) warn("unknown_traveler", `${nameOf(p)} is for "${p.traveler_key}", who isn't a traveler on this trip.`, { packing_item_id: p.id });
    if (p.bag_id && !bagsById.has(p.bag_id)) warn("missing_bag", `${nameOf(p)} is in a bag that isn't on this trip.`, { packing_item_id: p.id });
  }
  for (const x of bags) if (x.traveler_key && x.traveler_key !== SHARED && !keys.has(x.traveler_key)) warn("unknown_traveler", `The bag ${x.key} is for "${x.traveler_key}", who isn't a traveler on this trip.`, { bag_id: x.id });

  // the days
  const dayOf = new Map(t.days.map((d) => [d.date, d]));
  const days_without_plan = tripDays.filter((d) => !dayOf.has(d));
  const days_with_activities_but_no_outfit = t.days.filter((d) => d.activities?.length && !d.items?.length).map((d) => d.date);
  for (const d of days_with_activities_but_no_outfit) warn("no_outfit", `${d} has activities but no outfit.`, { date: d });
  const travel_days = [...new Set([...transport.map((x) => x.date), ...t.days.filter((d) => d.activities?.some((x) => x.type === "travel")).map((d) => d.date)])].sort();
  const work_days = t.days.filter((d) => d.activities?.some((x) => x.type === "work")).map((d) => d.date);
  // transport may leave the day before the first leg (an overnight flight) and come back the day after the last
  for (const x of transport) if (a && (x.date < addDays(a, -1) || x.date > addDays(b, 1))) warn("transport_outside_trip", `${x.type} ${[x.carrier, x.number].filter(Boolean).join(" ")} on ${x.date} is outside the trip (${a} to ${b}).`, { transport_id: x.id });
  for (const x of lodging) if (a && (x.check_in < a || x.check_out > b)) warn("lodging_outside_trip", `${x.name} (${x.check_in} to ${x.check_out}) is outside the trip (${a} to ${b}).`, { lodging_id: x.id });
  const stays = [...lodging].sort(byWhen.lodging);
  for (let i = 0; i < stays.length; i++) for (let j = i + 1; j < stays.length; j++) {
    if (stays[j].check_in < stays[i].check_out && stays[i].check_in < stays[j].check_out) warn("lodging_overlap", `${stays[i].name} and ${stays[j].name} overlap (${stays[j].check_in} to ${stays[i].check_out}).`, { lodging_ids: [stays[i].id, stays[j].id] });
  }
  const nights_without_lodging = lodging.length ? tripDays.slice(0, -1).filter((d) => !lodging.some((x) => x.check_in <= d && d < x.check_out)) : [];

  const s = tally(packing);
  return {
    trip_id: t.id,
    summary: { total_entries: s.total_entries, total_units: s.total_units, packed_entries: s.packed, ready_entries: s.ready, needed_entries: s.needed, to_buy_entries: s.to_buy },
    by_traveler: groupBy((p) => p.traveler_key || "unassigned"),
    by_category: groupBy((p) => p.category),
    by_bag: groupBy((p) => bagsById.get(p.bag_id)?.key || "unassigned"),
    wardrobe_analysis: { planned_items, packed_items, planned_but_not_packed, packed_but_not_planned, repeated_item_usage, unused_packed_wardrobe_items },
    day_analysis: { trip_days: tripDays.length, days_without_plan, days_with_activities_but_no_outfit, travel_days, work_days, nights_without_lodging },
    warnings,
  };
}

const weatherLine = (l) => `${l.place}, ${l.country} (${l.from} to ${l.to}): ${l.weather ? `${l.weather.kind === "typical" ? "typically" : l.weather.kind === "mixed" ? "forecast then typical:" : "forecast:"} highs ${l.weather.summary.hi}°C, lows ${l.weather.summary.lo}°C, about ${plural(l.weather.summary.wet, "day")} of rain` : "weather unavailable"}`;
const activityLine = (x) => `${x.start_time ? `${x.start_time}${x.end_time ? `–${x.end_time}` : ""} ` : ""}${x.title}${x.type ? ` (${x.type})` : ""}${x.location ? ` at ${x.location}` : ""}`;

async function getTrip(args, ctx) {
  const w = await whole(ctx, args.id);
  const { t } = w;
  const [a, b] = span(t);
  const legs = await Promise.all(t.legs.map(async (l) => ({ ...l, weather: await ctx.weather(l).catch(() => null) })));
  const weatherOn = (date) => { for (const l of legs) { const d = l.weather?.days.find((x) => x.date === date); if (d) return d; } return null; };
  const placeOn = (date) => ([...legs].reverse().find((l) => l.from <= date && date <= l.to) || {}).place;
  const garments = await garmentsOf(tripIds(t, w.packing), ctx);
  const nameOf = (i) => garments[i]?.name || "(no longer in the wardrobe)";
  const bagsById = new Map(w.bags.map((x) => [x.id, x]));
  const transport = [...w.transport].sort(byWhen.transport), lodging = [...w.lodging].sort(byWhen.lodging);
  const days = [...t.days].sort((x, y) => x.date.localeCompare(y.date)).map((d) => {
    const wx = weatherOn(d.date);
    // items always there, if empty: the outfit (pick drops empty lists)
    return { ...pick({ date: d.date, place: placeOn(d.date), weather: wx && { hi: Math.round(wx.hi), lo: Math.round(wx.lo), rain: wx.rain }, occasion: d.occasion, activities: d.activities }, ["date", "place", "weather", "occasion", "activities"]), items: d.items || [], ...pick({ note: d.note, travel: transport.some((x) => x.date === d.date) || undefined }, ["note", "travel"]) };
  });
  const items = w.packing.map((p) => entryOut(p, bagsById));
  const summary = tally(w.packing);
  const bags = w.bags.map((x) => pick({ id: x.id, key: x.key, label: x.label, type: x.type, traveler: x.traveler_key, notes: x.notes, entries: w.packing.filter((p) => p.bag_id === x.id).length }, ["id", "key", "label", "type", "traveler", "notes", "entries"]));
  const strip = (r, keys) => pick(r, keys);
  const legsOut = legs.map(({ lat, lon, ...l }) => ({ ...l, ...(l.weather && { weather: { kind: l.weather.kind, summary: { hi: Math.round(l.weather.summary.hi), lo: Math.round(l.weather.summary.lo), wet: l.weather.summary.wet } } }) }));
  const entryLine = (p) => `${p.qty > 1 ? `${p.qty}× ` : ""}${p.item_id ? nameOf(p.item_id) : p.label} [${p.status}${p.traveler ? `, ${p.traveler}` : ""}, ${p.category}${p.bag ? `, in ${p.bag}` : ""}${p.essential ? ", essential" : ""}${p.notes ? `; ${p.notes}` : ""}; id ${p.id}]`;
  const text = [
    tripLine(t),
    travelersLine(t),
    ...legsOut.map(weatherLine),
    lodging.length ? `Lodging:\n${lodging.map((x) => `  ${lodgingLine(x)}`).join("\n")}` : "",
    transport.length ? `Transport:\n${transport.map((x) => `  ${transportLine(x)}`).join("\n")}` : "",
    w.resources.length ? `Links: ${w.resources.map((x) => `${x.label} (${x.type})${x.url ? ` ${x.url}` : ""} [id ${x.id}]`).join("; ")}` : "",
    bags.length ? `Bags: ${bags.map((x) => `${x.key} "${x.label}"${x.type ? ` ${x.type}` : ""}${x.traveler ? ` (${x.traveler})` : ""}, ${plural(x.entries, "entry")} [id ${x.id}]`).join("; ")}` : "",
    days.length ? `Planned days (${days.length} of ${a ? datesFrom(a, b).length : 0}):\n${days.map((d) => `  ${d.date} (${d.place || "?"}${d.weather ? `, ${d.weather.hi}°/${d.weather.lo}°, ${d.weather.rain}% rain` : ""}${d.travel ? ", travel day" : ""}): ${d.occasion ? `${d.occasion}. ` : ""}${d.activities?.length ? `${d.activities.map(activityLine).join("; ")}. ` : ""}Outfit: ${d.items.map(nameOf).join(", ") || "none yet"}${d.note ? ` (${d.note})` : ""}`).join("\n")}` : "No days planned yet.",
    items.length ? `Packing (${summary.packed} of ${summary.total_entries} packed, ${summary.ready} ready, ${summary.needed} needed, ${summary.to_buy} to buy):\n${items.map((p) => `  ${entryLine(p)}`).join("\n")}` : "No packing list yet.",
    t.laundry ? `Laundry: ${t.laundry.available ? `available${t.laundry.frequency_days ? `, about every ${plural(t.laundry.frequency_days, "day")}` : ""}` : "not available"}${t.laundry.notes ? ` (${t.laundry.notes})` : ""}` : "",
    t.notes ? `Notes: ${t.notes}` : "",
    `In the app: ${APP}#trip/${t.id}`,
  ].filter(Boolean).join("\n");
  return {
    text,
    data: {
      view: "trip",
      trip: pick({ id: t.id, name: t.name, notes: t.notes, start: a, end: b, laundry: t.laundry }, ["id", "name", "notes", "start", "end", "laundry"]),
      travelers: t.travelers,
      legs: legsOut,
      lodging: lodging.map((x) => strip(x, ["id", "name", "place", "address", "check_in", "check_out", "confirmation", "booking_url", "notes"])),
      transport: transport.map((x) => strip(x, ["id", "type", "date", "origin", "destination", "origin_code", "destination_code", "departure_time", "arrival_time", "carrier", "number", "confirmation", "booking_url", "notes"])),
      resources: w.resources.map((x) => strip(x, ["id", "type", "label", "url", "notes"])),
      bags,
      days,
      packing: { summary, items },
      garments,
    },
  };
}

async function call(name, args, ctx) {
  if (name === "list_trips") {
    const all = (await ctx.trips.list()).sort((a, b) => (span(a)[0] || "").localeCompare(span(b)[0] || ""));
    return { text: all.length ? all.map(tripLine).join("\n") : "No trips yet.", data: { trips: all.map((t) => ({ id: t.id, name: t.name, legs: t.legs.map(({ place, country, from, to }) => ({ place, country, from, to })) })) } };
  }
  if (name === "create_trip") {
    const tname = str(args.name, 120, "A trip's name", { required: true });
    const row = { name: tname, notes: str(args.notes, 4000, "notes") || null, legs: await legsFrom(args.legs, ctx), days: [], travelers: args.travelers ? travelersFrom(args.travelers) : [] };
    if (args.laundry !== undefined) row.laundry = laundryFrom(args.laundry);
    const t = await ctx.trips.add(row);
    return { text: `Created: ${tripLine(t)}${t.travelers.length ? `\n${travelersLine(t)}` : ""}`, data: { id: t.id, travelers: t.travelers } };
  }
  if (name === "get_trip") return getTrip(args, ctx);
  if (name === "analyze_trip_packing") {
    const w = await whole(ctx, args.trip_id);
    const garments = await garmentsOf(tripIds(w.t, w.packing), ctx);
    const r = analyze(w, garments);
    const s = r.summary;
    const text = [
      `${w.t.name}: ${s.total_entries} entries (${s.total_units} things): ${s.packed_entries} packed, ${s.ready_entries} ready, ${s.needed_entries} needed, ${s.to_buy_entries} to buy.`,
      r.wardrobe_analysis.planned_but_not_packed.length ? `Planned but not packed: ${r.wardrobe_analysis.planned_but_not_packed.map((x) => `${x.name} (${x.on_list ? x.status : "not on the list"})`).join(", ")}.` : "Every planned garment is packed.",
      r.wardrobe_analysis.packed_but_not_planned.length ? `On the list but never planned: ${r.wardrobe_analysis.packed_but_not_planned.map((x) => x.name).join(", ")}.` : "",
      r.day_analysis.days_without_plan.length ? `Days with no plan: ${r.day_analysis.days_without_plan.length} of ${r.day_analysis.trip_days}.` : "",
      r.warnings.length ? `Warnings:\n${r.warnings.map((x) => `  ${x.code}: ${x.message}`).join("\n")}` : "No warnings.",
    ].filter(Boolean).join("\n");
    return { text, data: r };
  }
  const id = String(args.id || args.trip_id || "");
  const { t } = await whole(ctx, id, []);
  if (name === "delete_trip") {
    const at = new Date().toISOString();
    await ctx.trash.set("trips", t.id, at);
    return { text: trashed(t.name, at), data: { id: t.id, in_trash: true, gone_on: goneOn(at) } };
  }
  if (name === "update_trip") {
    const patch = {};
    if (args.name !== undefined) patch.name = str(args.name, 120, "A trip's name", { required: true });
    if (args.notes !== undefined) patch.notes = str(args.notes, 4000, "notes") || null;
    if (args.legs !== undefined) patch.legs = await legsFrom(args.legs, ctx);
    if (args.travelers !== undefined) patch.travelers = travelersFrom(args.travelers, t.travelers);
    if (args.laundry !== undefined) patch.laundry = laundryFrom(args.laundry);
    if (!Object.keys(patch).length) throw new Invalid("Nothing to change.");
    const u = await ctx.trips.set(t.id, patch);
    let note = "";
    if (patch.travelers) {
      // what still points at a traveler who's gone: kept, and said
      const keys = new Set([SHARED, ...patch.travelers.map((x) => x.key)]);
      const [packing, bags] = await Promise.all([ctx.parts.list("trip_packing", t.id), ctx.parts.list("trip_bags", t.id)]);
      const gone = [...new Set([...packing, ...bags].map((p) => p.traveler_key).filter((k) => k && !keys.has(k)))];
      if (gone.length) note = `\nStill pointing at travelers no longer on the trip (${gone.join(", ")}): packing entries or bags. Change them, or add the travelers back.`;
    }
    return { text: `Changed: ${tripLine(u)}${u.travelers?.length ? `\n${travelersLine({ travelers: u.travelers })}` : ""}${note}`, data: { id: u.id, travelers: u.travelers } };
  }
  if (name === "plan_days") {
    const [a, b] = span(t);
    const items = await ctx.items.list(), byId = new Map(items.map((i) => [i.id, i]));
    const days = new Map(t.days.map((d) => [d.date, d]));
    for (const d of args.days || []) {
      if (!isDate(d.date) || (a && (d.date < a || d.date > b))) throw new Invalid(`${d.date} isn't a day of this trip (${a} to ${b}).`);
      const ids = [...new Set(d.items || [])];
      const missing = ids.filter((i) => !byId.has(i));
      if (missing.length) throw new Invalid(`Not in the wardrobe: ${missing.join(", ")}. Use ids from find_items.`);
      const had = days.get(d.date)?.activities || [];
      const activities = (d.activities || []).map((x) => {
        const title = str(x.title, 200, `An activity on ${d.date}`, { required: true });
        const start_time = clock(x.start_time, `${title}'s start_time`), end_time = clock(x.end_time, `${title}'s end_time`);
        if (start_time && end_time && end_time < start_time) throw new Invalid(`${title} ends before it starts (${start_time}–${end_time}).`);
        return pick({ id: had.some((y) => y.id === x.id) || /^[0-9a-f-]{36}$/.test(x.id || "") ? x.id : uuid(), title, type: oneOf(x.type, ACTIVITY_TYPES, `${title}'s type`), start_time, end_time, location: str(x.location, 200, "location"), notes: str(x.notes, 500, "notes") }, ["id", "title", "type", "start_time", "end_time", "location", "notes"]);
      }).sort((x, y) => (x.start_time || "99").localeCompare(y.start_time || "99"));
      const occasion = str(d.occasion, 200, "occasion"), note = str(d.note, 500, "note");
      if (!ids.length && !occasion && !note && !activities.length) { days.delete(d.date); continue; }
      days.set(d.date, { ...pick({ date: d.date, occasion, activities }, ["date", "occasion", "activities"]), items: ids, ...pick({ note }, ["note"]) });
    }
    const u = await ctx.trips.set(t.id, { days: [...days.values()].sort((x, y) => x.date.localeCompare(y.date)) });
    return { text: `Planned ${plural(args.days.length, "day")} of ${u.name}; ${u.days.length} planned in all.`, data: { id: u.id, planned: u.days.length, days: (args.days || []).map((d) => u.days.find((x) => x.date === d.date) || { date: d.date, cleared: true }) } };
  }
  throw new Invalid(`There's no tool called ${name}.`);
}

export default {
  name: "trips",
  records: true,
  tools: TOOLS,
  status: {
    list_trips: ["Getting the trips…", "Got the trips"],
    get_trip: ["Getting the trip and its weather…", "Got the trip"],
    analyze_trip_packing: ["Checking the packing…", "Checked the packing"],
    create_trip: ["Creating the trip…", "Created the trip"],
    update_trip: ["Changing the trip…", "Changed the trip"],
    plan_days: ["Planning the days…", "Planned"],
    delete_trip: ["Moving the trip to the trash…", "Moved the trip to the trash"],
  },
  instructions: "Trips: get_trip first (the whole trip, with the weather). SJPJr keeps the facts and checks them (analyze_trip_packing); you suggest outfits and what to bring. add_packing_items appends; set_packing replaces the whole list.",
  call,
  analyze, // for the tests
};
