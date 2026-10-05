// A trip's packing list, one of SJPJr's areas (server.js has the protocol and the rules): entries
// for everyone on the trip, each a wardrobe item (by id, never copied) or anything else by label,
// with who it's for, a category, how many, where it's at (needed, to buy, ready, packed), which bag
// and whether it's essential. Each entry is its own row (trip_packing), so a tick in the app and a
// change from a chat never overwrite each other. trip-kit.js has the checks.
import { write, Invalid } from "../kit.js";
import { CATEGORIES, STATUSES, SHARED, plural, str, oneOf, whole, partOf, travelerKey, bagOf, entryOut, tally, wardrobeCategory } from "./trip-kit.js";

const IDS = { type: "array", minItems: 1, items: { type: "string" }, description: "Packing entry ids, from get_trip." };
const FIELDS = {
  traveler: { type: ["string", "null"], description: `Who it's for: a traveler's key (from get_trip), or "${SHARED}" for everyone. Left out: nobody in particular.` },
  category: { type: "string", enum: CATEGORIES, description: "Left out: a garment's from its wardrobe category, anything else misc." },
  qty: { type: "integer", minimum: 1 },
  status: { type: "string", enum: STATUSES, description: "needed (the default) → to_buy if it has to be bought → ready (out, by the bag) → packed." },
  bag: { type: ["string", "null"], description: "The bag's key or id (add_trip_bags makes them); null takes it out of its bag." },
  essential: { type: "boolean", description: "Can't leave without it (passports, medicine)." },
  notes: { type: ["string", "null"], description: "Only what has no field of its own." },
};
const ENTRY = {
  type: "object",
  properties: { item_id: { type: "string", description: "A wardrobe item's id (find_items)." }, label: { type: "string", description: "Anything not in the wardrobe: \"diapers\", \"UK adapter\"." }, ...FIELDS },
  additionalProperties: false,
};

