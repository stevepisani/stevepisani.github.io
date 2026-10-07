// Travelling, for the wardrobe's trip page and Today (docs/apps.md, "On the road"): getting there
// and staying as cards you can act on (a countdown, the booking reference to copy, the journey
// into Google Calendar, the address in Maps), and home and away in one line (the time there and at home,
// and what the money's worth). Only what's stored is shown: no gates, platforms or boarding times.
import { el, icon, toast } from './kit.js';

// Home, in one place: where Steve lives, its clock and its money
export const HOME = { place: 'Philadelphia', timezone: 'America/New_York', currency: 'USD' };

// A country's money, by the name the place lookup gives (Open-Meteo's geocoding, in English).
// Only currencies the rates come in (Frankfurter, the European Central Bank's daily rates).
const EURO = ['Austria', 'Belgium', 'Croatia', 'Cyprus', 'Estonia', 'Finland', 'France', 'Germany', 'Greece', 'Ireland', 'Italy', 'Latvia', 'Lithuania', 'Luxembourg', 'Malta', 'Netherlands', 'Portugal', 'Slovakia', 'Slovenia', 'Spain', 'Monaco', 'San Marino', 'Vatican City', 'Andorra', 'Montenegro', 'Kosovo'];
const MONEY = {
  ...Object.fromEntries(EURO.map((c) => [c, 'EUR'])),
  'United Kingdom': 'GBP', Switzerland: 'CHF', Liechtenstein: 'CHF', Denmark: 'DKK', Sweden: 'SEK', Norway: 'NOK', Iceland: 'ISK',
  Czechia: 'CZK', 'Czech Republic': 'CZK', Poland: 'PLN', Hungary: 'HUF', Romania: 'RON', Turkey: 'TRY', Türkiye: 'TRY',
  'United States': 'USD', Canada: 'CAD', Mexico: 'MXN', Brazil: 'BRL', Japan: 'JPY', 'South Korea': 'KRW', China: 'CNY', 'Hong Kong': 'HKD',
  Singapore: 'SGD', Thailand: 'THB', India: 'INR', Indonesia: 'IDR', Malaysia: 'MYR', Philippines: 'PHP', Israel: 'ILS',
  Australia: 'AUD', 'New Zealand': 'NZD', 'South Africa': 'ZAR',
};
export const currencyOf = (country) => MONEY[country] || null;

// the phone's clock: 12-hour ("9:10 AM") or 24 ("09:10")
const H12 = (() => { try { return new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12 !== false; } catch (e) { return true; } })();
const keep = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} };
const kept = (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } };

// ---------- What the money's worth: one local unit in home money, asked for at most once a day ----------
const RATES = 'https://api.frankfurter.dev/v1/latest';
const rateKey = (from, to) => `wardrobe-rate:${from}-${to}`;
/** The last rate kept on this phone: { rate, date, at }, or null */
export const keptRate = (from, to) => kept(rateKey(from, to));
/** The rate, from the copy if it's from today, else asked for (and kept); the copy when that fails */
export async function rate(from, to) {
  const copy = keptRate(from, to);
  if (copy && new Date(copy.at).toDateString() === new Date().toDateString()) return copy;
  if (!navigator.onLine) return copy;
  try {
    const res = await fetch(`${RATES}?base=${from}&symbols=${to}`);
    const j = res.ok ? await res.json() : null, r = j?.rates?.[to];
    if (!r) return copy;
    const got = { rate: r, date: j.date || null, at: Date.now() };
    keep(rateKey(from, to), got);
    return got;
  } catch (e) { return copy; }
}
const money = (n, cur, digits) => { try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, currencyDisplay: 'narrowSymbol', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n); } catch (e) { return `${n} ${cur}`; } };
const worth = (n) => (n >= 10 ? 0 : n >= 0.1 ? 2 : 4);
/** "€1 = $1.13", or turned round ("$1 = €0.89"); a weak currency reads the other way by default */
export function rateWords(from, to, r, flip = false) {
  const turn = r < 0.1 ? !flip : flip;
  return turn ? `${money(1, to, 0)} = ${money(1 / r, from, worth(1 / r))}` : `${money(1, from, 0)} = ${money(r, to, worth(r))}`;
}
/** The time now in a place: "15:40" (or "3:40 PM") */
export const clockIn = (timezone) => { try { return new Date().toLocaleTimeString(undefined, { hour: H12 ? 'numeric' : '2-digit', minute: '2-digit', timeZone: timezone }).replace(/\s/g, '\u00a0'); } catch (e) { return ''; } };

