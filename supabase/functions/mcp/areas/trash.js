// The trash: what a chat or the app deletes (delete_item, delete_photo, delete_trip) is kept for
// TRASH_DAYS, hidden everywhere, and can be restored; then empty_trash() deletes it for good and the
// weekly Supabase job removes its files (supabase/migrations/20261005000400_trash.sql,
// tools/empty-trash.mjs). One of SJPJr's areas (server.js has the protocol and the rules).
import { read, write, Invalid, TRASH_DAYS, goneOn } from "../kit.js";
import { settleHero } from "./wardrobe.js";

const TOOLS = [
  {
    name: "list_trash",
    title: "What's in the trash",
    description: `What's been deleted in the last ${TRASH_DAYS} days, garments, photos and trips, each with the day it's gone for good. restore brings any of them back.`,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: read,
  },
  {
    name: "restore",
    title: "Restore from the trash",
    description: "Brings a garment, photo or trip back from the trash, as it was, by its id (list_trash has them).",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
    annotations: { ...write, idempotentHint: true },
  },
];

const colour = (i) => i.manufacturer_colour || i.colour;
async function call(name, args, ctx) {
  const t = await ctx.trash.list();
  if (name === "list_trash") {
    const lines = [
      ...t.items.map((i) => `Garment: ${i.name}${colour(i) ? ` (${colour(i)})` : ""} [id ${i.id}], gone for good ${goneOn(i.deleted_at)}`),
      ...t.photos.map((p) => `Photo: ${p.origin || "own"} ${p.role}, of garment ${p.item_id} [id ${p.id}], gone for good ${goneOn(p.deleted_at)}`),
      ...t.trips.map((x) => `Trip: ${x.name} [id ${x.id}], gone for good ${goneOn(x.deleted_at)}`),
    ];
    const when = (r) => ({ ...r, gone_on: goneOn(r.deleted_at) });
    return { text: lines.length ? lines.join("\n") : "The trash is empty.", data: { items: t.items.map(when), photos: t.photos.map(when), trips: t.trips.map(when) } };
  }
  if (name === "restore") {
    const id = String(args.id || "");
    const item = t.items.find((x) => x.id === id), photo = t.photos.find((x) => x.id === id), trip = t.trips.find((x) => x.id === id);
    if (item) { await ctx.trash.set("wardrobe_items", id, null); return { text: `Restored ${item.name}.`, data: { id, kind: "garment" } }; }
    if (photo) { await ctx.trash.set("wardrobe_photos", id, null); await settleHero(photo.item_id, ctx); return { text: `Restored the photo [photo ${id}] to garment ${photo.item_id}.`, data: { id, kind: "photo", item_id: photo.item_id } }; }
    if (trip) { await ctx.trash.set("trips", id, null); return { text: `Restored ${trip.name}.`, data: { id, kind: "trip" } }; }
    throw new Invalid(`Nothing in the trash has that id. list_trash has what's there; after ${TRASH_DAYS} days things are gone for good.`);
  }
  throw new Invalid(`There's no tool called ${name}.`);
}

export default {
  name: "trash",
  records: true,
  tools: TOOLS,
  status: {
    list_trash: ["Looking in the trash…", "Looked in the trash"],
    restore: ["Restoring it…", "Restored"],
  },
  instructions: `After deleting, say so, and that restore brings it back within ${TRASH_DAYS} days.`,
  call,
};