const TOOLS = [
  {
    name: "add_packing_items",
    title: "Add to a trip's packing list",
    description: "Adds entries to a trip's packing list, keeping everything already on it. Each is a wardrobe item_id or a label, with optional traveler, category, qty, status, bag, essential and notes. An entry already on the list for the same thing and traveler (with no traveler given: the same thing) is updated with what's given instead of added twice. Returns the entries made or changed, with their ids.",
    inputSchema: { type: "object", properties: { trip_id: { type: "string" }, items: { type: "array", minItems: 1, items: ENTRY } }, required: ["trip_id", "items"], additionalProperties: false },
    annotations: { ...write, idempotentHint: true },
  },
  {
    name: "update_packing_item",
    title: "Change a packing entry",
    description: "Changes one packing entry by its id: only the fields given change (null clears traveler, bag or notes). label renames an entry that isn't a wardrobe item. The garment an entry points at is never changed.",
    inputSchema: { type: "object", properties: { packing_item_id: { type: "string" }, label: { type: "string" }, ...FIELDS }, required: ["packing_item_id"], additionalProperties: false },
    annotations: { ...write, idempotentHint: true },
  },
  {
    name: "set_packing_status",
    title: "Set packing entries' status",
    description: "Sets the status of one or more packing entries of a trip at once: needed, to_buy, ready or packed. The card's checklist ticks with it.",
    inputSchema: { type: "object", properties: { packing_item_ids: IDS, status: { type: "string", enum: STATUSES } }, required: ["packing_item_ids", "status"], additionalProperties: false },
    annotations: { ...write, idempotentHint: true },
    _meta: { "openai/widgetAccessible": true },
  },
  {
    name: "move_packing_items",
    title: "Put packing entries in a bag",
    description: "Puts one or more packing entries of a trip in a bag (its key or id), or takes them out of their bag with null. Nothing else about them changes.",
    inputSchema: { type: "object", properties: { packing_item_ids: IDS, bag: FIELDS.bag }, required: ["packing_item_ids", "bag"], additionalProperties: false },
    annotations: { ...write, idempotentHint: true },
  },
  {
    name: "remove_packing_item",
    title: "Take an entry off the packing list",
    description: "Takes one entry off a trip's packing list, for good (add it again to undo). Only the entry: a wardrobe garment it pointed at is never touched, and a day that plans it keeps it.",
    inputSchema: { type: "object", properties: { packing_item_id: { type: "string" } }, required: ["packing_item_id"], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "set_packing",
    title: "Replace a trip's packing list",
    description: "For importing or replacing a whole list at once; to add or change a few entries, use add_packing_items and the other packing tools. mode replace (the default) makes the given entries the whole list: entries not given are taken off (only the entries; garments are never touched). mode add appends, as add_packing_items does. An entry given that's already on the list (same thing, and same traveler if one is given) keeps its id and status unless they're given. Older calls with only item_id or label and qty work as before.",
    inputSchema: { type: "object", properties: { trip_id: { type: "string" }, items: { type: "array", minItems: 1, items: ENTRY }, mode: { type: "string", enum: ["replace", "add"] } }, required: ["trip_id", "items"], additionalProperties: false },
    annotations: { ...write, idempotentHint: true },
  },
];

// The fields given for an entry, checked: undefined for what wasn't given
function fieldsIn(x, t, bags) {
  const qty = x.qty === undefined ? undefined : parseInt(x.qty, 10);
  if (qty !== undefined && !(qty >= 1 && qty <= 999)) throw new Invalid(`qty is a whole number from 1 (not ${x.qty}).`);
  const bag = bagOf(bags, x.bag);
  if (x.essential !== undefined && typeof x.essential !== "boolean") throw new Invalid("essential is true or false.");
  return {
    traveler_key: travelerKey(t, x.traveler),
    category: oneOf(x.category, CATEGORIES, "category"),
    qty,
    status: oneOf(x.status, STATUSES, "status"),
    bag_id: bag === undefined ? undefined : bag ? bag.id : null,
    essential: x.essential,
    notes: str(x.notes, 500, "notes"),
  };
}
const given = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const thing = (p) => (p.item_id ? `i:${p.item_id}` : `l:${String(p.label).toLowerCase()}`);

// Adds the entries given (an entry already there is updated); with replace, takes off the rest
async function put(args, ctx, replace) {
  const w = await whole(ctx, args.trip_id, ["packing", "bags"]);
  const items = await ctx.items.list(), byId = new Map(items.map((i) => [i.id, i]));
  const bagsById = new Map(w.bags.map((b) => [b.id, b]));
  const kept = new Set(), created = [], updated = [];
  for (const x of args.items || []) {
    const label = x.item_id ? null : str(x.label, 120, "A label");
    if (x.item_id && !byId.has(x.item_id)) throw new Invalid(`Not in the wardrobe: ${x.item_id}. Use ids from find_items, or a label.`);
    if (!x.item_id && !label) throw new Invalid("Each entry needs a wardrobe item_id or a label.");
    const f = fieldsIn(x, w.t, w.bags), want = { item_id: x.item_id || null, label };
    const same = (p) => thing(p) === thing(want) && (f.traveler_key === undefined || p.traveler_key === f.traveler_key);
    const had = [...w.packing, ...created].find(same);
    if (had) {
      const patch = given(f);
      const row = Object.keys(patch).length ? await ctx.parts.set("trip_packing", had.id, patch) : had;
      Object.assign(had, row);
      kept.add(had.id);
      if (!updated.includes(had) && !created.includes(had)) updated.push(had);
      continue;
    }
    const [row] = await ctx.parts.add("trip_packing", [{
      trip_id: w.t.id, ...want,
      category: f.category || (x.item_id ? wardrobeCategory(byId.get(x.item_id).category) : "misc"),
      qty: f.qty || 1, status: f.status || "needed", essential: f.essential || false,
      ...given({ traveler_key: f.traveler_key, bag_id: f.bag_id, notes: f.notes }),
    }]);
    kept.add(row.id);
    created.push(row);
  }
  let removed = 0;
  if (replace) for (const p of w.packing) if (!kept.has(p.id) && (await ctx.parts.remove("trip_packing", p.id))) removed++;
  const all = await ctx.parts.list("trip_packing", w.t.id), s = tally(all);
  const out = (p) => entryOut(p, bagsById);
  return {
    text: `Packing for ${w.t.name}: ${plural(created.length, "entry")} added, ${updated.length} updated${replace ? `, ${removed} taken off` : ""}; ${s.total_entries} on the list (${s.packed} packed).${created.length ? `\nAdded: ${created.map((p) => `${p.label || byId.get(p.item_id)?.name} [id ${p.id}]`).join("; ")}` : ""}`,
    data: { trip_id: w.t.id, created: created.map(out), updated: updated.map(out), removed, count: s.total_entries, summary: s },
  };
}

// Several entries by id, all on one trip
async function entries(ids, ctx) {
  if (!Array.isArray(ids) || !ids.length) throw new Invalid("Give the packing entries' ids (get_trip lists them).");
  const found = [];
  for (const id of [...new Set(ids)]) found.push(await partOf(ctx, "packing", id, "packing entry"));
  const t = found[0].t;
  if (found.some((x) => x.t.id !== t.id)) throw new Invalid("Those entries are on different trips; do one trip at a time.");
  return { t, list: found.map((x) => x.p) };
}
const nameIn = (p, byId) => p.label || byId.get(p.item_id)?.name || "(no longer in the wardrobe)";

async function call(name, args, ctx) {
  if (name === "add_packing_items") return put(args, ctx, false);
  if (name === "set_packing") return put(args, ctx, args.mode !== "add");
  const items = await ctx.items.list(), byId = new Map(items.map((i) => [i.id, i]));
  if (name === "update_packing_item") {
    const { p, t } = await partOf(ctx, "packing", args.packing_item_id, "packing entry");
    const bags = await ctx.parts.list("trip_bags", t.id);
    const patch = given(fieldsIn(args, t, bags));
    if (args.label !== undefined) {
      if (p.item_id) throw new Invalid("That entry is a wardrobe garment; its name is the garment's. Take it off and add a label instead.");
      patch.label = str(args.label, 120, "A label", { required: true });
    }
    if (!Object.keys(patch).length) throw new Invalid("Nothing to change.");
    const u = await ctx.parts.set("trip_packing", p.id, patch);
    return { text: `Changed ${nameIn(u, byId)} on ${t.name}'s packing list.`, data: entryOut(u, new Map(bags.map((b) => [b.id, b]))) };
  }
  if (name === "remove_packing_item") {
    const { p, t } = await partOf(ctx, "packing", args.packing_item_id, "packing entry");
    await ctx.parts.remove("trip_packing", p.id);
    return { text: `Took ${nameIn(p, byId)} off ${t.name}'s packing list${p.item_id ? " (the garment is still in the wardrobe)" : ""}.`, data: { removed: p.id, trip_id: t.id } };
  }
  if (name === "set_packing_status" || name === "move_packing_items") {
    const { t, list } = await entries(args.packing_item_ids, ctx);
    const bags = await ctx.parts.list("trip_bags", t.id);
    let patch;
    if (name === "set_packing_status") patch = { status: oneOf(args.status, STATUSES, "status") };
    else { if (args.bag === undefined) throw new Invalid("Give the bag (its key or id), or null to take them out of their bag."); const bag = bagOf(bags, args.bag); patch = { bag_id: bag ? bag.id : null }; }
    if (!patch.status && name === "set_packing_status") throw new Invalid("Give the status.");
    for (const p of list) await ctx.parts.set("trip_packing", p.id, patch);
    const s = tally(await ctx.parts.list("trip_packing", t.id));
    const what = list.map((p) => nameIn(p, byId)).join(", ");
    const bag = bags.find((b) => b.id === patch.bag_id);
    return {
      text: name === "set_packing_status" ? `${what}: ${patch.status}. ${t.name}: ${s.packed} of ${s.total_entries} packed.` : `${what}: ${bag ? `in ${bag.key}` : "out of their bag"}.`,
      data: { trip_id: t.id, packing_item_ids: list.map((p) => p.id), ...(patch.status ? { status: patch.status } : { bag: bag?.key || null }), summary: s },
    };
  }
  throw new Invalid(`There's no tool called ${name}.`);
}

export default {
  name: "packing",
  records: true,
  tools: TOOLS,
  status: {
    add_packing_items: ["Adding to the packing list…", "Added to the packing list"],
    update_packing_item: ["Changing the entry…", "Changed the entry"],
    set_packing_status: ["Updating the packing…", "Updated the packing"],
    move_packing_items: ["Moving them…", "Moved"],
    remove_packing_item: ["Taking it off the list…", "Took it off the list"],
    set_packing: ["Updating the packing list…", "Updated the packing list"],
  },
  instructions: "", // in trips'
  call,
};
