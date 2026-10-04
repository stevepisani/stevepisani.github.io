// The wardrobe's MCP server, without the transport: the tools ChatGPT and Claude get, what each does,
// and the JSON-RPC it speaks (MCP over Streamable HTTP, stateless: each POST is answered with
// one JSON response, no session, no server-sent stream). index.ts serves it and signs people in;
// this file is plain JavaScript so tools/wardrobe-test.mjs can run it in Node against the real
// schema (PGlite).
//
// The model (supabase/migrations/20261005000100_wardrobe_products.sql): an owned item is a garment
// Steve has, one row per physical piece; it may belong to a variant (one colour and size as sold),
// which belongs to a product (brand, name, style number). Every fact keeps its source. Reads come
// flat (find_items) or whole (get_item); ingest_item files a garment at all three levels at once.
//
// `ctx` is the signed-in person's view of the data (index.ts builds it on a Supabase client
// signed in as them, so row-level security applies to everything here):
//   ctx.items.list() → closet rows (flat, resolved); get(id) → closet row; own(id) → the item row
//     itself; add(row) → closet row; set(id, patch) → closet row | null
//   ctx.products.list(); get(id); add(row) → row; set(id, patch) → row
//   ctx.variants.list(productId); get(id); add(row) → row; set(id, patch) → row
//   ctx.photos.list(itemId); get(id); byFile(fileId) → row | null; add(rows); set(id, patch)
//   ctx.photoUrls(paths) → Map(path → signed link); ctx.readProduct(url); ctx.storeImage(url) → path | null
//   ctx.storeUpload(file) → path | null (a file ChatGPT passes: { download_url, file_id, mime_type })
//   ctx.trips.list(); get(id); add(row) → row; set(id, patch) → row | null
//   ctx.locate(place) → { name, country, lat, lon } | null; ctx.weather(leg) → _shared/weather.js legWeather
export const PROTOCOLS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

// The in-chat card (MCP Apps, SEP-1865, which ChatGPT and Claude both render): one small HTML
// page, served as the resource APP_URI, that shows whatever a tool returned by its
// structuredContent.view (closet, garment, ingest, trip) and can call tools itself (open a
// garment, file a dry run, say what a photo is, tick packing). Its script is the site's
// (assets/js/mcp-app/, built to /assets/js/dist/mcp-app.js), fetched by the server and put in the
// page (ctx.cardScript), so the page needs nothing from elsewhere but the photos; if the site
// can't be reached, the page loads the script itself. Hosts keep the page until the connector is
// refreshed. Hosts without cards use each result's text.
export const APP_URI = "ui://wardrobe/app.html";
export const APP_MIME = "text/html;profile=mcp-app";
const SITE = "https://stevenpisani.com";
const APP = `${SITE}/apps/wardrobe`; // the app's own links: #closet, #item/<id>, #trip/<id>
// who this server is, as both apps show it: name, logo (assets/images/wardrobe*), and its home
export const ICONS = [
  { src: `${SITE}/assets/images/wardrobe.svg`, mimeType: "image/svg+xml", sizes: ["any"] },
  { src: `${SITE}/assets/images/wardrobe-512.png`, mimeType: "image/png", sizes: ["512x512"] },
  { src: `${SITE}/assets/images/wardrobe-64.png`, mimeType: "image/png", sizes: ["64x64"] },
];
export const SERVER = { name: "wardrobe", title: "Steve's wardrobe", version: "1.2.0", description: "Steve's clothes and trips: find, add and plan what to wear and pack.", websiteUrl: APP, icons: ICONS };
const showsCard = { ui: { resourceUri: APP_URI }, "openai/outputTemplate": APP_URI };
export function appResource(ctx, script) {
  const site = ctx.siteOrigin || SITE;
  const js = script ? `<script>${script.replace(/<\/(script)/gi, "<\\/$1")}</script>` : `<script src="${site}/assets/js/dist/mcp-app.js"></script>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Wardrobe</title></head><body><div id="app"></div>${js}</body></html>`;
  // what the card may load: its script from the site, and the photos (signed links to Storage)
  const _meta = {
    ui: { csp: { resourceDomains: [site, ...(ctx.storageOrigin ? [ctx.storageOrigin] : [])] }, prefersBorder: true },
    // for ChatGPT's model: what Steve already sees, so the answer needn't repeat it
    "openai/widgetDescription": "Shows the garments, the one garment, the filing preview or the trip just asked for, with their photos. Steve can open a garment, add a previewed garment, say what a photo is and tick off packing in it. Don't list what it shows or paste photo links; add what it doesn't say.",
  };
  return { uri: APP_URI, name: "Wardrobe", title: "Steve's wardrobe", mimeType: APP_MIME, icons: ICONS, html, _meta };
}

export const CATEGORIES = ["tops", "bottoms", "outerwear", "suits", "shoes", "accessories", "workout", "swim"];
const SEASONS = ["spring", "summer", "autumn", "winter"];
const WARMTH = ["light", "mid", "warm"];
const DRESSINESS = ["casual", "smart casual", "smart", "formal"];
export const SOURCES = ["user", "garment_label", "hang_tag", "care_label", "retailer_page", "manufacturer_page", "vision_inference", "derived"];
export const ROLES = ["garment", "tag", "care_label", "detail", "other"];
// what's a judgement about the garment rather than a fact printed on it
const CLASSIFIED = ["warmth", "dressiness", "dressiness_also", "seasons", "style_tags", "fit"];

