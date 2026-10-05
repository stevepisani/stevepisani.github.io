// The parts of a trip besides its days and packing, one of SJPJr's areas (server.js has the
// protocol and the rules): bags, transport, lodging and resources (links: insurance, tickets,
// bookings). Each is its own row with its own id, and each kind has three tools made the same way
// here: add (appends, several at once), update (by id, only what's given) and remove (that row
// alone). Facts only: nothing is looked up, booked or sent. trip-kit.js has the checks.
import { write, Invalid, pick } from "../kit.js";
import {
  BAG_TYPES, TRANSPORT_TYPES, RESOURCE_TYPES, SHARED, DATE, plural, keyOf, str, oneOf, date, url, time, timeDay, hasOffset,
  whole, partOf, travelerKey, transportLine, lodgingLine,
} from "./trip-kit.js";

const S = (description) => ({ type: "string", ...(description && { description }) });
const up = (s) => (s ? s.toUpperCase() : s);
const N = (description) => ({ type: ["string", "null"], ...(description && { description }) }); // null clears it, on update

// Each kind: its table, its fields (schema; check(value, trip) → stored value, undefined if not
// given), what it needs, a check of the whole row, and how it reads.
const KINDS = [
  {
    kind: "bags", table: "trip_bags", one: "bag", many: "bags",
    add: "add_trip_bags", update: "update_trip_bag", remove: "remove_trip_bag",
    what: "bags and other things that carry (checked_1, steve_carry_on, diaper_bag, stroller), for packing entries to go in",
    fields: {
      key: { schema: S("Short, lowercase, unique on the trip: \"checked_1\", \"steve_carry_on\". Made from the label if left out."), check: (v) => (v === undefined ? undefined : keyOf(v) || undefined) },
      label: { schema: S("\"Checked 1\", \"Steve's carry-on\"."), check: (v) => str(v, 120, "A bag's label", { required: v !== undefined }) },
      type: { schema: { type: "string", enum: BAG_TYPES }, check: (v) => oneOf(v, BAG_TYPES, "A bag's type") },
      traveler: { schema: N(`Whose it is: a traveler's key, or "${SHARED}".`), column: "traveler_key", check: (v, t) => travelerKey(t, v) },
      notes: { schema: N(), check: (v) => str(v, 500, "notes") },
    },
    required: ["label"],
    finish: (row, all) => {
      row.key ||= keyOf(row.label);
      if (!row.key || !/^[a-z0-9_]{1,40}$/.test(row.key)) throw new Invalid(`A bag needs a key of letters, digits and _: "${row.key}".`);
      if (all.some((b) => b.key === row.key && b.id !== row.id)) throw new Invalid(`There's already a bag "${row.key}" on this trip. Give another key, or update_trip_bag to change it.`);
    },
    line: (b) => `${b.key} "${b.label}"${b.type ? ` (${b.type})` : ""}${b.traveler_key ? `, ${b.traveler_key}'s` : ""} [id ${b.id}]`,
    out: ["id", "key", "label", "type", "traveler_key", "notes"],
  },
  {
    kind: "transport", table: "trip_transport", one: "transport", many: "transport",
    add: "add_transport", update: "update_transport", remove: "remove_transport",
    what: "flights, trains, transfers and other journeys, each with its date, from and to, and times as known",
    fields: {
      type: { schema: { type: "string", enum: TRANSPORT_TYPES }, check: (v) => oneOf(v, TRANSPORT_TYPES, "type") },
      date: { schema: { ...DATE, description: "The day it leaves, local. Taken from departure_time if left out." }, check: (v) => date(v, "date") },
      origin: { schema: S("Where from: \"Newark\", \"London City Airport\", \"Heathrow\"."), check: (v) => str(v, 120, "origin", { required: v !== undefined }) },
      destination: { schema: S(), check: (v) => str(v, 120, "destination", { required: v !== undefined }) },
      origin_code: { schema: N("An airport or station code, if it has one: \"EWR\"."), check: (v) => up(str(v, 10, "origin_code")) },
      destination_code: { schema: N(), check: (v) => up(str(v, 10, "destination_code")) },
      departure_time: { schema: N("ISO 8601, with the UTC offset where it's known: \"2026-10-13T11:15:00+01:00\"; without one it's local time there. \"HH:MM\" alone is on date."), check: (v, t, row) => time(v, "departure_time", row.date) },
      arrival_time: { schema: N("ISO 8601 as for departure_time, local to where it lands (give the date when it lands another day)."), check: (v, t, row) => time(v, "arrival_time", row.date) },
      carrier: { schema: N("\"British Airways\"."), check: (v) => str(v, 80, "carrier") },
      number: { schema: N("Flight or train number: \"BA184\"."), check: (v) => str(v, 20, "number") },
      confirmation: { schema: N(), check: (v) => str(v, 80, "confirmation") },
      booking_url: { schema: N(), check: (v) => url(v, "booking_url") },
      notes: { schema: N(), check: (v) => str(v, 500, "notes") },
    },
    required: ["type", "origin", "destination"],
    first: ["date"], // read before the times, which may lean on it
    finish: (row) => {
      row.date ||= timeDay(row.departure_time);
      if (!row.date) throw new Invalid("A journey needs its date (or a departure_time with one).");
      if (row.departure_time && timeDay(row.departure_time) !== row.date) throw new Invalid(`departure_time (${row.departure_time}) isn't on date (${row.date}).`);
      if (row.arrival_time && timeDay(row.arrival_time) < row.date) throw new Invalid(`arrival_time (${row.arrival_time}) is before the day it leaves (${row.date}).`);
      if (hasOffset(row.departure_time) && hasOffset(row.arrival_time) && new Date(row.arrival_time) < new Date(row.departure_time)) throw new Invalid(`It arrives (${row.arrival_time}) before it departs (${row.departure_time}).`);
    },
    line: transportLine,
    out: ["id", "type", "date", "origin", "destination", "origin_code", "destination_code", "departure_time", "arrival_time", "carrier", "number", "confirmation", "booking_url", "notes"],
  },
  {
    kind: "lodging", table: "trip_lodging", one: "stay", many: "lodging",
    add: "add_lodging", update: "update_lodging", remove: "remove_lodging",
    what: "where the travelers sleep: name, place, address, check-in and check-out dates",
    fields: {
      name: { schema: S("\"St James House\"."), check: (v) => str(v, 200, "name", { required: v !== undefined }) },
      place: { schema: N("The city: \"London\"."), check: (v) => str(v, 120, "place") },
      address: { schema: N(), check: (v) => str(v, 300, "address") },
      check_in: { schema: DATE, check: (v) => date(v, "check_in", { required: v !== undefined }) },
      check_out: { schema: DATE, check: (v) => date(v, "check_out", { required: v !== undefined }) },
      confirmation: { schema: N(), check: (v) => str(v, 80, "confirmation") },
      booking_url: { schema: N(), check: (v) => url(v, "booking_url") },
      notes: { schema: N(), check: (v) => str(v, 500, "notes") },
    },
    required: ["name", "check_in", "check_out"],
    finish: (row) => { if (row.check_out < row.check_in) throw new Invalid(`check_out (${row.check_out}) is before check_in (${row.check_in}).`); },
    line: lodgingLine,
    out: ["id", "name", "place", "address", "check_in", "check_out", "confirmation", "booking_url", "notes"],
  },
  {
    kind: "resources", table: "trip_resources", one: "link", many: "resources",
    add: "add_trip_resources", update: "update_trip_resource", remove: "remove_trip_resource",
    what: "links and references for the trip (travel insurance, tickets, reservations, bookings, documents), a label and a URL each, not the bookings themselves",
    fields: {
      type: { schema: { type: "string", enum: RESOURCE_TYPES }, check: (v) => oneOf(v, RESOURCE_TYPES, "type") },
      label: { schema: S("\"Travel insurance\", \"Eagles ticket\"."), check: (v) => str(v, 200, "label", { required: v !== undefined }) },
      url: { schema: N(), check: (v) => url(v, "url") },
      notes: { schema: N(), check: (v) => str(v, 500, "notes") },
    },
    required: ["label"],
    defaults: { type: "other" },
    finish: () => {},
    line: (r) => `${r.label} (${r.type})${r.url ? ` ${r.url}` : ""} [id ${r.id}]`,
    out: ["id", "type", "label", "url", "notes"],
  },
];

