// Weather for a trip's legs, from Open-Meteo (free, no key; https://open-meteo.com): where a place
// is, then its forecast when the dates are within 15 days, or else what those dates were like the
// last three years (the same days, averaged), labelled as typical. Plain JavaScript: the wardrobe's
// MCP server uses it on the server, and the app bundles the same file for the browser.
const GEO = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE = "https://archive-api.open-meteo.com/v1/archive";
const AHEAD = 15; // days the forecast reaches

async function get(url, tries = 2) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (res.ok) return await res.json();
      if (res.status < 500 || i + 1 >= tries) throw new Error(`HTTP ${res.status}`);
    } catch (e) { if (i + 1 >= tries) throw e; }
  }
}
const iso = (d) => d.toISOString().slice(0, 10);
const shift = (date, days = 0, years = 0) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCFullYear(d.getUTCFullYear() + years); d.setUTCDate(d.getUTCDate() + days); return iso(d); };
const daysBetween = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 864e5);

/** Where a place is: { name, country, lat, lon, timezone }, or null. */
export async function locate(place) {
  const data = await get(`${GEO}?name=${encodeURIComponent(place)}&count=1&language=en&format=json`);
  const r = data.results?.[0];
  return r ? { name: r.name, country: r.country, lat: r.latitude, lon: r.longitude, timezone: r.timezone } : null;
}

/**
 * The weather for one leg ({ lat, lon, from, to }, dates YYYY-MM-DD): { kind, days, summary }.
 * Each day is { date, hi, lo, rain, kind }, rain being the chance of rain in %: "forecast" for the
 * days the forecast reaches, "typical" for the rest (the same dates the last three years: the
 * temperatures averaged, the chance being how many of those years it rained, 1 mm or more). `kind` says which the leg has ("forecast", "typical" or "mixed"); `summary` is { hi, lo,
 * wet } in °C, `wet` the days likely to see rain.
 */
export async function legWeather(leg, today = iso(new Date())) {
  const { lat, lon, from, to } = leg;
  if (lat == null || lon == null || !from || !to || to < from) return null;
  const q = `latitude=${lat}&longitude=${lon}&timezone=auto`, horizon = shift(today, AHEAD - 1);
  let days = [];
  const start = from < today ? today : from, end = to > horizon ? horizon : to;
  if (start <= end) {
    const d = (await get(`${FORECAST}?${q}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&start_date=${start}&end_date=${end}`).catch(() => null))?.daily;
    if (d) days = d.time.map((date, i) => ({ date, hi: d.temperature_2m_max[i], lo: d.temperature_2m_min[i], rain: d.precipitation_probability_max[i], kind: "forecast" }));
  }
  // beyond the forecast: the same dates in each of the last three years, averaged day by day
  const rest = to > horizon ? (from > horizon ? from : shift(horizon, 1)) : null;
  if (rest) {
    const years = await Promise.all([1, 2, 3].map((y) => get(`${ARCHIVE}?${q}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&start_date=${shift(rest, 0, -y)}&end_date=${shift(to, 0, -y)}`).then((r) => r.daily).catch(() => null)));
    const got = years.filter(Boolean);
    if (got.length) {
      const avg = (key, i) => { const v = got.map((y) => y[key][i]).filter((x) => x != null); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null; };
      const chance = (i) => Math.round((100 * got.filter((y) => y.precipitation_sum[i] >= 1).length) / got.length);
      days = days.concat(Array.from({ length: got[0].time.length }, (_, i) => ({ date: shift(rest, i), hi: avg("temperature_2m_max", i), lo: avg("temperature_2m_min", i), rain: chance(i), kind: "typical" })));
    }
  }
  if (!days.length) return null;
  const kinds = new Set(days.map((d) => d.kind));
  return { kind: kinds.size > 1 ? "mixed" : [...kinds][0], days, summary: sum(days) };
}

function sum(days) {
  const vals = (k) => days.map((d) => d[k]).filter((x) => x != null);
  const mean = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
  return { hi: mean(vals("hi")), lo: mean(vals("lo")), wet: Math.round(days.reduce((n, d) => n + (d.rain ?? 0), 0) / 100) }; // expected days of rain
}
