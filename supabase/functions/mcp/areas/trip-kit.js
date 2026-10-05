// What the trip areas share (trips.js, packing.js, trip-parts.js): the kinds of things, the checks
// on what a tool is given, and a trip read whole. Not an area itself. The data is in
// supabase/migrations/20261004000200_trips.sql and 20261005000500_trip_details.sql.
import { Invalid, pick } from "../kit.js";

// The kinds. Checked here, not in the database, so a new one is a word added to a list.
export const TRAVELER_TYPES = ["adult", "child", "infant", "other"];
export const CATEGORIES = ["clothing", "shoes", "toiletries", "medicine", "baby", "electronics", "documents", "work", "accessories", "gear", "misc"];
export const STATUSES = ["needed", "to_buy", "ready", "packed"];
export const BAG_TYPES = ["checked", "carry_on", "personal_item", "stroller", "day_bag", "other"];
export const TRANSPORT_TYPES = ["flight", "train", "car", "taxi", "transfer", "ferry", "bus", "other"];
export const ACTIVITY_TYPES = ["travel", "work", "sightseeing", "dining", "event", "outdoor", "formal", "exercise", "free_time", "other"];
export const RESOURCE_TYPES = ["insurance", "ticket", "reservation", "booking", "document", "other"];
export const SHARED = "shared"; // a packing entry or bag for everyone, not one traveler
export const PARTS = { packing: "trip_packing", bags: "trip_bags", transport: "trip_transport", lodging: "trip_lodging", resources: "trip_resources" };

export const DATE = { type: "string", description: "YYYY-MM-DD." };
export const isDate = (d) => typeof d === "string" && /^\d{4}-\d\d-\d\d$/.test(d) && !isNaN(new Date(`${d}T12:00:00Z`)) && new Date(`${d}T12:00:00Z`).toISOString().startsWith(d);
export const addDays = (d, n) => new Date(new Date(`${d}T12:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);
export const datesFrom = (a, b) => { const out = []; for (let d = a; a && d <= b; d = addDays(d, 1)) out.push(d); return out; };
export const span = (t) => (t.legs.length ? [t.legs[0].from, t.legs[t.legs.length - 1].to] : [null, null]);
export const fmt = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
export const tripLine = (t) => { const [a, b] = span(t); return `${t.name}: ${t.legs.map((l) => `${l.place} ${fmt(l.from)}–${fmt(l.to)}`).join(", ") || "no legs"}${a ? ` (${a} to ${b})` : ""} [id ${t.id}]`; };
export const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
export const uuid = () => crypto.randomUUID();
// a key from a name: "Steve's carry-on" → "steve_s_carry_on"
export const keyOf = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
export const wardrobeCategory = (c) => (c === "shoes" ? "shoes" : c === "accessories" ? "accessories" : "clothing");

// What a tool was given, checked. undefined: not given (leave it); null: given empty (clear it).
export function str(v, max, what, { required = false } = {}) {
  if (v === undefined) { if (required) throw new Invalid(`${what} is needed.`); return undefined; }
  const s = v === null ? "" : String(v).trim();
  if (!s) { if (required) throw new Invalid(`${what} can't be empty.`); return null; }
  return s.slice(0, max);
}
export function oneOf(v, list, what) {
  if (v === undefined) return undefined;
  if (!list.includes(v)) throw new Invalid(`${what} is one of: ${list.join(", ")} (not "${v}").`);
  return v;
}
export function date(v, what, { required = false } = {}) {
  if (v === undefined || v === null || v === "") { if (required) throw new Invalid(`${what} is needed (YYYY-MM-DD).`); return v === undefined ? undefined : null; }
  if (!isDate(v)) throw new Invalid(`${what} is a date, YYYY-MM-DD (not "${v}").`);
  return v;
}
export function url(v, what) {
  const s = str(v, 2000, what);
  if (s && !/^https?:\/\/\S+$/i.test(s)) throw new Invalid(`${what} is a web address starting https:// (not "${s}").`);
  return s;
}
// A time as given, kept as given: ISO 8601, with the place's UTC offset when it's known (a time
// without one is local to where it happens; no time zone is ever assumed). "HH:MM" alone is on `day`.
const TIME = /^(\d{4}-\d\d-\d\d)T([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d(\.\d+)?)?(Z|[+-](0\d|1[0-4]):[0-5]\d)?$/;
export function time(v, what, day) {
  if (v === undefined) return undefined;
  const s = v === null ? "" : String(v).trim();
  if (!s) return null;
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) {
    if (!day) throw new Invalid(`${what}: give the date too ("2026-10-13T11:15"), or the transport's date.`);
    return `${day}T${s}`;
  }
  const m = TIME.exec(s);
  if (!m || !isDate(m[1])) throw new Invalid(`${what} is an ISO 8601 date and time, with the UTC offset where it's known: "2026-10-13T11:15:00+01:00", or "2026-10-13T11:15" for local time (not "${s}").`);
  return s;
}
export const timeDay = (s) => (s ? s.slice(0, 10) : null);
export const timeOfDay = (s) => (s ? s.slice(11, 16) : null);
export const hasOffset = (s) => /(Z|[+-]\d\d:\d\d)$/.test(s || "");
export const clock = (v, what) => {
  if (v === undefined) return undefined;
  const s = v === null ? "" : String(v).trim();
  if (!s) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) throw new Invalid(`${what} is a local time, HH:MM (not "${s}").`);
  return s;
};

