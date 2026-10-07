// The weather, drawn (the wardrobe's Today and trip pages; docs/apps.md, "Weather"): what a sky
// is called and which icon it gets, temperatures in °C or °F, the day in a sentence, the hours
// as a strip with a line through them, and the days as Apple Weather draws them, a bar for each
// day's low to high on one scale. The data is _shared/weather.js's, always in °C; it's turned
// into °F only here, when it's shown.
import { el, icon } from './kit.js';
import { conditionOf } from '../../../../supabase/functions/_shared/weather.js';

// ---------- °C or °F: the browser's habit (en-US is °F), until it's set in Settings ----------
const FAHRENHEIT = /-(US|LR|MM|BS|KY|PW|FM|MH)$/i; // the places that still use it
let unit = (() => {
  try { const u = localStorage.getItem('wardrobe-units'); if (u === 'C' || u === 'F') return u; } catch (e) {}
  return FAHRENHEIT.test(navigator.language || '') ? 'F' : 'C';
})();
export const units = () => unit;
export function setUnits(u) {
  unit = u === 'F' ? 'F' : 'C';
  try { localStorage.setItem('wardrobe-units', unit); } catch (e) {}
  return unit;
}
const toUnit = (c) => Math.round(unit === 'F' ? (c * 9) / 5 + 32 : c);
/** A temperature in °C, as text in the unit shown: "14°" */
export const temp = (c) => (c == null ? '–' : `${toUnit(c)}°`);
/** The same, as an element (redrawn when the unit changes) */
export const tempEl = (c, cls = '') => el('span', `t${cls ? ` ${cls}` : ''}`, temp(c));
export const speed = (kmh) => (unit === 'F' ? `${Math.round(kmh / 1.609)} mph` : `${Math.round(kmh)} km/h`);

// ---------- What the sky is: a word and a drawing (apps/index.html's sprite) ----------
const SNOW = new Set([71, 73, 75, 77, 85, 86]), FREEZING = new Set([56, 57, 66, 67]);
function iconOf(code, day) {
  if (code == null) return null;
  if (code === 0) return day ? 'sun' : 'moon';
  if (code === 1) return day ? 'sun-cloud-s' : 'moon-cloud-s';
  if (code === 2) return day ? 'sun-cloud' : 'moon-cloud';
  if (code === 3) return 'cloud';
  if (code === 45 || code === 48) return 'fog';
  if (FREEZING.has(code)) return 'sleet';
  if (code >= 51 && code <= 55) return 'drizzle';
  if (code === 61 || code === 63) return 'rain';
  if (code === 65 || code === 82) return 'heavy-rain';
  if (code === 80 || code === 81) return day ? 'showers' : 'rain';
  if (SNOW.has(code)) return 'snow';
  if (code >= 95) return 'thunder';
  return 'cloud';
}
/**
 * A day or an hour's sky: { icon, word }. A typical day (no forecast yet) has only a thermometer
 * and "Typical": it can say what's usual, never what the sky will do. A forecast with no code
 * (an old copy kept offline) is guessed from the chance of rain, as before.
 */
export function skyOf(w, day = true) {
  if (!w) return { icon: 'cloud', word: '' };
  if (w.kind === 'typical') return { icon: 'typical', word: 'Typical' };
  const by = iconOf(w.code, day);
  if (by) return { icon: by, word: conditionOf(w.code, day) || '' };
  return w.rain >= 50 ? { icon: 'rain', word: 'Rain likely' } : w.rain >= 25 ? { icon: 'sun-cloud', word: 'Chance of rain' } : { icon: 'sun', word: 'Mostly dry' };
}
export const skyIcon = (w, cls = '', day = true) => icon(skyOf(w, day).icon, `sky sky--${skyOf(w, day).icon}${w?.kind === 'typical' ? ' sky--typical' : ''}${cls ? ` ${cls}` : ''}`);
// what falls, in a word: for "Rain from about 2 PM"
function fallOf(codes) {
  if (codes.some((c) => c >= 95)) return 'Thunderstorms';
  if (codes.some((c) => SNOW.has(c))) return 'Snow';
  if (codes.some((c) => FREEZING.has(c))) return 'Freezing rain';
  if (codes.length && codes.every((c) => c >= 51 && c <= 55)) return 'Drizzle';
  if (codes.some((c) => c >= 80 && c <= 82)) return 'Showers';
  return 'Rain';
}

