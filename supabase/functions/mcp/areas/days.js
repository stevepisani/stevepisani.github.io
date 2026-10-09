// Days: what each day holds and what happened in it, one of SJPJr's areas (server.js has the
// protocol and the rules). get_today is a day in one call (where Steve is, its weather, the outfit
// planned, what he's logged, the next journey and tonight's stay); log_day records what he wore and
// a line about the day; get_history reads it back, with how often each garment was worn. The
// record is public.events (supabase/migrations/20261009000100_events.sql): rows only added, the
// newest for a day standing (_shared/days.js, which the app uses too), each with how it was known.
import { WARDROBE_APP as APP, read, write, Invalid, pick } from "../kit.js";
import { DATE, isDate, addDays, span, fmt, plural, str, byWhen, transportLine, lodgingLine, timeDay, timeOfDay } from "./trip-kit.js";
import { garmentsOf } from "./trips.js";
import { HOME } from "../../_shared/home.js";
import { conditionOf } from "../../_shared/weather.js";
import { ONE_A_DAY, standing, byDay, wears } from "../../_shared/days.js";

const KINDS = ONE_A_DAY; // what log_day records today; get_history reads any kind
const MAX_DAYS = 400; // the longest history one call reads

const TOOLS = [
  {
    name: "get_today",
    title: "Get today",
    description: "Everything about one day in one call, the call to start with for \"what should I wear today\" or anything about today: the date and where Steve is (the trip leg he's on, else home; today is by that place's clock); the weather; the outfit planned (names and photo ids); what's been logged as worn and the day's journal line; the day's activities; the next journey and tonight's stay; the \"In the app\" link. date: another day instead (YYYY-MM-DD).",
    inputSchema: { type: "object", properties: { date: DATE }, additionalProperties: false },
    annotations: { ...read, openWorldHint: true },
  },
  {
    name: "log_day",
    title: "Log what happened",
    description: "Records what Steve wore on a day, a line about it, or both, when he says so; the day is today where he is unless date is given (never a day to come). wore: wardrobe item ids from find_items, or the garments' names as he said them (each must match one garment; an unclear one is refused with the candidates); or as_planned: true for the outfit planned that day. Logging a day again replaces what it says (the earlier record is kept as its history); wore: [] clears what's logged as worn, journal: \"\" the line. Pass what he said in said, and client_ref always (a retry returns what was stored). dry_run shows what would be stored. Returns what was stored.",
    inputSchema: {
      type: "object",
      properties: {
        date: DATE,
        wore: { type: "array", items: { type: "string" }, description: "Wardrobe item ids, or names (\"the navy oxford\")." },
        as_planned: { type: "boolean", description: "He wore the day's planned outfit (get_today has it). Instead of wore." },
        journal: { type: ["string", "null"], description: "One line about the day, in his words (500 characters at most)." },
        said: { type: "string", description: "What Steve said, as he said it: kept as the evidence." },
        client_ref: { type: "string", description: "Your own id for this entry, the same on a retry." },
        dry_run: { type: "boolean" },
      },
      additionalProperties: false,
    },
    annotations: { ...write, idempotentHint: true },
  },
  {
    name: "get_history",
    title: "Get what happened",
    description: "What was logged over a range of days, newest first: each day's wore (garment ids) and journal line, with how each was recorded; and how many days each garment was worn, so you can say what's been worn most and, against find_items or a trip's packing, what hasn't. from and to (YYYY-MM-DD) default to the last 30 days; trip_id narrows it to that trip (and its dates, if from and to aren't given) and adds the packed garments not worn yet. kind narrows it to wore or journal.",
    inputSchema: {
      type: "object",
      properties: { from: DATE, to: DATE, trip_id: { type: "string" }, kind: { type: "string", description: "wore or journal; left out, both." } },
      additionalProperties: false,
    },
    annotations: read,
  },
];