// ---------- Times as stored: ISO 8601 with the place's UTC offset, or local time without one ----------
const pad = (n) => String(n).padStart(2, '0');
/** The moment a stored time is, in ms, only when it says its offset ("…+01:00" or "Z"); else null */
export const instant = (s) => (/T\d\d:\d\d(:\d\d)?(Z|[+-]\d\d:?\d\d)$/.test(s || '') ? Date.parse(s) : null);
const local = (s) => /^(\d{4}-\d\d-\d\d)T(\d\d:\d\d)/.exec(s || ''); // [, date, clock] as given
/** "Tue 13 Oct" (as the phone writes dates) */
export const fmtDay = (d, opts = {}) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: opts.weekday || undefined, day: 'numeric', month: opts.month || 'short' });
/** A stored time's clock, there: "09:10" (or "9:10 AM" where the clock is 12-hour), never moved to another zone */
const clockOf = (s) => {
  const m = local(s), hm = m?.[2] || /^\d\d:\d\d/.exec(s || '')?.[0];
  if (!hm) return '';
  if (!H12) return hm;
  const h = +hm.slice(0, 2);
  return `${h % 12 || 12}:${hm.slice(3)}\u00a0${h < 12 ? 'AM' : 'PM'}`;
};
const dateOf = (s) => local(s)?.[1] || null;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const spaced = (s) => (s || '').replace(/_/g, ' ');

/** "3 h 20 min", "25 min", "1 day 4 h" */
export function duration(min) {
  min = Math.max(1, Math.round(min));
  const h = Math.floor(min / 60), m = min % 60, d = Math.floor(h / 24), hh = h % 24;
  const out = min < 60 ? `${min} min` : h < 24 ? (m ? `${h} h ${m} min` : `${h} h`) : `${d} day${d === 1 ? '' : 's'}${hh ? ` ${hh} h` : ''}`;
  return out.replace(/ /g, '\u00a0'); // never broken across lines
}

// The short name of an end: its code (LHR), else the name before the first comma ("St James House")
const shortName = (name, code) => code || (name || '').split(',')[0].trim();
// Where a journey takes you, in a word: the trip's place it's in ("Florence Airport, Peretola" is Florence)
const placeOf = (name, legs = []) => legs.map((l) => l.place).find((p) => p && (name || '').toLowerCase().includes(p.toLowerCase())) || shortName(name);
const KIND = { other: 'Journey' };
const kindOf = (g) => KIND[g.type] || cap(spaced(g.type || 'journey'));

/**
 * Where a journey is, now: `soon` (leaving within 48 hours: "Train to Paris in 3 h 20 min"), `on`
 * (left, not arrived), `done`, or `later`. Only a time stored with its offset is counted down; one
 * without is a clock time somewhere, so it only says its day.
 */
export function journeyNow(g, legs = [], now = Date.now()) {
  const dep = instant(g.departure_time), arr = instant(g.arrival_time), to = placeOf(g.destination, legs);
  if (dep != null) {
    if (now < dep) {
      const min = (dep - now) / 6e4;
      return min <= 48 * 60 ? { state: 'soon', text: `${kindOf(g)} to ${to} in ${duration(min)}`, at: dep } : { state: 'later', at: dep };
    }
    if (arr != null && now < arr) return { state: 'on', text: `On the way to ${to}. Arrives in ${duration((arr - now) / 6e4)}`, at: dep };
    return { state: 'done', at: dep };
  }
  // no offset: by its date (and its clock on this phone, only to tell when it's over)
  const day = g.date || dateOf(g.departure_time);
  if (!day) return { state: 'later', at: Infinity };
  const end = new Date(`${day}T${local(g.arrival_time)?.[2] || local(g.departure_time)?.[2] || '23:59'}`).getTime();
  const start = new Date(`${day}T00:00`).getTime();
  if (now > end + (local(g.arrival_time) ? 0 : 60 * 6e4)) return { state: 'done', at: start };
  const days = Math.round((start - new Date(new Date(now).toDateString()).getTime()) / 864e5);
  if (days > 1) return { state: 'later', at: start };
  const at = clockOf(g.departure_time);
  return { state: 'soon', text: `${kindOf(g)} to ${to} ${days <= 0 ? 'today' : 'tomorrow'}${at ? ` at ${at}` : ''}`, at: start };
}
/** The next journey to show on Today: leaving within 48 hours, or under way */
export function nextJourney(goes, legs, now = Date.now()) {
  return goes.map((g) => ({ g, n: journeyNow(g, legs, now) })).filter(({ n }) => n.state === 'soon' || n.state === 'on').sort((a, b) => a.n.at - b.n.at)[0]?.g || null;
}

