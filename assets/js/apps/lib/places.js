// Places, a section of SJPJr (the Places tab; its markup is _includes/places.html): what Steve
// saved, starred, reviewed and labeled in Google Maps, and his own maps, brought in from a Google
// Takeout file. The file goes in the inbox as it came (public.inbox, its files under
// photos/inbox/<owner>/<id>/), is read here by _shared/takeout.js, and becomes public.places
// through places_import(). Every place waits in review until it's kept or dismissed, and is
// private until it's shared with Lexi or put on the site; the database refuses the site for home,
// work, people's houses, lodging and anything near home (places_guard). A place the file gives no
// coordinates for is located by places-locate (the Places API, capped). wardrobe.js mounts it, and
// shows what's saved near you on Today and near each place of a trip (nearby(), nearbyPart()).
import { unzipSync } from 'fflate';
import { $, el, db, sheet as sheetify, open, toast, buzz } from './kit.js';
import { units } from './sky.js';
import { readTakeout, wanted, pathFor } from '../../../../supabase/functions/_shared/takeout.js';

const PAGE = 100; // rows drawn at a time ("Show more")
const STATUS = [['review', 'To review'], ['kept', 'Kept'], ['dismissed', 'Dismissed'], ['all', 'All']];
const WHO = { private: 'only you', shared: 'you and Lexi', public: 'the site' };
// why a place can never be on the site (places_guard in the database decides; this only says it)
const WHY = { home: "It's home.", work: "It's work.", personal: "It's one of your labeled places.", lodging: "It's somewhere you stay.", near_home: "It's near home or work." };
let list = [], uid = null, loaded = false, shownN = PAGE, current = null, busy = false;
let view = { status: 'review', list: '' };
try { Object.assign(view, JSON.parse(localStorage.getItem('places-view'))); } catch (e) {}
const keepView = () => { try { localStorage.setItem('places-view', JSON.stringify(view)); } catch (e) {} };
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
let changed = () => {}; // wardrobe.js redraws Today or a trip when the places change
export const onChange = (fn) => { changed = fn; };
export const isLoaded = () => loaded;