const text = (description) => ({ type: "string", ...(description && { description }) });
const CODES = { type: "object", description: "Other codes, by what the label calls them, values as printed: {\"tag_codes\": [\"RN139864\"]}.", additionalProperties: true };
// The fields at each level, as ChatGPT sees and writes them
const ITEM = {
  name: text("What it is, in a few words: \"Navy oxford shirt\". Needed only when there's no product."),
  category: { type: "string", enum: CATEGORIES },
  subcategory: text("What kind, in snake case: \"long_sleeve_t_shirt\", \"chelsea_boots\", \"overcoat\"."),
  brand: text(), colour: text(), size: text("As on the label: M, 32x30, 10."), material: text(),
  fit: text("The fit only: \"slim\", \"regular\", \"relaxed\", \"runs small, size up\". Not the kind of garment."),
  warmth: { type: "string", enum: WARMTH },
  dressiness: { type: "string", enum: DRESSINESS, description: "Where it mostly belongs." },
  dressiness_also: { type: "array", items: { type: "string", enum: DRESSINESS }, description: "Other levels it works at: a plain tee is casual, also smart casual." },
  seasons: { type: "array", items: { type: "string", enum: SEASONS } },
  style_tags: { type: "array", items: { type: "string" }, description: "A few words for its style: \"minimal\", \"workwear\"." },
  condition: text("\"new\", \"good\", \"worn at the cuffs\"."),
  price: { type: "number", description: "What Steve paid for this one." },
  currency: text("Three letters: USD, EUR, GBP."),
  bought_on: text("YYYY-MM-DD."),
  buy_link: text("Where to buy another."),
  notes: text("Anything with no field of its own. Facts that have a field go in the field."),
};
const PRODUCT = {
  brand: text("As on the label."),
  name: text("The maker's name for it: \"Soft Brushed Crew Neck Long Sleeve T\"."),
  style_number: text("The maker's style or product code, exactly as printed."),
  description: text(), material: text("As on the label: \"100% cotton\"."), country_of_origin: text(),
  default_fit: text("The fit it's cut in: \"regular\", \"slim\"."),
  product_url: text("The maker's or a shop's page for it."),
  identifiers: CODES,
};
const VARIANT = {
  manufacturer_colour: text("As printed: \"38 Dark Brown\"."),
  colour: text("Plain, for search: \"dark brown\". Worked out from manufacturer_colour when left out."),
  manufacturer_size: text("As printed: \"M\", \"EU 43\", \"32x30\"."),
  size: text("Plain: \"M\". Worked out from manufacturer_size when left out."),
  sku: text(), barcode: text(),
  price: { type: "number", description: "The retail price, as on the tag or page." },
  currency: text("Three letters."),
  measurements: { type: "object", description: "Size facts, as printed: {\"chest\": \"38–41 in\"}.", additionalProperties: { type: "string" } },
  identifiers: CODES,
};
const SOURCE_MAP = {
  type: "object",
  description: `Where each field's value came from, by field name: a source (${SOURCES.join(", ")}) or { source, confidence 0–1, raw: the text as found }. Give one for every fact.`,
  additionalProperties: { type: "object", properties: { source: { type: "string", enum: SOURCES }, confidence: { type: "number" }, raw: { type: "string" } }, required: ["source"] },
};
const section = (fields, description) => ({ type: "object", description, properties: { ...fields, sources: SOURCE_MAP }, additionalProperties: false });
const LEVELS = { item: ITEM, product: PRODUCT, variant: VARIANT };

// A photo uploaded in the chat: ChatGPT hands it over as a short-lived link (the tool says which
// arguments with _meta "openai/fileParams"), which is fetched and stored at once.
const FILE = { type: "object", description: "A photo the user uploaded in this chat.", properties: { download_url: { type: "string" }, file_id: { type: "string" }, mime_type: { type: "string" }, file_name: { type: "string" } }, required: ["download_url", "file_id"] };
const PHOTO_ARGS = { garment_photo: "garment", tag_photo: "tag", care_label_photo: "care_label", detail_photos: "detail" };
const DATE = { type: "string", description: "YYYY-MM-DD." };
const LEG = { type: "object", properties: { place: { type: "string", description: "A city, with its country if it's ambiguous: \"Florence, Italy\"." }, from: DATE, to: DATE }, required: ["place", "from", "to"], additionalProperties: false };