// ---------- Into Google Calendar: a link that opens a new event, filled in ----------
const gUTC = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
// a time as written when it has no offset: the clock there, which Google reads in the calendar's zone
const gLocal = (s) => { const m = local(s); return m ? `${m[1].replace(/-/g, '')}T${m[2].replace(':', '')}00` : null; };
const ymd = (d) => d.replace(/-/g, '');
const nextDay = (d) => new Date(Date.parse(`${d}T00:00Z`) + 864e5).toISOString().slice(0, 10);
// start/end: in UTC when both ends carry an offset, else as written, else the whole day; with no
// arrival, an hour
function gDates(g) {
  const dep = instant(g.departure_time), arr = instant(g.arrival_time);
  if (dep != null) return `${gUTC(dep)}/${gUTC(arr != null && arr > dep ? arr : dep + 36e5)}`;
  const start = gLocal(g.departure_time);
  if (start) {
    const end = gLocal(g.arrival_time) || gLocal(new Date(Date.parse(`${local(g.departure_time)[1]}T${local(g.departure_time)[2]}Z`) + 36e5).toISOString());
    return `${start}/${end}`;
  }
  const day = g.date || dateOf(g.departure_time);
  return day ? `${ymd(day)}/${ymd(nextDay(day))}` : null;
}
/** A journey as a Google Calendar link (a new event with its times, places, reference and notes) */
export function googleCalendar(g, legs = []) {
  const dates = gDates(g);
  if (!dates) return null;
  const what = [g.carrier, g.number].filter(Boolean).join(' ');
  const from = [g.origin, g.origin_code && `(${g.origin_code})`].filter(Boolean).join(' '), to = [g.destination, g.destination_code && `(${g.destination_code})`].filter(Boolean).join(' ');
  const times = [g.departure_time && `${shortName(g.origin, g.origin_code)} ${clockOf(g.departure_time)}`, g.arrival_time && `${shortName(g.destination, g.destination_code)} ${clockOf(g.arrival_time)}${dateOf(g.arrival_time) && dateOf(g.arrival_time) !== (dateOf(g.departure_time) || g.date) ? ` (${fmtDay(dateOf(g.arrival_time))})` : ''}`].filter(Boolean).join(' → ');
  const details = [what, `${from} → ${to}`, times && `${times}, local times`, g.confirmation && `Booking reference ${g.confirmation}`, g.notes, g.booking_url].filter(Boolean).join('\n');
  const q = new URLSearchParams({ action: 'TEMPLATE', text: `${kindOf(g)} to ${placeOf(g.destination, legs)}${what ? ` (${what})` : ''}`, dates, details, location: from });
  return `https://calendar.google.com/calendar/render?${q}`;
}

