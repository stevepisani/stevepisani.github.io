// The wardrobe (/apps/wardrobe, apps/wardrobe.html): Steve's clothes, each with a photo cut out
// of its background, what it is, and where to buy another; and his trips, with the weather, what
// to wear each day and what to pack. Private to its owner (tables public.wardrobe_items,
// public.trips and the trip's parts: trip_packing, trip_bags, trip_transport, trip_lodging,
// trip_resources; photos under photos/wardrobe/<owner id>/). A garment may belong to a variant and
// product (wardrobe_variants, wardrobe_products: the maker's facts, filed by ChatGPT); the app
// reads the flat view (wardrobe_closet) and changes only the garment itself. ChatGPT reads and
// edits the same rows through the wardrobe MCP server (docs/apps.md).
//
// It works with no signal (a train, a plane): every load keeps a copy on the phone (the rows, the
// photo links, the weather; the photos themselves in a cache the service worker, /apps/offline.js,
// answers from), and with no connection the app opens on that copy. Changes to packing entries
// made then are kept and sent when the connection's back.
import { $, db, start, fresh, rows, saver, ask, photos, toast } from './lib/kit.js';
import { locate, legWeather } from '../../../supabase/functions/_shared/weather.js';

const items = rows('wardrobe_items', { trash: true }); // each garment Steve owns; written here (deleting moves to the trash)
const closet = rows('wardrobe_closet'); // (the view leaves the trash out) // the same, with its product's and variant's facts filled in; read here
const photoRows = rows('wardrobe_photos', { trash: true }); // every photo of a garment, with its role
const tripRows = rows('trips', { trash: true });
// a trip's parts, each its own rows: what to pack, the bags, getting there, where to stay, links
const PARTS = ['trip_packing', 'trip_bags', 'trip_transport', 'trip_lodging', 'trip_resources'];
const partRows = Object.fromEntries(PARTS.map((p) => [p, rows(p)]));
const noParts = () => Object.fromEntries(PARTS.map((p) => [p, []]));
const CATS = [['tops', 'Tops'], ['bottoms', 'Bottoms'], ['outerwear', 'Outerwear'], ['suits', 'Suits'], ['shoes', 'Shoes'], ['accessories', 'Accessories'], ['workout', 'Workout'], ['swim', 'Swim']];
const catName = Object.fromEntries(CATS);
let list = [], links = new Map(), failed = false, uid = null, offline = false;
let view = { cat: '', season: '', dress: '', shelf: 'in', tab: 'closet' };
try { Object.assign(view, JSON.parse(localStorage.getItem('wardrobe-view'))); } catch (e) {}
const tiles = new Map(); // item id → its tile

const href = (link) => (/^https?:\/\//i.test(link) ? link : `https://${link}`);
const folder = () => `wardrobe/${uid}`;
const keep = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} };
const kept = (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } };
const el = (tag, cls, text) => Object.assign(document.createElement(tag), cls ? { className: cls } : {}, text != null ? { textContent: text } : {});
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
for (const sel of ['#add-category', '[data-is="category"]']) $(sel).append(...CATS.map(([v, t]) => new Option(t, v)));

// A photo, small: the cut-out on its soft tile, or the category's letter when there's none
function thumb(it, cls = 'tile__photo') {
  const box = el('span', cls), url = it?.photo_path && links.get(it.photo_path);
  if (url) box.append(Object.assign(document.createElement('img'), { src: url, alt: '', loading: 'lazy', decoding: 'async' }));
  else box.append(el('span', 'tile__none', it ? catName[it.category]?.[0] || '' : '?'));
  return box;
}

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
  const on = [view.season, view.dress, view.shelf !== 'in'].filter(Boolean).length;
  $('#filter-n').textContent = on ? `(${on})` : '';
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
  $('.tile__open', tile).addEventListener('click', () => openItem(it));
  paintTile(it);
}

const saveView = () => keep('wardrobe-view', view);
const look = (change) => {
  Object.assign(view, change);
  saveView();
  render();
};
$('#search').addEventListener('input', render);
$('#cats').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) look({ cat: b.dataset.value }); });
for (const [id, key] of [['#season', 'season'], ['#dress', 'dress'], ['#shelf', 'shelf']]) {
  $(id).value = view[key];
  $(id).addEventListener('input', (e) => look({ [key]: e.target.value }));
}
// the filters fold away on a phone, where the closet is what matters; on a wider screen they're out
$('#filters').open = matchMedia('(min-width: 561px)').matches;

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
  if (offline) { toast("You're offline. Adding has to wait for a connection.", true); return; }
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
  if (path) {
    photoRows.add([{ item_id: added[0].id, role: 'garment', path, source: got.photo ? 'app_upload' : 'retailer_page' }]);
    links = new Map([...links, ...(await photos.urls([path]))]);
  }
  view.shelf = 'in';
  render();
  keepCopy();
  openItem(added[0], 'edit'); // the rest of what it is, while it's in hand
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