const read = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
export const TOOLS = [
  {
    name: "find_items",
    title: "Find clothes in Steve's wardrobe",
    description: "Start here. Lists what Steve owns, one entry per physical garment, flat (product and variant facts filled in), optionally narrowed by words, category, season, dressiness (matches where it mostly belongs or also works) or warmth. Retired things are left out unless asked for. Use it before suggesting outfits or packing, and before ingesting, to see if a garment or its product is already here.",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "Words to look for in the name, brand, colour (plain or as printed), material, style number or notes." }, category: ITEM.category, season: { type: "string", enum: SEASONS }, dressiness: ITEM.dressiness, warmth: ITEM.warmth, include_retired: { type: "boolean" } }, additionalProperties: false },
    outputSchema: { type: "object", properties: { view: { type: "string" }, count: { type: "integer" }, items: { type: "array", items: { type: "object", description: "One garment, flat: id, name, brand, category, subcategory, colour, manufacturer_colour, size, material, fit, warmth, seasons, dressiness, dressiness_also, price, hero_photo (a photo reference for the card), product_id, variant_id…" } } }, required: ["count", "items"] },
    annotations: read,
    _meta: showsCard,
  },
  {
    name: "get_item",
    title: "Get one garment, whole",
    description: "Everything about one owned garment: the flat view, then its product and variant (if it has them), what's set on this piece alone, every photo with its role, and where each fact came from. Photo ids here are what set_photo_role takes.",
    inputSchema: { type: "object", properties: { id: { type: "string" }, focus: { type: "array", items: { type: "string", enum: ["size", "colour", "material", "fit", "price", "bought", "condition", "style_number", "origin", "measurements", "notes"] }, description: "Optional: what Steve asked about, so the card shows those facts first." } }, required: ["id"], additionalProperties: false },
    outputSchema: { type: "object", properties: { view: { type: "string" }, item: { type: "object", description: "Flat, as find_items gives it." }, owned_item: { type: "object", description: "What's set on this piece alone, its status, overrides and sources." }, variant: { type: ["object", "null"] }, product: { type: ["object", "null"] }, photos: { type: "array", items: { type: "object", description: "id, role, hero, url (a photo reference for the card), source." } } }, required: ["item", "owned_item", "photos"] },
    annotations: read,
    _meta: { ...showsCard, "openai/widgetAccessible": true },
  },
  {
    name: "ingest_item",
    title: "File a garment from photos or a shop page",
    description: [
      "The way to add clothes. You look at the photos (or the shop page) and pass what you found, split by level; the server finds or creates the product and variant, creates the owned item, stores the photos with their roles and returns the whole garment.",
      "product: the garment as sold (brand and name needed; style_number when printed). variant: this colour and size, as printed (manufacturer_colour \"38 Dark Brown\", manufacturer_size \"M\") plus SKU, barcode, retail price, measurements. item: this physical piece: category (needed), subcategory, warmth, dressiness (+ dressiness_also), seasons, style_tags, condition, what he paid, bought_on, notes; name only when there's no product.",
      "Facts printed on a tag or label go in product or variant, with sources (hang_tag, garment_label, care_label, retailer_page...). Judgements (warmth, dressiness, seasons, style, fit when not printed) go in item, sourced vision_inference or derived. Never put structured facts in notes.",
      "No brand or tag (thrifted, old, tailored): leave product and variant out and describe it in item. Same shirt in another colour: same product, new variant; it's matched by brand + style number, else brand + exact name. A second identical piece: quantity, or ingest again.",
      "Photos: garment_photo is the one shown; tag_photo, care_label_photo and detail_photos are kept beside it. A tag is never shown as the garment.",
      "dry_run: true shows what would happen and any warnings, writing nothing; commit straightforward ones directly. Pass client_ref (any id you make up for this garment) so a retry adds nothing twice.",
    ].join("\n"),
    inputSchema: {
      type: "object",
      properties: {
        product: section(PRODUCT, "The garment as sold. Leave out when the brand isn't known."),
        variant: section(VARIANT, "This colour and size of the product."),
        item: section(ITEM, "This physical piece, and how it dresses."),
        quantity: { type: "integer", minimum: 1, maximum: 10, description: "Identical pieces owned (default 1); each becomes its own item." },
        garment_photo: FILE, tag_photo: FILE, care_label_photo: FILE,
        detail_photos: { type: "array", items: FILE },
        client_ref: { type: "string", description: "Your id for this ingestion; the same one again returns what was made the first time." },
        dry_run: { type: "boolean" },
      },
      required: ["item"],
      additionalProperties: false,
    },
    annotations: { ...write, idempotentHint: true },
    _meta: { "openai/fileParams": Object.keys(PHOTO_ARGS), ...showsCard, "openai/widgetAccessible": true },
  },
  {
    name: "read_store_link",
    title: "Read a shop's product page",
    description: "Reads a shop's product page for its name, brand, picture and price, without saving anything. Use it before ingest_item for a garment added from a link (sources: retailer_page). Some shops don't allow it; then nothing comes back but the link.",
    inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"], additionalProperties: false },
    annotations: { ...read, openWorldHint: true },
  },
  {
    name: "add_item",
    title: "Add a garment quickly",
    description: "A quick add with no product or variant: a name, a category, and what's known, all on the item. Prefer ingest_item, which keeps facts at the right level with their sources. With a buy_link, blank fields are filled from the shop's page and its picture is used if there's no photo.",
    inputSchema: { type: "object", properties: { ...ITEM, photo: FILE, photo_from_link: { type: "boolean", description: "Copy the shop's picture when there's no uploaded photo (default true)." } }, required: ["name", "category"], additionalProperties: false },
    annotations: { ...write, openWorldHint: true },
    _meta: { "openai/fileParams": ["photo"] },
  },
  {
    name: "add_photo",
    title: "Add a photo to a garment",
    description: "Adds a photo uploaded in this chat to a garment, with its role (garment, tag, care_label, detail, other). A garment photo becomes the one shown if the garment has none yet, or if make_hero.",
    inputSchema: { type: "object", properties: { id: { type: "string", description: "The owned item." }, photo: FILE, role: { type: "string", enum: ROLES }, make_hero: { type: "boolean" } }, required: ["id", "photo"], additionalProperties: false },
    annotations: { ...write, idempotentHint: true },
    _meta: { "openai/fileParams": ["photo"] },
  },
  {
    name: "set_photo_role",
    title: "Change a photo's role",
    description: "Says what a photo is (garment, tag, care_label, detail, other), or makes it the one shown (make_hero). Photo ids come from get_item. A photo that stops being a garment photo stops being shown.",
    inputSchema: { type: "object", properties: { photo_id: { type: "string" }, role: { type: "string", enum: ROLES }, make_hero: { type: "boolean" } }, required: ["photo_id"], additionalProperties: false },
    annotations: { ...write, idempotentHint: true },
    _meta: { "openai/widgetAccessible": true },
  },
  {
    name: "update_item",
    title: "Correct or change a garment",
    description: [
      "Changes the given fields, at one level (scope), and says how many garments that touches:",
      "item (default): this physical piece only, any item field. A product or variant field set here (brand, colour, size, material, fit, price) overrides it for this piece alone.",
      "variant: this colour and size, for every piece of it (manufacturer_colour, colour, sizes, sku, barcode, retail price, measurements, identifiers).",
      "product: the garment as sold, for every colour and size (brand, name, style_number, material, origin, default_fit, product_url, identifiers).",
      "An empty string clears a field. Pass sources for what you change (user, when Steve says so).",
    ].join("\n"),
    inputSchema: { type: "object", properties: { id: { type: "string", description: "The owned item." }, scope: { type: "string", enum: ["item", "variant", "product"] }, ...ITEM, ...PRODUCT, ...VARIANT, price: { type: "number", description: "scope item: what Steve paid for this one; scope variant: the retail price." }, sources: SOURCE_MAP }, required: ["id"], additionalProperties: false },
    annotations: { ...write, idempotentHint: true },
  },
  {
    name: "retire_item",
    title: "Retire a garment (or bring it back)",
    description: "Takes one physical garment out of the wardrobe (worn out, given away, lost) without deleting it, or with retired: false puts it back. Deleting is only done by Steve, in the app.",
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

// What ChatGPT shows while a tool runs, and once it's done (64 characters at most)
const STATUS = {
  find_items: ["Looking through the wardrobe…", "Looked through the wardrobe"],
  get_item: ["Getting the garment…", "Got the garment"],
  ingest_item: ["Filing it…", "Filed"],
  read_store_link: ["Reading the shop's page…", "Read the shop's page"],
  add_item: ["Adding it…", "Added"],
  add_photo: ["Adding the photo…", "Added the photo"],
  set_photo_role: ["Updating the photo…", "Updated the photo"],
  update_item: ["Making the change…", "Changed"],
  retire_item: ["Updating…", "Updated"],
  list_trips: ["Getting the trips…", "Got the trips"],
  get_trip: ["Getting the trip and its weather…", "Got the trip"],
  create_trip: ["Creating the trip…", "Created the trip"],
  update_trip: ["Changing the trip…", "Changed the trip"],
  plan_days: ["Planning the days…", "Planned"],
  set_packing: ["Updating the packing list…", "Updated the packing list"],
  tick_packing: ["Ticking it off…", "Ticked off"],
};
for (const t of TOOLS) { const [a, b] = STATUS[t.name]; t._meta = { ...t._meta, "openai/toolInvocation/invoking": a, "openai/toolInvocation/invoked": b }; }

// Every tool that writes says plainly what it touches (hosts' safety checks read descriptions too)
const PRIVATE = "It changes only Steve's private wardrobe on stevenpisani.com; it sends nothing anywhere and deletes nothing.";
for (const t of TOOLS) if (!t.annotations.readOnlyHint) t.description = `${t.description}\n${PRIVATE}`;

class Invalid extends Error {}

// ---------- Values: checked and tidied, unknown fields and wrong values refused, not guessed at ----------
const today = () => new Date().toISOString().slice(0, 10);
function value(k, v, spec, where) {
  if (v === "" || v === null) return null;
  const bad = (what) => { throw new Invalid(`${where}.${k} ${what}`); };
  if (spec.enum) { if (!spec.enum.includes(v)) bad(`is one of: ${spec.enum.join(", ")}.`); return v; }
  if (spec.type === "array") {
    if (!Array.isArray(v)) bad("is a list.");
    const allowed = spec.items.enum;
    const list = [...new Set(v.map((x) => String(x).trim().toLowerCase()).filter(Boolean))].slice(0, 20);
    if (allowed && list.some((x) => !allowed.includes(x))) bad(`are some of: ${allowed.join(", ")}.`);
    return list;
  }
  if (spec.type === "object") {
    if (typeof v !== "object" || Array.isArray(v)) bad("is an object.");
    const out = {};
    for (const [key, x] of Object.entries(v)) {
      const ok = typeof x === "string" || typeof x === "number" || (Array.isArray(x) && x.every((y) => typeof y === "string" || typeof y === "number"));
      if (!ok) bad(`.${key} is text, or a list of text.`);
      out[String(key).slice(0, 60)] = Array.isArray(x) ? x.map(String) : String(x);
    }
    return out;
  }
  if (spec.type === "number") { const n = Number(v); if (!(n >= 0)) bad("is a number, 0 or more."); return Math.round(n * 100) / 100; }
  if (k === "currency") { if (!/^[A-Za-z]{3}$/.test(String(v))) bad("is three letters, like USD."); return String(v).toUpperCase(); }
  if (k === "bought_on") { if (!/^\d{4}-\d\d-\d\d$/.test(String(v))) bad("is YYYY-MM-DD."); return String(v); }
  if (k === "subcategory") return String(v).trim().toLowerCase().replace(/[\s-]+/g, "_").slice(0, 60) || null;
  return String(v).trim().slice(0, k === "notes" || k === "description" ? 2000 : 300) || null;
}
// where a value came from: "hang_tag", or { source, confidence, raw }
function source(s, where) {
  const o = typeof s === "string" ? { source: s } : s;
  if (!o || !SOURCES.includes(o.source)) throw new Invalid(`${where} is one of: ${SOURCES.join(", ")} (or { source, confidence, raw }).`);
  const out = { source: o.source, at: today() };
  if (o.confidence !== undefined) { const c = Number(o.confidence); if (!(c >= 0 && c <= 1)) throw new Invalid(`${where}.confidence is between 0 and 1.`); out.confidence = c; }
  if (o.raw) out.raw = String(o.raw).slice(0, 300);
  return out;
}
// One level's fields and their sources, checked
function level(specs, input, where) {
  const fields = {}, sources = {};
  for (const [k, v] of Object.entries(input || {})) {
    if (k === "sources") continue;
    if (!specs[k]) throw new Invalid(`${where} has no field called ${k}. Its fields: ${Object.keys(specs).join(", ")}.`);
    fields[k] = value(k, v, specs[k], where);
  }
  for (const [k, s] of Object.entries(input?.sources || {})) {
    if (!specs[k]) throw new Invalid(`${where}.sources names ${k}, which isn't a field here.`);
    sources[k] = source(s, `${where}.sources.${k}`);
  }
  return { fields, sources };
}
const seasonsFor = { light: ["spring", "summer"], mid: ["spring", "autumn"], warm: ["autumn", "winter"] };
// The judgements an item carries, sourced "derived" unless the caller said otherwise; seasons
// worked out from warmth when not given
function classify(I) {
  if (I.fields.warmth && I.fields.seasons === undefined) { I.fields.seasons = seasonsFor[I.fields.warmth]; I.sources.seasons ??= { source: "derived", confidence: 0.5, at: today() }; }
  for (const k of CLASSIFIED) if (I.fields[k] != null && !I.sources[k]) I.sources[k] = { source: "derived", at: today() };
}

// ---------- Identity: how a garment's product and variant are found again ----------
const key = (s) => String(s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
const styleKey = (s) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, "");
const plainColour = (c) => (c ? c.replace(/^\s*[\d-]+\s*/, "").trim().toLowerCase() || null : null);
const plainSize = (s) => (s ? (/^(x{0,3}s|m|x{0,3}l|[2-5]xl)$/i.test(s.trim()) ? s.trim().toUpperCase() : s.trim()) : null);
// Strong identity first (brand + style number), then brand + the exact name (punctuation and case
// aside) where the style numbers don't disagree. Never a fuzzy match.
async function findProduct(f, ctx) {
  const mine = (await ctx.products.list()).filter((p) => key(p.brand) === key(f.brand));
  if (f.style_number) {
    const hit = mine.find((p) => p.style_number && styleKey(p.style_number) === styleKey(f.style_number));
    if (hit) return { product: hit, by: "brand and style number" };
  }
  const hit = mine.find((p) => key(p.name) === key(f.name) && !(f.style_number && p.style_number && styleKey(p.style_number) !== styleKey(f.style_number)));
  return hit ? { product: hit, by: "brand and name" } : { product: null };
}
// By SKU, else by colour and size as printed (plain if that's all there is)
async function findVariant(productId, f, ctx) {
  const all = await ctx.variants.list(productId);
  if (f.sku) { const hit = all.find((v) => v.sku && key(v.sku) === key(f.sku)); if (hit) return hit; }
  const c = key(f.manufacturer_colour || f.colour), s = key(f.manufacturer_size || f.size);
  return all.find((v) => key(v.manufacturer_colour || v.colour) === c && key(v.manufacturer_size || v.size) === s && !(f.sku && v.sku && key(v.sku) !== key(f.sku))) || null;
}
// A product or variant found again: blanks are filled from what was just read, nothing it already
// says is changed (that's update_item's job); differences are reported
function fill(existing, L, what) {
  const patch = {}, conflicts = [];
  for (const [k, v] of Object.entries(L.fields)) {
    if (v == null) continue;
    const was = existing[k];
    const empty = was == null || (typeof was === "object" && !Object.keys(was).length);
    if (empty) patch[k] = v;
    else if (JSON.stringify(was) !== JSON.stringify(v) && key(JSON.stringify(was)) !== key(JSON.stringify(v))) conflicts.push(`${what}.${k} is "${typeof was === "object" ? JSON.stringify(was) : was}" here; you read "${typeof v === "object" ? JSON.stringify(v) : v}". Kept; use update_item (scope ${what}) if it's wrong.`);
  }
  const sources = Object.fromEntries(Object.entries(L.sources).filter(([k]) => k in patch || existing.sources?.[k] === undefined));
  if (Object.keys(patch).length) patch.sources = { ...existing.sources, ...sources };
  return { patch, conflicts };
}
// a unique index can turn down a row another request has just made: then that row is the one
async function addOrFind(add, find) {
  try { return { row: await add(), made: true }; } catch (e) {
    if (e?.code !== "23505") throw e;
    const row = await find();
    if (!row) throw e;
    return { row, made: false };
  }
}

// ---------- What comes back ----------
const FLAT = ["id", "name", "brand", "category", "subcategory", "colour", "manufacturer_colour", "size", "manufacturer_size", "material", "fit", "warmth", "seasons", "dressiness", "dressiness_also", "style_tags", "condition", "price", "currency", "bought_on", "buy_link", "notes", "retired", "style_number", "product_id", "variant_id"];
const present = (v) => v !== null && v !== undefined && !(Array.isArray(v) && !v.length) && !(typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length);
const pick = (row, keys) => Object.fromEntries(keys.filter((k) => present(row[k])).map((k) => [k, row[k]]));
async function flat(rows, ctx) {
  const links = await ctx.photoUrls(rows.map((r) => r.photo_path).filter(Boolean));
  return rows.map((r) => {
    const o = pick(r, FLAT);
    if (!o.retired) delete o.retired;
    if (r.photo_path && links.get(r.photo_path)) o.hero_photo = links.get(r.photo_path); // for the card (photosApart)
    return o;
  });
}
// The garment whole: flat, then each level, the photos, and where every fact came from
async function whole(id, ctx) {
  const row = await ctx.items.get(id);
  if (!row) return null;
  const [[item], own, product, variant, photos] = await Promise.all([
    flat([row], ctx), ctx.items.own(id),
    row.product_id ? ctx.products.get(row.product_id) : null,
    row.variant_id ? ctx.variants.get(row.variant_id) : null,
    ctx.photos.list(id),
  ]);
  const links = await ctx.photoUrls(photos.map((p) => p.path));
  const overrides = own && row.variant_id ? pick(own, ["name", "brand", "colour", "size", "material", "fit", "price", "buy_link"]) : {};
  return {
    view: "garment",
    item,
    owned_item: { ...pick(own || {}, ["id", "category", "subcategory", "warmth", "dressiness", "dressiness_also", "seasons", "style_tags", "condition", "price", "currency", "bought_on", "notes", "retired", "retired_at", "created_at"]), status: own?.retired ? "retired" : "active", ...(present(overrides) && { overrides }), sources: own?.sources || {} },
    variant: variant && { ...pick(variant, ["id", "manufacturer_colour", "colour", "manufacturer_size", "size", "sku", "barcode", "price", "currency", "measurements", "identifiers"]), sources: variant.sources },
    product: product && { ...pick(product, ["id", "brand", "name", "style_number", "description", "material", "country_of_origin", "default_fit", "product_url", "identifiers"]), sources: product.sources },
    photos: photos.map((p) => ({ id: p.id, role: p.role, hero: p.path === row.photo_path, ...(links.get(p.path) && { url: links.get(p.path) }), ...(p.source && { source: p.source }), created_at: p.created_at })),
  };
}
// one line a garment, for the text half of a result
const line = (o) => `${o.name} (${[o.category, o.subcategory?.replace(/_/g, " ")].filter(Boolean).join(", ")}${o.retired ? ", retired" : ""}): ${[o.brand, o.manufacturer_colour || o.colour, o.size && `size ${o.size}`, o.fit, o.material, o.dressiness && `${o.dressiness}${o.dressiness_also?.length ? ` (also ${o.dressiness_also.join(", ")})` : ""}`, o.warmth && `${o.warmth} warmth`, o.seasons?.join("/")].filter(Boolean).join(", ") || "no details yet"} [id ${o.id}]`;
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

// ---------- Ingesting ----------
async function ingest(args, ctx) {
  const ref = args.client_ref ? String(args.client_ref).trim().slice(0, 120) : null;
  const qty = Math.max(1, Math.min(10, parseInt(args.quantity, 10) || 1));
  const photos = [];
  for (const [arg, role] of Object.entries(PHOTO_ARGS)) for (const file of [args[arg]].flat().filter(Boolean)) photos.push({ file, role });
  const done = async (rows, how) => {
    const w = await whole(rows[0].id, ctx);
    return { text: `Already filed (${how}): ${line(w.item)}`, data: { ...w, view: "ingest", product_created: false, variant_created: false, owned_item_created: false, item_ids: rows.map((r) => r.id), warnings: [] } };
  };
  // a retry: the same client_ref, or a photo already filed
  if (ref) { const rows = (await ctx.items.list()).filter((r) => r.ingest_key === ref || r.ingest_key?.startsWith(`${ref}#`)); if (rows.length) return done(rows, "same client_ref"); }
  for (const p of photos) {
    const hit = p.file?.file_id && (await ctx.photos.byFile(p.file.file_id));
    if (hit) return done([{ id: hit.item_id }], "that photo is already on it");
  }

  const P = args.product ? level(PRODUCT, args.product, "product") : null;
  if (P && (!P.fields.brand || !P.fields.name)) throw new Invalid("A product needs brand and name. For a garment with no known brand, leave product and variant out and describe it in item.");
  const V = args.variant ? level(VARIANT, args.variant, "variant") : null;
  if (V && !P) throw new Invalid("A variant belongs to a product: give product (brand and name) too, or put colour and size in item.");
  const I = level(ITEM, args.item, "item");
  if (!I.fields.category) throw new Invalid(`item.category is needed: one of ${CATEGORIES.join(", ")}.`);
  if (!P && !I.fields.name) throw new Invalid("item.name is needed when there's no product.");
  const VF = V || { fields: {}, sources: {} };
  if (!VF.fields.colour && VF.fields.manufacturer_colour) { VF.fields.colour = plainColour(VF.fields.manufacturer_colour); VF.sources.colour ??= { source: "derived", confidence: 0.9, at: today() }; }
  if (!VF.fields.size && VF.fields.manufacturer_size) { VF.fields.size = plainSize(VF.fields.manufacturer_size); VF.sources.size ??= { source: "derived", confidence: 0.9, at: today() }; }
  classify(I);

  // find what's already here
  const found = P ? await findProduct(P.fields, ctx) : { product: null };
  let product = found.product, variant = product ? await findVariant(product.id, VF.fields, ctx) : null;
  const warnings = [];
  if (!photos.some((p) => p.role === "garment")) warnings.push(photos.length ? "No garment photo: the tag and label photos are kept, but nothing is shown for it. Add one with add_photo." : "No photos.");
  if (P && !P.fields.style_number) warnings.push("No style number, so the product was matched on brand and name only.");
  if (found.by === "brand and name") warnings.push(`Matched an existing product on brand and name ("${product.name}"); check it's the same garment.`);
  const unsourced = [...(P ? Object.keys(P.fields).filter((k) => P.fields[k] != null && !P.sources[k]).map((k) => `product.${k}`) : []), ...Object.keys(VF.fields).filter((k) => VF.fields[k] != null && !VF.sources[k]).map((k) => `variant.${k}`)];
  if (unsourced.length) warnings.push(`No source given for: ${unsourced.join(", ")}.`);
  if (!I.fields.bought_on) warnings.push("When it was bought isn't known.");
  const pFill = product ? fill(product, P, "product") : null, vFill = variant ? fill(variant, VF, "variant") : null;
  warnings.push(...(pFill?.conflicts || []), ...(vFill?.conflicts || []));

  const plan = [
    P ? (product ? `Product: ${product.brand} ${product.name} (already here, matched on ${found.by})` : `Product: ${P.fields.brand} ${P.fields.name} (new)`) : "No product: the item stands alone.",
    P ? (variant ? `Variant: ${[variant.manufacturer_colour || variant.colour, variant.manufacturer_size || variant.size].filter(Boolean).join(" / ") || "unspecified"} (already here)` : `Variant: ${[VF.fields.manufacturer_colour || VF.fields.colour, VF.fields.manufacturer_size || VF.fields.size].filter(Boolean).join(" / ") || "unspecified"} (new)`) : null,
    `Owned: ${plural(qty, "new item")}${photos.length ? `, with ${photos.map((p) => p.role).join(", ")} photo${photos.length > 1 ? "s" : ""}` : ""}`,
    [...Object.entries({ ...(P?.fields || {}), ...VF.fields }).filter(([, v]) => v != null)].map(([k, v]) => `  ${k}: ${typeof v === "object" ? JSON.stringify(v) : v}${({ ...(P?.sources || {}), ...VF.sources })[k] ? ` [${({ ...(P?.sources || {}), ...VF.sources })[k].source}]` : ""}`).join("\n"),
    CLASSIFIED.filter((k) => present(I.fields[k])).map((k) => `  ${k}: ${[I.fields[k]].flat().join("/")} [${I.sources[k].source}]`).join("\n"),
    warnings.length ? `Warnings:\n${warnings.map((w) => `  - ${w}`).join("\n")}` : "",
  ].filter(Boolean).join("\n");
  // what the card shows before anything's written: each level, what's already here, every value with its source
  const preview = {
    product: P ? { existing: product ? pick(product, ["id", "brand", "name", "style_number"]) : null, matched_by: found.by || null, fields: P.fields, sources: P.sources } : null,
    variant: P ? { existing: variant ? pick(variant, ["id", "manufacturer_colour", "manufacturer_size"]) : null, fields: VF.fields, sources: VF.sources } : null,
    item: { fields: I.fields, sources: I.sources },
    quantity: qty,
    photos: photos.map((p) => p.role),
  };
  if (args.dry_run) return { text: `Dry run, nothing written.\n${plan}`, data: { view: "ingest", dry_run: true, product_created: P ? !product : false, variant_created: P ? !variant : false, owned_item_created: false, product_matched_by: found.by || null, preview, warnings } };

  // write: product, variant, photos, then the owned items
  let productCreated = false, variantCreated = false;
  if (P && !product) {
    ({ row: product, made: productCreated } = await addOrFind(() => ctx.products.add({ ...P.fields, sources: P.sources }), async () => (await findProduct(P.fields, ctx)).product));
  } else if (pFill && Object.keys(pFill.patch).length) product = await ctx.products.set(product.id, pFill.patch);
  if (P && !variant) {
    ({ row: variant, made: variantCreated } = await addOrFind(() => ctx.variants.add({ product_id: product.id, ...VF.fields, sources: VF.sources }), () => findVariant(product.id, VF.fields, ctx)));
  } else if (vFill && Object.keys(vFill.patch).length) variant = await ctx.variants.set(variant.id, vFill.patch);
  const stored = [];
  for (const p of photos) {
    const path = p.file?.download_url ? await ctx.storeUpload(p.file) : null;
    if (path) stored.push({ ...p, path }); else warnings.push(`The ${p.role} photo didn't come through; ask Steve to attach it again and use add_photo.`);
  }
  const hero = stored.find((p) => p.role === "garment") || null;
  const ids = [];
  for (let i = 0; i < qty; i++) {
    const row = await ctx.items.add({
      ...I.fields, variant_id: variant?.id ?? null, sources: I.sources,
      ingest_key: ref ? (qty > 1 ? `${ref}#${i + 1}` : ref) : null,
      photo_path: hero?.path ?? null, photo_file_id: hero?.file.file_id ?? null,
    });
    ids.push(row.id);
    if (stored.length) await ctx.photos.add(stored.map((p) => ({ item_id: row.id, role: p.role, path: p.path, source: "chatgpt_upload", file_id: p.file.file_id || null })));
  }
  const w = await whole(ids[0], ctx);
  const how = [productCreated ? "new product" : P ? "existing product" : null, P ? (variantCreated ? "new variant" : "existing variant") : null, plural(ids.length, "new item")].filter(Boolean).join(", ");
  return { text: `Filed (${how}): ${line(w.item)}${warnings.length ? `\nWarnings:\n${warnings.map((x) => `  - ${x}`).join("\n")}` : ""}`, data: { ...w, view: "ingest", product_created: productCreated, variant_created: variantCreated, owned_item_created: true, item_ids: ids, warnings } };
}

// ---------- Changing ----------
async function update(args, ctx) {
  const scope = args.scope || "item";
  if (!LEVELS[scope]) throw new Invalid("scope is item, variant or product.");
  const row = await ctx.items.get(String(args.id || ""));
  if (!row) throw new Invalid("There's no item with that id.");
  const { id, scope: _, ...rest } = args;
  const L = level(LEVELS[scope], rest, scope);
  if (!Object.keys(L.fields).length && !Object.keys(L.sources).length) throw new Invalid("Nothing to change: give at least one field.");
  const req = { product: ["brand", "name"], variant: [], item: ["category"] }[scope];
  for (const k of req) if (k in L.fields && L.fields[k] == null) throw new Invalid(`${scope}.${k} can't be empty.`);
  if (scope === "item" && "name" in L.fields && L.fields.name == null && !row.variant_id) throw new Invalid("item.name can't be empty: this item has no product to take its name from.");
  const merged = (was) => { const s = { ...was, ...L.sources }; for (const [k, v] of Object.entries(L.fields)) if (v == null) delete s[k]; return s; };
  const items = await ctx.items.list();
  let touched;
  if (scope === "product") {
    if (!row.product_id) throw new Invalid("This item has no product. Change it with scope item, or file it with ingest_item.");
    const p = await ctx.products.get(row.product_id);
    await ctx.products.set(p.id, { ...L.fields, sources: merged(p.sources) });
    touched = items.filter((r) => r.product_id === p.id).length;
  } else if (scope === "variant") {
    if (!row.variant_id) throw new Invalid("This item has no variant. Change it with scope item, or file it with ingest_item.");
    const v = await ctx.variants.get(row.variant_id);
    await ctx.variants.set(v.id, { ...L.fields, sources: merged(v.sources) });
    touched = items.filter((r) => r.variant_id === v.id).length;
  } else {
    const own = await ctx.items.own(row.id);
    await ctx.items.set(row.id, { ...L.fields, sources: merged(own.sources) });
    touched = 1;
  }
  const w = await whole(row.id, ctx);
  return { text: `Changed the ${scope} (${plural(touched, "garment")}): ${line(w.item)}`, data: { scope, garments_affected: touched, ...w } };
}

// ---------- Photos ----------
async function addPhoto(args, ctx) {
  const row = await ctx.items.get(String(args.id || ""));
  if (!row) throw new Invalid("There's no item with that id.");
  if (!args.photo?.download_url) throw new Invalid("The photo didn't come through. Ask Steve to attach it again.");
  const role = args.role === undefined ? "garment" : args.role;
  if (!ROLES.includes(role)) throw new Invalid(`role is one of: ${ROLES.join(", ")}.`);
  const mine = await ctx.photos.list(row.id);
  if (!mine.some((p) => p.file_id && p.file_id === args.photo.file_id)) {
    const path = await ctx.storeUpload(args.photo);
    if (!path) throw new Invalid("The photo couldn't be fetched from the chat. Ask Steve to attach it again.");
    await ctx.photos.add([{ item_id: row.id, role, path, source: "chatgpt_upload", file_id: args.photo.file_id || null }]);
    const shown = mine.find((p) => p.path === row.photo_path);
    if (args.make_hero || (role === "garment" && (!row.photo_path || (shown && shown.role !== "garment")))) await ctx.items.set(row.id, { photo_path: path, photo_file_id: args.photo.file_id || null });
  }
  const w = await whole(row.id, ctx);
  return { text: `Photo added (${role}): ${line(w.item)}`, data: w };
}
async function setPhotoRole(args, ctx) {
  const p = await ctx.photos.get(String(args.photo_id || ""));
  if (!p) throw new Invalid("There's no photo with that id. get_item lists them.");
  if (args.role !== undefined && !ROLES.includes(args.role)) throw new Invalid(`role is one of: ${ROLES.join(", ")}.`);
  const role = args.role || p.role;
  if (role !== p.role) await ctx.photos.set(p.id, { role });
  const item = await ctx.items.get(p.item_id);
  if (args.make_hero) await ctx.items.set(p.item_id, { photo_path: p.path, photo_file_id: p.file_id });
  else if (item.photo_path === p.path && role !== "garment") {
    // a tag or label isn't shown as the garment: another garment photo is, or none
    const next = (await ctx.photos.list(p.item_id)).find((x) => x.id !== p.id && x.role === "garment");
    await ctx.items.set(p.item_id, { photo_path: next?.path ?? null, photo_file_id: next?.file_id ?? null });
  }
  const w = await whole(p.item_id, ctx);
  return { text: `Photo is now ${role}${args.make_hero ? ", and the one shown" : ""}: ${line(w.item)}`, data: w };
}

async function call(name, args = {}, ctx) {
  if (name === "find_items") {
    const q = key(args.query);
    const rows = (await ctx.items.list()).filter((r) => (args.include_retired || !r.retired)
      && (!args.category || r.category === args.category) && (!args.season || r.seasons?.includes(args.season))
      && (!args.dressiness || r.dressiness === args.dressiness || r.dressiness_also?.includes(args.dressiness))
      && (!args.warmth || r.warmth === args.warmth)
      && (!q || key([r.name, r.brand, r.colour, r.manufacturer_colour, r.material, r.notes, r.category, r.subcategory, r.style_number].join(" ")).includes(q)));
    rows.sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || String(a.name).localeCompare(String(b.name)));
    const items = await flat(rows, ctx);
    return { text: items.length ? `${plural(items.length, "garment")}:\n${items.map(line).join("\n")}\nIn the app: ${APP}#closet` : "Nothing in the wardrobe matches that.", data: { view: "closet", count: items.length, items } };
  }
  if (name === "get_item") {
    const w = await whole(String(args.id || ""), ctx);
    if (!w) throw new Invalid("There's no item with that id.");
    return { text: [line(w.item), w.product && `Product: ${w.product.brand} ${w.product.name}${w.product.style_number ? ` (style ${w.product.style_number})` : ""}`, w.variant && `Variant: ${[w.variant.manufacturer_colour, w.variant.manufacturer_size].filter(Boolean).join(" / ")}`, w.photos.length ? `Photos: ${w.photos.map((p) => `${p.role}${p.hero ? " (shown)" : ""} [photo ${p.id}]`).join(", ")}` : "No photos.", w.item.notes && `Notes: ${w.item.notes}`, `In the app: ${APP}#item/${w.item.id}`].filter(Boolean).join("\n"), data: w };
  }
  if (name === "read_store_link") {
    const p = await ctx.readProduct(String(args.url || ""));
    return { text: p.name ? `${p.name}${p.brand ? ` by ${p.brand}` : ""}${p.price != null ? `, ${p.price} ${p.currency || ""}` : ""}.` : "That shop doesn't say what's on the page; only the link is known.", data: { product: p } };
  }
  if (name === "ingest_item") return ingest(args, ctx);
  if (name === "add_item") {
    const { photo, photo_from_link, ...rest } = args;
    const I = level(ITEM, rest, "item");
    if (!I.fields.name || !I.fields.category) throw new Invalid("An item needs a name and a category.");
    classify(I);
    if (photo) {
      // the same upload twice (ChatGPT sometimes repeats a call) is the same item
      const again = photo.file_id && (await ctx.photos.byFile(photo.file_id));
      if (again) { const w = await whole(again.item_id, ctx); return { text: `Already added: ${line(w.item)}`, data: w }; }
    }
    const row = { ...I.fields, sources: I.sources };
    const pics = [];
    if (photo) { const path = await ctx.storeUpload(photo); if (path) { pics.push({ role: "garment", path, source: "chatgpt_upload", file_id: photo.file_id }); Object.assign(row, { photo_path: path, photo_file_id: photo.file_id }); } }
    if (row.buy_link) {
      const p = await ctx.readProduct(row.buy_link).catch(() => null);
      if (p) {
        row.buy_link = p.url;
        if (!row.brand && p.brand) { row.brand = p.brand; row.sources.brand = { source: "retailer_page", at: today() }; }
        if (row.price === undefined && p.price != null) { row.price = p.price; row.currency ??= p.currency; row.sources.price = { source: "retailer_page", at: today() }; }
        if (!row.photo_path && photo_from_link !== false && p.image) { const path = await ctx.storeImage(p.image); if (path) { row.photo_path = path; pics.push({ role: "garment", path, source: "retailer_page" }); } }
      }
    }
    const added = await ctx.items.add(row);
    if (pics.length) await ctx.photos.add(pics.map((p) => ({ item_id: added.id, ...p })));
    const w = await whole(added.id, ctx);
    const lost = photo && !row.photo_file_id ? " The photo didn't come through; ask Steve to attach it again and use add_photo." : "";
    return { text: `Added: ${line(w.item)}${lost}`, data: w };
  }
  if (name === "add_photo") return addPhoto(args, ctx);
  if (name === "set_photo_role") return setPhotoRole(args, ctx);
  if (name === "update_item") return update(args, ctx);
  if (name === "retire_item") {
    const retired = args.retired !== false;
    const row = await ctx.items.set(String(args.id || ""), { retired, retired_at: retired ? new Date().toISOString() : null });
    if (!row) throw new Invalid("There's no item with that id.");
    return { text: `${row.name} is ${retired ? "retired (kept, out of the wardrobe)" : "back in the wardrobe"}.`, data: { id: row.id, retired } };
  }
  if (name.endsWith("_trip") || name === "list_trips" || name === "plan_days" || name === "set_packing" || name === "tick_packing") return trips(name, args, ctx);
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
    const links = await ctx.photoUrls([...new Set([...t.days.flatMap((d) => d.items), ...t.packing.map((p) => p.item_id)].map((i) => byId.get(i)?.photo_path).filter(Boolean))]);
    // what the card shows for a garment: its photo, and what tells it apart from its twins
    const look = (i) => { const r = byId.get(i), u = links.get(r?.photo_path); return r ? Object.fromEntries(Object.entries({ category: r.category, colour: r.colour, manufacturer_colour: r.manufacturer_colour, hero_photo: u }).filter(([, v]) => v)) : {}; };
    const days = [...t.days].sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({ ...d, place: placeOn(d.date), weather: weatherOn(d.date), items: d.items.map((i) => ({ id: i, name: byId.get(i)?.name || "(no longer in the wardrobe)", ...look(i) })) }));
    const packing = t.packing.map((p) => ({ ...p, name: p.item_id ? byId.get(p.item_id)?.name || "(no longer in the wardrobe)" : p.label, ...(p.item_id && look(p.item_id)) }));
    const text = [
      tripLine(t),
      ...legs.map((l) => `${l.place}, ${l.country} (${l.from} to ${l.to}): ${l.weather ? `${l.weather.kind === "typical" ? "typically" : l.weather.kind === "mixed" ? "forecast then typical:" : "forecast:"} highs ${l.weather.summary.hi}°C, lows ${l.weather.summary.lo}°C, about ${l.weather.summary.wet} day${l.weather.summary.wet === 1 ? "" : "s"} of rain` : "weather unavailable"}`),
      days.length ? `Planned days:\n${days.map((d) => `  ${d.date} (${d.place || "?"}${d.weather ? `, ${d.weather.hi}°/${d.weather.lo}°, ${d.weather.rain}% rain` : ""}): ${d.occasion ? `${d.occasion}: ` : ""}${d.items.map((i) => i.name).join(", ") || "nothing yet"}${d.note ? ` (${d.note})` : ""}`).join("\n")}` : "No days planned yet.",
      packing.length ? `Packing (${packing.filter((p) => p.packed).length} of ${packing.length} packed): ${packing.map((p) => `${p.qty > 1 ? `${p.qty}× ` : ""}${p.name}${p.packed ? " ✓" : ""}`).join(", ")}` : "No packing list yet.",
      t.notes ? `Notes: ${t.notes}` : "",
      `In the app: ${APP}#trip/${t.id}`,
    ].filter(Boolean).join("\n");
    return { text, data: { view: "trip", trip: { id: t.id, name: t.name, notes: t.notes, legs, days, packing } } };
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