// ---------- Times: as they are there (Open-Meteo gives local times, "2026-10-15T14:00") ----------
const asUTC = (t) => new Date(`${t.length === 16 ? t : `${t}T00:00`}:00Z`);
const H12 = (() => { try { return new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12 !== false; } catch (e) { return true; } })();
/** "2 PM" (or "14:00" where the clock is 24-hour); `short`, for the strip: "2 PM" or "14" */
export const hourLabel = (t, short = false) => asUTC(t).toLocaleTimeString(undefined, H12 || short ? { hour: 'numeric', timeZone: 'UTC' } : { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).replace(/\s/g, '\u00a0'); // "4 PM" never breaks
/** "6:42 PM" (or "18:42") */
export const clockLabel = (t) => asUTC(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).replace(/\s/g, '\u00a0');
/** Now, as the clock reads in that place: "2026-10-15T11:04" */
export function placeNow(timezone) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: timezone || undefined, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  } catch (e) {
    const d = new Date(), pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}
const minutes = (t) => Date.parse(`${t}:00Z`) / 6e4;
const hourOf = (t) => t.slice(0, 13) + ':00';
/** The hour now there, from a leg's hours (null when they don't reach it) */
export const hourNow = (hours, now) => (hours || []).find((h) => h.time === hourOf(now)) || null;

// ---------- The day in a sentence: an umbrella? a jacket? ----------
const wet = (h) => (h.rain ?? 0) >= 50 || ((h.mm ?? 0) >= 0.3 && (h.rain ?? 0) >= 30);
/**
 * When it rains (or snows) in these hours: { word, from, peak, until, all } (times "…T14:00"), or
 * null when it's dry. `until` is the first dry hour after.
 */
export function wetSpell(hours) {
  const w = (hours || []).filter(wet);
  if (!w.length) return null;
  const peak = w.reduce((a, b) => ((b.mm ?? 0) > (a.mm ?? 0) || ((b.mm ?? 0) === (a.mm ?? 0) && (b.rain ?? 0) > (a.rain ?? 0)) ? b : a));
  const last = hours.indexOf(w[w.length - 1]);
  return { word: fallOf(w.map((h) => h.code).filter((c) => c != null)), from: w[0].time, peak: peak.time, until: hours[last + 1]?.time || null, all: w.length >= hours.length * 0.75 };
}
// the hours left in a day: from now on (today), or the waking ones (another day)
export const hoursLeft = (hours, date, now) => (hours || []).filter((h) => h.time.startsWith(date) && (now && now.startsWith(date) ? h.time >= hourOf(now) : h.time >= `${date}T07:00`));

