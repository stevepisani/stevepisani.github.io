// What a day says, from its events (public.events, supabase/migrations/20261009000100_events.sql):
// the same rules for SJPJr's server (mcp/areas/days.js) and the app, which bundles this file. Rows
// are only ever added, so a day's wore (or journal) is its newest row not in the trash; the older
// ones are its history. Other kinds (visited, ate…) can happen many times a day, so every row counts.
// Plain JavaScript, no imports.

// the kinds a day has one of: logging again replaces what the day says
export const ONE_A_DAY = ["wore", "journal"];

// "2026-10-09 10:00:00.1+00" (Postgres) and "2026-10-09T10:00:00.100Z" (a browser) as one clock
const at = (s) => Date.parse(String(s || "").replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00")) || 0;
export const newest = (a, b) => at(b.created_at) - at(a.created_at) || String(b.id).localeCompare(String(a.id));

/** The events that stand: for a one-a-day kind, each day's newest; every other one as it is. Newest first. */
export function standing(events) {
  const seen = new Set(), out = [];
  for (const e of [...events].filter((x) => !x.deleted_at).sort(newest)) {
    if (ONE_A_DAY.includes(e.kind)) {
      const key = `${e.date}|${e.kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(e);
  }
  return out;
}

/** Each day's record: date → { wore, journal } (each the event that stands, or undefined). */
export function byDay(events) {
  const days = new Map();
  for (const e of standing(events)) {
    if (!ONE_A_DAY.includes(e.kind)) continue;
    if (!days.has(e.date)) days.set(e.date, {});
    days.get(e.date)[e.kind] = e;
  }
  return days;
}

/**
 * How often each garment was worn: item id → { times, dates, last }, one a day at most, from the
 * wore events that stand. `from`, `to` (dates, inclusive) and `trip` (a trip id) narrow it.
 */
export function wears(events, { from = null, to = null, trip = null } = {}) {
  const out = new Map();
  for (const e of standing(events)) {
    if (e.kind !== "wore" || (from && e.date < from) || (to && e.date > to) || (trip && e.trip_id !== trip)) continue;
    for (const id of new Set(e.item_ids || [])) {
      const w = out.get(id) || { times: 0, dates: [], last: null };
      w.times += 1;
      w.dates.push(e.date);
      if (!w.last || e.date > w.last) w.last = e.date;
      out.set(id, w);
    }
  }
  for (const w of out.values()) w.dates.sort();
  return out;
}
