// The wardrobe (/apps/wardrobe, apps/wardrobe.html): Steve's clothes, each with a photo cut out
// of its background, what it is, and where to buy another. Private to its owner (table
// public.wardrobe_items; photos under photos/wardrobe/<owner id>/). ChatGPT reads and edits the
// same rows through the wardrobe MCP server (docs/apps.md).
import { $, db, start, fresh, rows, saver, ask, photos, toast } from './lib/kit.js';
import { locate, legWeather } from '../../../supabase/functions/_shared/weather.js';

const items = rows('wardrobe_items');
const tripRows = rows('trips');
const CATS = [['tops', 'Tops'], ['bottoms', 'Bottoms'], ['outerwear', 'Outerwear'], ['suits', 'Suits'], ['shoes', 'Shoes'], ['accessories', 'Accessories'], ['workout', 'Workout'], ['swim', 'Swim']];
const catName = Object.fromEntries(CATS);
let list = [], links = new Map(), failed = false, uid = null;
let view = { cat: '', season: '', dress: '', shelf: 'in', tab: 'closet' };
try { Object.assign(view, JSON.parse(localStorage.getItem('wardrobe-view'))); } catch (e) {}
const tiles = new Map(); // item id → its tile

const href = (link) => (/^https?:\/\//i.test(link) ? link : `https://${link}`);
const folder = () => `wardrobe/${uid}`;
for (const sel of ['#add-category', '[data-is="category"]']) $(sel).append(...CATS.map(([v, t]) => new Option(t, v)));

// ---------- The closet: category chips, filters, a grid of tiles ----------
function paintTile(it) {
  const tile = tiles.get(it.id), img = $('img', tile), url = it.photo_path && links.get(it.photo_path);
  $('.tile__name', tile).textContent = it.name;
  $('.tile__meta', tile).textContent = [it.brand, it.size].filter(Boolean).join(' · ');
  if (url && img.src !== url) img.src = url;
  img.alt = it.name;
  img.hidden = !url;
  $('.tile__none', tile).hidden = !!url;
  $('.tile__none', tile).textContent = catName[it.category]?.[0] || '';
}

function render() {
  const q = $('#search').value.trim().toLowerCase();
  const shelf = list.filter((it) => it.retired === (view.shelf === 'retired'));
  const fits = (it) => (!view.season || it.seasons?.includes(view.season)) && (!view.dress || it.dressiness === view.dress)
    && (!q || [it.name, it.brand, it.colour, it.material, it.notes].join(' ').toLowerCase().includes(q));
  const counts = Object.fromEntries(CATS.map(([c]) => [c, shelf.filter((it) => it.category === c && fits(it)).length]));
  // the chips: All, then each category that has something (and the one picked, even if empty)
  const cats = $('#cats');
  cats.textContent = '';
  for (const [c, t] of [['', 'All'], ...CATS]) {
    const n = c ? counts[c] : Object.values(counts).reduce((a, b) => a + b, 0);
    if (c && !n && view.cat !== c) continue;
    const b = Object.assign(document.createElement('button'), { type: 'button' });
    b.dataset.value = c;
    b.setAttribute('aria-pressed', view.cat === c);
    b.append(t, Object.assign(document.createElement('span'), { textContent: n }));
    cats.append(b);
  }
  const order = (a, b) => CATS.findIndex(([c]) => c === a.category) - CATS.findIndex(([c]) => c === b.category) || a.name.localeCompare(b.name);
  let shown = 0;
  for (const it of [...list].sort(order)) {
    if (!tiles.has(it.id)) build(it);
    const tile = tiles.get(it.id), match = shelf.includes(it) && (!view.cat || it.category === view.cat) && fits(it);
    tile.hidden = !match;
    if (match) shown++;
    $('#grid').append(tile);
  }
  $('#empty').hidden = shown > 0;
  $('#empty').textContent = failed ? "The wardrobe didn't load. Reload the page to try again."
    : !list.length ? 'Nothing here yet. Add something: a photo, or a link to it in a shop.'
    : view.shelf === 'retired' && !shelf.length ? 'Nothing retired.' : 'Nothing matches that.';
}

function build(it) {
  const tile = $('#tile').content.firstElementChild.cloneNode(true);
  tiles.set(it.id, tile);
  $('.tile__open', tile).addEventListener('click', () => openSheet(it));
  paintTile(it);
}

const look = (change) => {
  Object.assign(view, change);
  try { localStorage.setItem('wardrobe-view', JSON.stringify(view)); } catch (e) {}
  render();
};
$('#search').addEventListener('input', render);
$('#cats').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) look({ cat: b.dataset.value }); });
for (const [id, key] of [['#season', 'season'], ['#dress', 'dress'], ['#shelf', 'shelf']]) {
  $(id).value = view[key];
  $(id).addEventListener('input', (e) => look({ [key]: e.target.value }));
}

