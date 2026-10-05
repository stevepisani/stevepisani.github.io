// SJPJr's MCP server, without the transport: Steve Pisani's own things (his wardrobe and trips,
// more to come), for ChatGPT and Claude. This file is the protocol (MCP over Streamable HTTP,
// stateless: each POST is answered with one JSON response, no session, no stream), who the server
// is, the in-chat card, and the rules every area keeps; each area is a file in areas/ with its
// tools. index.ts serves it and signs people in; it's plain JavaScript so tools/wardrobe-test.mjs
// can run it in Node against the real schema (PGlite).
//
// `ctx` is the signed-in person's view of the data (index.ts builds it on a Supabase client
// signed in as them, so row-level security applies to everything here):
//   ctx.items.list() → closet rows (flat, resolved); get(id) → closet row; own(id) → the item row
//     itself; add(row) → closet row; set(id, patch) → closet row | null
//   ctx.products.list(); get(id); add(row) → row; set(id, patch) → row
//   ctx.variants.list(productId); get(id); add(row) → row; set(id, patch) → row
//   ctx.photos.list(itemId); forItems(itemIds); get(id); byFile(fileId) → row | null; add(rows); set(id, patch)
//   ctx.photoUrls(paths) → Map(path → signed link); ctx.readProduct(url); ctx.storeImage(url) → path | null
//   ctx.storeUpload(file) → path | null (a file ChatGPT passes: { download_url, file_id, mime_type })
//   ctx.trips.list(); get(id); add(row) → row; set(id, patch) → row | null
//   ctx.locate(place) → { name, country, lat, lon } | null; ctx.weather(leg) → _shared/weather.js legWeather
import { SITE, APP_URI, Invalid } from "./kit.js";
import wardrobe from "./areas/wardrobe.js";
import trips from "./areas/trips.js";
import trash from "./areas/trash.js";
export { APP_URI };
export { CATEGORIES, SOURCES, ROLES } from "./areas/wardrobe.js";

export const PROTOCOLS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

// ---------- The areas, and the rules they all keep (docs/apps.md, "The rules") ----------
// An area is one file in areas/: { name, records, tools, status, instructions, call }. A new one
// is a file and a line here.
export const AREAS = [wardrobe, trips, trash];
// 1. Steve's own records (an area with records: true) can be read and changed from a chat. The
//    site's content (drinks, books, what he's written) is read-only here: it changes in the repo.
// 2. Deleting moves things to the trash, from a chat as from the app: hidden everywhere, restorable
//    for 30 days (kit.js, TRASH_DAYS), then gone for good. No tool deletes outright; TRASH lists the
//    only tools that delete.
// 3. Everything runs as the signed-in member (row-level security), and stays on stevenpisani.com.
// Checked here when the server starts, so an area that breaks them doesn't load; said to the model
// in RULES, and on every tool that writes.
export const RULES = "Rules: Steve's own records (wardrobe, trips) can be read and changed; the site's content is read-only; deleting moves things to the trash, where they can be restored for 30 days before they're gone for good.";
// the only tools that delete, each to the trash
export const TRASH = ["delete_item", "delete_photo", "delete_trip"];
const WRITES = "It changes only Steve's own records on stevenpisani.com; it sends nothing anywhere and deletes nothing.";
const TRASHES = "It moves only that to the trash in Steve's private wardrobe on stevenpisani.com (restorable for 30 days), and sends nothing anywhere.";
export const TOOLS = [];
const OWNER = new Map();
for (const area of AREAS) for (const t of area.tools) {
  if (OWNER.has(t.name)) throw new Error(`${t.name} is in two areas`);
  if (!area.records && !t.annotations.readOnlyHint) throw new Error(`${t.name}: ${area.name} is read-only (the rules)`);
  if ((t.annotations.destructiveHint || /^(delete|remove|destroy)_/.test(t.name)) && !TRASH.includes(t.name)) throw new Error(`${t.name}: deleting goes to the trash, through the TRASH tools (the rules)`);
  const [invoking, invoked] = area.status[t.name] || [];
  if (!invoking) throw new Error(`${t.name} has no status lines`);
  OWNER.set(t.name, area);
  // what ChatGPT shows while it runs, and once it's done (64 characters at most)
  TOOLS.push({ ...t, ...(!t.annotations.readOnlyHint && { description: `${t.description}\n${TRASH.includes(t.name) ? TRASHES : WRITES}` }), _meta: { ...t._meta, "openai/toolInvocation/invoking": invoking, "openai/toolInvocation/invoked": invoked } });
}
const INSTRUCTIONS = [
  "SJPJr: Steve Pisani's own things, private to him: his wardrobe and his trips. Start with find_items (one entry per garment he owns, flat) and refer to things by name.",
  RULES,
  ...AREAS.map((a) => a.instructions),
].join(" ");

