// The wardrobe's MCP server, without the transport: the tools ChatGPT gets and what each does,
// and the JSON-RPC it speaks (MCP over Streamable HTTP, stateless: each POST is answered with
// one JSON response, no session, no server-sent stream). index.ts serves it and signs people in;
// this file is plain JavaScript so tools/smoke.mjs can check it in Node with a made-up store.
//
// `ctx` is the signed-in person's view of the data (index.ts builds it on a Supabase client
// signed in as them, so row-level security applies to everything here):
//   ctx.items.list() → rows; get(id); add(row) → row; set(id, patch) → row | null
//   ctx.photoUrls(paths) → Map(path → signed link); ctx.readProduct(url); ctx.storeImage(url) → path | null
//   ctx.storeUpload(file) → path | null (a file ChatGPT passes: { download_url, file_id, mime_type })
//   ctx.trips.list(); get(id); add(row) → row; set(id, patch) → row | null
//   ctx.locate(place) → { name, country, lat, lon } | null; ctx.weather(leg) → _shared/weather.js legWeather
export const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];

export const CATEGORIES = ["tops", "bottoms", "outerwear", "suits", "shoes", "accessories", "workout", "swim"];
const SEASONS = ["spring", "summer", "autumn", "winter"];
const WARMTH = ["light", "mid", "warm"];
const DRESSINESS = ["casual", "smart casual", "smart", "formal"];
// what an item is, as ChatGPT sees and writes it (the table's columns, minus the bookkeeping)
const FIELDS = {
  name: { type: "string", description: "What it is, in a few words: \"Navy oxford shirt\"." },
  category: { type: "string", enum: CATEGORIES },
  brand: { type: "string" },
  colour: { type: "string" },
  size: { type: "string", description: "As on the label: M, 32x30, 10." },
  fit: { type: "string", description: "How it fits, for buying another: \"runs small, size up\"." },
  material: { type: "string" },
  seasons: { type: "array", items: { type: "string", enum: SEASONS } },
  warmth: { type: "string", enum: WARMTH },
  dressiness: { type: "string", enum: DRESSINESS },
  price: { type: "number", description: "What it cost." },
  currency: { type: "string", description: "Three letters: USD, EUR, GBP." },
  bought_on: { type: "string", description: "YYYY-MM-DD." },
  buy_link: { type: "string", description: "Where to buy another (a shop's page for it)." },
  notes: { type: "string" },
};
const NULLABLE = ["brand", "colour", "size", "fit", "material", "warmth", "dressiness", "price", "bought_on", "buy_link", "notes"];

// A photo uploaded in the chat: ChatGPT hands it over as a short-lived link (the tool says which
// argument with _meta "openai/fileParams"), which is fetched and stored at once.
const FILE = { type: "object", description: "A photo the user uploaded in this chat.", properties: { download_url: { type: "string" }, file_id: { type: "string" }, mime_type: { type: "string" }, file_name: { type: "string" } }, required: ["download_url", "file_id"] };
const DATE = { type: "string", description: "YYYY-MM-DD." };
const LEG = { type: "object", properties: { place: { type: "string", description: "A city, with its country if it's ambiguous: \"Florence, Italy\"." }, from: DATE, to: DATE }, required: ["place", "from", "to"], additionalProperties: false };