/** One or two short sentences about a day: rain and when, then a cold evening or a hot afternoon */
export function story(day, hours, now) {
  if (!day) return '';
  if (day.kind === 'typical') {
    const years = Math.round(((day.rain ?? 0) * 3) / 100);
    return `Usually about ${temp(day.hi)} by day and ${temp(day.lo)} at night. It rained on ${years ? `${years} of` : 'none of'} the last three years.`;
  }
  const out = [], today = now?.startsWith(day.date);
  let left = hoursLeft(hours, day.date, now);
  // late in the day, the night ahead instead: the next twelve hours
  if (today && left.length < 6) {
    const i = (hours || []).findIndex((h) => h.time === hourOf(now));
    if (i >= 0 && hours.length - i >= 6) {
      const night = hours.slice(i, i + 12), s = wetSpell(night), low = Math.min(...night.map((h) => h.temp));
      const word = skyOf({ ...night[Math.min(3, night.length - 1)], kind: 'forecast' }, false).word;
      if (!s) return `${word || 'Dry'} tonight, down to ${temp(low)}.`;
      return `${s.word} ${s.from <= hourOf(now) ? 'now' : `from about ${hourLabel(s.from)}`}${s.until && s.from <= hourOf(now) ? `, easing by ${hourLabel(s.until)}` : ''}. Down to ${temp(low)} overnight.`;
    }
  }
  if (left.length >= 3) {
    const s = wetSpell(left);
    if (!s) {
      const most = Math.max(...left.map((h) => h.rain ?? 0));
      out.push(most >= 30 ? `Mostly dry, a ${most}% chance of rain at most.` : today && left.length < 14 ? 'Dry for the rest of the day.' : 'Dry all day.');
    } else if (s.all) out.push(`${s.word} on and off all day.`);
    else if (today && s.from <= hourOf(now)) out.push(`${s.word} now${s.until ? `, easing by ${hourLabel(s.until)}` : ''}.`);
    else out.push(`${s.word} from about ${hourLabel(s.from)}${s.peak !== s.from ? `, heaviest at ${hourLabel(s.peak)}` : ''}.`);
    // the evening: 7 PM on
    const eve = left.filter((h) => h.time >= `${day.date}T19:00`), coldest = eve.length ? Math.min(...eve.map((h) => h.temp)) : null;
    if (coldest != null && coldest <= 3) out.push(`Cold tonight, down to ${temp(coldest)}.`);
    else if (coldest != null && coldest <= 11) out.push(`Cool evening, down to ${temp(coldest)}.`);
    else if (day.hi >= 28) out.push(`Hot by afternoon, ${temp(day.hi)}.`);
  } else {
    const codes = day.code != null ? [day.code] : [], word = fallOf(codes);
    out.push(day.rain >= 60 ? `${word} likely (${day.rain}%).` : day.rain >= 30 ? `A chance of ${word.toLowerCase()} (${day.rain}%).` : 'Dry, most likely.');
    if (day.lo != null && day.lo <= 3) out.push(`Cold at night, down to ${temp(day.lo)}.`);
    else if (day.lo != null && day.lo <= 11) out.push(`Cool evening, down to ${temp(day.lo)}.`);
    else if (day.hi >= 28) out.push(`Hot by afternoon, ${temp(day.hi)}.`);
  }
  return out.join(' ');
}

/** The small facts, only when they matter: a strong sun, a strong wind; the sunset when there's no strip to show it */
export function facts(day, { strip = false, now = null } = {}) {
  const out = [];
  if (!day || day.kind === 'typical') return out;
  const sunDown = now && day.sunset && minutes(now) > minutes(day.sunset) - 120; // the sun's low or gone: no UV worth saying
  if (!strip && day.sunset) out.push(['sunset', `Sunset ${clockLabel(day.sunset)}`]);
  if (day.uv >= 6 && !sunDown) out.push(['sun', `UV ${Math.round(day.uv)}, ${day.uv >= 8 ? 'very high' : 'high'}`]);
  if (day.wind >= 30) out.push(['wind', `Wind up to ${speed(day.wind)}`]);
  return out;
}

// ---------- The sky behind Today's weather: the condition, at the time of day it is there ----------
const GROUP = (code) => (code == null ? 'partly' : code <= 1 ? 'clear' : code === 2 ? 'partly' : code === 3 ? 'cloudy' : code <= 48 ? 'fog' : SNOW.has(code) ? 'snow' : code >= 95 ? 'storm' : 'rain');
/** { sky, time } for data attributes: sky clear | partly | cloudy | fog | rain | snow | storm | typical | none; time day | golden | night */
export function mood(day, hour, now) {
  if (!day) return { sky: 'none', time: 'day' };
  if (day.kind === 'typical') return { sky: 'typical', time: 'day' };
  const sky = GROUP(hour?.code ?? day.code);
  if (!now || !now.startsWith(day.date) || !day.sunrise || !day.sunset) return { sky, time: 'day' };
  const m = minutes(now), up = minutes(day.sunrise), down = minutes(day.sunset);
  const time = m < up - 20 || m > down + 25 ? 'night' : (m > down - 75 || m < up + 40) && (sky === 'clear' || sky === 'partly') ? 'golden' : 'day';
  return { sky, time };
}