// ---------- An item: what it is first, the fields behind Edit; saved as they're typed ----------
const sheet = $('#sheet');
let current = null;
async function save(patch) {
  const it = current;
  if (!it) return false;
  if (offline) { toast("You're offline. Changes have to wait for a connection.", true); return false; }
  if (!(await items.set(it.id, patch))) return false;
  Object.assign(it, patch);
  paintTile(it);
  paintSheet();
  keepCopy();
  return true;
}
const money = (n, cur) => { try { return n.toLocaleString(undefined, { style: 'currency', currency: cur || 'USD', maximumFractionDigits: n % 1 ? 2 : 0 }); } catch (e) { return `${n} ${cur || ''}`; } };
function paintSheet() {
  const it = current;
  if (!it) return;
  const img = $('.sheet__photo img', sheet), url = it.photo_path && links.get(it.photo_path);
  if (url && img.src !== url) img.src = url;
  img.alt = it.name;
  img.hidden = !url;
  $('.sheet__photo .tile__none', sheet).hidden = !!url;
  $('.sheet__photo .tile__none', sheet).textContent = catName[it.category]?.[0] || '';
  // what it is, in a few lines
  $('#sv-cat').textContent = `${catName[it.category] || ''}${it.retired ? ' · retired' : ''}`;
  $('#sv-name').textContent = it.name;
  $('#sv-facts').textContent = [it.brand, it.manufacturer_colour || it.colour, it.material, it.size && `size ${it.size}`].filter(Boolean).join(' · ');
  $('#sv-fit').textContent = [it.fit && `Fit: ${it.fit}`, it.style_number && `Style ${it.style_number}`, it.condition && `Condition: ${it.condition}`].filter(Boolean).join(' · ');
  $('#sv-tags').replaceChildren(...[it.subcategory?.replace(/_/g, ' '), ...(it.seasons || []), { light: 'light', mid: 'mid-weight', warm: 'warm' }[it.warmth], it.dressiness, ...(it.dressiness_also || []).map((d) => `also ${d}`), ...(it.style_tags || [])].filter(Boolean).map((t) => el('span', 'pill', t)));
  $('#sheet-shared').hidden = !it.variant_id;
  const bought = it.bought_on && new Date(`${it.bought_on}T12:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  $('#sv-bought').textContent = [it.price != null && money(Number(it.price), it.currency), bought && `bought ${bought}`].filter(Boolean).join(', ');
  $('#sv-notes').textContent = it.notes || '';
  $('#buy').hidden = !it.buy_link;
  if (it.buy_link) $('#buy').href = href(it.buy_link);
  $('#find').href = `https://www.google.com/search?tbm=shop&q=${encodeURIComponent([it.brand, it.name, it.colour].filter(Boolean).join(' '))}`;
  $('#find').textContent = it.buy_link ? 'Or find another' : 'Find another';
  $('#retire').textContent = it.retired ? 'Back in the closet' : 'Retire it (worn out, given away)';
  $('#sheet-photo span').textContent = 'Add a photo';
  paintPhotos();
}
function openSheet(it, mode = 'view') {
  current = it;
  for (const f of sheet.querySelectorAll('[data-is]')) { f.value = it[f.dataset.is] ?? ''; delete f.dataset.save; }
  for (const box of sheet.querySelectorAll('.sheet__seasons input')) box.checked = !!it.seasons?.includes(box.value);
  sheet.dataset.mode = mode;
  sheetPhotos = [];
  picked = null;
  paintSheet();
  loadPhotos(it);
  sheet.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => sheet.close(); });
  if (!sheet.open) sheet.showModal();
}
$('#sheet-edit').addEventListener('click', () => {
  if (offline) { toast("You're offline. Changes have to wait for a connection.", true); return; }
  sheet.dataset.mode = 'edit';
  $('[data-is="name"]', sheet).focus();
});
// text saves as it's typed; the rest at once
const TEXT = ['name', 'brand', 'colour', 'size', 'material', 'fit', 'condition', 'buy_link', 'notes'];
for (const field of TEXT) {
  const f = $(`[data-is="${field}"]`, sheet);
  saver(f, (value) => (field === 'name' && !value.trim() && !current?.variant_id ? Promise.resolve(false) : save({ [field]: value.trim() || null })));
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
// closing saves what's still being typed, before the sheet moves on to another item; then the
// address goes back to the view underneath
sheet.addEventListener('close', () => {
  if (sheet.dataset.mode === 'edit') for (const field of TEXT) $(`[data-is="${field}"]`, sheet).dispatchEvent(new Event('change'));
  if (here()[0] === 'item') { if (pushedItem) history.back(); else history.replaceState(null, '', `#${shownHash}`); }
  pushedItem = false;
  setTimeout(() => { if (!sheet.open) { current = null; redraw(); } }, 0);
});
$('#retire').addEventListener('click', async () => {
  const it = current, was = it.retired;
  if (!(await save({ retired: !was }))) return;
  sheet.close();
  toast(was ? 'Back in the closet.' : 'Retired. It\'s under "Retired" in the filters.', false, async () => {
    if (await items.set(it.id, { retired: was })) { it.retired = was; keepCopy(); render(); }
  });
});
$('#remove').addEventListener('click', async () => {
  const it = current;
  if (!confirm(`Move "${it.name}" to the trash? It can be restored for 30 days. (Retiring keeps it in the closet's history.)`)) return;
  if (!(await items.remove(it.id))) return; // its photos and files stay until the trash is emptied
  list = list.filter((x) => x !== it);
  tiles.get(it.id)?.remove();
  tiles.delete(it.id);
  keepCopy();
  sheet.close();
});
$('#sheet-photo input').addEventListener('change', async (e) => {
  const file = e.target.files?.[0], it = current, slot = $('#sheet-photo');
  e.target.value = '';
  if (!file || !it || slot.classList.contains('is-busy')) return;
  slot.classList.add('is-busy');
  $('span', slot).textContent = 'Cutting it out…';
  const path = await storePhoto(file);
  if (path) {
    links.set(path, (await photos.urls([path])).get(path) || URL.createObjectURL(file));
    const added = await photoRows.add([{ item_id: it.id, role: 'garment', path, source: 'app_upload' }]);
    if (added) {
      sheetPhotos.push(...added);
      const shown = sheetPhotos.find((p) => p.path === it.photo_path);
      if (!it.photo_path || (shown && shown.role !== 'garment')) await showPhoto(it, added[0]); // a new garment photo beats a tag
    } else photos.remove(path);
  }
  slot.classList.remove('is-busy');
  if (current === it) paintSheet();
});

// ---------- An item's photos: each with its role, one of them shown ----------
// Loaded when the item opens (not kept offline). A tag or label is never what's shown for the
// garment: when the one shown stops being a garment photo, another garment photo takes its
// place, or none (the same rule the MCP server keeps).
const ROLE = { garment: 'Garment', tag: 'Tag', care_label: 'Care label', detail: 'Detail', other: 'Other' };
let sheetPhotos = [], picked = null;
async function loadPhotos(it) {
  if (offline) return;
  const { data } = await db.from('wardrobe_photos').select('*').eq('item_id', it.id).is('deleted_at', null).order('created_at');
  if (current !== it) return;
  sheetPhotos = data || [];
  const missing = sheetPhotos.map((p) => p.path).filter((p) => !links.has(p));
  if (missing.length) links = new Map([...links, ...(await photos.urls(missing))]);
  if (current === it) paintPhotos();
}
async function showPhoto(it, p) {
  const ok = await save({ photo_path: p?.path ?? null, photo_file_id: p?.file_id ?? null });
  if (ok) paintTile(it);
  return ok;
}
function paintPhotos() {
  const it = current, strip = $('#sheet-photos'), tools = $('#photo-tools');
  strip.hidden = sheetPhotos.length < 2 && !(sheetPhotos.length === 1 && sheetPhotos[0].path !== it?.photo_path);
  strip.textContent = '';
  for (const p of sheetPhotos) {
    const b = el('button', 'photo-thumb');
    b.type = 'button';
    b.setAttribute('aria-pressed', picked === p);
    const box = el('span', 'photo-thumb__img'), url = links.get(p.path);
    if (url) box.append(Object.assign(document.createElement('img'), { src: url, alt: '' })); else box.textContent = ROLE[p.role][0];
    b.append(box, el('span', 'photo-thumb__role', `${ROLE[p.role]}${p.path === it.photo_path ? ' · shown' : ''}`));
    b.addEventListener('click', () => { picked = picked === p ? null : p; paintPhotos(); });
    strip.append(b);
  }
  tools.hidden = !picked;
  if (picked) {
    $('#photo-role').value = picked.role;
    $('#photo-show').disabled = picked.path === it.photo_path;
  }
}
$('#photo-role').addEventListener('change', async (e) => {
  const it = current, p = picked, role = e.target.value;
  if (!p || !(await photoRows.set(p.id, { role }))) { if (p) e.target.value = p.role; return; }
  p.role = role;
  if (it.photo_path === p.path && role !== 'garment') await showPhoto(it, sheetPhotos.find((x) => x !== p && x.role === 'garment'));
  paintSheet();
});
$('#photo-show').addEventListener('click', async () => { if (picked && (await showPhoto(current, picked))) paintSheet(); });
$('#photo-remove').addEventListener('click', async () => {
  const it = current, p = picked;
  if (!p || !confirm('Move this photo to the trash? It can be restored for 30 days.') || !(await photoRows.remove(p.id))) return;
  sheetPhotos = sheetPhotos.filter((x) => x !== p);
  picked = null;
  if (it.photo_path === p.path) await showPhoto(it, sheetPhotos.find((x) => x.role === 'garment'));
  paintSheet();
});
// ---------- Where you are: the address says, so Back works and any view can be linked ----------
// #today, #closet, #trips, #trip/<id>, #trip/<id>/pack, and #item/<id> (an item over the view)
let trips = [], parts = noParts(), openTrip = null, ready = false, shown = null, shownHash = '', pushedItem = false, nextMode = 'view';
const here = () => { const h = location.hash.slice(1); return h.includes('=') ? [] : h.split('/').map((p) => { try { return decodeURIComponent(p); } catch (e) { return p; } }); }; // "=": a sign-in link
const openItem = (it, mode = 'view') => { nextMode = mode; pushedItem = true; location.hash = `item/${it.id}`; };
addEventListener('hashchange', route);

function route() {
  if (!ready) return;
  const [where, id, part] = here();
  if (where === 'item') {
    if (!shown) showView(...home());
    const it = list.find((x) => x.id === id);
    if (it && current !== it) openSheet(it, nextMode);
    nextMode = 'view';
    return;
  }
  if (sheet.open) sheet.close();
  if (where === 'trip' && trips.some((t) => t.id === id)) return showView(part === 'pack' ? 'pack' : 'trip', id);
  if (where === 'closet' || where === 'trips' || (where === 'today' && nowTrip())) return showView(where);
  showView(...home());
}
// with a trip on (or about to be), Today; otherwise wherever you were last
const home = () => [nowTrip() ? 'today' : view.tab === 'trips' ? 'trips' : 'closet'];
function showView(name, id) {
  shown = name;
  shownHash = id ? `trip/${id}${name === 'pack' ? '/pack' : ''}` : name;
  const tab = name === 'trip' || name === 'pack' ? 'trips' : name;
  if (tab !== 'today') { view.tab = tab; saveView(); }
  const now = nowTrip();
  for (const a of $('#tabs').children) {
    if (a.dataset.value === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    if (a.dataset.value === 'today') a.hidden = !now;
  }
  $('#today-view').hidden = tab !== 'today';
  $('#closet-view').hidden = tab !== 'closet';
  $('#trips-view').hidden = tab !== 'trips';
  $('#trip-list-view').hidden = name !== 'trips';
  $('#trip').hidden = name !== 'trip';
  $('#pack-view').hidden = name !== 'pack';
  openTrip = id ? trips.find((t) => t.id === id) : name === 'today' ? now : null;
  redraw();
}
function redraw() {
  if (shown === 'today') drawToday();
  else if (shown === 'trips') drawTrips();
  else if (shown === 'trip') drawTrip();
  else if (shown === 'pack') drawPack();
  else render();
}

// ---------- Trips: where and when, the weather, what to wear each day, what to pack ----------
// Mostly built in ChatGPT (the MCP server's trip tools); here they're shown, the packing is ticked
// off, and a trip can be started or its places and dates changed.
const weatherCache = new Map(); // leg key → Promise of its weather
const wxKept = kept('wardrobe-wx') || {}; // the last weather each leg had, for when there's no connection
const pad = (n) => String(n).padStart(2, '0');
const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const daysBetween = (a, b) => Math.round((new Date(`${b}T12:00`) - new Date(`${a}T12:00`)) / 864e5);
const addDays = (d, n) => { const x = new Date(`${d}T12:00`); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
const fmtDay = (d, opts = {}) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: opts.weekday || undefined, day: 'numeric', month: opts.month || 'short' });
const span = (t) => (t.legs.length ? [t.legs[0].from, t.legs[t.legs.length - 1].to] : [null, null]);
const legKey = (l) => `${l.lat},${l.lon},${l.from},${l.to}`;
const legWeatherCached = (l) => {
  const key = legKey(l);
  if (!weatherCache.has(key)) {
    weatherCache.set(key, (navigator.onLine ? legWeather(l) : Promise.reject(new Error('offline')))
      .then((w) => { if (w) { wxKept[key] = w; keep('wardrobe-wx', wxKept); } return w; })
      .catch(() => wxKept[key] || null));
  }
  return weatherCache.get(key);
};
// a trip's rows of one part (a part whose trip isn't loaded, in the trash, is never shown)
const partsOf = (t, part) => parts[part].filter((r) => r.trip_id === t.id);
// where you are on a date: on a travel day, the place you're going to
const legOn = (t, date) => [...t.legs].reverse().find((l) => l.from <= date && date <= l.to);
const wxOn = async (t, date) => { const l = legOn(t, date); return l ? (await legWeatherCached(l))?.days.find((d) => d.date === date) || null : null; };
// the trip that's on, or else the next one if it starts within two weeks
function nowTrip() {
  const today = isoToday(), dated = trips.filter((t) => t.legs.length).map((t) => [t, ...span(t)]);
  const on = dated.find(([, a, b]) => a <= today && today <= b);
  if (on) return on[0];
  return dated.filter(([, a]) => a > today && daysBetween(today, a) <= 14).sort((x, y) => x[1].localeCompare(y[1]))[0]?.[0] || null;
}
const leaving = (a) => { const d = daysBetween(isoToday(), a); return d > 1 ? `you leave in ${d} days` : d === 1 ? 'you leave tomorrow' : d === 0 ? 'you leave today' : ''; };

function drawTrips() {
  const ul = $('#trip-list');
  ul.textContent = '';
  const sorted = [...trips].sort((a, b) => (span(b)[0] || '').localeCompare(span(a)[0] || ''));
  for (const t of sorted) {
    const [a, b] = span(t);
    const li = el('li'), card = el('a', 'trip-card');
    card.href = `#trip/${t.id}`;
    card.append(el('span', 'trip-card__name', t.name), el('span', 'trip-card__when', a ? `${fmtDay(a)} – ${fmtDay(b)}` : 'No dates yet'), el('span', 'trip-card__legs', t.legs.map((l) => l.place).join(' → ')));
    li.append(card);
    ul.append(li);
  }
  $('#trips-empty').hidden = trips.length > 0;
  $('#trips-empty').textContent = 'No trips yet. Start one here, or ask ChatGPT to plan one.';
}

function itemChip(id, { opens = true } = {}) {
  const it = list.find((x) => x.id === id), chip = el('span', 'chip-item');
  chip.append(thumb(it, 'chip-item__photo'), el('span', 'chip-item__name', it ? it.name : 'No longer in the wardrobe'));
  if (it && opens) { chip.tabIndex = 0; chip.role = 'button'; chip.addEventListener('click', () => openItem(it)); chip.addEventListener('keydown', (e) => { if (e.key === 'Enter') openItem(it); }); }
  return chip;
}

const packSummary = (t) => {
  const entries = partsOf(t, 'trip_packing'), done = entries.filter((p) => p.status === 'packed').length, n = entries.length;
  return !n ? 'Nothing on the list yet.' : done === n ? `All ${n} packed.` : `${done} of ${n} packed.`;
};

// A time as given ("2026-10-13T11:15:00+01:00", or "11:15"): its clock time there, never moved
// to another timezone; and its date, when it has one
const clock = (s) => /(?:T|^)(\d\d:\d\d)/.exec(s || '')?.[1] || s || '';
const dateOf = (s) => /^\d{4}-\d\d-\d\d/.exec(s || '')?.[0] || null;
const spaced = (s) => (s || '').replace(/_/g, ' ');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// a row in one of the trip's short lists: what it is (a link if there's one), then the details
function infoRow(title, url, details) {
  const li = el('li', 'info-row'), head = url ? el('a', 'info-row__title', title) : el('span', 'info-row__title', title);
  if (url) Object.assign(head, { href: href(url), target: '_blank', rel: 'noopener' });
  li.append(head);
  const more = details.filter(Boolean).join(' · ');
  if (more) li.append(el('span', 'info-row__more', more));
  return li;
}
const part = (id, rowsIn) => { $(`#${id}`).replaceChildren(...rowsIn); $(`#${id}-part`).hidden = !rowsIn.length; };
// what a day holds, in time order: "09:30–12:00 Uffizi · sightseeing"
function activities(d) {
  const acts = [...(d.activities || [])].sort((x, y) => (x.start_time || '99').localeCompare(y.start_time || '99'));
  if (!acts.length) return null;
  const ul = el('ul', 'acts');
  for (const a of acts) {
    const li = el('li', 'act'), when = [a.start_time, a.end_time].filter(Boolean).join('–');
    li.append(el('span', 'act__time', when), el('span', 'act__title', a.title || ''), el('span', 'act__more', [a.type && spaced(a.type), a.location].filter(Boolean).join(' · ')));
    ul.append(li);
  }
  return ul;
}

async function drawTrip() {
  const t = openTrip;
  if (!t) return;
  const [a, b] = span(t);
  $('#trip-name').textContent = t.name;
  $('#trip-when').textContent = a ? `${fmtDay(a)} – ${fmtDay(b)} · ${plural(t.legs.length, 'place')}` : '';
  $('#trip-notes').hidden = !t.notes;
  $('#trip-notes').textContent = t.notes || '';
  $('#pack-sum').textContent = packSummary(t);
  $('#pack-open').href = `#trip/${t.id}/pack`;
  // who's going, how they get there, where they stay, the links: each only when there's something
  const people = t.travelers || [];
  $('#trip-who').textContent = people.map((x) => (x.type && x.type !== 'adult' ? `${x.name} (${spaced(x.type)})` : x.name)).join(', ');
  $('#trip-who-part').hidden = !people.length;
  const goes = partsOf(t, 'trip_transport').sort((x, y) => x.date.localeCompare(y.date) || (x.departure_time || '').localeCompare(y.departure_time || ''));
  part('trip-go', goes.map((g) => {
    const dep = g.departure_time, arr = g.arrival_time, nextDay = dateOf(arr) && dateOf(arr) !== (dateOf(dep) || g.date);
    const times = [dep && clock(dep), arr && `${clock(arr)}${nextDay ? ` (${fmtDay(dateOf(arr))})` : ''}`].filter(Boolean).join(' – ');
    const end = (place, code) => (code ? `${place} ${code}` : place);
    return infoRow(`${end(g.origin, g.origin_code)} → ${end(g.destination, g.destination_code)}`, g.booking_url, [
      `${cap(spaced(g.type))}, ${fmtDay(g.date, { weekday: 'short' })}`, [g.carrier, g.number].filter(Boolean).join(' '), times, g.confirmation && `ref ${g.confirmation}`, g.notes]);
  }));
  const stays = partsOf(t, 'trip_lodging').sort((x, y) => x.check_in.localeCompare(y.check_in));
  part('trip-stay', stays.map((l) => infoRow(l.name, l.booking_url, [l.place, `${fmtDay(l.check_in)} – ${fmtDay(l.check_out)}`, l.confirmation && `ref ${l.confirmation}`, l.notes])));
  part('trip-links', partsOf(t, 'trip_resources').map((r) => infoRow(r.label, r.url, [r.notes])));
  // the legs, each with its weather
  const weather = await Promise.all(t.legs.map(legWeatherCached));
  if (openTrip !== t || shown !== 'trip') return;
  const legs = $('#legs');
  legs.textContent = '';
  t.legs.forEach((l, i) => {
    const w = weather[i], li = el('li', 'leg');
    li.append(el('h3', 'leg__place', `${l.place}${l.country ? `, ${l.country}` : ''}`), el('p', 'leg__when', `${fmtDay(l.from)} – ${fmtDay(l.to)}`));
    if (w) {
      const s = w.summary;
      li.append(el('p', 'leg__weather', `${w.kind === 'forecast' ? 'Forecast' : w.kind === 'mixed' ? 'Forecast, then typical' : 'Typically'}: highs ${s.hi}°, lows ${s.lo}°, about ${plural(s.wet, 'day')} of rain`));
      const strip = el('ol', 'leg__days');
      strip.setAttribute('aria-label', `Day by day in ${l.place}`);
      for (const d of w.days) {
        const day = el('li', `wx${d.kind === 'typical' ? ' wx--typical' : ''}`);
        day.title = `${fmtDay(d.date, { weekday: 'short' })}: ${d.hi}° / ${d.lo}°, ${d.rain}% chance of rain${d.kind === 'typical' ? ' (typical)' : ''}`;
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
  const wxDay = (date) => { for (const w of weather) { const d = w?.days.find((x) => x.date === date); if (d) return d; } return null; };
  for (const d of [...t.days].sort((x, y) => x.date.localeCompare(y.date))) {
    const li = el('li', 'day'), w = wxDay(d.date);
    const head = el('p', 'day__head');
    head.append(el('strong', '', fmtDay(d.date, { weekday: 'short' })), ` · ${legOn(t, d.date)?.place || ''}${w ? ` · ${Math.round(w.hi)}°/${Math.round(w.lo)}°, ${w.rain}% rain` : ''}`);
    li.append(head);
    if (d.occasion) li.append(el('p', 'day__occasion', d.occasion));
    const acts = activities(d);
    if (acts) li.append(acts);
    const outfit = el('div', 'day__outfit');
    d.items.forEach((id) => outfit.append(itemChip(id)));
    li.append(outfit);
    if (d.note) li.append(el('p', 'day__note', d.note));
    days.append(li);
  }
  const total = a ? daysBetween(a, b) + 1 : 0;
  $('#days-empty').hidden = false;
  $('#days-empty').textContent = t.days.length ? `${t.days.length} of ${total} days planned.` : 'No outfits planned yet. Ask ChatGPT: "plan what I wear each day of my trip".';
}

// ---------- Today: where you are on the trip, the weather, what you're wearing ----------
// A line or two of advice when the weather and the outfit don't agree. The words in an item's
// name, material and notes are all it knows about what's for rain.
const words = (it) => [it.name, it.material, it.notes].join(' ').toLowerCase();
function advice(w, outfit) {
  if (!w) return [];
  const out = [];
  if (w.rain >= 50) {
    const shell = outfit.find((it) => /rain|waterproof|shell|gore-?tex|trench|\bmac\b|umbrella/.test(words(it)));
    out.push(shell ? `Rain likely (${w.rain}%). ${shell.name} is in the outfit.` : outfit.length ? `Rain likely (${w.rain}%), and nothing in this outfit is for rain.` : `Rain likely (${w.rain}%).`);
    const suede = outfit.find((it) => /suede/.test(words(it)));
    if (suede) out.push(`Maybe not ${suede.name} in the rain.`);
  }
  if (w.lo != null && w.lo < 8 && outfit.length && !outfit.some((it) => it.category === 'outerwear' || it.warmth === 'warm')) out.push(`Down to ${Math.round(w.lo)}° later, and nothing warm in this outfit.`);
  if (w.hi != null && w.hi >= 26) { const hot = outfit.find((it) => it.warmth === 'warm'); if (hot) out.push(`Up to ${Math.round(w.hi)}°: warm for ${hot.name}.`); }
  return out;
}

let dayOn = null; // the date the Today card shows; it can step through the trip
async function drawToday() {
  const t = openTrip, box = $('#today-view');
  if (!t) return;
  const [a, b] = span(t), today = isoToday(), underway = a <= today;
  if (!dayOn || dayOn < a || dayOn > b) dayOn = underway ? today : a;
  const date = dayOn, total = daysBetween(a, b) + 1;
  const ahead = Array.from({ length: Math.min(5, daysBetween(date, b)) }, (_, i) => addDays(date, i + 1));
  const [w, ...wAhead] = await Promise.all([date, ...ahead].map((d) => wxOn(t, d)));
  if (openTrip !== t || shown !== 'today' || dayOn !== date) return;
  const planned = (d) => t.days.find((x) => x.date === d);
  const wearing = (d) => (planned(d)?.items || []).map((id) => list.find((x) => x.id === id)).filter(Boolean);

  // the trip, and where you are on it: a line in legs, the one you're on lit
  const head = el('header', 'today__trip');
  head.append(el('h2', 'today__name', t.name), el('p', 'today__when', `${fmtDay(a)} – ${fmtDay(b)} · ${underway ? `day ${daysBetween(a, today) + 1} of ${total}` : leaving(a)}`));
  const line = el('ol', 'legline');
  line.setAttribute('aria-label', 'The trip, place by place');
  t.legs.forEach((l, i) => {
    const last = i === t.legs.length - 1, end = last ? l.to : t.legs[i + 1].from;
    const now = underway && l.from <= today && (today < end || (last && today <= end));
    const li = el('li', `legline__leg${underway && end <= today && !now ? ' is-past' : ''}${now ? ' is-now' : ''}`);
    li.style.flexGrow = Math.max(1, daysBetween(l.from, end));
    li.append(el('span', 'legline__place', now ? `${l.place} · ${plural(daysBetween(today, end), 'day')} left` : l.place));
    line.append(li);
  });
  head.append(line);

  // the day: where, the weather, any advice, the outfit
  const card = el('section', 'today-card'), top = el('div', 'today-card__top'), where = el('div');
  card.setAttribute('aria-label', `What you're wearing ${date === today ? 'today' : fmtDay(date, { weekday: 'long' })}`);
  where.append(el('p', 'today-card__kicker', date === today ? 'Today' : date === a && !underway ? 'First day' : fmtDay(date, { weekday: 'long', month: 'long' }).split(',')[0]),
    el('h3', 'today-card__place', legOn(t, date)?.place || ''), el('p', 'today-card__date', fmtDay(date, { weekday: 'long' })));
  const wx = el('div', 'today-card__wx');
  if (w) {
    const rain = el('span', `today-card__rain${w.rain >= 50 ? ' is-wet' : ''}`, `${w.rain}% rain`);
    const low = el('span', 'today-card__low', `low ${Math.round(w.lo)}° · `);
    low.append(rain);
    wx.append(el('span', 'today-card__hi', `${Math.round(w.hi)}°`), low);
    if (w.kind === 'typical') wx.append(el('span', 'today-card__typical', 'typical, not a forecast yet'));
  } else wx.append(el('span', 'today-card__low', 'No weather yet'));
  top.append(where, wx);
  card.append(top);
  const outfit = wearing(date), plan = planned(date);
  for (const line of advice(w, outfit)) card.append(el('p', 'today-card__advice', line));
  card.append(el('p', 'today-card__label', "What you're wearing"));
  if (plan?.occasion) card.append(el('p', 'today-card__occasion', plan.occasion));
  const acts = plan && activities(plan);
  if (acts) card.append(acts);
  if (outfit.length) {
    const ul = el('ul', 'outfit');
    for (const it of outfit) {
      const li = el('li'), btn = el('button', 'outfit__item');
      btn.type = 'button';
      btn.append(thumb(it), el('span', 'outfit__name', it.name));
      btn.addEventListener('click', () => openItem(it));
      li.append(btn);
      ul.append(li);
    }
    card.append(ul);
  } else card.append(el('p', 'today-card__none', 'Nothing planned for this day. Ask ChatGPT to plan it.'));
  if (plan?.note) card.append(el('p', 'today-card__note', plan.note));
  const step = el('div', 'today-card__step');
  const go = (d, text) => { const btn = el('button', 'link-btn', text); btn.type = 'button'; btn.disabled = d < a || d > b; btn.addEventListener('click', () => { dayOn = d; drawToday(); }); return btn; };
  step.append(go(addDays(date, -1), '‹ Day before'), go(addDays(date, 1), date === today ? 'Tomorrow ›' : 'Next day ›'));
  card.append(step);

  // the next few days, a tap away
  const next = el('section', 'today__part'), nextHead = el('div', 'today__part-head');
  const allDays = el('a', 'link-btn', 'All days');
  allDays.href = `#trip/${t.id}`;
  nextHead.append(el('h3', '', 'Next few days'), allDays);
  const strip = el('ol', 'next-days');
  ahead.forEach((d, i) => {
    const li = el('li'), btn = el('button', 'next-day'), dw = wAhead[i], on = wearing(d);
    btn.type = 'button';
    btn.append(el('span', 'next-day__date', fmtDay(d, { weekday: 'short' })), el('span', 'next-day__wx', dw ? `${Math.round(dw.hi)}° · ${dw.rain}%` : '–'));
    const thumbs = el('span', 'next-day__thumbs');
    if (on.length) on.slice(0, 3).forEach((it) => thumbs.append(thumb(it, 'next-day__thumb')));
    else thumbs.append(el('span', 'next-day__none', 'Nothing planned'));
    btn.append(thumbs);
    btn.addEventListener('click', () => { dayOn = d; drawToday(); scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); });
    li.append(btn);
    strip.append(li);
  });
  if (ahead.length) next.append(nextHead, strip);

  // the packing, and the way to it
  const pack = el('section', 'today__part'), packHead = el('div', 'today__part-head'), packLink = el('a', 'link-btn', 'Pack ›');
  packLink.href = `#trip/${t.id}/pack`;
  packHead.append(el('h3', '', 'Packing'), packLink);
  pack.append(packHead, el('p', 'today__pack', packSummary(t)));

  box.replaceChildren(head, card, ...(ahead.length ? [next] : []), pack);
}

// ---------- The Packing Board: everyone's things, by category, a tap to move each one on ----------
// Each entry is its own row (trip_packing): a garment (by id) or anything else by label, whose it
// is, which bag, how many, and how far along it is. A change saves as a PATCH of that one row.
const STATUS = [['needed', 'Need'], ['to_buy', 'To buy'], ['ready', 'Ready'], ['packed', 'Packed']];
const statusName = Object.fromEntries(STATUS);
const NEXT = { needed: 'ready', to_buy: 'ready', ready: 'packed', packed: 'needed' }; // one tap moves it on
const SHOW = [['open', 'To pack'], ...STATUS, ['all', 'All']]; // "To pack": everything not packed yet
const PACK_CATS = [['clothing', 'Clothes'], ['shoes', 'Shoes'], ['baby', 'Baby'], ['toiletries', 'Toiletries'], ['medicine', 'Medicine'], ['electronics', 'Electronics'], ['documents', 'Documents'], ['work', 'Work'], ['accessories', 'Accessories'], ['gear', 'Gear'], ['misc', 'Misc']];
const packCatName = Object.fromEntries(PACK_CATS);
const catOf = (p) => (packCatName[p.category] ? p.category : 'misc');
// a garment's own category says where it goes on the list
const garmentCat = (it) => (it?.category === 'shoes' ? 'shoes' : it?.category === 'accessories' ? 'accessories' : 'clothing');
const packedLine = { packed: (n) => `Packed ${n}.`, ready: (n) => `${n}: ready to pack.`, needed: (n) => `${n}: needed again.` };
const garmentOf = (p) => (p.item_id ? list.find((x) => x.id === p.item_id) : null);
const entryName = (p) => (p.item_id ? garmentOf(p)?.name || p.label || 'No longer in the wardrobe' : p.label);
const whoName = (t, key) => (key === 'shared' ? 'Shared' : (t.travelers || []).find((x) => x.key === key)?.name || key || '');
const isShared = (p) => !p.traveler_key || p.traveler_key === 'shared';

// What's shown (status, whose, category, bag), remembered per trip on this phone
const packFilters = kept('wardrobe-pack') || {};
function packFilter(t) {
  const f = { status: 'open', who: '', cat: '', bag: '', ...packFilters[t.id] };
  if (!SHOW.some(([v]) => v === f.status)) f.status = 'open';
  if (f.who && f.who !== 'shared' && !(t.travelers || []).some((x) => x.key === f.who)) f.who = '';
  if (f.bag && f.bag !== 'none' && !partsOf(t, 'trip_bags').some((b) => b.id === f.bag)) f.bag = '';
  if (f.cat && !packCatName[f.cat]) f.cat = '';
  return f;
}
function setPackFilter(change) {
  const t = openTrip;
  if (!t) return;
  packFilters[t.id] = { ...packFilter(t), ...change };
  keep('wardrobe-pack', packFilters);
  drawPack();
}
const fits = (p, f) => (!f.who || (f.who === 'shared' ? isShared(p) : p.traveler_key === f.who))
  && (!f.cat || catOf(p) === f.cat) && (!f.bag || (f.bag === 'none' ? !p.bag_id : p.bag_id === f.bag));
const shows = (p, status) => (status === 'open' ? p.status !== 'packed' : status === 'all' || p.status === status);
const options = (select, pairs, value) => {
  select.replaceChildren(...pairs.map(([v, text]) => new Option(text, v)));
  select.value = pairs.some(([v]) => v === value) ? value : pairs[0]?.[0] ?? '';
};
const chips = (box, pairs, value) => box.replaceChildren(...pairs.map(([v, text, n]) => {
  const b = el('button', '', text);
  b.type = 'button';
  b.dataset.value = v;
  b.setAttribute('aria-pressed', v === value);
  if (n != null) b.append(el('span', '', n));
  return b;
}));

let addFor = ''; // the filters the add form's pickers were last set from
function drawPack() {
  const t = openTrip;
  if (!t) return;
  const entries = partsOf(t, 'trip_packing'), bags = partsOf(t, 'trip_bags'), people = t.travelers || [], f = packFilter(t);
  $('#pack-back').textContent = `‹ ${t.name}`;
  $('#pack-back').href = `#trip/${t.id}`;
  // how it's going, over the whole list
  const n = entries.length, done = entries.filter((p) => p.status === 'packed').length;
  const bar = $('#pack-progress');
  bar.hidden = !n;
  bar.firstElementChild.style.setProperty('--p', `${n ? (100 * done) / n : 0}%`);
  bar.setAttribute('aria-valuemax', n);
  bar.setAttribute('aria-valuenow', done);
  const leave = leaving(span(t)[0] || '');
  $('#pack-count').textContent = n ? `${done} of ${n} packed${leave ? ` · ${leave}` : ''}` : '';
  // what to show: the status (with counts under the other filters), whose, category, bag
  const pool = entries.filter((p) => fits(p, f));
  chips($('#pack-status'), SHOW.map(([v, text]) => [v, text, pool.filter((p) => shows(p, v)).length]), f.status);
  chips($('#pack-who'), [['', 'Everyone'], ...people.map((x) => [x.key, x.name]), ['shared', 'Shared']], f.who);
  $('#pack-who').hidden = !people.length;
  const cats = PACK_CATS.filter(([c]) => c === f.cat || entries.some((p) => catOf(p) === c));
  options($('#pack-cat'), [['', 'Every category'], ...cats], f.cat);
  options($('#pack-bag'), [['', 'Any bag'], ...bags.map((b) => [b.id, b.label]), ['none', 'In no bag']], f.bag);
  $('#pack-bag').hidden = !bags.length;
  $('#pack-filters').hidden = !n;
  // the add form starts from the filters: adding while looking at Lexi's toiletries adds hers
  const now = `${t.id}|${f.who}|${f.cat}`;
  if (addFor !== now) {
    addFor = now;
    options($('#pack-add-who'), [['', 'Not assigned'], ...people.map((x) => [x.key, x.name]), ['shared', 'Shared']], f.who);
    options($('#pack-add-cat'), PACK_CATS, f.cat || 'misc');
  }
  $('#pack-add-who').hidden = !people.length;
  // what the planned outfits wear that isn't on the list yet
  const onList = new Set(entries.map((p) => p.item_id).filter(Boolean));
  const missing = [...new Set(t.days.flatMap((d) => d.items || []))].filter((id) => !onList.has(id) && list.some((x) => x.id === id));
  $('#pack-from-plan').hidden = !missing.length;
  $('#pack-from-plan').textContent = n ? `Add from the planned outfits (${missing.length})` : 'Make the list from the planned outfits';
  $('#pack-from-plan').onclick = () => {
    const steve = people.some((x) => x.key === 'steve') ? 'steve' : null;
    addEntries(t, missing.map((item_id) => ({ item_id, category: garmentCat(list.find((x) => x.id === item_id)), traveler_key: steve })))
      .then((added) => added && toast(`Added ${plural(added.length, 'thing')} from the planned outfits.`));
  };
  // by category, in the board's order
  const box = $('#pack-groups');
  box.textContent = '';
  for (const [c, name] of PACK_CATS) {
    const inCat = pool.filter((p) => catOf(p) === c), shown = inCat.filter((p) => shows(p, f.status));
    if (!shown.length) continue;
    const left = inCat.filter((p) => p.status !== 'packed').length;
    const section = el('section', 'pack-group'), h = el('h3', 'pack-group__head');
    h.append(el('span', '', name), el('span', 'pack-group__left', left ? `${left} left` : 'all packed'));
    const ul = el('ul', 'pack-rows');
    shown.sort((x, y) => entryName(x).localeCompare(entryName(y))).forEach((p) => ul.append(packRow(t, p, bags)));
    section.append(h, ul);
    box.append(section);
  }
  const empty = !n ? (missing.length ? '' : 'Nothing on the list yet. Add things below, or ask ChatGPT to make the list.')
    : f.status === 'open' && !pool.some((p) => p.status !== 'packed') ? (pool.length ? 'All packed.' : 'Nothing here.') : 'Nothing here.';
  $('#pack-empty').hidden = !!box.childElementCount || !empty;
  $('#pack-empty').textContent = empty;
}

function packRow(t, p, bags) {
  const it = garmentOf(p), name = entryName(p), bag = bags.find((b) => b.id === p.bag_id);
  const li = el('li', `pack-row is-${p.status}`), open = el('button', 'pack-row__open'), text = el('span', 'pack-row__text');
  open.type = 'button';
  const title = el('span', 'pack-row__name', name);
  if (p.qty > 1) title.append(el('span', 'pack__qty', ` ×${p.qty}`));
  text.append(title);
  const line = (bits) => { const s = bits.filter(Boolean).join(' · '); if (s) text.append(el('span', 'pack-row__meta', s)); };
  if (p.item_id) {
    const planned = t.days.filter((d) => d.items?.includes(p.item_id)).sort((x, y) => x.date.localeCompare(y.date)).map((d) => fmtDay(d.date));
    line([it?.brand, it && (it.manufacturer_colour || it.colour)]);
    line([planned.length && `Planned: ${planned.join(', ')}`, bag?.label, p.notes]);
  } else line([whoName(t, p.traveler_key), bag?.label, p.notes]);
  if (p.essential) title.prepend(el('span', 'pack-row__must', 'Essential'));
  open.append(p.item_id ? thumb(it, 'pack-row__photo') : el('span', 'pack-row__photo pack-row__photo--none', (name || '?')[0].toUpperCase()), text);
  open.addEventListener('click', () => openEntry(p));
  const status = el('button', 'pack-row__status', statusName[p.status] || p.status);
  status.type = 'button';
  status.setAttribute('aria-label', `${name}: ${statusName[p.status]}. Tap for ${statusName[NEXT[p.status] || 'ready']}.`);
  status.addEventListener('click', () => {
    const was = p.status, to = NEXT[was] || 'ready';
    setEntry(p, { status: to }).then((ok) => ok && toast(packedLine[to](name), false, () => setEntry(p, { status: was })));
  });
  li.append(open, status);
  return li;
}
$('#pack-status').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setPackFilter({ status: b.dataset.value }); });
$('#pack-who').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setPackFilter({ who: b.dataset.value }); });
$('#pack-cat').addEventListener('change', (e) => setPackFilter({ cat: e.target.value }));
$('#pack-bag').addEventListener('change', (e) => setPackFilter({ bag: e.target.value }));