// ---------- Where Steve is, and what day it is there ----------
// A place's date and clock now ("2026-10-09", "14:05"), by its IANA time zone
const dateIn = (tz, now) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
const clockIn = (tz, now) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
// with no zone to hand (the weather couldn't be asked), one from the longitude: close, without summer time
const zoneNear = (lon) => { const h = Math.round(lon / 15); return h ? `Etc/GMT${h > 0 ? "-" : "+"}${Math.abs(h)}` : "UTC"; };
// on a travel day, the place you're going to (as the app has it)
const legOn = (t, date) => [...t.legs].reverse().find((l) => l.from <= date && date <= l.to);
const tripOn = (trips, date) => trips.filter((t) => { const [a, b] = span(t); return a && a <= date && date <= b; }).sort((x, y) => span(x)[0].localeCompare(span(y)[0]))[0] || null;

// The weather where a place is, for one day, asked once a call (`seen`). Its timezone comes with it.
function weatherOf(ctx, seen, p, date) {
  const key = `${p.lat},${p.lon},${date}`;
  if (!seen.has(key)) seen.set(key, ctx.weather({ lat: p.lat, lon: p.lon, from: date, to: date }).catch(() => null));
  return seen.get(key);
}
// a place's time zone: the weather's for today (the forecast always has today, whatever the date asked)
const zoneOf = async (ctx, seen, p) => (await weatherOf(ctx, seen, p, new Date().toISOString().slice(0, 10)))?.timezone || zoneNear(p.lon);

// Where Steve is on a date: the leg of the trip that's on then, else home
async function whereOn(ctx, seen, trips, date) {
  const t = tripOn(trips, date), leg = t && legOn(t, date);
  if (!leg) return { at: "home", place: HOME.place, country: HOME.country, lat: HOME.lat, lon: HOME.lon, timezone: HOME.timezone };
  return { at: "trip", trip: t, leg, place: leg.place, country: leg.country, lat: leg.lat, lon: leg.lon, timezone: await zoneOf(ctx, seen, leg) };
}
// Today, where he is: home's date first, then the trip leg's own if he's away (Florence is a day
// ahead of Philadelphia from 6 PM there); the day before and after are tried, for a trip that
// starts or ends around now
async function todayWhere(ctx, seen, trips, now) {
  const home = dateIn(HOME.timezone, now);
  for (const d of [home, addDays(home, 1), addDays(home, -1)]) {
    const w = await whereOn(ctx, seen, trips, d);
    if (w.at !== "trip") continue;
    const local = dateIn(w.timezone, now);
    if (local === d) return { ...w, date: d };
    const w2 = await whereOn(ctx, seen, trips, local);
    if (w2.at === "trip" && dateIn(w2.timezone, now) === local) return { ...w2, date: local };
  }
  return { ...(await whereOn(ctx, seen, [], home)), date: home };
}
// The date asked for (checked), or today; with where he is that day
async function dayOf(ctx, date) {
  const seen = new Map(), trips = await ctx.trips.list(), now = ctx.now?.() || new Date();
  const today = await todayWhere(ctx, seen, trips, now);
  if (date === undefined || date === null || date === "" || date === today.date) return { ...today, today: today.date, now, seen, trips };
  if (!isDate(date)) throw new Invalid(`date is YYYY-MM-DD (not "${date}").`);
  return { ...(await whereOn(ctx, seen, trips, date)), date, today: today.date, now, seen, trips };
}

// ---------- The record ----------
const ago = (e) => String(e.created_at || "").replace(" ", "T").slice(0, 16);
// an event as the model reads it (a wore always has its item_ids, if empty: cleared)
const eventOut = (e) => ({ ...pick({ id: e.id, date: e.date, kind: e.kind, item_ids: e.item_ids, text: e.text, trip_id: e.trip_id, data: e.data, source: e.source, recorded_by: e.recorded_by, evidence: e.evidence, logged_at: ago(e) }, ["id", "date", "kind", "item_ids", "text", "trip_id", "data", "source", "recorded_by", "evidence", "logged_at"]), ...(e.kind === "wore" && { item_ids: e.item_ids || [] }) });
// who sent it from a chat: the app that's signed in (its OAuth client), when the token says
const sender = (ctx) => (ctx.client ? `assistant (${ctx.client})` : "assistant");