const INSTRUCTIONS = [
  "Steve's wardrobe: every garment he owns. Start with find_items (one entry per physical piece, flat) and refer to things by name.",
  "To add clothes, use ingest_item: you read the photos (garment, hang tag, care label) or the shop page, and pass facts at the right level with where each came from. Printed facts go in product (brand, name, style number, material, origin) and variant (colour and size as printed, SKU, price, measurements); your judgements (warmth, dressiness, seasons, style, fit) go in item. Pass every photo with its role. A garment with no brand is just an item. Use dry_run when unsure, client_ref always.",
  "Correct mistakes with update_item and the right scope: item (this piece), variant (this colour and size) or product (every colour and size). You get each photo's role, not the image; go by the descriptions. Steve sees the photos in the card under your answer, so don't list what it shows; to send him to the app, use the \"In the app\" link a result gives.",
  "Trips: get_trip has the weather for each leg; plan outfits day by day with plan_days from what he owns (item ids), and the packing list with set_packing. Deleting is his to do in the app.",
].join(" ");

// The photos' signed links are long and only the card needs them: each becomes a short reference
// ("p1") in what the model reads, and the links travel in the result's _meta, which hosts pass to
// the card and not to the model. The card puts them back (assets/js/mcp-app/widget.js).
export function photosApart(data) {
  const photos = {};
  let n = 0;
  const walk = (v) => {
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== "object") return v;
    const o = {};
    for (const [k, x] of Object.entries(v)) {
      if ((k === "hero_photo" || k === "url") && typeof x === "string" && /^(https?:|data:)/.test(x)) { const ref = `p${++n}`; photos[ref] = x; o[k] = ref; }
      else o[k] = walk(x);
    }
    return o;
  };
  const lean = walk(data);
  return { data: lean, photos: n ? photos : null };
}