// ---------- A photo, cut out of its background ----------
// The cutting out runs in the browser (@imgly/background-removal; its model, about 40 MB, comes
// from imgly's CDN the first time and is cached). If it can't, the photo is kept as taken.
let cutter = null;
async function cutOut(file, status) {
  try {
    cutter ??= import('@imgly/background-removal');
    const { removeBackground } = await cutter;
    status?.('Cutting it out of the background…');
    const blob = await removeBackground(file, { model: 'isnet_quint8', output: { format: 'image/png' }, progress: (key, at, of) => { if (/fetch/.test(key) && of) status?.(`Getting ready (first time only)… ${Math.round((100 * at) / of)}%`); } });
    return new File([blob], 'cutout.png', { type: 'image/png' });
  } catch (e) {
    console.warn("Couldn't cut the photo out:", e); // handled: it's kept as taken
    return null;
  }
}
// Cuts out and stores a photo; returns its path (the original, if it couldn't be cut out)
async function storePhoto(file, status) {
  const cut = await cutOut(file, status);
  if (!cut) toast("Couldn't cut that one out; kept the photo as taken.");
  return photos.put(cut || file, folder(), { alpha: !!cut, longest: 1200 });
}

// ---------- Adding: a photo, or a link to it in a shop ----------
let pending = null; // what the add dialog has so far: { photo: Promise<path>, preview, from link: brand, price, currency, link }
$('#add').addEventListener('click', async () => {
  pending = {};
  const dialog = $('#add-dialog'), preview = $('#add-preview');
  preview.hidden = true;
  $('#add-ok').disabled = false;
  const values = await ask(dialog);
  const got = pending;
  pending = null;
  if (!values) { got.photo?.then((p) => photos.remove(p)); return; } // cancelled: nothing stays behind
  $('#add').disabled = true;
  const path = got.photo ? await got.photo : got.photo_path || null;
  const row = {
    name: values.name.trim(), category: values.category, photo_path: path,
    brand: got.brand || null, price: got.price ?? null, currency: got.currency || 'USD', buy_link: got.link || values.link.trim() || null,
  };
  const added = await items.add([row]);
  $('#add').disabled = false;
  if (!added) { photos.remove(path); return; }
  list.push(...added);
  if (path) links = new Map([...links, ...(await photos.urls([path]))]);
  view.shelf = 'in';
  render();
  openSheet(added[0]); // the rest of what it is, while it's in hand
});
const showPreview = (url, text) => {
  const preview = $('#add-preview');
  preview.hidden = false;
  if (url) $('img', preview).src = url;
  $('img', preview).hidden = !url;
  $('#add-status').textContent = text;
};
$('#add-photo input').addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file || !pending) return;
  const mine = pending;
  showPreview(URL.createObjectURL(file), 'Cutting it out of the background…');
  $('#add-ok').disabled = true;
  mine.photo = storePhoto(file, (t) => { if (pending === mine) showPreview(null, t); }).then(async (path) => {
    if (pending === mine) {
      const url = path && (await photos.urls([path])).get(path);
      showPreview(url || null, path ? 'Ready.' : "The photo didn't upload; you can add one later.");
      $('#add-ok').disabled = false;
    }
    return path;
  });
});
$('#read-link').addEventListener('click', async () => {
  const form = $('#add-dialog form'), link = form.link.value.trim();
  if (!link || !pending) return;
  const mine = pending, button = $('#read-link');
  button.disabled = true;
  showPreview(null, 'Reading the page…');
  const { data, error } = await db.functions.invoke('wardrobe-link', { body: { url: link } });
  button.disabled = false;
  if (pending !== mine) return;
  if (error || !data) { showPreview(null, "Couldn't read that page. Name it yourself; the link is kept."); return; }
  Object.assign(mine, { brand: data.brand, price: data.price, currency: data.currency, link: data.link, photo_path: data.photo_path });
  if (data.name && !form.name.value) form.name.value = data.name;
  const url = data.photo_path && (await photos.urls([data.photo_path])).get(data.photo_path);
  showPreview(url || null, data.name ? `From ${new URL(data.link).hostname.replace(/^www\./, '')}${data.price != null ? `, ${data.price} ${data.currency || ''}` : ''}.` : "That shop doesn't say much. Name it yourself; the link is kept.");
});

