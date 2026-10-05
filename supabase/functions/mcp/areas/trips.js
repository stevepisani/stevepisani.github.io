// Trips: where Steve's going, the weather there, what he'll wear each day and what to pack; one of
// SJPJr's areas (server.js has the protocol and the rules). Outfits and packing are wardrobe items,
// by id; the weather comes from _shared/weather.js (ctx.weather).
import { WARDROBE_APP as APP, showsCard, read, write, Invalid, heroPhotos, trashed, goneOn } from "../kit.js";

const DATE = { type: "string", description: "YYYY-MM-DD." };
const LEG = { type: "object", properties: { place: { type: "string", description: "A city, with its country if it's ambiguous: \"Florence, Italy\"." }, from: DATE, to: DATE }, required: ["place", "from", "to"], additionalProperties: false };

const TOOLS = [
  {
    name: "delete_trip",
    title: "Delete a trip (to the trash)",
    description: "Moves a trip, with its days and packing, to the trash: hidden everywhere, and restore brings it back within 30 days; then it's gone for good. The garments it planned aren't touched.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "list_trips",
    title: "List trips",
    description: "Steve's trips: name, where and when.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: read,
  },
  {
    name: "get_trip",
    title: "Get a trip, with its weather",
    description: "One trip: its legs with the weather for each (the forecast where it reaches, otherwise what those dates were like the last three years), the outfit planned for each day, and the packing list. Read this before planning outfits or packing.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
    annotations: { ...read, openWorldHint: true },
    _meta: showsCard,
  },
  {
    name: "create_trip",
    title: "Create a trip",
    description: "Creates a trip from its legs, in order (a place and dates each; the last day of one leg can be the first of the next).",
    inputSchema: { type: "object", properties: { name: { type: "string" }, legs: { type: "array", items: LEG, minItems: 1 }, notes: { type: "string" } }, required: ["name", "legs"], additionalProperties: false },
    annotations: { ...write, openWorldHint: true },
  },
  {
    name: "update_trip",
    title: "Change a trip",
    description: "Renames a trip, changes its notes, or replaces its legs (all of them, in order).",
    inputSchema: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, notes: { type: "string" }, legs: { type: "array", items: LEG, minItems: 1 } }, required: ["id"], additionalProperties: false },
    annotations: { ...write, idempotentHint: true, openWorldHint: true },
  },
  {
    name: "plan_days",
    title: "Plan outfits for days of a trip",
    description: "Sets what Steve wears on given days of a trip: the wardrobe items (by id), what the day holds (occasion), and a note. A day given again is replaced; a day with no items and no occasion is cleared. Use items from find_items.",
    inputSchema: { type: "object", properties: { trip_id: { type: "string" }, days: { type: "array", minItems: 1, items: { type: "object", properties: { date: DATE, items: { type: "array", items: { type: "string" } }, occasion: { type: "string", description: "What the day holds: \"Uffizi, then dinner out\"." }, note: { type: "string" } }, required: ["date"], additionalProperties: false } } }, required: ["trip_id", "days"], additionalProperties: false },
    annotations: { ...write, idempotentHint: true },
  },
  {
    name: "set_packing",
    title: "Set a trip's packing list",
    description: "Sets what to pack for a trip: wardrobe items (by id) and other things by label (\"charger\", \"umbrella\"), with how many. replace (the default) makes this the whole list; add appends. Whatever was already ticked off as packed stays ticked.",
    inputSchema: { type: "object", properties: { trip_id: { type: "string" }, items: { type: "array", minItems: 1, items: { type: "object", properties: { item_id: { type: "string" }, label: { type: "string" }, qty: { type: "integer", minimum: 1 } }, additionalProperties: false } }, mode: { type: "string", enum: ["replace", "add"] } }, required: ["trip_id", "items"], additionalProperties: false },
    annotations: { ...write, idempotentHint: true },
  },
  {
    name: "tick_packing",
    title: "Tick something off a trip's packing list",
    description: "For the wardrobe card's packing checklist: marks one thing on a trip's packing list (by item_id, or label) packed or not.",
    inputSchema: { type: "object", properties: { trip_id: { type: "string" }, item_id: { type: "string" }, label: { type: "string" }, packed: { type: "boolean" } }, required: ["trip_id", "packed"], additionalProperties: false },
    annotations: { ...write, idempotentHint: true },
    _meta: { ui: { visibility: ["app"] }, "openai/widgetAccessible": true },
  },
];

const isDate = (d) => typeof d === "string" && /^\d{4}-\d\d-\d\d$/.test(d) && !isNaN(new Date(`${d}T12:00:00Z`));
const span = (t) => (t.legs.length ? [t.legs[0].from, t.legs[t.legs.length - 1].to] : [null, null]);
const fmt = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
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
const tripLine = (t) => { const [a, b] = span(t); return `${t.name}: ${t.legs.map((l) => `${l.place} ${fmt(l.from)}–${fmt(l.to)}`).join(", ") || "no legs"}${a ? ` (${a} to ${b})` : ""} [id ${t.id}]`; };