// A trip with the parts asked for, read at once. A trip in the trash isn't found.
export async function whole(ctx, id, which = Object.keys(PARTS)) {
  const t = await ctx.trips.get(String(id || ""));
  if (!t) throw new Invalid("There's no trip with that id (it may be in the trash: list_trash). list_trips has them.");
  const out = { t: { ...t, travelers: t.travelers || [], days: t.days || [] } };
  await Promise.all(which.map(async (k) => { out[k] = await ctx.parts.list(PARTS[k], t.id); }));
  return out;
}
// A packing entry (or other part) by its own id, with its trip
export async function partOf(ctx, kind, id, what) {
  const p = await ctx.parts.get(PARTS[kind], String(id || ""));
  const t = p && (await ctx.trips.get(p.trip_id));
  if (!p || !t) throw new Invalid(`There's no ${what} with that id. get_trip lists them, with their ids.`);
  return { p, t: { ...t, travelers: t.travelers || [], days: t.days || [] } };
}

// A traveler named by key or id: its key. "shared" is everyone's; null clears.
export function travelerKey(t, v, what = "traveler") {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const s = String(v).trim();
  if (s.toLowerCase() === SHARED) return SHARED;
  const hit = t.travelers.find((x) => x.key === s || x.id === s) || t.travelers.find((x) => x.key === s.toLowerCase() || x.name.toLowerCase() === s.toLowerCase());
  if (!hit) throw new Invalid(`${what} "${s}" isn't on this trip. Its travelers: ${t.travelers.map((x) => x.key).join(", ") || "none yet (update_trip adds them)"}; or "${SHARED}".`);
  return hit.key;
}
// A bag named by key or id: the bag. null clears.
export function bagOf(bags, v) {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const s = String(v).trim();
  const hit = bags.find((b) => b.id === s || b.key === s) || bags.find((b) => b.key === keyOf(s));
  if (!hit) throw new Invalid(`There's no bag "${s}" on this trip. Its bags: ${bags.map((b) => b.key).join(", ") || "none yet (add_trip_bags)"}.`);
  return hit;
}

// How a packing entry reads, to the model and the card: by keys, nothing empty
export const entryOut = (p, bagsById) => pick({ id: p.id, item_id: p.item_id, label: p.label, traveler: p.traveler_key, category: p.category, qty: p.qty, status: p.status, bag: bagsById.get(p.bag_id)?.key, essential: p.essential || undefined, notes: p.notes }, ["id", "item_id", "label", "traveler", "category", "qty", "status", "bag", "essential", "notes"]);
// Counts of a set of entries, by status
export function tally(entries) {
  const out = { total_entries: entries.length, total_units: 0, packed: 0, ready: 0, needed: 0, to_buy: 0 };
  for (const p of entries) { out.total_units += p.qty; out[p.status] += 1; }
  return out;
}
// The order things happen: transport by date and local time, lodging by check-in
export const byWhen = {
  transport: (a, b) => (a.date + (timeOfDay(a.departure_time) || "99")).localeCompare(b.date + (timeOfDay(b.departure_time) || "99")),
  lodging: (a, b) => (a.check_in + a.check_out).localeCompare(b.check_in + b.check_out),
};
export const transportLine = (x) => `${x.date} ${x.type}${x.carrier || x.number ? ` ${[x.carrier, x.number].filter(Boolean).join(" ")}` : ""}: ${x.origin}${x.origin_code ? ` (${x.origin_code})` : ""} → ${x.destination}${x.destination_code ? ` (${x.destination_code})` : ""}${x.departure_time ? `, departs ${x.departure_time}` : ""}${x.arrival_time ? `, arrives ${x.arrival_time}` : ""}${x.confirmation ? `, confirmation ${x.confirmation}` : ""} [id ${x.id}]`;
export const lodgingLine = (x) => `${x.name}${x.place ? `, ${x.place}` : ""}: ${x.check_in} to ${x.check_out}${x.address ? ` (${x.address})` : ""}${x.confirmation ? `, confirmation ${x.confirmation}` : ""} [id ${x.id}]`;