/** Answers one JSON-RPC message (or null for a notification). */
export async function rpc(msg, ctx) {
  const ok = (result) => ({ jsonrpc: "2.0", id: msg.id, result });
  const fail = (code, message) => ({ jsonrpc: "2.0", id: msg.id ?? null, error: { code, message } });
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return fail(-32600, "Not a JSON-RPC request.");
  if (msg.id === undefined) return null; // notifications (initialized, cancelled): nothing to say
  switch (msg.method) {
    case "initialize": {
      const asked = msg.params?.protocolVersion;
      return ok({ protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0], capabilities: { tools: { listChanged: false }, resources: { listChanged: false } }, serverInfo: SERVER, instructions: INSTRUCTIONS });
    }
    case "ping": return ok({});
    case "tools/list": return ok({ tools: TOOLS });
    case "resources/list": { const { html, _meta, ...r } = appResource(ctx); return ok({ resources: [r] }); }
    case "resources/templates/list": return ok({ resourceTemplates: [] });
    case "resources/read": {
      if (msg.params?.uri !== APP_URI) return fail(-32002, `No resource ${msg.params?.uri}.`);
      const r = appResource(ctx, await ctx.cardScript?.().catch(() => null));
      return ok({ contents: [{ uri: r.uri, mimeType: r.mimeType, text: r.html, _meta: r._meta }] });
    }
    case "tools/call": {
      const { name, arguments: args } = msg.params || {};
      if (!TOOLS.some((t) => t.name === name)) return fail(-32602, `There's no tool called ${name}.`);
      try {
        const { text, data } = await call(name, args || {}, ctx);
        const { data: lean, photos } = photosApart(data);
        return ok({ content: [{ type: "text", text }], structuredContent: lean, ...(photos && { _meta: { photos } }) });
      } catch (e) {
        if (!(e instanceof Invalid)) console.error(e);
        return ok({ content: [{ type: "text", text: e instanceof Invalid ? e.message : "That didn't work; the wardrobe couldn't be reached. Try again." }], isError: true });
      }
    }
    default: return fail(-32601, `No method ${msg.method}.`);
  }
}