const read = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
export const TOOLS = [
  {
    name: "find_items",
    title: "Find clothes in Steve's wardrobe",
    description: "Lists what's in Steve's wardrobe, optionally narrowed by a search, category, season or dressiness. Retired things (worn out, given away) are left out unless asked for. Start here to know what he owns.",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "Words to look for in the name, brand, colour, material or notes." }, category: FIELDS.category, season: { type: "string", enum: SEASONS }, dressiness: FIELDS.dressiness, include_retired: { type: "boolean" } }, additionalProperties: false },
    annotations: read,
  },
  {
    name: "get_item",
    title: "Get one item",
    description: "Everything about one item in the wardrobe, by its id.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
    annotations: read,
  },
  {
    name: "read_store_link",
    title: "Read a shop's product page",
    description: "Reads a shop's product page for its name, brand, picture and price, without saving anything. Some shops don't allow it; then nothing comes back but the link.",
    inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"], additionalProperties: false },
    annotations: { ...read, openWorldHint: true },
  },
  {
    name: "add_item",
    title: "Add something to the wardrobe",
    description: "Adds a piece of clothing to Steve's wardrobe. Only name and category are needed; fill in what's known (look at the photo for colour, material and the rest). If Steve uploaded a photo of it, pass it as photo. With a buy_link, blank fields are filled from the shop's page, and the shop's picture becomes its photo if there's no uploaded one (unless photo_from_link is false). One item per call.",
    inputSchema: { type: "object", properties: { ...FIELDS, photo: FILE, photo_from_link: { type: "boolean", description: "Copy the shop's picture as its photo when there's no uploaded one (default true)." } }, required: ["name", "category"], additionalProperties: false },
    annotations: { ...write, openWorldHint: true },
    _meta: { "openai/fileParams": ["photo"] },
  },
  {
    name: "set_photo",
    title: "Set an item's photo",
    description: "Makes a photo Steve uploaded in this chat the photo of an item already in the wardrobe.",
    inputSchema: { type: "object", properties: { id: { type: "string" }, photo: FILE }, required: ["id", "photo"], additionalProperties: false },
    annotations: { ...write, idempotentHint: true },
    _meta: { "openai/fileParams": ["photo"] },
  },
  {
    name: "update_item",
    title: "Change an item",
    description: "Changes what's recorded about an item: only the fields given. An empty string clears a field.",
    inputSchema: { type: "object", properties: { id: { type: "string" }, ...FIELDS }, required: ["id"], additionalProperties: false },
    annotations: { ...write, idempotentHint: true },
  },
  {
    name: "retire_item",
    title: "Retire an item (or bring it back)",
    description: "Takes an item out of the wardrobe (worn out, given away, lost) without deleting it, or with retired: false puts it back. Deleting is only done by Steve, in the app.",
    inputSchema: { type: "object", properties: { id: { type: "string" }, retired: { type: "boolean", description: "Default true." } }, required: ["id"], additionalProperties: false },
    annotations: { ...write, idempotentHint: true },
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
];

class Invalid extends Error {}

// What's written, checked and tidied: unknown fields and wrong values are refused, not guessed at
function clean(args, { partial }) {
  const out = {};
  for (const [k, v] of Object.entries(args)) {
    if (k === "id" || k === "photo_from_link" || k === "retired" || k === "photo") continue;
    const f = FIELDS[k];
    if (!f) throw new Invalid(`There's no field called ${k}.`);
    if (v === "" || v === null) { if (!NULLABLE.includes(k) && k !== "seasons") throw new Invalid(`${k} can't be empty.`); out[k] = k === "seasons" ? [] : null; continue; }
    if (f.enum && !f.enum.includes(v)) throw new Invalid(`${k} is one of: ${f.enum.join(", ")}.`);
    if (k === "seasons") { if (!Array.isArray(v) || v.some((s) => !SEASONS.includes(s))) throw new Invalid(`seasons are some of: ${SEASONS.join(", ")}.`); out[k] = [...new Set(v)]; continue; }
    if (k === "price") { const n = Number(v); if (!(n >= 0)) throw new Invalid("price is a number, 0 or more."); out[k] = Math.round(n * 100) / 100; continue; }
    if (k === "currency") { if (!/^[A-Za-z]{3}$/.test(String(v))) throw new Invalid("currency is three letters, like USD."); out[k] = String(v).toUpperCase(); continue; }
    if (k === "bought_on") { if (!/^\d{4}-\d\d-\d\d$/.test(String(v))) throw new Invalid("bought_on is YYYY-MM-DD."); out[k] = String(v); continue; }
    out[k] = String(v).trim().slice(0, k === "notes" ? 2000 : 300);
    if (k === "name" && !out[k]) throw new Invalid("name can't be empty.");
  }
  if (!partial && (!out.name || !out.category)) throw new Invalid("An item needs a name and a category.");
  return out;
}

const KEEP = ["id", "name", "category", "brand", "colour", "size", "fit", "material", "seasons", "warmth", "dressiness", "price", "currency", "bought_on", "buy_link", "notes", "retired", "photo_path"];
async function shown(rows, ctx) {
  const links = await ctx.photoUrls(rows.map((r) => r.photo_path).filter(Boolean));
  return rows.map((r) => {
    const o = Object.fromEntries(KEEP.filter((k) => r[k] !== null && r[k] !== undefined && !(Array.isArray(r[k]) && !r[k].length)).map((k) => [k, r[k]]));
    delete o.photo_path;
    if (r.photo_path && links.get(r.photo_path)) o.photo_url = links.get(r.photo_path); // ChatGPT can't see it, but Steve can open it
    if (!o.retired) delete o.retired;
    return o;
  });
}
// one line an item, for the text half of a result
const line = (o) => `${o.name} (${o.category}${o.retired ? ", retired" : ""}): ${[o.brand, o.colour, o.size && `size ${o.size}`, o.fit, o.material, o.dressiness, o.warmth && `${o.warmth} warmth`, o.seasons?.join("/")].filter(Boolean).join(", ") || "no details yet"} [id ${o.id}]`;

