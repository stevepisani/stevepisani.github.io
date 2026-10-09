// The wardrobe: every garment Steve owns, one of SJPJr's areas (server.js has the protocol and
// the rules; docs/apps.md the model).
//
// The model (supabase/migrations/20261005000100_wardrobe_products.sql): an owned item is a garment
// Steve has, one row per physical piece; it may belong to a variant (one colour and size as sold),
// which belongs to a product (brand, name, style number). Every fact keeps its source. Reads come
// flat (find_items) or whole (get_item); ingest_item files a garment at all three levels at once.
import { BUDGET, PURPOSES, LINK_MINUTES, sniff, base64, b64Length, photoBytes, dimensions, board } from "../images.js";
import { WARDROBE_APP as APP, showsCard, read, write, Invalid, today, present, pick, plural, heroPhotos, sign, trashed, goneOn } from "../kit.js";

export const PHOTOS_MAX = 6; // get_photos, at once
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
const PHOTO_ARGS = { garment_photo: "garment", tag_photo: "tag", care_label_photo: "care_label", detail_photos: "detail", catalog_photo: "garment" };
// Where a photo came from (supabase/migrations/20261005000300_wardrobe_photo_origin.sql): Steve's own
// photo of his piece, a shop's or maker's picture (a reference, to make a catalog image from), or the
// wardrobe's own catalog image. The one shown is the best there is: catalog, then his own, then a
// reference only as a stand-in.
export const ORIGINS = ["own", "reference", "catalog"];
const RANK = { catalog: 0, own: 1, reference: 2 };
// The one look every catalog image has, whatever the brand, so the closet reads as one set
const SHOWS = { type: "object", description: "For a catalog image: what it shows, checked against the garment before it's kept. subcategory as the garment's (\"long_sleeve_t_shirt\"), colour in plain words.", properties: { subcategory: { type: "string" }, colour: { type: "string" } }, required: ["subcategory", "colour"], additionalProperties: false };
export const CATALOG_STYLE = "the garment alone, front on, laid flat or on an invisible mannequin, centred and filling most of a square frame, on a plain light grey background (#F2F2F2), soft even light, true colour, no model, no props, no added text or logos";

