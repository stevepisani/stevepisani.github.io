// Places: what Steve saved, starred, reviewed and labeled in Google Maps, and his own maps, one
// of SJPJr's areas (server.js has the protocol and the rules). Brought in from a Google Takeout
// file in the app (assets/js/apps/lib/places.js; public.places,
// supabase/migrations/20261020000100_places.sql). Read here, never changed: what's kept and who
// sees it are Steve's to set in the app. A place goes on a trip's day through plan_days, with its
// place_id. get_today has the few saved near where he is (nearOf, below).
import { WARDROBE_APP as APP, read, Invalid, pick, plural } from "../kit.js";
import { DATE, isDate, span } from "./trip-kit.js";
import { HOME } from "../../_shared/home.js";

const MAX = 50;

const TOOLS = [
  {
    name: "find_places",
    title: "Find saved places",
    description: "Steve's places from Google Maps: starred, saved lists (Want to go, Favorites, his own), places he reviewed (with his stars and words), his labeled places, and maps of his own (\"All The Tiki Bars\"). Near somewhere: near (a place's name: \"Florence\", \"the hotel\" won't do), or lat and lon, or trip_id and date (where that day of the trip is), within radius_km (3 by default), nearest first; or by words (q) and list. Leaves out what he's dismissed, and his labeled places (people's houses) unless list is Labeled. Each has its id, name, lists, rating, what it is, how far, and a Google Maps link. To put one on a trip's day, give plan_days an activity with its place_id.",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Words in its name, address, list, notes or review." },
        list: { type: "string", description: "Only this list (as find_places names them: Starred, Reviewed, Want to go, a map's name…)." },
        near: { type: "string", description: "A place's name, to search around: a city or neighbourhood." },
        lat: { type: "number" },
        lon: { type: "number" },
        trip_id: { type: "string", description: "With date: around where that day of the trip is." },
        date: DATE,
        radius_km: { type: "number", minimum: 0.1, maximum: 100, description: "How far around, in km (3 by default)." },
        status: { type: "string", enum: ["kept", "review", "any"], description: "kept (he's kept it), review (not looked at yet), any (both; the default)." },
        limit: { type: "integer", minimum: 1, maximum: MAX, description: `At most this many (20 by default, ${MAX} at most).` },
      },
      additionalProperties: false,
    },
    annotations: { ...read, openWorldHint: true },
  },
];

const metres = (a, b) => {
  const r = (d) => (d * Math.PI) / 180, dLat = r(b.lat - a.lat), dLon = r(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * 6371000 * Math.asin(Math.sqrt(h)));
};
const mapLink = (p) => p.google_url || (p.lat != null ? `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}` : null);
const far = (m) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);
// a place as the model reads it (never where it was imported from, or who sees it, beyond "private")
export const placeOut = (p, m) => pick({
  id: p.id, name: p.name, lists: p.lists, category: p.category, label: p.label, address: p.address, country_code: p.country_code,
  rating: p.rating, review: p.review, note: p.note, distance_m: m, lat: p.lat, lon: p.lon, map: mapLink(p),
  kept: p.status === "kept" || undefined, not_located: p.lat == null || undefined,
}, ["id", "name", "lists", "category", "label", "address", "country_code", "rating", "review", "note", "distance_m", "lat", "lon", "map", "kept", "not_located"]);
const line = (p, m) => `- ${p.name}${m != null ? ` (${far(m)})` : ""}: ${[p.category, p.lists.join(", "), p.rating && `${p.rating}★`].filter(Boolean).join("; ")} [id ${p.id}]`;

// the saved places within km of a point, nearest first: not dismissed, not a labeled one
export function nearOf(all, at, km = 3, limit = 5) {
  if (!at || at.lat == null) return [];
  return all.filter((p) => p.lat != null && p.status !== "dismissed" && !p.lists.includes("Labeled"))
    .map((p) => ({ p, m: metres(at, p) })).filter((x) => x.m <= km * 1000).sort((a, b) => a.m - b.m).slice(0, limit);
}
// home, by its label in Google Maps (where it is exactly), else the city
export const homeOf = (all) => all.find((p) => p.sensitive === "home" && p.lat != null) || HOME;