// ---------- An item's sheet: everything about it, saved as it's typed ----------
const sheet = $('#sheet');
let current = null;
async function save(patch) {
  const it = current;
  if (!it || !(await items.set(it.id, patch))) return false;
  Object.assign(it, patch);
  paintTile(it);
  paintSheet();
  return true;
}
function paintSheet() {
  const it = current;
  if (!it) return;
  const img = $('.sheet__photo img', sheet), url = it.photo_path && links.get(it.photo_path);
  if (url && img.src !== url) img.src = url;
  img.alt = it.name;
  img.hidden = !url;
  $('.sheet__photo .tile__none', sheet).hidden = !!url;
  $('.sheet__photo .tile__none', sheet).textContent = catName[it.category]?.[0] || '';
  $('#buy').hidden = !it.buy_link;
  if (it.buy_link) $('#buy').href = href(it.buy_link);
  $('#find').href = `https://www.google.com/search?tbm=shop&q=${encodeURIComponent([it.brand, it.name, it.colour].filter(Boolean).join(' '))}`;
  $('#find').textContent = it.buy_link ? 'Or find another' : 'Find another';
  $('#retire').textContent = it.retired ? 'Back in the closet' : 'Retire it (worn out, given away)';
  $('#sheet-photo span').textContent = it.photo_path ? 'Change the photo' : 'Add a photo';
}
function openSheet(it) {
  current = it;
  for (const el of sheet.querySelectorAll('[data-is]')) { el.value = it[el.dataset.is] ?? ''; delete el.dataset.save; }
  for (const box of sheet.querySelectorAll('.sheet__seasons input')) box.checked = !!it.seasons?.includes(box.value);
  paintSheet();
  sheet.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => sheet.close(); });
  sheet.showModal();
}
// text saves as it's typed; the rest at once
const TEXT = ['name', 'brand', 'colour', 'size', 'material', 'fit', 'buy_link', 'notes'];
for (const field of TEXT) {
  const el = $(`[data-is="${field}"]`, sheet);
  saver(el, (value) => (field === 'name' && !value.trim() ? Promise.resolve(false) : save({ [field]: value.trim() || null })));
}
for (const field of ['category', 'warmth', 'dressiness', 'bought_on']) {
  $(`[data-is="${field}"]`, sheet).addEventListener('change', (e) => save({ [field]: e.target.value || null }).then(() => render()));
}
$('[data-is="price"]', sheet).addEventListener('change', (e) => {
  const n = parseFloat(e.target.value.replace(/[^\d.]/g, ''));
  save({ price: isNaN(n) ? null : n });
});
$('[data-is="currency"]', sheet).addEventListener('change', (e) => {
  const c = e.target.value.trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(c)) save({ currency: c }); else e.target.value = current.currency;
});
$('.sheet__seasons', sheet).addEventListener('change', () => save({ seasons: [...sheet.querySelectorAll('.sheet__seasons input:checked')].map((b) => b.value) }).then(() => render()));
// closing saves what's still being typed, before the sheet moves on to another item
sheet.addEventListener('close', () => { for (const field of TEXT) $(`[data-is="${field}"]`, sheet).dispatchEvent(new Event('change')); setTimeout(() => { current = null; render(); }, 0); });
$('#retire').addEventListener('click', async () => {
  const was = current.retired;
  if (await save({ retired: !was })) { sheet.close(); toast(was ? 'Back in the closet.' : 'Retired. It\'s under "Retired" if you want it back.'); }
});
$('#remove').addEventListener('click', async () => {
  const it = current;
  if (!confirm(`Delete "${it.name}" for good? (Retiring keeps it.)`) || !(await items.remove(it.id))) return;
  photos.remove(it.photo_path);
  list = list.filter((x) => x !== it);
  tiles.get(it.id)?.remove();
  tiles.delete(it.id);
  sheet.close();
});
$('#sheet-photo input').addEventListener('change', async (e) => {
  const file = e.target.files?.[0], it = current, slot = $('#sheet-photo');
  e.target.value = '';
  if (!file || !it || slot.classList.contains('is-busy')) return;
  slot.classList.add('is-busy');
  $('span', slot).textContent = 'Cutting it out…';
  const old = it.photo_path, path = await storePhoto(file);
  if (path) {
    links.set(path, (await photos.urls([path])).get(path) || URL.createObjectURL(file));
    const ok = await items.set(it.id, { photo_path: path });
    if (ok) { it.photo_path = path; paintTile(it); if (current === it) paintSheet(); }
    photos.remove(ok ? old : path);
  }
  slot.classList.remove('is-busy');
  if (current === it) paintSheet();
});

