// Weather for a trip's legs, from Open-Meteo (free, no key; https://open-meteo.com): where a place
// is, then its forecast when the dates are within 15 days, or else what those dates were like the
// last three years (the same days, averaged), labelled as typical. Plain JavaScript: the wardrobe's
// MCP server uses it on the server, and the app bundles the same file for the browser.
const GEO = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE = "https://archive-api.open-meteo.com/v1/archive";
const AHEAD = 15; // days the forecast reaches
// what's asked of the forecast: each day, and (for the app) each hour of today and tomorrow
const DAILY = "weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,precipitation_sum,sunrise,sunset,uv_index_max,wind_speed_10m_max";
const HOURLY = "temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,is_day,wind_speed_10m";

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

/**
 * A WMO weather code (what Open-Meteo gives) in plain words: "Light rain", "Partly cloudy". By
 * night, "Clear" for "Sunny". Null for a code it doesn't know (or none).
 */
export function conditionOf(code, day = true) {
  const words = {
    0: day ? "Sunny" : "Clear", 1: day ? "Mostly sunny" : "Mostly clear", 2: "Partly cloudy", 3: "Cloudy", 45: "Fog", 48: "Freezing fog",
    51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 56: "Freezing drizzle", 57: "Freezing drizzle",
    61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Freezing rain",
    71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains", 80: "Showers", 81: "Showers", 82: "Heavy showers",
    85: "Snow showers", 86: "Heavy snow showers", 95: "Thunderstorms", 96: "Thunderstorms with hail", 99: "Thunderstorms with hail",
  };
  return words[code] ?? null;
}

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
 *
 * A forecast day also has `code` (WMO weather code; conditionOf says it in words), `feelsHi` and
 * `feelsLo` (°C), `mm` (rain, mm), `sunrise` and `sunset` (local time there, "2026-10-15T07:21"),
 * `uv` (the day's highest UV index) and `wind` (its strongest wind, km/h); a typical day has `mm`,
 * the average. `timezone` is the place's. With { hourly: true } (the app; never the MCP server,
 * whose answers stay short) there's also `hours`: each hour of today and tomorrow that falls in
 * the leg, { time (local, "2026-10-15T14:00"), temp, feels, rain (%), mm, code, day (daylight),
 * wind }.
 */
export async function legWeather(leg, today = iso(new Date()), { hourly = false } = {}) {
  const { lat, lon, from, to } = leg;
  if (lat == null || lon == null || !from || !to || to < from) return null;
  const q = `latitude=${lat}&longitude=${lon}&timezone=auto`, horizon = shift(today, AHEAD - 1);
  let days = [], hours, timezone;
  const start = from < today ? today : from, end = to > horizon ? horizon : to;
  if (start <= end) {
    // the hours: today and tomorrow, where they're in the leg
    const h0 = start, h1 = [shift(today, 1), end].sort()[0];
    const r = await get(`${FORECAST}?${q}&daily=${DAILY}&start_date=${start}&end_date=${end}${hourly && h0 <= h1 ? `&hourly=${HOURLY}&start_hour=${h0}T00:00&end_hour=${h1}T23:00` : ""}`).catch(() => null);
    const d = r?.daily;
    timezone = r?.timezone;
    if (d) {
      const at = (key, i) => d[key]?.[i] ?? null;
      days = d.time.map((date, i) => ({
        date, hi: at("temperature_2m_max", i), lo: at("temperature_2m_min", i), rain: at("precipitation_probability_max", i), kind: "forecast",
        code: at("weather_code", i), feelsHi: at("apparent_temperature_max", i), feelsLo: at("apparent_temperature_min", i), mm: at("precipitation_sum", i),
        sunrise: at("sunrise", i), sunset: at("sunset", i), uv: at("uv_index_max", i), wind: at("wind_speed_10m_max", i),
      }));
    }
    const h = r?.hourly;
    if (h?.time) {
      const at = (key, i) => h[key]?.[i] ?? null;
      hours = h.time.map((time, i) => ({ time, temp: at("temperature_2m", i), feels: at("apparent_temperature", i), rain: at("precipitation_probability", i), mm: at("precipitation", i), code: at("weather_code", i), day: at("is_day", i) !== 0, wind: at("wind_speed_10m", i) }))
        .filter((x) => x.temp != null);
    }
  }
  // beyond the forecast: the same dates in each of the last three years, averaged day by day
  const rest = to > horizon ? (from > horizon ? from : shift(horizon, 1)) : null;
  if (rest) {
    const years = await Promise.all([1, 2, 3].map((y) => get(`${ARCHIVE}?${q}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&start_date=${shift(rest, 0, -y)}&end_date=${shift(to, 0, -y)}`).then((r) => { timezone ??= r.timezone; return r.daily; }).catch(() => null)));
    const got = years.filter(Boolean);
    if (got.length) {
      const avg = (key, i) => { const v = got.map((y) => y[key][i]).filter((x) => x != null); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null; };
      const chance = (i) => Math.round((100 * got.filter((y) => y.precipitation_sum[i] >= 1).length) / got.length);
      days = days.concat(Array.from({ length: got[0].time.length }, (_, i) => ({ date: shift(rest, i), hi: avg("temperature_2m_max", i), lo: avg("temperature_2m_min", i), rain: chance(i), kind: "typical", mm: avg("precipitation_sum", i) })));
    }
  }
  if (!days.length) return null;
  const kinds = new Set(days.map((d) => d.kind));
  return { kind: kinds.size > 1 ? "mixed" : [...kinds][0], days, summary: sum(days), ...(timezone && { timezone }), ...(hours?.length && { hours }) };
}

function sum(days) {
  const vals = (k) => days.map((d) => d[k]).filter((x) => x != null);
  const mean = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
  return { hi: mean(vals("hi")), lo: mean(vals("lo")), wet: Math.round(days.reduce((n, d) => n + (d.rain ?? 0), 0) / 100) }; // expected days of rain
}