async function call(name, args, ctx) {
  if (name === "list_trips") {
    const all = (await ctx.trips.list()).sort((a, b) => (span(a)[0] || "").localeCompare(span(b)[0] || ""));
    return { text: all.length ? all.map(tripLine).join("\n") : "No trips yet.", data: { trips: all.map((t) => ({ id: t.id, name: t.name, legs: t.legs.map(({ place, country, from, to }) => ({ place, country, from, to })) })) } };
  }
  if (name === "create_trip") {
    if (!String(args.name || "").trim()) throw new Invalid("A trip needs a name.");
    const t = await ctx.trips.add({ name: String(args.name).trim().slice(0, 120), notes: args.notes ? String(args.notes) : null, legs: await legsFrom(args.legs, ctx), days: [], packing: [] });
    return { text: `Created: ${tripLine(t)}`, data: { id: t.id } };
  }
  const id = String(args.id || args.trip_id || "");
  const t = await ctx.trips.get(id);
  if (!t) throw new Invalid("There's no trip with that id (it may be in the trash: list_trash). list_trips has them.");
  if (name === "delete_trip") {
    const at = new Date().toISOString();
    await ctx.trash.set("trips", t.id, at);
    return { text: trashed(t.name, at), data: { id: t.id, in_trash: true, gone_on: goneOn(at) } };
  }
  const items = await ctx.items.list(), byId = new Map(items.map((i) => [i.id, i]));
  if (name === "get_trip") {
    const legs = await Promise.all(t.legs.map(async (l) => ({ ...l, weather: await ctx.weather(l).catch(() => null) })));
    const weatherOn = (date) => { for (const l of legs) { const d = l.weather?.days.find((x) => x.date === date); if (d) return d; } return null; };
    const placeOn = (date) => (legs.find((l) => l.from <= date && date <= l.to) || {}).place;
    const heroes = await heroPhotos([...new Set([...t.days.flatMap((d) => d.items), ...t.packing.map((p) => p.item_id)])].map((i) => byId.get(i)).filter(Boolean), ctx);
    // what the card shows for a garment: its photo (by id), and what tells it apart from its twins
    const look = (i) => { const r = byId.get(i); return r ? Object.fromEntries(Object.entries({ category: r.category, colour: r.colour, manufacturer_colour: r.manufacturer_colour, hero_photo_id: heroes.get(i)?.id }).filter(([, v]) => v)) : {}; };
    // each garment on the trip once; days and packing name them by id (a garment worn on twenty
    // days is one entry, not twenty)
    const garments = {};
    for (const i of new Set([...t.days.flatMap((d) => d.items), ...t.packing.map((p) => p.item_id).filter(Boolean)])) garments[i] = { name: byId.get(i)?.name || "(no longer in the wardrobe)", ...look(i) };
    const days = [...t.days].sort((a, b) => a.date.localeCompare(b.date)).map((d) => { const w = weatherOn(d.date); return { ...d, place: placeOn(d.date), ...(w && { weather: { hi: Math.round(w.hi), lo: Math.round(w.lo), rain: w.rain } }) }; });
    const packing = t.packing.map((p) => ({ ...p }));
    const nameOf = (i) => garments[i].name;
    const text = [
      tripLine(t),
      ...legs.map((l) => `${l.place}, ${l.country} (${l.from} to ${l.to}): ${l.weather ? `${l.weather.kind === "typical" ? "typically" : l.weather.kind === "mixed" ? "forecast then typical:" : "forecast:"} highs ${l.weather.summary.hi}°C, lows ${l.weather.summary.lo}°C, about ${l.weather.summary.wet} day${l.weather.summary.wet === 1 ? "" : "s"} of rain` : "weather unavailable"}`),
      days.length ? `Planned days:\n${days.map((d) => `  ${d.date} (${d.place || "?"}${d.weather ? `, ${d.weather.hi}°/${d.weather.lo}°, ${d.weather.rain}% rain` : ""}): ${d.occasion ? `${d.occasion}: ` : ""}${d.items.map(nameOf).join(", ") || "nothing yet"}${d.note ? ` (${d.note})` : ""}`).join("\n")}` : "No days planned yet.",
      packing.length ? `Packing (${packing.filter((p) => p.packed).length} of ${packing.length} packed): ${packing.map((p) => `${p.qty > 1 ? `${p.qty}× ` : ""}${p.item_id ? nameOf(p.item_id) : p.label}${p.packed ? " ✓" : ""}`).join(", ")}` : "No packing list yet.",
      t.notes ? `Notes: ${t.notes}` : "",
      `In the app: ${APP}#trip/${t.id}`,
    ].filter(Boolean).join("\n");
    // the legs' weather as a summary: the day by day is in each planned day
    const legsOut = legs.map(({ lat, lon, ...l }) => ({ ...l, ...(l.weather && { weather: { kind: l.weather.kind, summary: { hi: Math.round(l.weather.summary.hi), lo: Math.round(l.weather.summary.lo), wet: l.weather.summary.wet } } }) }));
    return { text, data: { view: "trip", trip: { id: t.id, name: t.name, notes: t.notes, legs: legsOut, days, packing, garments } } };
  }
  if (name === "update_trip") {
    const patch = {};
    if (args.name !== undefined) { if (!String(args.name).trim()) throw new Invalid("A trip needs a name."); patch.name = String(args.name).trim().slice(0, 120); }
    if (args.notes !== undefined) patch.notes = String(args.notes) || null;
    if (args.legs !== undefined) patch.legs = await legsFrom(args.legs, ctx);
    if (!Object.keys(patch).length) throw new Invalid("Nothing to change.");
    const u = await ctx.trips.set(t.id, patch);
    return { text: `Changed: ${tripLine(u)}`, data: { id: u.id } };
  }
  if (name === "plan_days") {
    const [a, b] = span(t);
    const days = new Map(t.days.map((d) => [d.date, d]));
    for (const d of args.days || []) {
      if (!isDate(d.date) || (a && (d.date < a || d.date > b))) throw new Invalid(`${d.date} isn't a day of this trip (${a} to ${b}).`);
      const ids = [...new Set(d.items || [])];
      const missing = ids.filter((i) => !byId.has(i));
      if (missing.length) throw new Invalid(`Not in the wardrobe: ${missing.join(", ")}. Use ids from find_items.`);
      if (!ids.length && !d.occasion) { days.delete(d.date); continue; }
      days.set(d.date, { date: d.date, items: ids, ...(d.occasion && { occasion: String(d.occasion).slice(0, 200) }), ...(d.note && { note: String(d.note).slice(0, 500) }) });
    }
    const u = await ctx.trips.set(t.id, { days: [...days.values()].sort((x, y) => x.date.localeCompare(y.date)) });
    return { text: `Planned ${args.days.length} day${args.days.length === 1 ? "" : "s"} of ${u.name}; ${u.days.length} planned in all.`, data: { id: u.id, planned: u.days.length } };
  }
  if (name === "tick_packing") {
    const which = (p) => (args.item_id ? p.item_id === args.item_id : !p.item_id && String(p.label).trim().toLowerCase() === String(args.label || "").trim().toLowerCase());
    if (!t.packing.some(which)) throw new Invalid("That isn't on this trip's packing list.");
    const u = await ctx.trips.set(t.id, { packing: t.packing.map((p) => (which(p) ? { ...p, packed: !!args.packed } : p)) });
    const done = u.packing.filter((p) => p.packed).length;
    return { text: `Packing for ${u.name}: ${done} of ${u.packing.length} packed.`, data: { trip_id: u.id, packed: done, total: u.packing.length } };
  }
  if (name === "set_packing") {
    const key = (p) => (p.item_id ? `i:${p.item_id}` : `l:${String(p.label || "").trim().toLowerCase()}`);
    const was = new Map(t.packing.map((p) => [key(p), p]));
    const list = [];
    for (const p of args.items || []) {
      if (p.item_id && !byId.has(p.item_id)) throw new Invalid(`Not in the wardrobe: ${p.item_id}. Use ids from find_items, or a label.`);
      if (!p.item_id && !String(p.label || "").trim()) throw new Invalid("Each thing to pack needs an item_id or a label.");
      const e = p.item_id ? { item_id: p.item_id } : { label: String(p.label).trim().slice(0, 120) };
      list.push({ ...e, qty: Math.max(1, Math.min(99, parseInt(p.qty, 10) || 1)), packed: !!was.get(key(e))?.packed });
    }
    const merged = args.mode === "add" ? [...t.packing.filter((p) => !list.some((q) => key(q) === key(p))), ...list] : list;
    const u = await ctx.trips.set(t.id, { packing: merged });
    return { text: `Packing list for ${u.name}: ${u.packing.length} thing${u.packing.length === 1 ? "" : "s"} (${u.packing.filter((p) => p.packed).length} packed).`, data: { id: u.id, count: u.packing.length } };
  }
  throw new Invalid(`There's no tool called ${name}.`);
}

export default {
  name: "trips",
  records: true,
  tools: TOOLS,
  status: {
    delete_trip: ["Moving the trip to the trash…", "Moved the trip to the trash"],
  list_trips: ["Getting the trips…", "Got the trips"],
  get_trip: ["Getting the trip and its weather…", "Got the trip"],
  create_trip: ["Creating the trip…", "Created the trip"],
  update_trip: ["Changing the trip…", "Changed the trip"],
  plan_days: ["Planning the days…", "Planned"],
  set_packing: ["Updating the packing list…", "Updated the packing list"],
  tick_packing: ["Ticking it off…", "Ticked off"],
  },
  instructions: "Trips: get_trip has the weather for each leg; plan outfits day by day with plan_days from what he owns (item ids), and the packing list with set_packing.",
  call,
};