const schemaOf = (k) => Object.fromEntries(Object.entries(k.fields).map(([f, d]) => [f, d.schema]));
// The fields given, checked, as columns; `base` is the row they'll land on (for checks that lean on it)
function columns(k, x, t, base = {}) {
  const out = {};
  const order = [...(k.first || []), ...Object.keys(k.fields).filter((f) => !(k.first || []).includes(f))];
  for (const f of order) {
    const v = k.fields[f].check(x[f], t, { ...base, ...out });
    if (v !== undefined) out[k.fields[f].column || f] = v;
  }
  return out;
}
const outOf = (k, r) => pick({ ...r, ...(r.traveler_key !== undefined && { traveler: r.traveler_key }) }, k.out.map((f) => (f === "traveler_key" ? "traveler" : f)));

const TOOLS = [];
const BY = new Map();
for (const k of KINDS) {
  TOOLS.push(
    {
      name: k.add,
      title: `Add ${k.many} to a trip`,
      description: `Adds ${k.what}. Appends: what's already on the trip stays. Needs ${k.required.join(", ")} for each. Returns them with their ids.`,
      inputSchema: { type: "object", properties: { trip_id: { type: "string" }, [k.many]: { type: "array", minItems: 1, items: { type: "object", properties: schemaOf(k), required: k.required, additionalProperties: false } } }, required: ["trip_id", k.many], additionalProperties: false },
      annotations: write,
    },
    {
      name: k.update,
      title: `Change a ${k.one}`,
      description: `Changes one of a trip's ${k.many} by its id (get_trip lists them): only the fields given change; null clears one that isn't needed.`,
      inputSchema: { type: "object", properties: { id: { type: "string" }, ...schemaOf(k) }, required: ["id"], additionalProperties: false },
      annotations: { ...write, idempotentHint: true },
    },
    {
      name: k.remove,
      title: `Remove a ${k.one}`,
      description: `Removes one of a trip's ${k.many} by its id, for good (add it again to undo). Only that${k.kind === "bags" ? ": the packing entries in it stay on the list, out of any bag" : ""}.`,
      inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
  );
  BY.set(k.add, ["add", k]).set(k.update, ["update", k]).set(k.remove, ["remove", k]);
}

async function call(name, args, ctx) {
  const [op, k] = BY.get(name) || [];
  if (!k) throw new Invalid(`There's no tool called ${name}.`);
  if (op === "add") {
    const w = await whole(ctx, args.trip_id, [k.kind]);
    const list = args[k.many];
    if (!Array.isArray(list) || !list.length) throw new Invalid(`Give the ${k.many} to add, as a list.`);
    const rows = [], all = [...w[k.kind]];
    for (const x of list) {
      for (const f of k.required) if (x?.[f] === undefined || x[f] === null || x[f] === "") throw new Invalid(`Each of the ${k.many} needs ${f}: ${JSON.stringify(x)}`);
      const row = { ...(k.defaults || {}), ...columns(k, x, w.t) };
      k.finish(row, all);
      all.push(row);
      rows.push(row);
    }
    const made = await ctx.parts.add(k.table, rows.map((r) => ({ trip_id: w.t.id, ...r })));
    return { text: `Added to ${w.t.name}:\n${made.map((r) => `  ${k.line(r)}`).join("\n")}`, data: { trip_id: w.t.id, [k.many]: made.map((r) => outOf(k, r)) } };
  }
  const { p, t } = await partOf(ctx, k.kind, args.id, k.one);
  if (op === "remove") {
    const inBag = k.kind === "bags" ? (await ctx.parts.list("trip_packing", t.id)).filter((x) => x.bag_id === p.id).length : 0;
    await ctx.parts.remove(k.table, p.id);
    return { text: `Removed from ${t.name}: ${k.line(p)}${inBag ? `\n${plural(inBag, "packing entry")} that were in it stay on the list, out of any bag.` : ""}`, data: { removed: p.id, trip_id: t.id, ...(k.kind === "bags" && { unassigned: inBag }) } };
  }
  const { id, ...fields } = args;
  const patch = columns(k, fields, t, p);
  if (!Object.keys(patch).length) throw new Invalid("Nothing to change.");
  const row = { ...p, ...patch };
  for (const f of k.required) if (!row[f]) throw new Invalid(`A ${k.one} needs ${f}.`);
  k.finish(row, await ctx.parts.list(k.table, t.id));
  const u = await ctx.parts.set(k.table, p.id, { ...patch, ...(row.date !== p.date && row.date && { date: row.date }), ...(row.key !== p.key && row.key && { key: row.key }) });
  return { text: `Changed on ${t.name}: ${k.line(u)}`, data: { trip_id: t.id, ...outOf(k, u) } };
}

export default {
  name: "trip parts",
  records: true,
  tools: TOOLS,
  status: Object.fromEntries(KINDS.flatMap((k) => [
    [k.add, [`Adding the ${k.many}…`, `Added the ${k.many}`]],
    [k.update, [`Changing the ${k.one}…`, `Changed the ${k.one}`]],
    [k.remove, [`Removing the ${k.one}…`, `Removed the ${k.one}`]],
  ])),
  instructions: "", // the tools say it
  call,
};