async function call(name, args = {}, ctx) {
  if (name === "find_items") {
    const q = (args.query || "").trim().toLowerCase();
    const rows = (await ctx.items.list()).filter((r) => (args.include_retired || !r.retired)
      && (!args.category || r.category === args.category) && (!args.season || r.seasons?.includes(args.season)) && (!args.dressiness || r.dressiness === args.dressiness)
      && (!q || [r.name, r.brand, r.colour, r.material, r.notes, r.category].join(" ").toLowerCase().includes(q)));
    rows.sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || a.name.localeCompare(b.name));
    const items = await shown(rows, ctx);
    return { text: items.length ? `${items.length} item${items.length > 1 ? "s" : ""}:\n${items.map(line).join("\n")}` : "Nothing in the wardrobe matches that.", data: { count: items.length, items } };
  }
  if (name === "get_item") {
    const row = await ctx.items.get(String(args.id || ""));
    if (!row) throw new Invalid("There's no item with that id.");
    const [item] = await shown([row], ctx);
    return { text: line(item) + (item.notes ? `\nNotes: ${item.notes}` : "") + (item.buy_link ? `\nBuy another: ${item.buy_link}` : ""), data: { item } };
  }
  if (name === "read_store_link") {
    const p = await ctx.readProduct(String(args.url || ""));
    return { text: p.name ? `${p.name}${p.brand ? ` by ${p.brand}` : ""}${p.price != null ? `, ${p.price} ${p.currency || ""}` : ""}.` : "That shop doesn't say what's on the page; only the link is known.", data: { product: p } };
  }
  if (name === "add_item") {
    const row = clean(args, { partial: false });
    if (args.photo) {
      // the same upload twice (ChatGPT sometimes repeats a call) is the same item
      const again = (await ctx.items.list()).find((r) => r.photo_file_id && r.photo_file_id === args.photo.file_id);
      if (again) { const [item] = await shown([again], ctx); return { text: `Already added: ${line(item)}`, data: { item } }; }
      row.photo_path = await ctx.storeUpload(args.photo);
      if (row.photo_path) row.photo_file_id = args.photo.file_id;
    }
    if (row.buy_link) {
      const p = await ctx.readProduct(row.buy_link).catch(() => null);
      if (p) {
        row.buy_link = p.url;
        row.brand ??= p.brand ?? null;
        if (row.price === undefined && p.price != null) { row.price = p.price; row.currency ??= p.currency; }
        if (!row.photo_path && args.photo_from_link !== false && p.image) row.photo_path = await ctx.storeImage(p.image);
      }
    }
    const added = await ctx.items.add(row);
    const [item] = await shown([added], ctx);
    const lost = args.photo && !row.photo_path ? " The photo didn't come through; ask Steve to attach it again and use set_photo." : "";
    return { text: `Added: ${line(item)}${lost}`, data: { item } };
  }
  if (name === "set_photo") {
    if (!args.photo?.download_url) throw new Invalid("The photo didn't come through. Ask Steve to attach it again.");
    const path = await ctx.storeUpload(args.photo);
    if (!path) throw new Invalid("The photo couldn't be fetched from the chat. Ask Steve to attach it again.");
    const row = await ctx.items.set(String(args.id || ""), { photo_path: path, photo_original: null, photo_file_id: args.photo.file_id });
    if (!row) throw new Invalid("There's no item with that id.");
    const [item] = await shown([row], ctx);
    return { text: `Photo set: ${line(item)}`, data: { item } };
  }
  if (name.endsWith("_trip") || name === "list_trips" || name === "plan_days" || name === "set_packing") return trips(name, args, ctx);
  if (name === "update_item") {
    const patch = clean(args, { partial: true });
    if (!Object.keys(patch).length) throw new Invalid("Nothing to change: give at least one field.");
    const row = await ctx.items.set(String(args.id || ""), patch);
    if (!row) throw new Invalid("There's no item with that id.");
    const [item] = await shown([row], ctx);
    return { text: `Changed: ${line(item)}`, data: { item } };
  }
  if (name === "retire_item") {
    const retired = args.retired !== false;
    const row = await ctx.items.set(String(args.id || ""), { retired });
    if (!row) throw new Invalid("There's no item with that id.");
    return { text: `${row.name} is ${retired ? "retired (kept, out of the wardrobe)" : "back in the wardrobe"}.`, data: { id: row.id, retired } };
  }
  throw new Invalid(`There's no tool called ${name}.`);
}

