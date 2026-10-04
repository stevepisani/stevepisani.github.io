// The wardrobe's MCP server, without the transport: the tools ChatGPT gets and what each does,
// and the JSON-RPC it speaks (MCP over Streamable HTTP, stateless: each POST is answered with
// one JSON response, no session, no server-sent stream). index.ts serves it and signs people in;
// this file is plain JavaScript so tools/smoke.mjs can check it in Node with a made-up store.
//
// `ctx` is the signed-in person's view of the data (index.ts builds it on a Supabase client
// signed in as them, so row-level security applies to everything here):
//   ctx.items.list() → rows; get(id); add(row) → row; set(id, patch) → row | null
//   ctx.photoUrls(paths) → Map(path → signed link); ctx.readProduct(url); ctx.storeImage(url) → path | null
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
    description: "Adds a piece of clothing to Steve's wardrobe. Only name and category are needed; fill in what's known. With a buy_link, the shop's picture of it is copied in as its photo (unless photo_from_link is false), and blank fields are filled from the page.",
    inputSchema: { type: "object", properties: { ...FIELDS, photo_from_link: { type: "boolean", description: "Copy the shop's picture as its photo (default true)." } }, required: ["name", "category"], additionalProperties: false },
    annotations: { ...write, openWorldHint: true },
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
];

class Invalid extends Error {}

// What's written, checked and tidied: unknown fields and wrong values are refused, not guessed at
function clean(args, { partial }) {
  const out = {};
  for (const [k, v] of Object.entries(args)) {
    if (k === "id" || k === "photo_from_link" || k === "retired") continue;
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
    if (row.buy_link) {
      const p = await ctx.readProduct(row.buy_link).catch(() => null);
      if (p) {
        row.buy_link = p.url;
        row.brand ??= p.brand ?? null;
        if (row.price === undefined && p.price != null) { row.price = p.price; row.currency ??= p.currency; }
        if (args.photo_from_link !== false && p.image) row.photo_path = await ctx.storeImage(p.image);
      }
    }
    const added = await ctx.items.add(row);
    const [item] = await shown([added], ctx);
    return { text: `Added: ${line(item)}`, data: { item } };
  }
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

const INSTRUCTIONS = "Steve's wardrobe: every piece of clothing he owns, with what it is (category, colour, material, fit, size, warmth, dressiness, seasons) and where to buy another. Use find_items to see what he has before suggesting outfits or packing lists, and refer to things by name. You can add, change and retire items; deleting is his to do in the app. Photos can't be shown to you; go by the descriptions.";

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