const TOOLS = [
  {
    name: "get_photo",
    title: "See a garment's photo",
    description: "Returns one stored photo as the image itself (MCP image content, never described or redrawn), with what it is: photo_id, item_id, role, origin (own, reference, catalog), hero (whether it's the one shown) and made_from. purpose original (the default) is the stored file unchanged; vision is a smaller copy. Look at a garment this way before describing it, comparing it or picturing an outfit with it; never go by its text alone. The ids are hero_photo_id (find_items, get_item) and get_item's photos.",
    inputSchema: { type: "object", properties: { photo_id: { type: "string" }, purpose: { type: "string", enum: Object.keys(PURPOSES), description: "original: the stored file, unchanged. vision: a copy up to 1024 px (JPEG), for looking at fabric, pattern, colour and cut; small enough that several fit in one answer. thumbnail: up to 256 px." } }, required: ["photo_id"], additionalProperties: false },
    annotations: read,
  },
  {
    name: "get_photos",
    title: "See several photos",
    description: `Returns up to ${PHOTOS_MAX} stored photos at once, as the images themselves, each with its photo_id, item_id, role, origin, hero and made_from, numbered in the order asked. purpose vision (the default here) sends copies up to 1024 px so they all fit in one answer; original sends the stored files, which may not all fit. A photo that can't be sent is listed with why; the rest still come. For an outfit, get_outfit_images is simpler.`,
    inputSchema: { type: "object", properties: { photo_ids: { type: "array", minItems: 1, maxItems: PHOTOS_MAX, items: { type: "string" } }, purpose: { type: "string", enum: Object.keys(PURPOSES), description: "original: the stored file, unchanged. vision: a copy up to 1024 px (JPEG), for looking at fabric, pattern, colour and cut; small enough that several fit in one answer. thumbnail: up to 256 px." } }, required: ["photo_ids"], additionalProperties: false },
    annotations: read,
  },
  {
    name: "get_outfit_images",
    title: "See an outfit's garments",
    description: `The way to look at an outfit: give up to ${PHOTOS_MAX} garments, each with a slot (\"top\", \"outerwear\", \"bottom\", \"shoes\"), and get each one's current photo shown (its hero, looked up now) as the image itself, in that order. Each image comes with its reference_key (the slot), item_id, photo_id and hero, and nothing else to read in its place: image 1 is the first slot, and so on. purpose vision (the default) sends copies up to 1024 px. A garment with no photo, or not found, is listed with why. Use the images, not the garments' text, for colour, pattern, cut and what goes together. To show the outfit as one picture, use purpose board: the same photos, laid out together in one image (the real photos, resized and placed, nothing drawn). To picture it some other way, call again with purpose generation: the same photos, as short-lived links to the full-size files, to give an image generator as its input images (the same order and reference_keys); fetch them again for the next outfit.`,
    inputSchema: { type: "object", properties: { items: { type: "array", minItems: 1, maxItems: PHOTOS_MAX, items: { type: "object", properties: { slot: { type: "string", description: "Short and unique in the outfit: top, outerwear, bottom, shoes, accessory." }, item_id: { type: "string" } }, required: ["slot", "item_id"], additionalProperties: false } }, purpose: { type: "string", enum: [...Object.keys(PURPOSES), "generation", "board"], description: "vision (the default): the images themselves, copies up to 1024 px, to look at. board: one image, the garments' photos laid out together, white, 1200 px wide, in the order given (left to right, top to bottom), to show Steve the outfit. generation: no images; for each garment a link to its stored photo, unchanged, full size, on SJPJr's own address, signed and good for " + LINK_MINUTES + " minutes, with its type and size: the input images for an image generator. original, thumbnail: as get_photo." } }, required: ["items"], additionalProperties: false },
    annotations: read,
  },
  {
    name: "find_items",
    title: "Find clothes in Steve's wardrobe",
    description: "Start here. Lists what Steve owns, one entry per physical garment, flat (product and variant facts filled in), optionally narrowed by words, category, season, dressiness (matches where it mostly belongs or also works) or warmth. Retired things are left out unless asked for. Use it before suggesting outfits or packing, and before ingesting, to see if a garment or its product is already here.",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "Words to look for in the name, brand, colour (plain or as printed), material, style number or notes." }, category: ITEM.category, season: { type: "string", enum: SEASONS }, dressiness: ITEM.dressiness, warmth: ITEM.warmth, include_retired: { type: "boolean" } }, additionalProperties: false },
    outputSchema: { type: "object", properties: { view: { type: "string" }, count: { type: "integer" }, items: { type: "array", items: { type: "object", description: "One garment, flat: id, name, brand, category, subcategory, colour, manufacturer_colour, size, material, fit, warmth, seasons, dressiness, dressiness_also, price, hero_photo_id (the photo shown: get_item lists it with hero: true)…" } } }, required: ["count", "items"] },
    annotations: read,
    _meta: showsCard,
  },
  {
    name: "get_item",
    title: "Get one garment, whole",
    description: "Everything about one owned garment: the flat view, then its product and variant (if it has them), what's set on this piece alone, every photo with its role, and where each fact came from. Photo ids here are what set_photo_role takes.",
    inputSchema: { type: "object", properties: { id: { type: "string" }, focus: { type: "array", items: { type: "string", enum: ["size", "colour", "material", "fit", "price", "bought", "condition", "style_number", "origin", "measurements", "notes"] }, description: "Optional: what Steve asked about, so the card shows those facts first." }, include_images: { type: "boolean", description: "Also return the photo shown (hero_photo_id) as the image itself, so you can see the garment." } }, required: ["id"], additionalProperties: false },
    outputSchema: { type: "object", properties: { view: { type: "string" }, item: { type: "object", description: "Flat, as find_items gives it." }, owned_item: { type: "object", description: "What's set on this piece alone, its status, overrides and sources." }, variant: { type: ["object", "null"] }, product: { type: ["object", "null"] }, photos: { type: "array", items: { type: "object", description: "id, role, origin (own, reference, catalog), hero, source, source_url, made_from." } } }, required: ["item", "owned_item", "photos"] },
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
      `Photos: garment_photo, tag_photo, care_label_photo and detail_photos are Steve's own, kept as evidence; catalog_photo is the wardrobe's own image of it (${CATALOG_STYLE}), made from those or the shop's picture, and is the one shown. Without one, the garment photo is shown. A tag is never shown as the garment.`,
      "dry_run: true shows what would happen and any warnings, writing nothing; commit straightforward ones directly. Pass client_ref (any id you make up for this garment) so a retry adds nothing twice.",
    ].join("\n"),
    inputSchema: {
      type: "object",
      properties: {
        product: section(PRODUCT, "The garment as sold. Leave out when the brand isn't known."),
        variant: section(VARIANT, "This colour and size of the product."),
        item: section(ITEM, "This physical piece, and how it dresses."),
        quantity: { type: "integer", minimum: 1, maximum: 10, description: "Identical pieces owned (default 1); each becomes its own item." },
        garment_photo: FILE, tag_photo: FILE, care_label_photo: FILE, catalog_photo: FILE,
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
    description: [
      "Adds a photo to a garment: one uploaded in this chat (photo), or a shop's or maker's picture from a link (url: the picture itself, or the product page, whose main picture is taken; its page is noted on the garment). Says what it is (role) and where it came from (origin).",
      `origin: own (Steve's photo of his piece, the default for uploads), reference (a shop's or maker's picture, the default for links: kept to make a catalog image from, shown only when there's nothing better), catalog (the wardrobe's own image of the garment, made from the references and his photos in one style for every brand: ${CATALOG_STYLE}; give made_from, the ids of the photos it was made from). A new catalog image is the one shown; others only with make_hero, or when there's no better one.`,
      "Before adding a catalog image, look at it against the garment: the same kind (long or short sleeves, collar, length), colour and details as Steve's photos and the shop's. Say what it shows in shows; one of another kind is refused. A photo that's wrong goes to the trash with delete_photo.",
    ].join("\n"),
    inputSchema: { type: "object", properties: { id: { type: "string", description: "The owned item." }, photo: FILE, url: { type: "string", description: "A shop's or maker's page or picture." }, role: { type: "string", enum: ROLES }, origin: { type: "string", enum: ORIGINS }, made_from: { type: "array", items: { type: "string" }, description: "For a catalog image: the photo ids it was made from." }, shows: SHOWS, make_hero: { type: "boolean" } }, required: ["id"], additionalProperties: false },
    annotations: { ...write, idempotentHint: true },
    _meta: { "openai/fileParams": ["photo"] },
  },
  {
    name: "set_photo_role",
    title: "Change a photo's role",
    description: "Says what a photo is (role: garment, tag, care_label, detail, other) and where it came from (origin: own, reference, catalog), or makes it the one shown (make_hero). Photo ids come from get_item. A photo that stops being a garment photo stops being shown; one newly marked catalog is shown.",
    inputSchema: { type: "object", properties: { photo_id: { type: "string" }, role: { type: "string", enum: ROLES }, origin: { type: "string", enum: ORIGINS }, shows: SHOWS, make_hero: { type: "boolean" } }, required: ["photo_id"], additionalProperties: false },
    annotations: { ...write, idempotentHint: true },
    _meta: { "openai/widgetAccessible": true },
  },
  {
    name: "delete_photo",
    title: "Delete a photo (to the trash)",
    description: "Moves a photo to the trash: it's hidden everywhere, and restore brings it back within 30 days; then it's gone for good. For a wrong catalog image or shop picture, or any photo Steve wants gone. If it was the one shown, the next best is.",
    inputSchema: { type: "object", properties: { photo_id: { type: "string" } }, required: ["photo_id"], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    _meta: { "openai/widgetAccessible": true },
  },
  {
    name: "delete_item",
    title: "Delete a garment (to the trash)",
    description: "Moves a garment to the trash, with its photos: it's hidden everywhere (trips that planned it show it as gone), and restore brings it back within 30 days; then it's gone for good. To keep it but take it out of the wardrobe (worn out, given away), retire_item instead.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
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
    description: "Takes one physical garment out of the wardrobe (worn out, given away, lost) without deleting it, or with retired: false puts it back. To delete it instead, delete_item (to the trash).",
    inputSchema: { type: "object", properties: { id: { type: "string" }, retired: { type: "boolean", description: "Default true." } }, required: ["id"], additionalProperties: false },
    annotations: { ...write, idempotentHint: true },
  },
];


// ---------- Values: checked and tidied, unknown fields and wrong values refused, not guessed at ----------
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
// what a list gives per garment: enough to dress from and to draw it; the rest is get_item's
const FLAT = ["id", "name", "brand", "category", "subcategory", "colour", "manufacturer_colour", "size", "material", "fit", "warmth", "seasons", "dressiness", "dressiness_also", "style_tags", "notes", "retired"];
const FLAT_WHOLE = [...FLAT, "manufacturer_size", "condition", "price", "currency", "bought_on", "buy_link", "style_number", "product_id", "variant_id"];
async function flat(rows, ctx, keys = FLAT) {
  const heroes = await heroPhotos(rows, ctx);
  return rows.map((r) => {
    const o = pick(r, keys);
    if (!o.retired) delete o.retired;
    if (heroes.get(r.id)) o.hero_photo_id = heroes.get(r.id).id; // the photo shown, by its id (get_item's photos)
    return o;
  });
}
// The garment whole: flat, then each level, the photos, and where every fact came from
async function whole(id, ctx) {
  const row = await ctx.items.get(id);
  if (!row) return null;
  const [[item], own, product, variant, photos] = await Promise.all([
    flat([row], ctx, FLAT_WHOLE), ctx.items.own(id),
    row.product_id ? ctx.products.get(row.product_id) : null,
    row.variant_id ? ctx.variants.get(row.variant_id) : null,
    ctx.photos.list(id),
  ]);
  await sign(ctx, photos);
  // the photo shown, the same one everywhere: item.hero_photo_id is the photo with hero: true
  const heroId = photos.find((p) => p.path === row.photo_path)?.id;
  if (heroId) item.hero_photo_id = heroId; else delete item.hero_photo_id;
  const facts = (src) => Object.fromEntries(Object.entries(src || {}).map(([k, v]) => { if (!v || typeof v !== "object" || Array.isArray(v)) return [k, v]; const { at, ...rest } = v; return [k, rest]; }));
  const overrides = own && row.variant_id ? pick(own, ["name", "brand", "colour", "size", "material", "fit", "price", "buy_link"]) : {};
  return {
    view: "garment",
    item,
    owned_item: { ...pick(own || {}, ["id", "category", "subcategory", "warmth", "dressiness", "dressiness_also", "seasons", "style_tags", "condition", "price", "currency", "bought_on", "notes", "retired", "retired_at"]), status: own?.retired ? "retired" : "active", ...(present(overrides) && { overrides }), sources: facts(own?.sources) },
    variant: variant && { ...pick(variant, ["id", "manufacturer_colour", "colour", "manufacturer_size", "size", "sku", "barcode", "price", "currency", "measurements", "identifiers"]), sources: facts(variant.sources) },
    product: product && { ...pick(product, ["id", "brand", "name", "style_number", "description", "material", "country_of_origin", "default_fit", "product_url", "identifiers"]), sources: facts(product.sources) },
    photos: photos.map((p) => ({ id: p.id, role: p.role, origin: p.origin || "own", hero: p.id === heroId, ...(p.source && { source: p.source }), ...(p.source_url && { source_url: p.source_url }), ...(p.made_from?.length && { made_from: p.made_from }) })),
  };
}
// ---------- Photos as images, for the model to see (images.js has the sizes and why) ----------
const photoLine = (m) => `${m.reference_key ? `${m.reference_key}: ` : ""}${m.item_name}, ${m.origin} ${m.role} photo${m.hero ? " (the one shown)" : ""}, ${m.purpose} [photo ${m.photo_id}, item ${m.item_id}]`;
// The photos asked for, in order (each { photo_id } and anything to carry along, like a slot):
// each one's facts (meta, with its place among the images) and the image; what can't be sent, why
async function photoImages(wanted, ctx, purpose = "original") {
  const meta = [], images = [], skipped = [];
  let total = 0;
  for (const w of wanted) {
    const { photo_id: id, ...carry } = w;
    const p = id && (await ctx.photos.get(id));
    const item = p && (await ctx.items.get(p.item_id));
    if (!p || !item) { skipped.push({ ...carry, photo_id: id || null, reason: id ? "There's no photo with that id (it may be in the trash). get_item lists a garment's photos." : "It has no photo." }); continue; }
    const got = await photoBytes(ctx, p.path, purpose);
    const mimeType = got && sniff(got.bytes);
    // for the logs: which file, which size, how big, what it is (the folder, Steve's user id, left out)
    console.log(`photo ${id}: ${p.path.replace(/^wardrobe\/[^/]+\//, "wardrobe/…/")}, ${got ? `${got.purpose}, ${got.bytes.length} bytes` : "no file"}, ${mimeType || "not an image"}`);
    if (!got || !mimeType) { skipped.push({ ...carry, photo_id: id, reason: "Its file couldn't be read as an image." }); continue; }
    const size = b64Length(got.bytes.length);
    if (total + size > BUDGET) { skipped.push({ ...carry, photo_id: id, reason: `Too big to send with the rest (${Math.round(got.bytes.length / 1024)} KB as ${got.purpose}); ${got.purpose === "original" ? "ask with purpose vision, or" : ""} ask for it alone.` }); continue; }
    total += size;
    images.push({ data: base64(got.bytes), mimeType });
    meta.push({ image: images.length, ...carry, photo_id: p.id, item_id: p.item_id, item_name: item.name, role: p.role, origin: p.origin || "own", hero: item.photo_path === p.path, made_from: p.made_from || [], purpose: got.purpose, mime_type: mimeType, bytes: got.bytes.length });
  }
  return { meta, images, skipped };
}

// For an image generator: each garment's stored photo as a short-lived link (images.js), with its
// type and size read from the file; no images in the answer, so nothing competes with them
async function generationLinks(wanted, ctx) {
  const references = [], not_sent = [];
  for (const w of wanted) {
    const { photo_id: id, reference_key, item_id, missing_item } = w;
    const p = id && (await ctx.photos.get(id));
    const item = p && (await ctx.items.get(p.item_id));
    const bytes = p && item && (await ctx.photoFile(p.path).catch(() => null));
    const mime_type = bytes && sniff(bytes);
    if (!mime_type) { not_sent.push({ reference_key, ...(item_id && { item_id }), ...(id && { photo_id: id }), reason: missing_item ? `There's no garment ${missing_item} (find_items has them).` : !id ? "It has no photo." : "Its file couldn't be read as an image.", ...(missing_item && { item_id: missing_item }) }); continue; }
    const { url, expires_at } = await ctx.photoLink(p.id);
    references.push({ reference_key, item_id: p.item_id, photo_id: p.id, hero: item.photo_path === p.path, url, expires_at, mime_type, ...dimensions(bytes), bytes: bytes.length, item_name: item.name });
  }
  console.log(`generation links: ${references.length} made, ${not_sent.length} not`);
  const text = [
    ...references.map((r, i) => `Reference ${i + 1} = ${r.reference_key}: ${r.item_name} [photo ${r.photo_id}], ${r.mime_type}${r.width ? ` ${r.width}×${r.height}` : ""}: ${r.url}`),
    ...not_sent.map((s) => `Not sent (${s.reference_key}): ${s.reason}`),
    references.length ? `The links are the stored photos, unchanged, and work until ${references[0].expires_at} (${LINK_MINUTES} minutes). Give them to the image generator as its input images, in this order, each as the garment its reference_key names.` : "",
  ].filter(Boolean).join("\n");
  return { text, data: { purpose: "generation", references, ...(not_sent.length && { not_sent }) } };
}

// The outfit as one picture (images.js, board): each garment's photo, its vision copy, in a grid
// in the order asked. A garment with no photo, or one that can't be read, is left off and said.
async function outfitBoard(wanted, ctx) {
  const got = [], not_sent = [];
  for (const w of wanted) {
    const { photo_id: id, reference_key, item_id, missing_item } = w;
    const p = id && (await ctx.photos.get(id));
    const item = p && (await ctx.items.get(p.item_id));
    const file = p && item && (await photoBytes(ctx, p.path, "vision"));
    if (!file || !sniff(file.bytes)) { not_sent.push({ reference_key, ...(item_id && { item_id }), ...(id && { photo_id: id }), reason: missing_item ? `There's no garment ${missing_item} (find_items has them).` : !id ? "It has no photo." : "Its file couldn't be read as an image.", ...(missing_item && { item_id: missing_item }) }); continue; }
    got.push({ reference_key, item_id: p.item_id, photo_id: p.id, hero: item.photo_path === p.path, item_name: item.name, bytes: file.bytes });
  }
  if (!got.length) throw new Invalid(`Nothing to lay out: ${not_sent.map((s) => `${s.reference_key}: ${s.reason}`).join(" ")}`);
  const made = await board(ctx.imaging, got.map((g) => g.bytes));
  if (!made) throw new Invalid("The board can't be made right now (the server's image library didn't load); use purpose vision to see the garments one by one.");
  const references = [];
  for (const [i, g] of got.entries()) {
    const { bytes, ...ref } = g;
    if (made.placed[i]) references.push({ ...ref, position: references.length + 1, ...made.placed[i] });
    else not_sent.push({ reference_key: g.reference_key, item_id: g.item_id, photo_id: g.photo_id, reason: "Its file couldn't be read as an image." });
  }
  console.log(`board: ${references.length} placed, ${not_sent.length} not, ${made.bytes.length} bytes`);
  if (!references.length) throw new Invalid(`Nothing to lay out: ${not_sent.map((s) => `${s.reference_key}: ${s.reason}`).join(" ")}`);
  const text = [
    `Image 1 = the outfit board, ${made.width}×${made.height}: the garments' own photos, laid out left to right, top to bottom.`,
    ...references.map((r) => `${r.position}. ${r.reference_key}: ${r.item_name} [photo ${r.photo_id}, item ${r.item_id}]`),
    ...not_sent.map((s) => `Left off (${s.reference_key}): ${s.reason}`),
  ].join("\n");
  return { text, images: [{ data: base64(made.bytes), mimeType: "image/jpeg" }], data: { purpose: "board", board: { width: made.width, height: made.height, mime_type: "image/jpeg", bytes: made.bytes.length }, references, ...(not_sent.length && { not_sent }) } };
}

// one line a garment, for the text half of a result
const line = (o) => `${o.name} (${[o.category, o.subcategory?.replace(/_/g, " ")].filter(Boolean).join(", ")}${o.retired ? ", retired" : ""}): ${[o.brand, o.manufacturer_colour || o.colour, o.size && `size ${o.size}`, o.fit, o.material, o.dressiness && `${o.dressiness}${o.dressiness_also?.length ? ` (also ${o.dressiness_also.join(", ")})` : ""}`, o.warmth && `${o.warmth} warmth`, o.seasons?.join("/")].filter(Boolean).join(", ") || "no details yet"} [id ${o.id}]`;

// ---------- Ingesting ----------
async function ingest(args, ctx) {
  const ref = args.client_ref ? String(args.client_ref).trim().slice(0, 120) : null;
  const qty = Math.max(1, Math.min(10, parseInt(args.quantity, 10) || 1));
  const photos = [];
  for (const [arg, role] of Object.entries(PHOTO_ARGS)) for (const file of [args[arg]].flat().filter(Boolean)) photos.push({ file, role, origin: arg === "catalog_photo" ? "catalog" : "own" });
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
  const hero = stored.find((p) => p.origin === "catalog") || stored.find((p) => p.role === "garment") || null;
  const ids = [];
  for (let i = 0; i < qty; i++) {
    const row = await ctx.items.add({
      ...I.fields, variant_id: variant?.id ?? null, sources: I.sources,
      ingest_key: ref ? (qty > 1 ? `${ref}#${i + 1}` : ref) : null,
      photo_path: hero?.path ?? null, photo_file_id: hero?.file.file_id ?? null,
    });
    ids.push(row.id);
    if (stored.length) await ctx.photos.add(stored.map((p) => ({ item_id: row.id, role: p.role, origin: p.origin, path: p.path, source: "chatgpt_upload", file_id: p.file.file_id || null })));
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
// Which photo is shown: the one asked for, else the best garment photo there is (catalog, then
// Steve's own, then a reference), keeping the one shown unless something outranks it
export async function settleHero(id, ctx, choose) {
  const [item, photos] = await Promise.all([ctx.items.get(id), ctx.photos.list(id)]);
  const shown = photos.find((p) => p.path === item.photo_path);
  let next = choose ? photos.find((p) => p.id === choose) : shown && shown.role === "garment" ? shown : null;
  if (!choose) {
    const best = photos.filter((p) => p.role === "garment").sort((a, b) => RANK[a.origin || "own"] - RANK[b.origin || "own"] || String(b.created_at).localeCompare(String(a.created_at)))[0];
    if (best && (!next || RANK[best.origin || "own"] < RANK[next.origin || "own"])) next = best;
  }
  if ((next?.path ?? null) !== (item.photo_path ?? null)) await ctx.items.set(id, { photo_path: next?.path ?? null, photo_file_id: next?.file_id ?? null });
}
// A catalog image is checked against the garment before it's kept: the kind it shows has to be the
// garment's (a short-sleeve picture for a long-sleeve shirt is refused); a colour that reads
// differently is said, not refused (names for colours vary)
function checkShows(row, shows) {
  if (!shows?.subcategory || !shows?.colour) throw new Invalid("A catalog image needs shows: the subcategory and colour it shows, checked against the garment first.");
  const sub = key(row.subcategory), said = key(shows.subcategory);
  if (sub && said !== sub) throw new Invalid(`This garment is a ${row.subcategory.replace(/_/g, " ")}; that image shows a ${String(shows.subcategory).replace(/_/g, " ")}. Make one that matches, or correct the garment first with update_item.`);
  const c = key(row.colour), sc = key(shows.colour);
  return c && sc && !c.includes(sc) && !sc.includes(c) ? ` Check the colour: the garment is ${row.colour}; the image is ${shows.colour}.` : "";
}
async function addPhoto(args, ctx) {
  const row = await ctx.items.get(String(args.id || ""));
  if (!row) throw new Invalid("There's no item with that id.");
  const url = args.url ? String(args.url).trim() : null;
  if (!args.photo?.download_url && !url) throw new Invalid("Give a photo uploaded in this chat (photo), or a link to a shop's page or picture (url). If a photo didn't come through, ask Steve to attach it again.");
  const role = args.role === undefined ? "garment" : args.role;
  if (!ROLES.includes(role)) throw new Invalid(`role is one of: ${ROLES.join(", ")}.`);
  const origin = args.origin ?? (url ? "reference" : "own");
  if (!ORIGINS.includes(origin)) throw new Invalid(`origin is one of: ${ORIGINS.join(", ")}.`);
  if (origin === "catalog" && role !== "garment") throw new Invalid("A catalog image is of the garment: role garment.");
  const colourNote = origin === "catalog" ? checkShows(row, args.shows) : "";
  const mine = await ctx.photos.list(row.id);
  const made_from = [...new Set(args.made_from || [])];
  if (made_from.some((m) => !mine.some((p) => p.id === m))) throw new Invalid("made_from names photos of this garment (their ids from get_item).");
  let photo = args.photo?.file_id ? mine.find((p) => p.file_id === args.photo.file_id) : url ? mine.find((p) => p.source_url === url && p.origin === origin) : null;
  let noted = "";
  if (!photo) {
    let path = null, page = null, source = "chatgpt_upload";
    if (args.photo?.download_url) {
      path = await ctx.storeUpload(args.photo);
      if (!path) throw new Invalid("The photo couldn't be fetched from the chat. Ask Steve to attach it again.");
    } else {
      // a picture's own address, or a page whose main picture is taken
      path = await ctx.storeImage(url);
      if (!path) { page = await ctx.readProduct(url).catch(() => null); path = page?.image ? await ctx.storeImage(page.image) : null; }
      if (!path) throw new Invalid("No picture could be taken from that link (some shops don't allow it). Ask Steve to save the picture and attach it.");
      source = "retailer_page";
      // the shop's page, noted on the garment where nothing's noted yet
      if (page) {
        const product = row.product_id ? await ctx.products.get(row.product_id) : null;
        if (product && !product.product_url) { await ctx.products.set(product.id, { product_url: page.url || url }); noted = " Noted the shop's page on the product."; }
        else if (!product && !row.buy_link) { await ctx.items.set(row.id, { buy_link: page.url || url }); noted = " Noted the shop's page on the garment."; }
      }
    }
    await ctx.photos.add([{ item_id: row.id, role, origin, path, source, file_id: args.photo?.file_id || null, source_url: url, made_from }]);
    photo = (await ctx.photos.list(row.id)).find((p) => p.path === path);
  }
  // a new catalog image is the one shown (unless make_hero: false); anything else only if asked, or if it's the best there is
  await settleHero(row.id, ctx, args.make_hero || (origin === "catalog" && args.make_hero !== false) ? photo.id : null);
  const w = await whole(row.id, ctx);
  return { text: `Photo added (${origin}, ${role}) [photo ${photo.id}]${w.item.hero_photo_id === photo.id ? ", and it's the one shown" : ""}:${noted}${colourNote} ${line(w.item)}`, data: { ...w, photo_id: photo.id } };
}
async function setPhotoRole(args, ctx) {
  const p = await ctx.photos.get(String(args.photo_id || ""));
  if (!p) throw new Invalid("There's no photo with that id. get_item lists them.");
  if (args.role !== undefined && !ROLES.includes(args.role)) throw new Invalid(`role is one of: ${ROLES.join(", ")}.`);
  if (args.origin !== undefined && !ORIGINS.includes(args.origin)) throw new Invalid(`origin is one of: ${ORIGINS.join(", ")}.`);
  const role = args.role || p.role, origin = args.origin || p.origin || "own";
  if (origin === "catalog" && role !== "garment") throw new Invalid("A catalog image is of the garment: role garment.");
  const item = await ctx.items.get(p.item_id);
  if (origin === "catalog" && (p.origin || "own") !== "catalog") checkShows(item, args.shows);
  if (role !== p.role || origin !== (p.origin || "own")) await ctx.photos.set(p.id, { role, origin });
  const wasShown = item.photo_path === p.path, nowCatalog = origin === "catalog" && (p.origin || "own") !== "catalog";
  // asked for, or newly the wardrobe's own image: shown; changed while shown: the best there is
  if (args.make_hero || nowCatalog) await settleHero(p.item_id, ctx, p.id);
  else if (wasShown) await settleHero(p.item_id, ctx);
  const w = await whole(p.item_id, ctx);
  return { text: `Photo ${p.id} is now ${origin}, ${role}${w.item.hero_photo_id === p.id ? ", and the one shown" : ""}: ${line(w.item)}`, data: w };
}

async function deletePhoto(args, ctx) {
  const p = await ctx.photos.get(String(args.photo_id || ""));
  if (!p) throw new Invalid("There's no photo with that id (it may be in the trash already: list_trash). get_item lists them.");
  const at = new Date().toISOString();
  await ctx.trash.set("wardrobe_photos", p.id, at);
  await settleHero(p.item_id, ctx);
  const w = await whole(p.item_id, ctx);
  return { text: `${trashed(`the ${p.origin || "own"} ${p.role} photo [photo ${p.id}]`, at)} ${line(w.item)}`, data: w };
}
async function deleteItem(args, ctx) {
  const row = await ctx.items.get(String(args.id || ""));
  if (!row) throw new Invalid("There's no item with that id (it may be in the trash already: list_trash).");
  const at = new Date().toISOString();
  await ctx.trash.set("wardrobe_items", row.id, at);
  return { text: trashed(row.name, at), data: { id: row.id, in_trash: true, gone_on: goneOn(at) } };
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
    const shown = args.include_images && w.item.hero_photo_id ? await photoImages([{ photo_id: w.item.hero_photo_id }], ctx) : null;
    if (shown) w.images = shown.meta;
    return { ...(shown && { images: shown.images }), text: [shown && (shown.meta.length ? `The photo shown is attached: ${photoLine(shown.meta[0])}` : `The photo shown couldn't be sent: ${shown.skipped[0]?.reason}`), args.include_images && !w.item.hero_photo_id && "It has no photo to show.",line(w.item), w.product && `Product: ${w.product.brand} ${w.product.name}${w.product.style_number ? ` (style ${w.product.style_number})` : ""}`, w.variant && `Variant: ${[w.variant.manufacturer_colour, w.variant.manufacturer_size].filter(Boolean).join(" / ")}`, w.photos.length ? `Photos: ${w.photos.map((p) => `${p.role}${p.hero ? " (shown)" : ""} [photo ${p.id}]`).join(", ")}` : "No photos.", w.item.notes && `Notes: ${w.item.notes}`, `In the app: ${APP}#item/${w.item.id}`].filter(Boolean).join("\n"), data: w };
  }
  if (name === "get_photo" || name === "get_photos" || name === "get_outfit_images") {
    const purpose = args.purpose || (name === "get_photo" ? "original" : "vision");
    const outfitOnly = ["generation", "board"];
    if (!(purpose in PURPOSES) && !(outfitOnly.includes(purpose) && name === "get_outfit_images")) throw new Invalid(`purpose is one of: ${Object.keys(PURPOSES).join(", ")}${name === "get_outfit_images" ? `, ${outfitOnly.join(", ")}` : ""}.`);
    let wanted;
    if (name === "get_outfit_images") {
      const items = Array.isArray(args.items) ? args.items : [];
      if (!items.length || items.length > PHOTOS_MAX) throw new Invalid(`Give 1 to ${PHOTOS_MAX} garments, each with a slot and item_id.`);
      const slots = items.map((x) => String(x?.slot || "").trim().toLowerCase().slice(0, 30));
      if (slots.some((x) => !x) || new Set(slots).size !== slots.length) throw new Invalid("Each garment needs its own slot (top, outerwear, bottom, shoes…).");
      wanted = [];
      for (const [i, x] of items.entries()) {
        const row = await ctx.items.get(String(x.item_id || ""));
        const hero = row && (await heroPhotos([row], ctx)).get(row.id);
        wanted.push({ photo_id: hero?.id || null, reference_key: slots[i], ...(row ? { item_id: row.id } : { missing_item: String(x.item_id || "") }) });
      }
    } else {
      const ids = name === "get_photo" ? [String(args.photo_id || "")] : [...new Set((args.photo_ids || []).map(String))];
      if (!ids.length || !ids[0]) throw new Invalid("Give the photo id (hero_photo_id from find_items, or one of get_item's photos).");
      if (ids.length > PHOTOS_MAX) throw new Invalid(`Up to ${PHOTOS_MAX} photos at once.`);
      wanted = ids.map((photo_id) => ({ photo_id }));
    }
    if (purpose === "generation") return generationLinks(wanted, ctx);
    if (purpose === "board") return outfitBoard(wanted, ctx);
    const r = await photoImages(wanted, ctx, purpose);
    for (const s of r.skipped) if (s.missing_item) { s.reason = `There's no garment ${s.missing_item} (find_items has them).`; s.item_id = s.missing_item; delete s.missing_item; }
    if (name === "get_photo" && !r.meta.length) throw new Invalid(r.skipped[0].reason);
    const text = [...r.meta.map((m) => `Image ${m.image} = ${photoLine(m)}`), ...r.skipped.map((s) => `Not sent${s.reference_key ? ` (${s.reference_key})` : ""}: ${s.reason}`)].join("\n");
    const key = name === "get_outfit_images" ? "references" : "photos";
    return { text, images: r.images, data: { [key]: r.meta, ...(r.skipped.length && { not_sent: r.skipped }) } };
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
    if (photo) { const path = await ctx.storeUpload(photo); if (path) { pics.push({ role: "garment", origin: "own", path, source: "chatgpt_upload", file_id: photo.file_id }); Object.assign(row, { photo_path: path, photo_file_id: photo.file_id }); } }
    if (row.buy_link) {
      const p = await ctx.readProduct(row.buy_link).catch(() => null);
      if (p) {
        row.buy_link = p.url;
        if (!row.brand && p.brand) { row.brand = p.brand; row.sources.brand = { source: "retailer_page", at: today() }; }
        if (row.price === undefined && p.price != null) { row.price = p.price; row.currency ??= p.currency; row.sources.price = { source: "retailer_page", at: today() }; }
        if (!row.photo_path && photo_from_link !== false && p.image) { const path = await ctx.storeImage(p.image); if (path) { row.photo_path = path; pics.push({ role: "garment", origin: "reference", path, source: "retailer_page", source_url: row.buy_link }); } }
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
  if (name === "delete_photo") return deletePhoto(args, ctx);
  if (name === "delete_item") return deleteItem(args, ctx);
  if (name === "update_item") return update(args, ctx);
  if (name === "retire_item") {
    const retired = args.retired !== false;
    const row = await ctx.items.set(String(args.id || ""), { retired, retired_at: retired ? new Date().toISOString() : null });
    if (!row) throw new Invalid("There's no item with that id.");
    return { text: `${row.name} is ${retired ? "retired (kept, out of the wardrobe)" : "back in the wardrobe"}.`, data: { id: row.id, retired } };
  }
  throw new Invalid(`There's no tool called ${name}.`);
}

export default {
  name: "wardrobe",
  records: true, // Steve's own records: read and written here (the rules, server.js)
  tools: TOOLS,
  status: {
  find_items: ["Looking through the wardrobe…", "Looked through the wardrobe"],
  get_item: ["Getting the garment…", "Got the garment"],
  get_photo: ["Getting the photo…", "Got the photo"],
  get_photos: ["Getting the photos…", "Got the photos"],
  get_outfit_images: ["Getting the outfit's photos…", "Got the outfit's photos"],
  ingest_item: ["Filing it…", "Filed"],
  read_store_link: ["Reading the shop's page…", "Read the shop's page"],
  add_item: ["Adding it…", "Added"],
  add_photo: ["Adding the photo…", "Added the photo"],
  set_photo_role: ["Updating the photo…", "Updated the photo"],
  delete_photo: ["Moving the photo to the trash…", "Moved the photo to the trash"],
  delete_item: ["Moving it to the trash…", "Moved it to the trash"],
  update_item: ["Making the change…", "Changed"],
  retire_item: ["Updating…", "Updated"],
  },
  instructions: ["Photos: Steve's own are evidence; a shop's picture is a reference (add_photo with its url); the one shown should be the wardrobe's catalog image, in one style for every brand, made from those and added with origin catalog. Photos go by id; hero_photo_id is the one shown.", "To add clothes, use ingest_item: read the photos (garment, hang tag, care label) or the shop page and pass facts at the right level, with where each came from. Printed facts go in product (brand, name, style number, material, origin) and variant (colour and size as printed, SKU, price, measurements); your judgements (warmth, dressiness, seasons, style, fit) go in item. Pass every photo with its role. A garment with no brand is just an item. Use dry_run when unsure, client_ref always.", "Correct mistakes with update_item at the right scope: item (this piece), variant (this colour and size) or product (all of them). get_photo, or get_outfit_images for an outfit, returns the images themselves: look before describing, comparing or picturing. Steve sees the card under your answer, so don't list what it shows; to send him to the app, use a result's \"In the app\" link."].join(" "),
  call,
};