// garments named by id or by what Steve called them: one each, or the candidates to choose from
const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function resolve(words, items) {
  const out = [], named = [];
  for (const w of words) {
    const s = String(w ?? "").trim();
    if (!s) continue;
    if (UUID.test(s)) {
      if (!items.some((i) => i.id === s)) throw new Invalid(`Not in the wardrobe: ${s}. Use ids from find_items, or the garment's name.`);
      out.push(s);
      named.push({ said: s, item_id: s, by: "id" });
      continue;
    }
    const n = norm(s).replace(/^(my|the|a|an) /, ""), words2 = n.split(" ").filter(Boolean);
    const text = (i) => norm([i.name, i.brand, i.colour, i.manufacturer_colour, i.material, i.subcategory, i.category].join(" "));
    // the exact name first; else every word in what it is; the closet before what's retired
    let hits = items.filter((i) => norm(i.name) === n);
    let by = "name";
    if (!hits.length) { hits = items.filter((i) => words2.every((x) => text(i).split(" ").some((y) => y === x || y.startsWith(x)))); by = "words"; }
    if (hits.length > 1 && hits.some((i) => !i.retired)) hits = hits.filter((i) => !i.retired);
    if (!hits.length) throw new Invalid(`No garment matches "${s}". find_items has them; pass the id.`);
    if (hits.length > 1) throw new Invalid(`"${s}" could be: ${hits.slice(0, 8).map((i) => `${i.name}${i.manufacturer_colour || i.colour ? ` (${i.manufacturer_colour || i.colour})` : ""} [id ${i.id}]`).join("; ")}. Pass the id.`);
    out.push(hits[0].id);
    named.push({ said: s, item_id: hits[0].id, by });
  }
  return { ids: [...new Set(out)], named };
}

// what a day's garments are, by name and photo, inline
const outfit = (ids, garments) => (ids || []).map((id) => ({ id, ...garments[id] }));
const names = (ids, garments) => (ids || []).map((id) => garments[id]?.name || "(no longer in the wardrobe)").join(", ") || "nothing";
const weatherOut = (d) => d && pick({ hi: d.hi == null ? undefined : Math.round(d.hi), lo: d.lo == null ? undefined : Math.round(d.lo), rain: d.rain, condition: conditionOf(d.code) || undefined, kind: d.kind, feels_hi: d.feelsHi == null ? undefined : Math.round(d.feelsHi), feels_lo: d.feelsLo == null ? undefined : Math.round(d.feelsLo), mm: d.mm, wind: d.wind == null ? undefined : Math.round(d.wind), uv: d.uv, sunrise: d.sunrise, sunset: d.sunset }, ["hi", "lo", "rain", "condition", "kind", "feels_hi", "feels_lo", "mm", "wind", "uv", "sunrise", "sunset"]);
const activityLine = (x) => `${x.start_time ? `${x.start_time}${x.end_time ? `–${x.end_time}` : ""} ` : ""}${x.title}${x.type ? ` (${x.type})` : ""}${x.location ? ` at ${x.location}` : ""}`;
// "Thursday 15 October 2026", the same in Node and Deno (whose date formats differ by a comma)
const longDay = (d) => { const x = new Date(`${d}T12:00:00Z`), f = (o) => x.toLocaleDateString("en-GB", { ...o, timeZone: "UTC" }); return `${f({ weekday: "long" })} ${f({ day: "numeric" })} ${f({ month: "long" })} ${f({ year: "numeric" })}`; };