// ---------- Who it is ----------
// its name, logo (the site's SJPJr badge) and home, as both apps show them
export const ICONS = [
  { src: `${SITE}/assets/images/sj-512.png`, mimeType: "image/png", sizes: ["512x512"] },
  { src: `${SITE}/assets/images/sj-256.png`, mimeType: "image/png", sizes: ["256x256"] }, // 7 KB: the one to upload where an app wants a small icon
  { src: `${SITE}/assets/images/sj-180.png`, mimeType: "image/png", sizes: ["180x180"] },
  { src: `${SITE}/assets/images/sj-64.png`, mimeType: "image/png", sizes: ["64x64"] },
];
export const SERVER = { name: "sjpjr", title: "SJPJr", version: "2.0.0", description: "Steve Pisani's own things: his wardrobe and trips, to find, add and plan what to wear and pack.", websiteUrl: SITE, icons: ICONS };

// ---------- The in-chat card (MCP Apps, SEP-1865, which ChatGPT and Claude both render) ----------
// One small HTML page, served as the resource APP_URI, that shows whatever a tool returned by its
// structuredContent.view (closet, garment, ingest, trip) and can call tools itself (open a
// garment, file a dry run, say what a photo is, tick packing). Its script is the site's
// (assets/js/mcp-app/, built to /assets/js/dist/mcp-app.js), fetched by the server and put in the
// page (ctx.cardScript), so the page needs nothing from elsewhere but the photos; if the site
// can't be reached, the page loads the script itself. Hosts keep the page until the connector is
// refreshed. Hosts without cards use each result's text.
export const APP_MIME = "text/html;profile=mcp-app";
export function appResource(ctx, script) {
  const site = ctx.siteOrigin || SITE;
  const js = script ? `<script>${script.replace(/<\/(script)/gi, "<\\/$1")}</script>` : `<script src="${site}/assets/js/dist/mcp-app.js"></script>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SJPJr</title></head><body><div id="app"></div>${js}</body></html>`;
  const _meta = {
    // what the card may load: its script from the site, and the photos (signed links to Storage)
    ui: { csp: { resourceDomains: [site, ...(ctx.storageOrigin ? [ctx.storageOrigin] : [])] }, prefersBorder: true },
    // for ChatGPT's model: what Steve already sees, so the answer needn't repeat it
    "openai/widgetDescription": "Shows the garments, the one garment, the filing preview or the trip just asked for, with their photos. Steve can open a garment, add a previewed garment, say what a photo is and tick off packing in it. Don't list what it shows or paste photo links; add what it doesn't say.",
  };
  return { uri: APP_URI, name: "SJPJr", title: "SJPJr", mimeType: APP_MIME, icons: ICONS, html, _meta };
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
      const area = OWNER.get(name);
      if (!area) return fail(-32602, `There's no tool called ${name}.`);
      try {
        // the photos' links, by photo id, for the card alone (kit.js, sign)
        const links = {};
        const { text, data } = await area.call(name, args || {}, { ...ctx, links });
        return ok({ content: [{ type: "text", text }], structuredContent: data, ...(Object.keys(links).length && { _meta: { photos: links } }) });
      } catch (e) {
        if (!(e instanceof Invalid)) console.error(e);
        return ok({ content: [{ type: "text", text: e instanceof Invalid ? e.message : "That didn't work; SJPJr couldn't be reached. Try again." }], isError: true });
      }
    }
    default: return fail(-32601, `No method ${msg.method}.`);
  }
}