// ---------- The temperature's colour: data colours, like the clothes' (the same in every theme but terminal) ----------
// °C → colour, as Apple Weather does: deep blue below freezing, light blue to 15°, green to 20°,
// yellow to 25°, orange to 30°, red above. Used for the day bars and the hourly line.
export const HEAT = [[-10, '#3b5bdb'], [0, '#4dabf7'], [10, '#3bc9db'], [15, '#51cf66'], [20, '#fcc419'], [25, '#ff922b'], [30, '#f03e3e'], [40, '#c92a2a']];
export function heat(c) {
  if (c <= HEAT[0][0]) return HEAT[0][1];
  for (let i = 1; i < HEAT.length; i++) {
    const [t1, c1] = HEAT[i], [t0, c0] = HEAT[i - 1];
    if (c <= t1) {
      const k = (c - t0) / (t1 - t0), mix = (a, b) => Math.round(a + (b - a) * k);
      const [r0, g0, b0] = [1, 3, 5].map((j) => parseInt(c0.slice(j, j + 2), 16)), [r1, g1, b1] = [1, 3, 5].map((j) => parseInt(c1.slice(j, j + 2), 16));
      return `rgb(${mix(r0, r1)} ${mix(g0, g1)} ${mix(b0, b1)})`;
    }
  }
  return HEAT[HEAT.length - 1][1];
}
// a gradient from lo to hi, its colours by temperature
const heatGradient = (lo, hi) => (hi - lo < 0.5 ? heat(lo) : `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map((k) => `${heat(lo + (hi - lo) * k)} ${k * 100}%`).join(', ')})`);

// ---------- Day by day: low, a bar on one scale, high ----------
const fmtWeekday = (d) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
const fmtDate = (d) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const fmtLong = (d) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
/** The trip's coolest low and warmest high, so every leg's bars share one scale */
export function scaleOf(weathers) {
  const days = weathers.flatMap((w) => w?.days || []);
  const los = days.map((d) => d.lo ?? d.hi).filter((x) => x != null), his = days.map((d) => d.hi ?? d.lo).filter((x) => x != null);
  return los.length ? [Math.min(...los), Math.max(...his)] : [0, 1];
}
/** In words, for VoiceOver (and as each row's title): "Thursday 15 October: light rain, 18° to 9°, 70% chance of rain" */
export function dayWords(d, label = fmtLong(d.date)) {
  const typical = d.kind === 'typical';
  return `${label}: ${typical ? 'typically' : skyOf(d).word.toLowerCase() || 'forecast'}, high ${temp(d.hi)}, low ${temp(d.lo)}${typical ? `, rained on ${Math.round(((d.rain ?? 0) * 3) / 100)} of the last three years` : d.rain != null ? `, ${d.rain}% chance of rain` : ''}`;
}
/**
 * A leg's days as a list: weekday, sky, the chance of rain when it's 20% or more, the low, the bar
 * (its span the day's low to high on the trip's scale, coloured by temperature), the high. Today
 * says so and has a dot where it is now; the typical days come after a line saying what they are,
 * drawn faint and dashed. A long leg shows `show` days and a button for the rest.
 */