// ---------- get_today ----------
async function getToday(args, ctx) {
  const w = await dayOf(ctx, args.date);
  const { date, trip: t } = w, isToday = date === w.today;
  const plan = t ? (t.days || []).find((d) => d.date === date) || null : null;
  const [weather, events] = await Promise.all([weatherOf(ctx, w.seen, w, date), ctx.events.list({ from: date, to: date })]);
  const day = byDay(events).get(date) || {};
  // the next journey from then, on any trip not over yet; and that night's bed
  const ahead = w.trips.filter((x) => (span(x)[1] || "") >= addDays(date, -1));
  const [journeys, beds] = await Promise.all([
    Promise.all(ahead.map((x) => ctx.parts.list("trip_transport", x.id))).then((r) => r.flat()),
    t ? ctx.parts.list("trip_lodging", t.id) : [],
  ]);
  const clock = isToday ? clockIn(w.timezone, w.now) : null;
  // a journey today that's already arrived (by the place's clock) is behind you
  const done = (g) => isToday && g.date === date && clock && (() => { const end = timeDay(g.arrival_time) === date ? timeOfDay(g.arrival_time) : !g.arrival_time ? timeOfDay(g.departure_time) : null; return end && end < clock; })();
  const next = journeys.filter((g) => g.date >= date && !done(g)).sort(byWhen.transport)[0] || null;
  const bed = beds.find((l) => l.check_in <= date && date < l.check_out) || null;
  const garments = await garmentsOf([...new Set([...(plan?.items || []), ...(day.wore?.item_ids || [])])], ctx);
  const wx = weatherOut(weather?.days?.find((d) => d.date === date));
  const [a, b] = t ? span(t) : [null, null];
  const where = pick({ at: w.at, place: w.place, country: w.country, timezone: w.timezone, local_time: clock || undefined, trip: t ? { id: t.id, name: t.name, day: Math.round((Date.parse(date) - Date.parse(a)) / 864e5) + 1, days: Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1 } : undefined }, ["at", "place", "country", "timezone", "local_time", "trip"]);
  // (items always there, if empty: cleared)
  const worn = day.wore ? { items: outfit(day.wore.item_ids, garments), ...pick({ as_planned: day.wore.evidence?.as_planned, event_id: day.wore.id, logged_at: ago(day.wore), source: day.wore.source, recorded_by: day.wore.recorded_by }, ["as_planned", "event_id", "logged_at", "source", "recorded_by"]) } : null;
  const journal = day.journal?.text ? { text: day.journal.text, event_id: day.journal.id, logged_at: ago(day.journal), source: day.journal.source } : null;
  const link = t && !isToday ? `${APP}#trip/${t.id}` : `${APP}#today`;
  const text = [
    `${isToday ? "Today" : date < w.today ? "That day" : "Ahead"}: ${longDay(date)}, ${w.at === "trip" ? `in ${w.place}${w.country ? `, ${w.country}` : ""}` : `at home in ${w.place}`}${(() => { const bits = [t && `day ${where.trip.day} of ${where.trip.days} of ${t.name}`, clock && `${clock} there`].filter(Boolean).join("; "); return bits ? ` (${bits})` : ""; })()}.`,
    wx ? `Weather: ${wx.condition ? `${wx.condition}, ` : ""}${wx.hi}°/${wx.lo}°C, ${wx.rain ?? "?"}% chance of rain${wx.kind === "typical" ? " (typical for the date, not a forecast)" : ""}.` : "Weather: unavailable for this day.",
    plan ? `Planned: ${plan.occasion ? `${plan.occasion}. ` : ""}Outfit: ${plan.items?.length ? names(plan.items, garments) : "none yet"}${plan.note ? ` (${plan.note})` : ""}.` : w.at === "trip" ? "Nothing planned for this day." : "Nothing planned (at home).",
    plan?.activities?.length ? `Activities: ${plan.activities.map(activityLine).join("; ")}.` : "",
    worn ? `Worn: ${worn.items.length ? names(day.wore.item_ids, garments) : "cleared"}${worn.as_planned ? " (as planned)" : ""}; logged ${worn.logged_at} via ${worn.source}.` : `Worn: not logged yet${plan?.items?.length && date <= w.today ? " (log_day with as_planned: true if he wore the plan)" : ""}.`,
    journal ? `Journal: "${journal.text}"` : "Journal: nothing yet.",
    next ? `Next journey: ${transportLine(next)}` : "",
    bed ? `Tonight: ${lodgingLine(bed)}${bed.check_out === addDays(date, 1) ? " (check out tomorrow)" : ""}` : "",
    `In the app: ${link}`,
  ].filter(Boolean).join("\n");
  const strip = (r, keys) => pick(r, keys);
  return {
    text,
    data: {
      date, today: isToday, where,
      weather: wx || null,
      planned: plan ? pick({ occasion: plan.occasion, note: plan.note, items: outfit(plan.items, garments) }, ["occasion", "note", "items"]) : null,
      activities: plan?.activities || [],
      worn, journal,
      next_journey: next && strip(next, ["id", "trip_id", "type", "date", "origin", "destination", "origin_code", "destination_code", "departure_time", "arrival_time", "carrier", "number", "confirmation"]),
      tonight: bed && strip(bed, ["id", "name", "place", "address", "check_in", "check_out", "confirmation"]),
      link,
    },
  };
}