// ---------- Trips: where and when, the weather, what to wear each day, what to pack ----------
// Mostly built in ChatGPT (the MCP server's trip tools); here they're shown, the packing is ticked
// off, and a trip can be started or its places and dates changed.
let trips = [], openTrip = null;
const weatherCache = new Map(); // leg key → Promise of its weather
const fmtDay = (d, opts = {}) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: opts.weekday ? 'short' : undefined, day: 'numeric', month: 'short' });
const span = (t) => (t.legs.length ? [t.legs[0].from, t.legs[t.legs.length - 1].to] : [null, null]);
const legWeatherCached = (l) => {
  const key = `${l.lat},${l.lon},${l.from},${l.to}`;
  if (!weatherCache.has(key)) weatherCache.set(key, legWeather(l).catch(() => null));
  return weatherCache.get(key);
};
const el = (tag, cls, text) => Object.assign(document.createElement(tag), cls ? { className: cls } : {}, text != null ? { textContent: text } : {});

function showTab(tab) {
  view.tab = tab;
  try { localStorage.setItem('wardrobe-view', JSON.stringify(view)); } catch (e) {}
  for (const b of $('#tabs').children) b.setAttribute('aria-pressed', b.dataset.value === tab);
  $('#closet-view').hidden = tab !== 'closet';
  $('#trips-view').hidden = tab !== 'trips';
  if (tab === 'trips') (openTrip ? drawTrip() : drawTrips());
}
$('#tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) showTab(b.dataset.value); });

function drawTrips() {
  $('#trip-list-view').hidden = false;
  $('#trip').hidden = true;
  const list = $('#trip-list');
  list.textContent = '';
  const sorted = [...trips].sort((a, b) => (span(b)[0] || '').localeCompare(span(a)[0] || ''));
  for (const t of sorted) {
    const [a, b] = span(t);
    const li = el('li'), btn = el('button', 'trip-card');
    btn.type = 'button';
    btn.append(el('span', 'trip-card__name', t.name), el('span', 'trip-card__when', a ? `${fmtDay(a)} – ${fmtDay(b)}` : 'No dates yet'), el('span', 'trip-card__legs', t.legs.map((l) => l.place).join(' → ')));
    btn.addEventListener('click', () => { openTrip = t; drawTrip(); });
    li.append(btn);
    list.append(li);
  }
  $('#trips-empty').hidden = trips.length > 0;
  $('#trips-empty').textContent = 'No trips yet. Start one here, or ask ChatGPT to plan one.';
}

function itemChip(id, { opens = true } = {}) {
  const it = list.find((x) => x.id === id), chip = el('span', 'chip-item');
  const ph = el('span', 'chip-item__photo'), url = it?.photo_path && links.get(it.photo_path);
  if (url) ph.append(Object.assign(document.createElement('img'), { src: url, alt: '', loading: 'lazy' }));
  else ph.textContent = it ? catName[it.category]?.[0] || '' : '?';
  chip.append(ph, el('span', 'chip-item__name', it ? it.name : 'No longer in the wardrobe'));
  if (it && opens) { chip.tabIndex = 0; chip.role = 'button'; chip.addEventListener('click', () => openSheet(it)); chip.addEventListener('keydown', (e) => { if (e.key === 'Enter') openSheet(it); }); }
  return chip;
}

async function drawTrip() {
  const t = openTrip;
  if (!t) return drawTrips();
  $('#trip-list-view').hidden = true;
  $('#trip').hidden = false;
  const [a, b] = span(t);
  $('#trip-name').textContent = t.name;
  $('#trip-when').textContent = a ? `${fmtDay(a)} – ${fmtDay(b)} · ${t.legs.length} place${t.legs.length === 1 ? '' : 's'}` : '';
  $('#trip-notes').hidden = !t.notes;
  $('#trip-notes').textContent = t.notes || '';
  // the legs, each with its weather
  const legs = $('#legs');
  legs.textContent = '';
  const weather = await Promise.all(t.legs.map(legWeatherCached));
  if (openTrip !== t) return;
  t.legs.forEach((l, i) => {
    const w = weather[i], li = el('li', 'leg');
    li.append(el('h3', 'leg__place', `${l.place}${l.country ? `, ${l.country}` : ''}`), el('p', 'leg__when', `${fmtDay(l.from)} – ${fmtDay(l.to)}`));
    if (w) {
      const s = w.summary;
      li.append(el('p', 'leg__weather', `${w.kind === 'forecast' ? 'Forecast' : w.kind === 'mixed' ? 'Forecast, then typical' : 'Typically'}: highs ${s.hi}°, lows ${s.lo}°, about ${s.wet} day${s.wet === 1 ? '' : 's'} of rain`));
      const strip = el('ol', 'leg__days');
      strip.setAttribute('aria-label', `Day by day in ${l.place}`);
      for (const d of w.days) {
        const day = el('li', `wx${d.kind === 'typical' ? ' wx--typical' : ''}`);
        day.title = `${fmtDay(d.date, { weekday: true })}: ${d.hi}° / ${d.lo}°, ${d.rain}% chance of rain${d.kind === 'typical' ? ' (typical)' : ''}`;
        day.style.setProperty('--hi', d.hi ?? 0);
        day.style.setProperty('--rain', (d.rain ?? 0) / 100);
        day.append(el('span', 'wx__hi', d.hi != null ? `${Math.round(d.hi)}°` : '–'));
        strip.append(day);
      }
      li.append(strip);
    } else li.append(el('p', 'leg__weather', 'Weather unavailable right now.'));
    legs.append(li);
  });
  // day by day: the planned days, each with its place, weather and outfit
  const days = $('#days');
  days.textContent = '';
  const wxOn = (date) => { for (const w of weather) { const d = w?.days.find((x) => x.date === date); if (d) return d; } return null; };
  const placeOn = (date) => (t.legs.find((l) => l.from <= date && date <= l.to) || {}).place;
  for (const d of [...t.days].sort((x, y) => x.date.localeCompare(y.date))) {
    const li = el('li', 'day'), w = wxOn(d.date);
    const head = el('p', 'day__head');
    head.append(el('strong', '', fmtDay(d.date, { weekday: true })), ` · ${placeOn(d.date) || ''}${w ? ` · ${Math.round(w.hi)}°/${Math.round(w.lo)}°, ${w.rain}% rain` : ''}`);
    li.append(head);
    if (d.occasion) li.append(el('p', 'day__occasion', d.occasion));
    const outfit = el('div', 'day__outfit');
    d.items.forEach((id) => outfit.append(itemChip(id)));
    li.append(outfit);
    if (d.note) li.append(el('p', 'day__note', d.note));
    days.append(li);
  }
  const total = a ? Math.round((new Date(`${b}T12:00`) - new Date(`${a}T12:00`)) / 864e5) + 1 : 0;
  $('#days-empty').hidden = false;
  $('#days-empty').textContent = t.days.length ? `${t.days.length} of ${total} days planned.` : 'No outfits planned yet. Ask ChatGPT: "plan what I wear each day of my trip".';
  drawPacking();
}

function drawPacking() {
  const t = openTrip, ul = $('#packing');
  ul.textContent = '';
  const done = t.packing.filter((p) => p.packed).length;
  $('#pack-count').textContent = t.packing.length ? `${done} of ${t.packing.length}` : '';
  const bar = $('#pack-progress');
  bar.hidden = !t.packing.length;
  bar.firstElementChild.style.setProperty('--p', `${t.packing.length ? (100 * done) / t.packing.length : 0}%`);
  bar.setAttribute('aria-valuemax', t.packing.length);
  bar.setAttribute('aria-valuenow', done);
  // what's from the wardrobe first, by category; then the rest
  const order = (p) => { const it = p.item_id && list.find((x) => x.id === p.item_id); return it ? CATS.findIndex(([c]) => c === it.category) : 99; };
  t.packing.map((p, i) => [p, i]).sort((x, y) => order(x[0]) - order(y[0])).forEach(([p, i]) => {
    const li = el('li', `pack${p.packed ? ' is-packed' : ''}`), label = el('label', 'pack__tick');
    const box = Object.assign(document.createElement('input'), { type: 'checkbox', checked: !!p.packed });
    box.addEventListener('change', () => savePacking(t, (list2) => { list2[i] = { ...list2[i], packed: box.checked }; }));
    label.append(box, p.item_id ? itemChip(p.item_id, { opens: false }) : el('span', 'pack__label', p.label)); // a tap ticks it
    if (p.qty > 1) label.append(el('span', 'pack__qty', `× ${p.qty}`));
    const x = el('button', 'link-btn pack__x', '×');
    x.type = 'button';
    x.setAttribute('aria-label', `Take ${p.label || 'it'} off the list`);
    x.addEventListener('click', () => savePacking(t, (list2) => { list2.splice(i, 1); }));
    li.append(label, x);
    ul.append(li);
  });
}
async function savePacking(t, change) {
  const next = t.packing.map((p) => ({ ...p }));
  change(next);
  if (await tripRows.set(t.id, { packing: next })) t.packing = next;
  if (openTrip === t) drawPacking();
}
$('#pack-add').addEventListener('submit', (e) => {
  e.preventDefault();
  const label = e.target.label.value.trim();
  if (!label || !openTrip) return;
  e.target.reset();
  savePacking(openTrip, (l) => { l.push({ label, qty: 1, packed: false }); });
});
$('#trip-back').addEventListener('click', () => { openTrip = null; drawTrips(); });

// Starting a trip, or changing its places and dates (the places are looked up for the weather)
function legRow(l = {}) {
  const row = $('#leg-row').content.firstElementChild.cloneNode(true);
  for (const k of ['place', 'from', 'to']) $(`[data-k="${k}"]`, row).value = l[k] || '';
  $('.leg-row__x', row).addEventListener('click', () => { if ($('#leg-rows').querySelectorAll('.leg-row').length > 1) row.remove(); });
  $('#leg-rows').append(row);
}
$('#add-leg').addEventListener('click', () => {
  const last = [...$('#leg-rows').querySelectorAll('.leg-row')].pop();
  legRow({ from: last && $('[data-k="to"]', last).value });
});
async function editTrip(t) {
  const dialog = $('#trip-dialog');
  $('#trip-dialog-title').textContent = t ? 'Edit the trip' : 'New trip';
  $('#trip-remove').hidden = !t;
  const opened = ask(dialog); // resets the form, so fill it after
  const form = $('form', dialog);
  form.name.value = t?.name || '';
  form.notes.value = t?.notes || '';
  $('#leg-rows').querySelectorAll('.leg-row').forEach((r) => r.remove());
  (t?.legs.length ? t.legs : [{}]).forEach((l) => legRow({ ...l, place: l.place && l.country ? `${l.place}, ${l.country}` : l.place }));
  $('#trip-remove').onclick = async () => {
    if (!confirm(`Delete "${t.name}" and everything planned for it?`) || !(await tripRows.remove(t.id))) return;
    trips = trips.filter((x) => x !== t);
    openTrip = null;
    dialog.close('');
    drawTrips();
  };
  const v = await opened;
  if (!v) return;
  const rowsIn = [...$('#leg-rows').querySelectorAll('.leg-row')].map((r) => Object.fromEntries(['place', 'from', 'to'].map((k) => [k, $(`[data-k="${k}"]`, r).value.trim()])));
  const legs = [];
  for (const l of rowsIn) {
    if (!l.place || !l.from || !l.to || l.to < l.from) { toast(`Check the dates for ${l.place || 'each place'}.`, true); return; }
    const where = await locate(l.place).catch(() => null);
    if (!where) { toast(`Couldn't find ${l.place}. Try the city and country.`, true); return; }
    legs.push({ place: where.name, country: where.country, lat: where.lat, lon: where.lon, from: l.from, to: l.to });
  }
  legs.sort((x, y) => x.from.localeCompare(y.from));
  const values = { name: v.name.trim(), notes: v.notes.trim() || null, legs };
  if (t) { if (await tripRows.set(t.id, values)) { Object.assign(t, values); drawTrip(); } }
  else { const added = await tripRows.add([{ ...values, days: [], packing: [] }]); if (added) { trips.push(...added); openTrip = added[0]; drawTrip(); } }
}
$('#new-trip').addEventListener('click', () => editTrip(null));
$('#trip-edit').addEventListener('click', () => openTrip && editTrip(openTrip));

// ---------- Loading ----------
async function load() {
  const [got, gotTrips] = await Promise.all([items.list('name'), tripRows.list('created_at')]);
  failed = !got;
  list = got || [];
  trips = gotTrips || [];
  if (openTrip) openTrip = trips.find((t) => t.id === openTrip.id) || null;
  links = await photos.urls(list.map((it) => it.photo_path).filter(Boolean));
  tiles.clear();
  $('#grid').textContent = '';
  render();
  showTab(view.tab);
}
start(async (user) => { uid = user.id; await load(); }, () => { list = []; trips = []; openTrip = null; tiles.clear(); $('#grid').textContent = ''; });
fresh(load);