export function dayList(w, { scale, today, nowTemp = null, show = 10, open = false, onOpen } = {}) {
  const [min, max] = scale, span = Math.max(1, max - min), at = (c) => Math.min(1, Math.max(0, (c - min) / span));
  const ol = el('ol', 'daylist');
  let typicalShown = false;
  w.days.forEach((d, i) => {
    if (d.kind === 'typical' && !typicalShown) {
      typicalShown = true;
      const li = el('li', 'daylist__note', i ? 'Beyond the forecast: what these dates were like the last three years (the chance of rain is how many of them it rained)' : 'Too far off for a forecast: what these dates were like the last three years (the chance of rain is how many of them it rained)');
      if (i >= show && !open) li.hidden = true;
      ol.append(li);
    }
    const isToday = d.date === today, typical = d.kind === 'typical';
    const li = el('li', `daylist__day${typical ? ' is-typical' : ''}${isToday ? ' is-today' : ''}`);
    if (i >= show && !open) li.hidden = true;
    const words = dayWords(d, isToday ? 'Today' : fmtLong(d.date));
    li.append(el('span', 'visually-hidden', words));
    const when = el('span', 'daylist__when');
    when.append(el('span', 'daylist__wd', isToday ? 'Today' : fmtWeekday(d.date)), el('span', 'daylist__date', fmtDate(d.date)));
    const sk = el('span', 'daylist__sky');
    sk.append(skyIcon(d));
    if ((d.rain ?? 0) >= 20) sk.append(el('span', 'daylist__rain', `${d.rain}%`));
    const lo = tempEl(d.lo, 'daylist__lo'), hi = tempEl(d.hi, 'daylist__hi');
    const track = el('span', 'daylist__track'), bar = el('span', 'daylist__bar');
    const a = at(d.lo ?? d.hi), b = at(d.hi ?? d.lo);
    bar.style.left = `${a * 100}%`;
    bar.style.width = `${Math.max(0.04, b - a) * 100}%`;
    bar.style.setProperty('--heat', heatGradient(d.lo ?? d.hi, d.hi ?? d.lo));
    track.append(bar);
    if (isToday && nowTemp != null) {
      const dot = el('span', 'daylist__now');
      dot.style.left = `${at(nowTemp) * 100}%`;
      track.append(dot);
    }
    for (const x of [when, sk, lo, track, hi]) x.setAttribute('aria-hidden', 'true');
    li.append(when, sk, lo, track, hi);
    li.title = words;
    ol.append(li);
  });
  const rest = w.days.length - show;
  if (rest > 0 && !open) {
    const li = el('li', 'daylist__more'), btn = el('button', 'link-btn', `All ${w.days.length} days`);
    btn.type = 'button';
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', () => { for (const x of ol.children) x.hidden = false; li.remove(); onOpen?.(); });
    li.append(btn);
    ol.append(li);
  }
  return ol;
}

// ---------- Hour by hour: Now, then the next day's hours, a line through the temperatures ----------
const CELL = 52; // px per hour in the strip
/**
 * The next 24 hours from now, with the sunrise and sunset in their places: each hour's time, sky,
 * chance of rain (when it's 20% or more) and temperature, the temperatures joined by a line
 * coloured by how warm it is, and faint bars along the bottom for the chance of rain. A list
 * (each hour said in words for VoiceOver); the line is a picture of what the list says.
 */