async function findPlaces(args, ctx) {
  const limit = Math.min(MAX, Math.max(1, Math.round(Number(args.limit) || 20)));
  const km = args.radius_km === undefined ? 3 : Number(args.radius_km);
  if (!(km > 0 && km <= 100)) throw new Invalid("radius_km is between 0.1 and 100.");
  if ((args.lat === undefined) !== (args.lon === undefined)) throw new Invalid("Give lat and lon together.");
  if (args.date !== undefined && !isDate(args.date)) throw new Invalid(`date is YYYY-MM-DD (not "${args.date}").`);
  const all = await ctx.places.list();
  // where to look around, if anywhere
  let at = null, where = null;
  if (args.lat !== undefined) {
    at = { lat: Number(args.lat), lon: Number(args.lon) };
    if (!(Math.abs(at.lat) <= 90 && Math.abs(at.lon) <= 180)) throw new Invalid("lat and lon aren't a place on Earth.");
    where = `${at.lat}, ${at.lon}`;
  } else if (args.trip_id) {
    const t = await ctx.trips.get(String(args.trip_id));
    if (!t) throw new Invalid("There's no trip with that id (it may be in the trash). list_trips has them.");
    const [a, b] = span(t), date = args.date || a;
    const leg = [...t.legs].reverse().find((l) => l.from <= date && date <= l.to);
    if (!leg) throw new Invalid(`${date} isn't a day of ${t.name} (${a} to ${b}).`);
    at = leg;
    where = `${leg.place} (${t.name}, ${date})`;
  } else if (args.near) {
    const found = /^\s*home\s*$/i.test(args.near) ? homeOf(all) : await ctx.locate(String(args.near));
    if (!found) throw new Invalid(`Couldn't find "${args.near}" on the map. Give a city or neighbourhood, or lat and lon.`);
    at = found;
    where = found.name || found.place || args.near;
  }
  const status = args.status || "any";
  if (!["kept", "review", "any"].includes(status)) throw new Invalid("status is kept, review or any.");
  const q = String(args.q || "").toLowerCase().split(/\s+/).filter(Boolean);
  const list = args.list ? String(args.list).trim().toLowerCase() : null;
  const text = (p) => [p.name, p.address, p.category, p.label, p.note, p.review, ...p.lists].join(" ").toLowerCase();
  let hits = all.filter((p) => p.status !== "dismissed" && (status === "any" || p.status === status)
    && (list ? p.lists.some((l) => l.toLowerCase() === list) : !p.lists.includes("Labeled"))
    && q.every((w) => text(p).includes(w)));
  let rows = hits.map((p) => ({ p, m: at && p.lat != null ? metres(at, p) : null }));
  if (at) rows = rows.filter((x) => x.m != null && x.m <= km * 1000).sort((a, b) => a.m - b.m);
  else rows.sort((a, b) => (b.p.rating || 0) - (a.p.rating || 0) || a.p.name.localeCompare(b.p.name));
  const total = rows.length;
  rows = rows.slice(0, limit);
  const lists = [...new Set(all.filter((p) => p.status !== "dismissed").flatMap((p) => p.lists))];
  const text2 = [
    `${plural(total, "saved place")}${where ? ` within ${km} km of ${where}` : ""}${q.length ? ` matching "${args.q}"` : ""}${args.list ? ` in ${args.list}` : ""}${total > rows.length ? `; the ${rows.length} ${at ? "nearest" : "best rated"}` : ""}:`,
    rows.length ? rows.map(({ p, m }) => line(p, m)).join("\n") : all.length ? "None." : "None yet: Steve hasn't brought in his Google Maps places (the Places tab in the app).",
    !args.list && lists.length ? `Lists: ${lists.join(", ")}.` : "",
    `In the app: ${APP}#places`,
  ].filter(Boolean).join("\n");
  return { text: text2, data: { ...(where && { near: where, radius_km: km }), total, places: rows.map(({ p, m }) => placeOut(p, m ?? undefined)), lists } };
}

async function call(name, args, ctx) {
  if (name === "find_places") return findPlaces(args, ctx);
  throw new Invalid(`There's no tool called ${name}.`);
}

export default {
  name: "places",
  records: true,
  tools: TOOLS,
  status: { find_places: ["Looking through saved places…", "Looked through saved places"] },
  instructions: "Places: find_places; plan_days takes a place_id.",
  call,
};