// ---------- log_day ----------
async function logDay(args, ctx) {
  const ref = str(args.client_ref, 200, "client_ref");
  if (ref) {
    const had = (await Promise.all(KINDS.map((k) => ctx.events.byRef(`${ref}:${k}`)))).filter(Boolean);
    if (had.length) return { text: `Already logged (client_ref ${ref}): ${had.map((e) => `${e.kind} on ${e.date}`).join(", ")}.`, data: { date: had[0].date, stored: had.map(eventOut), repeated: true } };
  }
  if (args.wore !== undefined && !Array.isArray(args.wore)) throw new Invalid("wore is a list of garment ids or names.");
  if (args.wore !== undefined && args.as_planned) throw new Invalid("Give wore or as_planned: true, not both.");
  if (args.wore === undefined && !args.as_planned && args.journal === undefined) throw new Invalid("Nothing to log: give wore (or as_planned: true), journal, or both.");
  const w = await dayOf(ctx, args.date);
  if (w.date > w.today) throw new Invalid(`${w.date} hasn't happened yet (it's ${w.today} where Steve is). Plan it with plan_days instead.`);
  const t = w.trip, plan = t ? (t.days || []).find((d) => d.date === w.date) : null, planned = plan?.items || [];
  const said = str(args.said, 1000, "said");
  const base = { date: w.date, trip_id: t?.id || null, source: "mcp", recorded_by: sender(ctx) };
  const rows = [];
  if (args.wore !== undefined || args.as_planned) {
    let ids, named;
    if (args.as_planned) {
      if (!planned.length) throw new Invalid(`Nothing was planned to wear on ${w.date}. Give what he wore in wore.`);
      ids = [...planned];
    } else ({ ids, named } = resolve(args.wore, await ctx.items.list()));
    const asPlanned = !!planned.length && ids.length === planned.length && ids.every((i) => planned.includes(i));
    rows.push({ ...base, kind: "wore", item_ids: ids, evidence: pick({ planned: planned.length ? planned : undefined, as_planned: planned.length ? asPlanned : undefined, named: named?.length ? named : undefined, said }, ["planned", "as_planned", "named", "said"]), client_ref: ref ? `${ref}:wore` : null });
  }
  if (args.journal !== undefined) {
    const line = args.journal === null ? null : String(args.journal).trim().replace(/\s+/g, " ");
    if (line && line.length > 500) throw new Invalid("journal is one line: 500 characters at most.");
    rows.push({ ...base, kind: "journal", text: line || null, evidence: pick({ said }, ["said"]), client_ref: ref ? `${ref}:journal` : null });
  }
  const garments = await garmentsOf(rows.find((r) => r.kind === "wore")?.item_ids || [], ctx);
  const wore = rows.find((r) => r.kind === "wore"), line = rows.find((r) => r.kind === "journal");
  const summary = [
    wore && (wore.item_ids.length ? `wore ${names(wore.item_ids, garments)}${wore.evidence.as_planned ? " (as planned)" : planned.length ? " (not the planned outfit)" : ""}` : "what was worn cleared"),
    line && (line.text ? `journal "${line.text}"` : "the journal line cleared"),
  ].filter(Boolean).join("; ");
  const where = t ? `${w.place}, ${t.name}` : "at home";
  if (args.dry_run) return { text: `Dry run, nothing stored. For ${fmt(w.date)} (${where}): ${summary}.`, data: { date: w.date, dry_run: true, would_store: rows.map(eventOut), garments } };
  // stamped after the day's newest, so this is what the day says even if the phone that logged
  // the last one had its clock ahead
  const newest = Math.max(0, ...(await ctx.events.list({ from: w.date, to: w.date })).map((e) => Date.parse(String(e.created_at).replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00")) || 0));
  const at = new Date(Math.max((ctx.now?.() || new Date()).getTime(), newest + 1)).toISOString();
  const stored = await ctx.events.add(rows.map((r) => ({ ...r, created_at: at })));
  return {
    text: `Logged for ${fmt(w.date)} (${where}): ${summary}.\nIn the app: ${APP}#today`,
    data: { date: w.date, stored: stored.map(eventOut), garments },
  };
}

// ---------- get_history ----------
async function getHistory(args, ctx) {
  const kind = args.kind === undefined || args.kind === null || args.kind === "" ? null : String(args.kind).trim();
  if (kind && !/^[a-z][a-z_]{0,39}$/.test(kind)) throw new Invalid(`kind is a word like wore or journal (not "${kind}").`);
  for (const [k, v] of [["from", args.from], ["to", args.to]]) if (v !== undefined && !isDate(v)) throw new Invalid(`${k} is YYYY-MM-DD (not "${v}").`);
  let t = null;
  if (args.trip_id) {
    t = await ctx.trips.get(String(args.trip_id));
    if (!t) throw new Invalid("There's no trip with that id (it may be in the trash). list_trips has them.");
  }
  const today = (await dayOf(ctx)).today;
  const [a, b] = t ? span(t) : [null, null];
  const to = args.to || (t ? [b, today].sort()[0] : today);
  const from = args.from || (t ? a : addDays(to, -29));
  if (from > to) throw new Invalid(`from (${from}) is after to (${to}).`);
  if ((Date.parse(to) - Date.parse(from)) / 864e5 >= MAX_DAYS) throw new Invalid(`That's more than ${MAX_DAYS} days; ask for a shorter range.`);
  const all = standing(await ctx.events.list({ from, to, trip_id: t?.id }));
  const events = all.filter((e) => !kind || e.kind === kind);
  const counts = wears(all, { from, to, trip: t?.id });
  const ids = [...counts.keys()];
  const packing = t ? await ctx.parts.list("trip_packing", t.id) : [];
  const packed = [...new Set(packing.filter((p) => p.item_id && p.status === "packed").map((p) => p.item_id))];
  const garments = await garmentsOf([...new Set([...ids, ...packed, ...events.flatMap((e) => e.item_ids || [])])], ctx);
  const worn = ids.map((id) => ({ item_id: id, name: garments[id]?.name || "(no longer in the wardrobe)", days: counts.get(id).times, last: counts.get(id).last })).sort((x, y) => y.days - x.days || x.name.localeCompare(y.name));
  const notWorn = t ? packed.filter((id) => !counts.has(id)).map((id) => ({ item_id: id, name: garments[id]?.name || "(no longer in the wardrobe)" })) : undefined;
  const logged = new Set(all.filter((e) => e.kind === "wore" && e.item_ids?.length).map((e) => e.date));
  const line = (e) => `  ${e.date} ${e.kind}: ${e.kind === "wore" ? names(e.item_ids, garments) || "cleared" : e.text ? `"${e.text}"` : e.item_ids?.length ? names(e.item_ids, garments) : "(cleared)"} [${e.source}${e.recorded_by ? `, ${e.recorded_by}` : ""}; id ${e.id}]`;
  const text = [
    `${t ? `${t.name}, ` : ""}${from} to ${to}: ${plural(events.length, "entry")}${kind ? ` (${kind})` : ""}; wear logged on ${plural(logged.size, "day")}.`,
    events.length ? events.map(line).join("\n") : "",
    worn.length ? `Worn most: ${worn.slice(0, 12).map((x) => `${x.name} ${x.days}×`).join(", ")}${worn.length > 12 ? ` and ${worn.length - 12} more` : ""}.` : "Nothing logged as worn in that time.",
    notWorn?.length ? `Packed but not worn yet: ${notWorn.map((x) => x.name).join(", ")}.` : "",
  ].filter(Boolean).join("\n");
  return { text, data: { from, to, ...(t && { trip_id: t.id }), ...(kind && { kind }), days_with_wear: logged.size, events: events.map(eventOut), worn, ...(t && { packed_not_worn: notWorn }) } };
}

async function call(name, args, ctx) {
  if (name === "get_today") return getToday(args, ctx);
  if (name === "log_day") return logDay(args, ctx);
  if (name === "get_history") return getHistory(args, ctx);
  throw new Invalid(`There's no tool called ${name}.`);
}

export default {
  name: "days",
  records: true,
  tools: TOOLS,
  status: {
    get_today: ["Getting today…", "Got today"],
    log_day: ["Logging the day…", "Logged the day"],
    get_history: ["Reading what happened…", "Read what happened"],
  },
  instructions: "Days: log_day when Steve says what he wore or did; get_history for what he's worn.",
  call,
};