export function hourStrip(hours, days, now) {
  const start = hours.findIndex((h) => h.time === hourOf(now));
  if (start < 0) return null;
  const next = hours.slice(start, start + 25);
  if (next.length < 4) return null;
  // the sun's moments in between, each where it falls
  const cells = next.map((h, i) => ({ h, x: i }));
  for (const d of days) for (const [key, word, ic] of [['sunrise', 'Sunrise', 'sunrise'], ['sunset', 'Sunset', 'sunset']]) {
    const t = d?.[key];
    if (!t || t <= now || t >= next[next.length - 1].time) continue;
    const i = next.findIndex((h) => h.time > t);
    if (i > 0) cells.push({ moment: { t, word, ic }, x: i - 1 + (minutes(t) - minutes(next[i - 1].time)) / 60 });
  }
  cells.sort((a, b) => a.x - b.x);
  const temps = next.map((h) => h.temp), lo = Math.min(...temps), hi = Math.max(...temps), range = Math.max(2, hi - lo);
  const H = 58, top = 24, bottom = 44; // the chart's height; where the warmest and coolest points sit
  const yOf = (c) => bottom - ((c - lo) / range) * (bottom - top);
  const tempAt = (x) => { const i = Math.floor(x), k = x - i; return temps[i] + ((temps[Math.min(i + 1, temps.length - 1)] - temps[i]) * k); };

  const box = el('div', 'hours');
  const ol = el('ol', 'hours__list');
  ol.setAttribute('aria-label', 'Hour by hour, the next 24 hours');
  ol.style.setProperty('--cell', `${CELL}px`);
  const xs = []; // each cell's centre
  cells.forEach((c, n) => {
    const li = el('li', `hour${c.moment ? ' hour--moment' : ''}${n === 0 ? ' is-now' : ''}`);
    const cx = n * CELL + CELL / 2;
    xs.push([cx, c.moment ? tempAt(c.x) : c.h.temp, c]);
    const vis = el('span', 'hour__vis');
    vis.setAttribute('aria-hidden', 'true');
    if (c.moment) {
      vis.append(el('span', 'hour__time', clockLabel(c.moment.t)), icon(c.moment.ic, 'sky hour__sky'), el('span', 'hour__rain', ''), el('span', 'hour__word', c.moment.word));
      li.append(el('span', 'visually-hidden', `${c.moment.word} at ${clockLabel(c.moment.t)}`));
    } else {
      const h = c.h, sk = skyOf(h, h.day);
      vis.append(el('span', 'hour__time', n === 0 ? 'Now' : hourLabel(h.time, true)), icon(sk.icon, `sky sky--${sk.icon} hour__sky`), el('span', 'hour__rain', (h.rain ?? 0) >= 20 ? `${h.rain}%` : ''));
      const t = tempEl(h.temp, 'hour__temp');
      t.style.top = `calc(var(--chart-top) + ${yOf(h.temp) - 22}px)`;
      vis.append(t);
      li.append(el('span', 'visually-hidden', `${n === 0 ? 'Now' : hourLabel(h.time)}: ${sk.word.toLowerCase()}, ${temp(h.temp)}${(h.rain ?? 0) >= 20 ? `, ${h.rain}% chance of rain` : ''}`));
    }
    li.append(vis);
    ol.append(li);
  });
  // the line, its colour by temperature along the way, and the chance of rain as bars beneath
  const W = cells.length * CELL, NS = 'http://www.w3.org/2000/svg', mk = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
  const svg = mk('svg', { class: 'hours__chart', width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
  const grad = mk('linearGradient', { id: 'hours-heat', gradientUnits: 'userSpaceOnUse', x1: 0, x2: W, y1: 0, y2: 0 });
  for (const [x, c] of xs) grad.append(mk('stop', { offset: (x / W).toFixed(4), 'stop-color': heat(c) }));
  const defs = mk('defs', {});
  defs.append(grad);
  svg.append(defs);
  for (const [x, , c] of xs) if (!c.moment && (c.h.rain ?? 0) >= 20) svg.append(mk('rect', { class: 'hours__wet', x: x - 6, width: 12, y: H - (c.h.rain / 100) * 12, height: (c.h.rain / 100) * 12, rx: 2 }));
  const pts = xs.map(([x, c]) => [x, yOf(c)]);
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) { // a gentle curve through the points (Catmull-Rom, as Béziers)
    const p0 = pts[i - 2] || pts[i - 1], p1 = pts[i - 1], p2 = pts[i], p3 = pts[i + 1] || p2;
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0]} ${p2[1].toFixed(1)}`;
  }
  svg.append(mk('path', { class: 'hours__line', d, stroke: 'url(#hours-heat)' }));
  pts.forEach(([x, y], i) => { if (!xs[i][2].moment) svg.append(mk('circle', { class: `hours__dot${i === 0 ? ' is-now' : ''}`, cx: x, cy: y.toFixed(1), r: i === 0 ? 4 : 2.2 })); });
  const inner = el('div', 'hours__inner');
  inner.style.width = `${W}px`;
  inner.append(svg, ol);
  box.append(inner);
  return box;
}