// ---------- Where they are ----------
const metres = (a, b) => {
  const r = (d) => (d * Math.PI) / 180, dLat = r(b.lat - a.lat), dLon = r(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
};
// how far, in the units Settings has (°F: miles; °C: kilometres)
export const far = (m) => (units() === 'F'
  ? (m < 160 ? `${Math.max(50, Math.round(m * 3.28084 / 50) * 50)} ft` : `${(m / 1609.34).toFixed(m < 16000 ? 1 : 0)} mi`)
  : (m < 1000 ? `${Math.max(50, Math.round(m / 50) * 50)} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`));
export const mapLink = (p) => p.google_url || `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`;
// home, from its label, for "near you" when you're there (closer than the city's middle)
export const homeSpot = () => { const h = list.find((p) => p.sensitive === 'home' && p.lat != null); return h ? { lat: h.lat, lon: h.lon } : null; };
// the saved places near a point, nearest first: not the labeled ones (people's houses), not the dismissed
export function nearby(at, km, limit = 5) {
  if (!at || at.lat == null) return [];
  return list.filter((p) => p.lat != null && p.status !== 'dismissed' && !p.lists.includes('Labeled'))
    .map((p) => ({ place: p, m: metres(at, p) })).filter((x) => x.m <= km * 1000)
    .sort((a, b) => a.m - b.m).slice(0, limit);
}
// what a visit there is, as a trip's activity type (trip-kit.js ACTIVITY_TYPES)
export const activityType = (p) => (/\b(bar|pub|tiki|lounge|restaurant|caf[eé]|coffee|bistro|trattoria|osteria|pizzeria|kitchen|grill|diner|bakery|brewery|tavern|wine)\b/i.test([p.name, p.category, p.note].join(' ')) ? 'dining' : 'sightseeing');

const sub = (p, m) => [m != null && far(m), p.category || p.lists.filter((l) => l !== 'Reviewed' || !p.rating).join(' · '), p.rating && `${'★'.repeat(p.rating)}`].filter(Boolean).join(' · ');

// "Saved nearby": a few places, each a tap from Maps (title: its heading, if it needs one); with addTo, a way to put one on a day of a
// trip ({ dates: [YYYY-MM-DD…], label(date), add(place, date) }: one date is a button, several a picker)
export function nearbyPart(title, spots, addTo = null) {
  const part = el('section', 'today__part saved-near');
  if (title) part.append(el('h2', 'part-title', title));
  const ul = el('ul', 'saved-near__list');
  for (const { place: p, m } of spots) {
    const li = el('li', 'saved-near__row'), a = el('a', 'saved-near__name', p.name);
    Object.assign(a, { href: mapLink(p), target: '_blank', rel: 'noopener' });
    const text = el('div', 'saved-near__text');
    text.append(a, el('span', 'saved-near__more', sub(p, m)));
    li.append(text);
    if (addTo?.dates.length === 1) {
      const b = el('button', 'link-btn saved-near__add', 'Add to this day');
      b.type = 'button';
      b.addEventListener('click', () => { buzz(); addTo.add(p, addTo.dates[0]); });
      li.append(b);
    } else if (addTo?.dates.length > 1) {
      const pick = el('select', 'saved-near__pick');
      pick.setAttribute('aria-label', `Add ${p.name} to a day`);
      pick.append(Object.assign(el('option', '', 'Add to a day…'), { value: '' }), ...addTo.dates.map((d) => Object.assign(el('option', '', addTo.label(d)), { value: d })));
      pick.addEventListener('change', () => { if (pick.value) { addTo.add(p, pick.value); pick.value = ''; } });
      li.append(pick);
    }
    ul.append(li);
  }
  part.append(ul);
  return part;
}

// ---------- Loading ----------
async function fetchAll() {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('places').select('id, name, address, country_code, lat, lon, google_url, lists, category, label, rating, review, note, saved_on, reviewed_on, sensitive, status, visibility, sources, created_at').order('name').range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}
export async function load({ user, offline = false } = {}) {
  uid = user?.id || uid;
  const copyKey = `places-copy:${uid}`;
  try {
    if (offline) throw new Error('offline');
    list = await fetchAll();
    try { localStorage.setItem(copyKey, JSON.stringify(list.filter((p) => p.status !== 'dismissed').map(({ sources, review, ...p }) => p))); } catch (e) {}
  } catch (e) {
    if (e.message !== 'offline') console.warn("The places didn't load:", e.message);
    try { list = JSON.parse(localStorage.getItem(copyKey)) || []; } catch (e2) { list = []; }
  }
  loaded = true;
  draw();
  changed();
}
export function clear() { list = []; uid = null; loaded = false; current = null; $('#places-rows').textContent = ''; }

// ---------- The view ----------
const counts = () => Object.fromEntries(STATUS.map(([s]) => [s, list.filter((p) => s === 'all' || p.status === s).length]));
const listsOf = () => { const n = new Map(); for (const p of list) for (const l of p.lists) n.set(l, (n.get(l) || 0) + 1); return [...n].sort((a, b) => b[1] - a[1]); };
const words = (p) => [p.name, p.address, p.category, p.label, p.note, p.review, ...p.lists].join(' ').toLowerCase();
function shown() {
  const q = $('#places-search').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter((p) => (view.status === 'all' || p.status === view.status) && (!view.list || p.lists.includes(view.list)) && q.every((w) => words(p).includes(w)));
}
const chip = (value, text, n, on, pick) => {
  const b = el('button', '', text);
  b.type = 'button';
  b.setAttribute('aria-pressed', on);
  if (n != null) b.append(el('span', '', String(n)));
  b.addEventListener('click', () => { pick(value); shownN = PAGE; keepView(); draw(); });
  return b;
};
export function draw() {
  const has = list.length > 0;
  $('#places-in').classList.toggle('is-small', has);
  $('#places-in-title').textContent = has ? 'Bring in more' : 'Bring in your Google Maps places';
  $('#places-body').hidden = !has;
  if (!has) return;
  const c = counts();
  if (view.status === 'review' && !c.review) view.status = 'kept';
  $('#places-status-chips').replaceChildren(...STATUS.filter(([s]) => s === 'all' || c[s] || s === view.status).map(([s, t]) => chip(s, t, c[s], view.status === s, (v) => { view.status = v; })));
  const lists = listsOf();
  if (view.list && !lists.some(([l]) => l === view.list)) view.list = '';
  $('#places-lists').replaceChildren(chip('', 'Every list', null, !view.list, (v) => { view.list = v; }), ...lists.map(([l, n]) => chip(l, l, n, view.list === l, (v) => { view.list = v; })));
  listBar();
  const rows = shown(), ul = $('#places-rows');
  ul.replaceChildren(...rows.slice(0, shownN).map(row));
  $('#places-more').hidden = rows.length <= shownN;
  $('#places-more').textContent = `Show more (${rows.length - shownN} left)`;
  $('#places-empty').hidden = !!rows.length;
  $('#places-empty').textContent = view.status === 'review' ? 'Nothing left to review here.' : 'Nothing here.';
  const lost = list.filter((p) => p.lat == null && p.status !== 'dismissed').length;
  $('#places-locate').hidden = !lost;
  $('#places-locate').textContent = `Find where ${plural(lost, 'place')} ${lost === 1 ? 'is' : 'are'} on the map`;
}
function row(p) {
  const li = el('li', `place${p.status === 'dismissed' ? ' is-dismissed' : ''}`), b = el('button', 'place__open');
  b.type = 'button';
  const text = el('span', 'place__text');
  text.append(el('span', 'place__name', p.name), el('span', 'place__more', [p.category || p.address, ...p.lists.filter((l) => l !== view.list), p.rating && '★'.repeat(p.rating)].filter(Boolean).join(' · ')));
  b.append(text);
  if (p.visibility !== 'private') b.append(el('span', `pill${p.visibility === 'public' ? ' pill--ok' : ''}`, p.visibility === 'public' ? 'On the site' : 'Lexi'));
  if (p.lat == null) b.append(el('span', 'pill', 'No location'));
  b.addEventListener('click', () => openPlace(p));
  li.append(b);
  if (p.status === 'review') {
    const keep = el('button', 'btn btn--ghost btn--small place__keep', 'Keep');
    keep.type = 'button';
    keep.setAttribute('aria-label', `Keep ${p.name}`);
    keep.addEventListener('click', () => { buzz(); setStatus([p], 'kept'); });
    li.append(keep);
  }
  return li;
}

// A list, picked: keep everything in it at once, and who sees it (the site: only what's kept and
// can be; the rest stays as it is, and the bar says how many)
function listBar() {
  const l = view.list, bar = $('#places-list-bar');
  bar.hidden = !l;
  if (!l) return;
  const all = list.filter((p) => p.lists.includes(l)), waiting = all.filter((p) => p.status === 'review'), kept = all.filter((p) => p.status === 'kept');
  const never = kept.filter((p) => p.sensitive);
  $('#places-list-text').textContent = `${l}: ${plural(all.length, 'place')}${waiting.length ? `, ${waiting.length} to review` : ''}.`;
  const keepAll = $('#places-keep-all');
  keepAll.hidden = !waiting.length;
  keepAll.textContent = `Keep all ${waiting.length}`;
  $('#places-list-who').hidden = !kept.length;
  const who = new Set(kept.map((p) => p.visibility)), one = who.size === 1 ? [...who][0] : null;
  for (const b of $('#places-list-seg').children) b.setAttribute('aria-pressed', b.dataset.value === one);
  $('#places-list-note').textContent = [
    !one && kept.length ? 'Some of these are shared differently.' : '',
    never.length ? `${plural(never.length, 'place')} here can never be on the site (home, work, labeled places, somewhere you stay, near home), so ${never.length === 1 ? 'it stays' : 'they stay'} with you${one === 'public' ? '' : ' or Lexi'}.` : '',
    waiting.length ? 'Only kept places are shared.' : '',
  ].filter(Boolean).join(' ');
}
$('#places-keep-all').addEventListener('click', async () => {
  const l = view.list, these = list.filter((p) => p.lists.includes(l) && p.status === 'review');
  if (!these.length || busy) return;
  busy = true;
  // one request for the whole list, by what it is, not by ids (hundreds of ids won't fit in an address)
  const { error } = await db.from('places').update({ status: 'kept' }).eq('status', 'review').contains('lists', [l]);
  busy = false;
  if (error) return toast(`Keeping them didn't work: ${error.message}`, true);
  for (const p of these) p.status = 'kept';
  toast(`Kept ${plural(these.length, 'place')} in ${l}.`);
  draw();
  changed();
});
$('#places-list-seg').addEventListener('click', async (e) => {
  const b = e.target.closest('button'), l = view.list;
  if (!b || !l || busy) return;
  const to = b.dataset.value;
  // the site takes only what's kept and can be shown; Lexi and "only you" take everything kept
  const these = list.filter((p) => p.lists.includes(l) && p.status === 'kept' && (to !== 'public' || !p.sensitive) && p.visibility !== to);
  if (!these.length) return draw();
  if (to === 'public' && !confirm(`Put ${plural(these.length, 'place')} from ${l} on the site? Anyone can see them there (the name, where it is and your stars; not the address, notes or reviews).`)) return;
  busy = true;
  let q = db.from('places').update({ visibility: to }).eq('status', 'kept').contains('lists', [l]).neq('visibility', to);
  if (to === 'public') q = q.is('sensitive', null);
  const { error } = await q;
  busy = false;
  if (error) return toast(`That didn't save: ${error.message}`, true);
  for (const p of these) p.visibility = to;
  toast(`${l}: ${plural(these.length, 'place')} now seen by ${WHO[to]}.`);
  draw();
});
$('#places-search').addEventListener('input', () => { shownN = PAGE; draw(); });
$('#places-more').addEventListener('click', () => { shownN += PAGE; draw(); });

async function setStatus(these, status) {
  const ids = these.map((p) => p.id), was = these.map((p) => [p, p.status, p.visibility]);
  // dismissing takes it off the site and away from Lexi too
  const patch = status === 'kept' ? { status } : { status, visibility: 'private' };
  const { error } = await db.from('places').update(patch).in('id', ids);
  if (error) return toast(`That didn't save: ${error.message}`, true);
  for (const p of these) Object.assign(p, patch);
  if (these.length === 1 && status !== 'review') toast(`${status === 'kept' ? 'Kept' : 'Dismissed'} ${these[0].name}.`, false, async () => {
    for (const [p, s, v] of was) { const back = await db.from('places').update({ status: s, visibility: v }).eq('id', p.id); if (!back.error) Object.assign(p, { status: s, visibility: v }); }
    draw(); paintSheet(); changed();
  });
  draw();
  paintSheet();
  changed();
}

// ---------- A place, in a sheet ----------
const placeSheet = $('#place-sheet');
sheetify(placeSheet, () => placeSheet.close());
function openPlace(p) { current = p; paintSheet(); open(placeSheet); }
function paintSheet() {
  const p = current;
  if (!p) return;
  $('#place-lists').textContent = [p.category, ...p.lists].filter(Boolean).join(' · ');
  $('#place-name').textContent = p.name;
  $('#place-address').textContent = p.label && p.label !== p.name ? `${p.label} · ${p.address || ''}` : p.address || (p.lat == null ? 'Not on the map yet' : '');
  $('#place-rating').hidden = !p.rating;
  $('#place-rating').textContent = p.rating ? `${'★'.repeat(p.rating)}${'☆'.repeat(5 - p.rating)} your review${p.reviewed_on ? `, ${new Date(`${p.reviewed_on}T12:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}` : ''}` : '';
  $('#place-review').hidden = !p.review;
  $('#place-review').textContent = p.review ? `“${p.review}”` : '';
  $('#place-note').hidden = !p.note;
  $('#place-note').textContent = p.note || '';
  const map = $('#place-map');
  map.hidden = p.lat == null && !p.google_url;
  if (!map.hidden) map.href = mapLink(p);
  for (const b of $('#place-status').children) b.setAttribute('aria-pressed', b.dataset.value === p.status);
  for (const b of $('#place-who').children) {
    b.setAttribute('aria-pressed', b.dataset.value === p.visibility);
    b.disabled = p.status !== 'kept' || (b.dataset.value === 'public' && !!p.sensitive);
  }
  const why = p.status !== 'kept' ? 'Keep it first to share it.' : p.sensitive ? `${WHY[p.sensitive] || ''} It can be shared with Lexi, but never put on the site.` : '';
  $('#place-why').hidden = !why;
  $('#place-why').textContent = why;
  const from = (p.sources || []).map((s) => s.kind?.replace(/_/g, ' ')).filter(Boolean);
  $('#place-from').textContent = from.length ? `From Google Maps (${[...new Set(from)].join(', ')})` : '';
}
$('#place-status').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && current && current.status !== b.dataset.value) setStatus([current], b.dataset.value); });
$('#place-who').addEventListener('click', async (e) => {
  const b = e.target.closest('button'), p = current;
  if (!b || !p || b.disabled || p.visibility === b.dataset.value) return;
  const to = b.dataset.value;
  const { error } = await db.from('places').update({ visibility: to }).eq('id', p.id);
  if (error) return toast(`That didn't save: ${error.message}`, true);
  p.visibility = to;
  toast(`${p.name}: seen by ${WHO[to]}.`);
  draw();
  paintSheet();
});

// ---------- Bringing them in ----------
const say = (text) => { const s = $('#places-status'); s.hidden = !text; s.textContent = text || ''; };
const decode = (bytes) => new TextDecoder().decode(bytes);
// the files worth reading, from a zip (or the files themselves, dropped on their own); a map's
// .kmz is a zip of its own, opened to its .kml
function filesFrom(name, bytes) {
  if (/\.zip$/i.test(name)) {
    const got = unzipSync(bytes, { filter: (f) => wanted(f.name) });
    return Object.entries(got).flatMap(([path, b]) => filesFrom(path, b));
  }
  const path = pathFor(name);
  if (!wanted(path)) return [];
  if (/\.kmz$/i.test(path)) {
    const kml = Object.entries(unzipSync(bytes, { filter: (f) => /\.kml$/i.test(f.name) }))[0];
    return kml ? [{ path, bytes, text: decode(kml[1]) }] : [];
  }
  return [{ path, bytes, text: decode(bytes) }];
}
const TYPES = { json: 'application/json', csv: 'text/csv', kml: 'application/vnd.google-earth.kml+xml', kmz: 'application/vnd.google-earth.kmz' };
async function bringIn(picked) {
  if (busy || !picked.length) return;
  busy = true;
  $('#places-pick').classList.add('is-busy');
  try {
    say('Opening the file…');
    const files = [];
    for (const f of picked) {
      try { files.push(...filesFrom(f.name, new Uint8Array(await f.arrayBuffer()))); } catch (e) { console.warn(e); }
    }
    if (!files.length) { say(''); toast('No places in that. In Takeout, pick Maps (your places), Saved and My Maps.', true); return; }
    // 1. into the inbox as it came: the files themselves, kept as the evidence
    say('Keeping a copy…');
    const { data: inbox, error } = await db.from('inbox').insert({ kind: 'file', source: 'takeout', name: picked.map((f) => f.name).join(', ').slice(0, 300) }).select().single();
    if (error) throw error;
    const paths = [];
    for (const f of files) {
      const path = `inbox/${uid}/${inbox.id}/${f.path.replace(/^.*?Takeout\//i, '').replace(/[^\w ().,&'-]+/g, '_')}`;
      const up = await db.storage.from('photos').upload(path, f.bytes, { contentType: TYPES[path.split('.').pop().toLowerCase()] || 'application/octet-stream', upsert: true });
      if (up.error) console.warn(up.error.message); else paths.push(path);
    }
    await db.from('inbox').update({ paths }).eq('id', inbox.id);
    // 2. read, and merged into what's there (in a few goes, so no one request is too big)
    const { places, skipped } = readTakeout(files, { inboxId: inbox.id });
    say(`Adding ${plural(places.length, 'place')}…`);
    let added = 0, merged = 0;
    for (let i = 0; i < places.length; i += 400) {
      const { data, error: e2 } = await db.rpc('places_import', { inbox_id: inbox.id, places: places.slice(i, i + 400) });
      if (e2) { await db.from('inbox').update({ status: 'failed', result: { error: e2.message } }).eq('id', inbox.id); throw e2; }
      added += data.added; merged += data.merged;
    }
    say('');
    toast(`${plural(added, 'new place')}${merged ? `, ${merged} already here` : ''}${skipped ? `; ${skipped} had nothing to go on` : ''}.`);
    view = { status: added ? 'review' : view.status, list: '' };
    keepView();
    await load();
    locate();
  } catch (e) {
    say('');
    console.error(e);
    toast(`Bringing them in didn't work: ${e.message}`, true);
  } finally {
    busy = false;
    $('#places-pick').classList.remove('is-busy');
    $('#places-file').value = '';
  }
}
$('#places-file').addEventListener('change', (e) => bringIn([...e.target.files]));

// The ones with no coordinates (a saved list gives none), a batch at a time, by the Places API on
// the server; it says when there's no key yet, or the month's cap is reached
let locating = false;
async function locate({ asked = false } = {}) {
  if (locating || !list.some((p) => p.lat == null && p.status !== 'dismissed')) return;
  locating = true;
  try {
    const { data, error } = await db.functions.invoke('places-locate', { body: {} });
    if (error) throw error;
    if (data.missing_key) { if (asked) toast('Finding them needs the Google Maps key (docs/backend.md, "Secrets").', true); return; }
    if (data.located) { await load(); }
    if (asked || data.located) toast(`${data.located ? `Found ${plural(data.located, 'place')} on the map.` : 'Found none this time.'}${data.left ? ` ${data.left} still to find${data.capped ? " (this month's limit is reached)" : ''}.` : ''}`);
  } catch (e) {
    if (asked) toast(`Finding them didn't work: ${e.message}`, true);
  } finally { locating = false; }
}
$('#places-locate').addEventListener('click', () => locate({ asked: true }));