// A change shows at once and saves as a PATCH of that one entry. With no connection it's kept on
// the phone (entry id → its changes, merged) and sent when the connection's back.
const QUEUE = 'wardrobe-packing-queue';
try { localStorage.removeItem('wardrobe-queue'); } catch (e) {} // the old queue held whole lists, for a column that's gone
const queue = kept(QUEUE) || {};
const cantAdd = () => {
  if (!offline && navigator.onLine) return false;
  toast("You're offline. Adding and taking off wait for a connection.", true);
  return true;
};
async function setEntry(p, patch) {
  const before = Object.fromEntries(Object.keys(patch).map((k) => [k, p[k]]));
  Object.assign(p, patch);
  redraw();
  paintEntry();
  if (offline || !navigator.onLine) {
    queue[p.id] = { ...queue[p.id], ...patch };
    keep(QUEUE, queue);
    keepCopy();
    return true;
  }
  if (!(await partRows.trip_packing.set(p.id, patch))) { Object.assign(p, before); redraw(); paintEntry(); return false; }
  keepCopy();
  return true;
}
async function sendQueue() {
  for (const [id, patch] of Object.entries(queue)) {
    const { error } = await db.from('trip_packing').update(patch).eq('id', id);
    if (!error || error.code) delete queue[id]; // sent, or refused (taken off the list elsewhere): either way, done
  }
  keep(QUEUE, queue);
}
async function addEntries(t, entries) {
  if (cantAdd()) return null;
  const added = await partRows.trip_packing.add(entries.map((r) => ({ trip_id: t.id, qty: 1, status: 'needed', ...r })));
  if (!added) return null;
  parts.trip_packing.push(...added);
  keepCopy();
  redraw();
  return added;
}
$('#pack-add').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target, label = form.label.value.trim(), t = openTrip;
  if (!label || !t) return;
  if (await addEntries(t, [{ label, traveler_key: form.traveler.value || null, category: form.category.value }])) form.label.value = '';
});