// ---------- Trips ----------
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

async function trips(name, args, ctx) {
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
  if (!t) throw new Invalid("There's no trip with that id. list_trips has them.");
  const items = await ctx.items.list(), byId = new Map(items.map((i) => [i.id, i]));
  if (name === "get_trip") {
    const legs = await Promise.all(t.legs.map(async (l) => ({ ...l, weather: await ctx.weather(l).catch(() => null) })));
    const weatherOn = (date) => { for (const l of legs) { const d = l.weather?.days.find((x) => x.date === date); if (d) return d; } return null; };
    const placeOn = (date) => (legs.find((l) => l.from <= date && date <= l.to) || {}).place;
    const days = [...t.days].sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({ ...d, place: placeOn(d.date), weather: weatherOn(d.date), items: d.items.map((i) => ({ id: i, name: byId.get(i)?.name || "(no longer in the wardrobe)" })) }));
    const packing = t.packing.map((p) => ({ ...p, name: p.item_id ? byId.get(p.item_id)?.name || "(no longer in the wardrobe)" : p.label }));
    const text = [
      tripLine(t),
      ...legs.map((l) => `${l.place}, ${l.country} (${l.from} to ${l.to}): ${l.weather ? `${l.weather.kind === "typical" ? "typically" : l.weather.kind === "mixed" ? "forecast then typical:" : "forecast:"} highs ${l.weather.summary.hi}°C, lows ${l.weather.summary.lo}°C, about ${l.weather.summary.wet} day${l.weather.summary.wet === 1 ? "" : "s"} of rain` : "weather unavailable"}`),
      days.length ? `Planned days:\n${days.map((d) => `  ${d.date} (${d.place || "?"}${d.weather ? `, ${d.weather.hi}°/${d.weather.lo}°, ${d.weather.rain}% rain` : ""}): ${d.occasion ? `${d.occasion}: ` : ""}${d.items.map((i) => i.name).join(", ") || "nothing yet"}${d.note ? ` (${d.note})` : ""}`).join("\n")}` : "No days planned yet.",
      packing.length ? `Packing (${packing.filter((p) => p.packed).length} of ${packing.length} packed): ${packing.map((p) => `${p.qty > 1 ? `${p.qty}× ` : ""}${p.name}${p.packed ? " ✓" : ""}`).join(", ")}` : "No packing list yet.",
      t.notes ? `Notes: ${t.notes}` : "",
    ].filter(Boolean).join("\n");
    return { text, data: { trip: { id: t.id, name: t.name, notes: t.notes, legs, days, packing } } };
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

const INSTRUCTIONS = "Steve's wardrobe: every piece of clothing he owns, with what it is (category, colour, material, fit, size, warmth, dressiness, seasons) and where to buy another. Use find_items to see what he has before suggesting outfits or packing lists, and refer to things by name. You can add, change and retire items; deleting is his to do in the app. Photos can't be shown to you; go by the descriptions, and when he uploads a photo of something new, describe it in the fields (colour, material, dressiness, warmth, seasons) as you add it. Trips: get_trip has the weather for each leg; plan outfits day by day with plan_days from what he owns, and the packing list with set_packing.";

/** Answers one JSON-RPC message (or null for a notification). */
export async function rpc(msg, ctx) {
  const ok = (result) => ({ jsonrpc: "2.0", id: msg.id, result });
  const fail = (code, message) => ({ jsonrpc: "2.0", id: msg.id ?? null, error: { code, message } });
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return fail(-32600, "Not a JSON-RPC request.");
  if (msg.id === undefined) return null; // notifications (initialized, cancelled): nothing to say
  switch (msg.method) {
    case "initialize": {
      const asked = msg.params?.protocolVersion;
      return ok({ protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: "wardrobe", title: "Steve's wardrobe", version: "1.0.0" }, instructions: INSTRUCTIONS });
    }
    case "ping": return ok({});
    case "tools/list": return ok({ tools: TOOLS });
    case "tools/call": {
      const { name, arguments: args } = msg.params || {};
      try {
        const { text, data } = await call(name, args || {}, ctx);
        return ok({ content: [{ type: "text", text }], structuredContent: data });
      } catch (e) {
        if (!(e instanceof Invalid)) console.error(e);
        return ok({ content: [{ type: "text", text: e instanceof Invalid ? e.message : "That didn't work; the wardrobe couldn't be reached. Try again." }], isError: true });
      }
    }
    default: return fail(-32601, `No method ${msg.method}.`);
  }
}