// ---------- The parts of a card ----------
/** Copies text (the Clipboard API, or the old way where it isn't there), and says so */
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); }
  catch (e) {
    const t = Object.assign(document.createElement('textarea'), { value: text });
    t.setAttribute('readonly', '');
    t.style.cssText = 'position:fixed;opacity:0';
    document.body.append(t);
    t.select();
    try { document.execCommand('copy'); } catch (e2) { t.remove(); toast("Couldn't copy it.", true); return; }
    t.remove();
  }
  toast(`Copied ${text}`);
}
// the booking reference, a tap to copy
function refChip(code) {
  const b = el('button', 'chip chip--ref');
  b.type = 'button';
  b.setAttribute('aria-label', `Booking reference ${code.split('').join(' ')}. Copy`);
  b.append(el('span', 'chip__label', 'Ref'), el('span', 'chip__code', code), icon('copy'));
  b.addEventListener('click', () => copyText(code));
  return b;
}
const href = (link) => (/^https?:\/\//i.test(link) ? link : `https://${link}`);
function outLink(text, url, cls = 'chip') {
  const a = el('a', cls);
  Object.assign(a, { href: href(url), target: '_blank', rel: 'noopener' });
  a.append(el('span', '', text), icon('out'));
  return a;
}
/** An address, as a tap that opens it in Maps (Apple Maps; the web version elsewhere) */
export function mapLink(name, address) {
  const a = el('a', 'map-link');
  Object.assign(a, { href: `https://maps.apple.com/?q=${encodeURIComponent(name || address)}&address=${encodeURIComponent(address)}`, target: '_blank', rel: 'noopener' });
  a.setAttribute('aria-label', `${address}. Open in Maps`);
  a.append(icon('pin'), el('span', '', address));
  return a;
}
const ICON = { flight: 'flight', train: 'train', bus: 'bus', ferry: 'ferry', car: 'car', taxi: 'car', transfer: 'car' };

/**
 * Getting there, as a boarding card: the ends big (codes when there are any, the names under),
 * what it is, the times there with the day when it changes, a countdown inside 48 hours, and the
 * reference, Google Calendar and the booking. `big` is Today's.
 */
export function journeyCard(g, legs = [], { now = Date.now(), today = false } = {}) {
  const n = journeyNow(g, legs, now), card = el(today ? 'section' : 'li', `journey${n.state === 'done' ? ' is-past' : ''}${today ? ' journey--today' : ''}`);
  const what = [g.carrier, g.number].filter(Boolean).join(' ');
  // what it is (the carrier and number, else the kind) and its day
  const head = el('p', 'journey__kind');
  head.append(icon(ICON[g.type] || 'route'), el('span', 'visually-hidden', what ? `${kindOf(g)}: ` : ''), el('span', 'journey__what', what || kindOf(g)), el('span', 'journey__date', fmtDay(g.date || dateOf(g.departure_time), { weekday: 'short' })));
  card.append(head);
  const ends = el('div', 'journey__ends');
  const end = (name, code, time, side) => {
    const box = el('div', `journey__end journey__end--${side}`);
    const big = shortName(name, code);
    box.append(el('span', `journey__code${code ? '' : ' is-name'}`, big));
    if (name && name !== big) box.append(el('span', 'journey__name', name));
    if (time) {
      box.append(el('span', 'journey__time', clockOf(time)));
      // arriving another day says which
      if (side === 'to' && dateOf(time) && dateOf(time) !== (dateOf(g.departure_time) || g.date)) box.append(el('span', 'journey__day', fmtDay(dateOf(time), { weekday: 'short' })));
    }
    return box;
  };
  const line = el('span', 'journey__line');
  line.setAttribute('aria-hidden', 'true');
  line.append(icon(ICON[g.type] || 'route'));
  ends.append(end(g.origin, g.origin_code, g.departure_time, 'from'), line, el('span', 'visually-hidden', 'to'), end(g.destination, g.destination_code, g.arrival_time, 'to'));
  card.append(ends);
  if (n.text) {
    const soon = el('p', `journey__soon${n.state === 'on' ? ' is-on' : ''}`, n.text);
    card.append(soon);
    counting.add({ soon, g, legs });
    count();
  }
  if (g.notes) card.append(el('p', 'journey__notes', g.notes));
  const acts = el('div', 'journey__acts');
  if (g.confirmation) acts.append(refChip(g.confirmation));
  const cal = n.state !== 'done' && googleCalendar(g, legs);
  if (cal) {
    const a = el('a', 'chip');
    Object.assign(a, { href: cal, target: '_blank', rel: 'noopener' });
    a.append(icon('calendar'), el('span', '', 'Add to Google Calendar'));
    acts.append(a);
  }
  if (g.booking_url) acts.append(outLink('Booking', g.booking_url));
  if (acts.children.length) card.append(acts);
  return card;
}

// the countdowns on the page, moved on each half minute (only their words change)
const counting = new Set();
let counter = null;
function count() {
  if (counter) return;
  counter = setInterval(() => {
    for (const c of counting) {
      if (!c.soon.isConnected) { counting.delete(c); continue; }
      const n = journeyNow(c.g, c.legs);
      if (n.text && c.soon.textContent !== n.text) c.soon.textContent = n.text;
    }
    if (!counting.size) { clearInterval(counter); counter = null; }
  }, 30000);
}

const nights = (a, b) => Math.round((new Date(`${b}T12:00`) - new Date(`${a}T12:00`)) / 864e5);
/** Where you're staying: the name, the dates and nights, the address to Maps, the reference, the booking */
export function stayCard(l, { date = null, today = false, kicker = '' } = {}) {
  const on = date && l.check_in <= date && date < l.check_out;
  const card = el(today ? 'section' : 'li', `stay${on && !today ? ' is-on' : ''}${today ? ' stay--today' : ''}`);
  if (kicker) card.append(el('p', 'stay__kicker', kicker));
  card.append(el(today ? 'h2' : 'h3', 'stay__name', l.name));
  const n = nights(l.check_in, l.check_out), left = date ? nights(date, l.check_out) : 0;
  // on Today, only when you leave; on the trip, the stay
  card.append(el('p', 'stay__when', today ? `Check out ${left === 1 ? 'tomorrow' : fmtDay(l.check_out, { weekday: 'long' })}` : `${fmtDay(l.check_in, { weekday: 'short' })} – ${fmtDay(l.check_out, { weekday: 'short' })} · ${n} night${n === 1 ? '' : 's'}${on ? ' · staying now' : ''}`));
  if (l.address) card.append(mapLink(l.name, l.address));
  else if (l.place && !today) card.append(el('p', 'stay__place', l.place));
  if (l.notes && !today) card.append(el('p', 'stay__notes', l.notes));
  const acts = el('div', 'journey__acts');
  if (l.confirmation) acts.append(refChip(l.confirmation));
  if (l.booking_url) acts.append(outLink('Booking', l.booking_url));
  if (acts.children.length) card.append(acts);
  return card;
}

/**
 * Home and away, one quiet line: "Florence 15:40 · Philadelphia 09:40 · €1 = $1.13". The times
 * move each minute while it's showing; a tap on the rate turns it round. `leg` is where you are.
 */
let ticking = null, flipped = false;
export function homeAway(leg, timezone) {
  if (!leg || !timezone || timezone === HOME.timezone) return null;
  const line = el('p', 'home-away');
  const cur = currencyOf(leg.country);
  const here = el('span', 'home-away__time'), home = el('span', 'home-away__time');
  const tick = () => {
    here.textContent = `${leg.place} ${clockIn(timezone)}`;
    home.textContent = `${HOME.place} ${clockIn(HOME.timezone)}`;
  };
  tick();
  line.append(here, el('span', 'home-away__dot', ' · '), home);
  if (cur && cur !== HOME.currency) {
    const btn = el('button', 'home-away__rate');
    btn.type = 'button';
    const paint = (r) => {
      if (!r) return;
      btn.textContent = rateWords(cur, HOME.currency, r.rate, flipped);
      btn.setAttribute('aria-label', `${btn.textContent}, the rate on ${new Date(r.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}. Tap to turn it round`);
      if (!btn.isConnected) line.append(el('span', 'home-away__dot', ' · '), btn);
    };
    btn.addEventListener('click', () => { flipped = !flipped; paint(keptRate(cur, HOME.currency)); });
    paint(keptRate(cur, HOME.currency));
    rate(cur, HOME.currency).then((r) => { if (r) paint(r); });
  }
  // on the minute, each minute, while it's on the page (only the text changes: the same width, no jump)
  clearTimeout(ticking);
  const next = () => { ticking = setTimeout(() => { tick(); if (line.isConnected) next(); }, 60000 - (Date.now() % 60000) + 50); };
  next();
  return line;
}