// ---------- An entry, in a small sheet: status, whose, which bag, how many, essential, notes ----------
const packSheet = $('#pack-sheet');
let entryOpen = null;
function openEntry(p) {
  entryOpen = p;
  $('#ps-notes').value = p.notes || '';
  delete $('#ps-notes').dataset.save;
  paintEntry();
  if (!packSheet.open) packSheet.showModal();
}
function paintEntry() {
  const p = entryOpen, t = openTrip;
  if (!p || !t) return;
  const it = garmentOf(p);
  $('#ps-photo').replaceChildren(p.item_id ? thumb(it, 'pack-row__photo') : el('span', 'pack-row__photo pack-row__photo--none', (entryName(p) || '?')[0].toUpperCase()));
  $('#ps-name').textContent = entryName(p);
  $('#ps-cat').textContent = packCatName[catOf(p)];
  chips($('#ps-status'), STATUS, p.status);
  const people = t.travelers || [], who = [['', 'Not assigned'], ...people.map((x) => [x.key, x.name]), ['shared', 'Shared']];
  if (p.traveler_key && !who.some(([k]) => k === p.traveler_key)) who.push([p.traveler_key, p.traveler_key]);
  options($('#ps-who'), who, p.traveler_key || '');
  options($('#ps-bag'), [['', 'No bag yet'], ...partsOf(t, 'trip_bags').map((b) => [b.id, b.label])], p.bag_id || '');
  $('#ps-qty').textContent = p.qty;
  $('#ps-less').disabled = p.qty <= 1;
  $('#ps-essential').checked = !!p.essential;
  $('#ps-garment').hidden = !it;
}
$('#ps-status').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && entryOpen) setEntry(entryOpen, { status: b.dataset.value }); });
$('#ps-who').addEventListener('change', (e) => entryOpen && setEntry(entryOpen, { traveler_key: e.target.value || null }));
$('#ps-bag').addEventListener('change', (e) => entryOpen && setEntry(entryOpen, { bag_id: e.target.value || null }));
$('#ps-essential').addEventListener('change', (e) => entryOpen && setEntry(entryOpen, { essential: e.target.checked }));
for (const [id, by] of [['#ps-less', -1], ['#ps-more', 1]]) {
  $(id).addEventListener('click', () => entryOpen && setEntry(entryOpen, { qty: Math.min(999, Math.max(1, entryOpen.qty + by)) }));
}
saver($('#ps-notes'), (value) => (entryOpen ? setEntry(entryOpen, { notes: value.trim() || null }) : Promise.resolve(false)));
$('#ps-garment').addEventListener('click', () => { const it = entryOpen && garmentOf(entryOpen); packSheet.close(); if (it) openItem(it); });
$('#ps-remove').addEventListener('click', async () => {
  const p = entryOpen, t = openTrip, name = entryName(p);
  if (!p || cantAdd() || !(await partRows.trip_packing.remove(p.id))) return; // the entry only; never the garment
  parts.trip_packing = parts.trip_packing.filter((x) => x !== p);
  keepCopy();
  packSheet.close();
  redraw();
  const { owner, updated_at, ...back } = p;
  toast(`Took ${name} off the list.`, false, () => addEntries(t, [back]));
});
packSheet.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => packSheet.close(); });
packSheet.addEventListener('close', () => { $('#ps-notes').dispatchEvent(new Event('change')); setTimeout(() => { if (!packSheet.open) entryOpen = null; }, 0); });

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
  if (offline) { toast("You're offline. Trips can be changed when there's a connection.", true); return; }
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
    if (!confirm(`Move "${t.name}" and everything planned for it to the trash? It can be restored for 30 days.`) || !(await tripRows.remove(t.id))) return;
    trips = trips.filter((x) => x !== t);
    keepCopy();
    dialog.close('');
    location.hash = 'trips';
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
  if (t) { if (await tripRows.set(t.id, values)) { Object.assign(t, values); keepCopy(); redraw(); } }
  else { const added = await tripRows.add([{ ...values, days: [] }]); if (added) { trips.push(...added); keepCopy(); location.hash = `trip/${added[0].id}`; } }
}
$('#new-trip').addEventListener('click', () => editTrip(null));
$('#trip-edit').addEventListener('click', () => openTrip && editTrip(openTrip));

