// What every area of SJPJr's MCP server shares (server.js has the protocol and the rules).
export const SITE = "https://stevenpisani.com";
export const WARDROBE_APP = `${SITE}/apps/`; // the app's own links: #closet, #item/<id>, #trip/<id>

// The in-chat card: one page for every area (server.js serves it); a tool that shows it says so
// with these keys, the MCP Apps one and ChatGPT's
export const APP_URI = "ui://sjpjr/card.html";
export const showsCard = { ui: { resourceUri: APP_URI }, "openai/outputTemplate": APP_URI };

// Tool hints, as both apps read them. Nothing is ever destructive here (the rules, server.js).
export const read = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
export const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

// A mistake in the call, said so the model can fix it (anything else is "couldn't be reached")
export class Invalid extends Error {}

export const today = () => new Date().toISOString().slice(0, 10);
export const present = (v) => v !== null && v !== undefined && !(Array.isArray(v) && !v.length) && !(typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length);
export const pick = (row, keys) => Object.fromEntries(keys.filter((k) => present(row[k])).map((k) => [k, row[k]]));
export const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

// Photos. What the model reads names a photo by its id (the item's hero_photo_id is the one shown,
// get_item's photos have theirs); the card also needs its link, a signed one that changes with
// every call, so links go in the result's _meta, by photo id, which hosts give the card and not
// the model (server.js; assets/js/mcp-app/card.js puts them in place). ctx.links collects them.
export async function sign(ctx, photos) {
  if (!ctx.links || !photos.length) return;
  const urls = await ctx.photoUrls(photos.map((p) => p.path));
  for (const p of photos) if (urls.get(p.path)) ctx.links[p.id] = urls.get(p.path);
}
// the photo shown for each item (the one at its photo_path), by item id, with its link for the card
export async function heroPhotos(rows, ctx) {
  const shown = rows.filter((r) => r.photo_path);
  const out = new Map();
  if (!shown.length) return out;
  const photos = await ctx.photos.forItems(shown.map((r) => r.id));
  for (const r of shown) { const p = photos.find((x) => x.item_id === r.id && x.path === r.photo_path); if (p) out.set(r.id, p); }
  await sign(ctx, [...out.values()]);
  return out;
}

// The trash: what's deleted is kept this long, then gone for good (empty_trash, the weekly job)
export const TRASH_DAYS = 30;
export const goneOn = (deletedAt) => new Date(new Date(deletedAt).getTime() + TRASH_DAYS * 864e5).toISOString().slice(0, 10);
export const trashed = (what, at) => `Moved ${what} to the trash: it can be restored until ${goneOn(at)}, then it's gone for good.`;