// ---------- The copy on the phone ----------
const copyKey = () => `wardrobe-copy:${uid}`;
const keepCopy = () => { if (uid) keep(copyKey(), { at: Date.now(), list, trips, parts, links: [...links] }); };
// the photos themselves, for the service worker to answer from with no connection: keyed by the
// file (a signed link's token changes), fetched once each, and dropped when nothing shows them
const photoKey = (url) => { const u = new URL(url); return u.origin + u.pathname; };
async function keepPhotos() {
  if (!('caches' in window)) return;
  try {
    const cache = await caches.open('wardrobe-photos'), want = new Set();
    for (const url of links.values()) {
      const key = photoKey(url);
      want.add(key);
      if (await cache.match(key)) continue;
      const res = await fetch(url);
      if (res.ok) await cache.put(key, res);
    }
    for (const req of await cache.keys()) if (!want.has(req.url)) await cache.delete(req);
  } catch (e) { /* the copy is a nicety: without it, offline shows the letters instead */ }
}
const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 2 ? 'just now' : m < 60 ? `${m} minutes ago` : m < 48 * 60 ? `${Math.round(m / 60)} hours ago` : `${Math.round(m / 1440)} days ago`; };

// ---------- Loading ----------
async function load() {
  let got = null, gotTrips = null, gotParts = null;
  if (navigator.onLine && (await db.auth.getSession()).data.session) {
    await sendQueue(); // what was changed offline goes first, so what comes back has it
    let rest;
    [got, gotTrips, ...rest] = await Promise.all([closet.list('name'), tripRows.list('created_at'), ...PARTS.map((p) => partRows[p].list('created_at'))]);
    if (rest.every(Boolean)) gotParts = Object.fromEntries(PARTS.map((p, i) => [p, rest[i]]));
  }
  const copy = kept(copyKey());
  if (got && gotTrips && gotParts) {
    offline = failed = false;
    list = got;
    trips = gotTrips;
    parts = gotParts;
    links = await photos.urls(list.map((it) => it.photo_path).filter(Boolean));
    keepCopy();
    keepPhotos();
    for (const k of Object.keys(wxKept)) if (!trips.some((t) => t.legs.some((l) => legKey(l) === k))) delete wxKept[k];
    keep('wardrobe-wx', wxKept);
  } else if (copy) {
    offline = true;
    failed = false;
    list = copy.list;
    trips = copy.trips;
    parts = { ...noParts(), ...copy.parts };
    links = new Map(copy.links);
    for (const p of parts.trip_packing) if (queue[p.id]) Object.assign(p, queue[p.id]);
  } else {
    offline = false;
    failed = true;
    list = got || [];
    trips = gotTrips || [];
    parts = gotParts || noParts();
  }
  $('#offline-note').hidden = !offline;
  if (offline) $('#offline-note').textContent = `Offline: showing the copy saved on this phone ${ago(copy.at)}. Packing changes are kept and sent when you're back online.`;
  if (openTrip) openTrip = trips.find((t) => t.id === openTrip.id) || null;
  tiles.clear();
  $('#grid').textContent = '';
  ready = true;
  route();
}
addEventListener('online', () => { if (uid) load(); });
start(async (user) => { uid = user.id; await load(); }, () => {
  list = []; trips = []; parts = noParts(); openTrip = null; uid = null; ready = false; shown = null; tiles.clear(); $('#grid').textContent = '';
}, { offline: true });
fresh(load);

// The service worker that answers from the copy when there's no connection (apps/offline.js)
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/apps/offline.js', { scope: '/apps/' }).catch(() => {});
