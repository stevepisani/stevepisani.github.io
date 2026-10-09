// SJPJr (/apps, apps/index.html), the app: Today (the next thing to do, what you're
// wearing, the weather where you are), the Closet (your clothes, each with a photo cut out of its
// background, what it is, and where to buy another), Trips (the weather, what to wear each day and
// what to pack) and Recipes (lib/recipes.js, shared). Each member sees only their sections (me()
// in the database). The wardrobe and trips are private to their owner (tables public.wardrobe_items,
// public.trips and the trip's parts: trip_packing, trip_bags, trip_transport, trip_lodging,
// trip_resources; photos under photos/wardrobe/<owner id>/). A garment may belong to a variant and
// product (wardrobe_variants, wardrobe_products: the maker's facts, filed by ChatGPT); the app
// reads the flat view (wardrobe_closet) and changes only the garment itself. ChatGPT reads and
// edits the same rows through the wardrobe MCP server (docs/apps.md).
//
// It works with no signal (a train, a plane): every load keeps a copy on the phone (the rows, the
// photo links, the weather; the photos themselves in a cache the service worker, /apps/offline.js,
// answers from), and with no connection the app opens on that copy. Changes to packing entries
// and what's logged of the day (what you wore, a line about it) made then are kept and sent when
// the connection's back.
//
// Each day keeps a record (public.events, rows only added; _shared/days.js says what a day says):
// "Wore it" on Today logs the planned outfit in one tap, the pieces can be changed, and a line
// about the day saves as you leave it. The trip shows each past day as it was, the packing how
// often each garment's been worn, and a garment what it's cost a wear.
import { $, el, icon, db, start, fresh, rows, saver, ask, open, sheet as sheetify, photos, toast, calm, buzz, celebrate, here, pull } from './lib/kit.js';
import { SIZES } from './lib/photo-sizes.js';
import { locate, legWeather } from '../../../supabase/functions/_shared/weather.js';
import { byDay, wears } from '../../../supabase/functions/_shared/days.js';
import { fmtDay, journeyCard, stayCard, nextJourney, journeyNow, homeAway, HOME } from './lib/travel.js';
import * as recipes from './lib/recipes.js';
import { units, setUnits, temp, tempEl, skyOf, skyIcon, placeNow, hourNow, hourLabel, hoursLeft, wetSpell, story, facts, mood, scaleOf, dayList, dayWords, hourStrip } from './lib/sky.js';

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
let list = [], links = new Map(), failed = false, uid = null, offline = false, me = null;
// the sections, in the tabs' order; each member sees the ones me() names (null: all of them)
const SECTIONS = ['today', 'closet', 'trips', 'recipes'];
let sections = SECTIONS;
const can = (s) => sections.includes(s);
let view = { cat: '', colour: '', season: '', dress: '', shelf: 'in' };
try { const { tab, ...v } = JSON.parse(localStorage.getItem('wardrobe-view')) || {}; Object.assign(view, v); } catch (e) {} // (it once kept the tab last used; it always opens on Today now)
const tiles = new Map(); // item id → its tile

const href = (link) => (/^https?:\/\//i.test(link) ? link : `https://${link}`);
const folder = () => `wardrobe/${uid}`;
const keep = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} };
const kept = (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } };
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
for (const sel of ['#add-category', '[data-is="category"]']) $(sel).append(...CATS.map(([v, t]) => new Option(t, v)));

const catIcon = (it) => (catName[it?.category] ? it.category : 'tops');

// A photo, small: the garment on the studio ground every catalog photo shares, or, with no photo
// yet, a line drawing of its kind (so it reads as "no photo yet", not as broken)
function thumb(it, cls = 'tile__photo studio') {
  const box = el('span', cls), url = it?.photo_path && links.get(it.photo_path);
  if (url) box.append(Object.assign(document.createElement('img'), { src: url, alt: '', loading: 'lazy', decoding: 'async' }));
  else box.append(icon(it ? catIcon(it) : 'tops', `tile__none${it ? '' : ' is-gone'}`));
  return box;
}

// A garment's colour, for browsing by colour: its colour word ("Dark Brown" is brown, "charcoal" is
// grey) and a dot of cloth that colour. These are the garments' colours, not the page's, so they
// stay the same in every theme. A word not here isn't offered.
const CLOTH = {
  black: '#1f1f22', white: '#f7f6f2', ivory: '#efe9db', cream: '#efe9db', ecru: '#e8dfca', beige: '#d8c7a6', sand: '#d2bf98', stone: '#c9bea8', khaki: '#b5a47a', tan: '#b88b5a', camel: '#b58350',
  brown: '#6b4a33', chocolate: '#4e342a', rust: '#a4502b', orange: '#d9772f', mustard: '#c9a13b', yellow: '#e6c84f',
  olive: '#6b6b3a', green: '#3f6b48', sage: '#9aaa8c', teal: '#2f6e70', blue: '#3e5f8f', denim: '#4a6587', indigo: '#2e3a63', navy: '#22304d',
  purple: '#5d4777', burgundy: '#6c2232', wine: '#6c2232', maroon: '#6c2232', red: '#a8322f', pink: '#dba3a8',
  grey: '#8d8f91', gray: '#8d8f91', charcoal: '#45484c', silver: '#b9bcbf', heather: '#a3a5a8', oatmeal: '#d9cdb6',
};
const SAME = { gray: 'grey', maroon: 'burgundy', wine: 'burgundy', ivory: 'cream', chocolate: 'brown' };
function swatchOf(it) {
  const words = String(it.colour || it.manufacturer_colour || '').toLowerCase().split(/[^a-z]+/).filter(Boolean).reverse();
  const w = words.find((x) => CLOTH[x]);
  return w ? SAME[w] || w : null;
}

// ---------- The closet: category chips, colours, filters, a grid of tiles ----------
function paintTile(it) {
  const tile = tiles.get(it.id), img = $('img', tile), url = it.photo_path && links.get(it.photo_path);
  $('.tile__name', tile).textContent = it.name;
  $('.tile__meta', tile).textContent = [it.brand, it.size].filter(Boolean).join(' · ');
  if (url && img.src !== url) img.src = url;
  img.alt = it.name;
  img.hidden = !url;
  $('.tile__none', tile).style.display = url ? 'none' : '';
  $('.tile__none use', tile).setAttribute('href', `#i-${catIcon(it)}`);
}

function render() {
  const q = $('#search').value.trim().toLowerCase();
  const shelf = list.filter((it) => it.retired === (view.shelf === 'retired'));
  const fits = (it) => (!view.season || it.seasons?.includes(view.season)) && (!view.dress || it.dressiness === view.dress)
    && (!q || [it.name, it.brand, it.colour, it.manufacturer_colour, it.material, it.notes].join(' ').toLowerCase().includes(q));
  const tinted = (it) => !view.colour || swatchOf(it) === view.colour;
  const counts = Object.fromEntries(CATS.map(([c]) => [c, shelf.filter((it) => it.category === c && fits(it) && tinted(it)).length]));
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
  // the colours there are, as dots: a tap shows only that colour (when there are two or more)
  const tints = new Map();
  for (const it of shelf) { const sw = swatchOf(it); if (sw && fits(it) && (!view.cat || it.category === view.cat)) tints.set(sw, (tints.get(sw) || 0) + 1); }
  if (view.colour && !tints.has(view.colour)) tints.set(view.colour, 0);
  const sw = $('#swatches');
  sw.hidden = tints.size < 2 && !view.colour;
  sw.replaceChildren(...[...tints].sort((a, b) => b[1] - a[1]).map(([c, n]) => {
    const b = el('button', 'swatch');
    b.type = 'button';
    b.dataset.value = c;
    b.style.setProperty('--swatch', CLOTH[c]);
    b.setAttribute('aria-pressed', view.colour === c);
    b.setAttribute('aria-label', `${c} (${n})`);
    b.title = c;
    return b;
  }));
  const on = [view.season, view.dress, view.shelf !== 'in'].filter(Boolean).length;
  $('#filter-n').textContent = on ? `(${on})` : '';
  const order = (a, b) => CATS.findIndex(([c]) => c === a.category) - CATS.findIndex(([c]) => c === b.category) || a.name.localeCompare(b.name);
  let shown = 0;
  for (const it of [...list].sort(order)) {
    if (!tiles.has(it.id)) build(it);
    const tile = tiles.get(it.id), match = shelf.includes(it) && (!view.cat || it.category === view.cat) && fits(it) && tinted(it);
    tile.hidden = !match;
    if (match) shown++;
    $('#grid').append(tile);
  }
  $('#grid').setAttribute('aria-busy', 'false');
  const narrowed = q || view.cat || view.colour || on;
  $('#empty').hidden = shown > 0;
  $('#empty').replaceChildren(failed ? "Your closet didn't load. Pull down to try again."
    : !list.length ? 'Nothing in your closet yet. Add something: a photo, or a link to it in a shop.'
    : view.shelf === 'retired' && !shelf.length ? 'Nothing retired.' : 'Nothing matches that. ');
  if (shown === 0 && narrowed && list.length && !failed) {
    const all = el('button', 'link-btn', 'Show everything');
    all.type = 'button';
    all.addEventListener('click', () => { $('#search').value = ''; $('#season').value = $('#dress').value = ''; $('#shelf').value = 'in'; look({ cat: '', colour: '', season: '', dress: '', shelf: 'in' }); });
    $('#empty').append(all);
  }
}

function build(it) {
  const tile = $('#tile').content.firstElementChild.cloneNode(true);
  tiles.set(it.id, tile);
  $('.tile__open', tile).addEventListener('click', () => openItem(it, 'view', $('.tile__photo', tile)));
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
$('#swatches').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) look({ colour: view.colour === b.dataset.value ? '' : b.dataset.value }); });
for (const [id, key] of [['#season', 'season'], ['#dress', 'dress'], ['#shelf', 'shelf']]) {
  $(id).value = view[key];
  $(id).addEventListener('input', (e) => look({ [key]: e.target.value }));
}
// the filters fold away on a phone, where the closet is what matters; on a wider screen they're out.
// Folded with one set, they open, so nothing hides with no trace.
$('#filters').open = matchMedia('(min-width: 701px)').matches || !!(view.season || view.dress || view.shelf !== 'in');

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
  return photos.put(cut || file, folder(), { alpha: !!cut, longest: 1200, copies: true });
}

// ---------- Adding: a photo, or a link to it in a shop ----------
let pending = null; // what the add dialog has so far: { photo: Promise<path>, preview, from link: brand, price, currency, link }
$('#add').addEventListener('click', async () => {
  if (offline) { toast("You're offline. Adding has to wait for a connection.", true); return; }
  pending = {};
  const dialog = $('#add-dialog'), mine = pending;
  showPreview('', '');
  $('#add-ok').disabled = false;
  const values = await ask(dialog, { dirty: () => !!(mine.photo || mine.photo_path) || [...$('form', dialog).elements].some((f) => f.name && f.type !== 'file' && f.value && f.value !== f.defaultValue && f.tagName !== 'SELECT') });
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
    links = new Map([...links, ...(await photos.urls([path], SIZES.small))]);
  }
  view.shelf = 'in';
  render();
  keepCopy();
  openItem(added[0], 'edit'); // the rest of what it is, while it's in hand
});
// The photo fills the place it was asked for in, shimmering while it's worked on; a line under it says
// what's happening
const showPreview = (url, text, busy = false) => {
  const drop = $('#add-photo'), img = $('.drop__img', drop);
  if (url != null) { img.hidden = !url; if (url) img.src = url; } // null: keep what's there; '': clear it
  $('.drop__ask', drop).hidden = !img.hidden;
  drop.classList.toggle('is-busy', busy);
  $('#add-status').hidden = !text;
  $('#add-status').textContent = text;
};
$('#add-photo input').addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file || !pending) return;
  const mine = pending;
  showPreview(URL.createObjectURL(file), 'Cutting it out of the background…', true);
  $('#add-ok').disabled = true;
  mine.photo = storePhoto(file, (t) => { if (pending === mine) showPreview(null, t, true); }).then(async (path) => {
    if (pending === mine) {
      const url = path && (await photos.urls([path], SIZES.small)).get(path);
      showPreview(url || null, path ? '' : "The photo didn't upload; you can add one later.");
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
  showPreview(null, 'Reading the page…', true);
  const { data, error } = await db.functions.invoke('wardrobe-link', { body: { url: link } });
  button.disabled = false;
  if (pending !== mine) return;
  if (error || !data) { showPreview(null, "Couldn't read that page. Name it yourself; the link is kept."); return; }
  Object.assign(mine, { brand: data.brand, price: data.price, currency: data.currency, link: data.link, photo_path: data.photo_path });
  if (data.name && !form.name.value) form.name.value = data.name;
  const url = data.photo_path && (await photos.urls([data.photo_path], SIZES.small)).get(data.photo_path);
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
// The sheet's photo, sharp: the small copy shows at once (it's what the tile already has), and the
// large one replaces it once it's here and decoded, so there's no blank and no flash
const big = new Map(); // photo path → link to its large copy ('' while it's being fetched)
async function sharpen(path) {
  if (big.has(path) || offline) return;
  big.set(path, '');
  const url = (await photos.urls([path], SIZES.large)).get(path);
  if (!url) { big.delete(path); return; }
  await Object.assign(new Image(), { src: url }).decode().catch(() => {});
  big.set(path, url);
  if (current?.photo_path === path) paintSheet();
}
function paintSheet() {
  const it = current;
  if (!it) return;
  const img = $('.sheet__photo img', sheet), url = it.photo_path && (big.get(it.photo_path) || links.get(it.photo_path));
  if (it.photo_path) sharpen(it.photo_path);
  if (url && img.src !== url) img.src = url;
  img.alt = it.name;
  img.hidden = !url;
  $('.sheet__photo .tile__none', sheet).style.display = url ? 'none' : '';
  $('.sheet__photo .tile__none use', sheet).setAttribute('href', `#i-${catIcon(it)}`);
  // what it is, in a few lines
  $('#sv-cat').textContent = `${catName[it.category] || ''}${it.retired ? ' · retired' : ''}`;
  $('#sv-name').textContent = it.name;
  $('#sv-facts').textContent = [it.brand, it.manufacturer_colour || it.colour, it.material, it.size && `size ${it.size}`].filter(Boolean).join(' · ');
  $('#sv-fit').textContent = [it.fit && `Fit: ${it.fit}`, it.style_number && `Style ${it.style_number}`, it.condition && `Condition: ${it.condition}`].filter(Boolean).join(' · ');
  $('#sv-tags').replaceChildren(...[it.subcategory?.replace(/_/g, ' '), ...(it.seasons || []), { light: 'light', mid: 'mid-weight', warm: 'warm' }[it.warmth], it.dressiness, ...(it.dressiness_also || []).map((d) => `also ${d}`), ...(it.style_tags || [])].filter(Boolean).map((t) => el('span', 'pill', t)));
  $('#sheet-shared').hidden = !it.variant_id;
  const bought = it.bought_on && new Date(`${it.bought_on}T12:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  $('#sv-bought').textContent = [it.price != null && money(Number(it.price), it.currency), bought && `bought ${bought}`].filter(Boolean).join(', ');
  // how often it's been worn, and what that makes each wear cost, from what's logged (never stored)
  const worn = wears(events).get(it.id)?.times || 0;
  $('#sv-wear').textContent = worn ? [worn === 1 ? 'Worn once' : `Worn ${worn} times`, it.price != null && `${money(Number(it.price) / worn, it.currency)} a wear`].filter(Boolean).join(' · ') : '';
  $('#sv-notes').textContent = it.notes || '';
  $('#buy').hidden = !it.buy_link;
  if (it.buy_link) $('#buy').href = href(it.buy_link);
  $('#find').href = `https://www.google.com/search?tbm=shop&q=${encodeURIComponent([it.brand, it.name, it.colour].filter(Boolean).join(' '))}`;
  $('#find').textContent = it.buy_link ? 'Or find another' : 'Find another';
  $('#retire').textContent = it.retired ? 'Back in the closet' : 'Retire it (worn out, given away)';
  if (!$('#sheet-photo').classList.contains('is-busy')) $('#sheet-photo span').textContent = 'Add a photo';
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
  if (!sheet.open) { open(sheet); sheet.scrollTop = 0; }
  if (mode === 'edit') $('[data-is="name"]', sheet).focus();
}
// Done, Esc, a tap outside or a swipe down: each closes it, and closing saves what's being typed
sheetify(sheet, () => sheet.close());
$('#sheet-edit').addEventListener('click', () => {
  if (offline) { toast("You're offline. Changes have to wait for a connection.", true); return; }
  sheet.dataset.mode = 'edit';
  $('[data-is="name"]', sheet).focus({ preventScroll: true });
});
// Done while editing goes back to what it is, with everything typed saved
const TEXT = ['name', 'brand', 'colour', 'size', 'material', 'fit', 'condition', 'buy_link', 'notes'];
$('#sheet-finish').addEventListener('click', () => {
  for (const field of TEXT) $(`[data-is="${field}"]`, sheet).dispatchEvent(new Event('change'));
  sheet.dataset.mode = 'view';
  $('#sheet-edit').focus({ preventScroll: true });
});
// the bar over the fields says whether they're saved (saver() marks each field as it goes)
new MutationObserver(() => {
  const states = [...sheet.querySelectorAll('[data-save]')].map((f) => f.dataset.save);
  $('#sheet-state').textContent = states.includes('failed') ? "Didn't save" : states.includes('saving') ? 'Saving…' : states.includes('saved') ? 'Saved' : 'Saves as you type';
}).observe(sheet, { subtree: true, attributeFilter: ['data-save'] });
// text saves as it's typed; the rest at once
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
  if (address()[0] === 'item') { if (pushedItem) history.back(); else history.replaceState(null, '', `#${shownHash}`); }
  pushedItem = false;
  setTimeout(() => { if (!sheet.open) { current = null; redraw(); } }, 0);
});
$('#retire').addEventListener('click', async () => {
  const it = current, was = it.retired;
  if (!(await save({ retired: !was }))) return;
  sheet.close();
  toast(was ? 'Back in the closet.' : 'Retired. It\'s under Retired, in More filters.', false, async () => {
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
    links.set(path, (await photos.urls([path], SIZES.small)).get(path) || URL.createObjectURL(file));
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
  if (missing.length) links = new Map([...links, ...(await photos.urls(missing, SIZES.small))]);
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
    if (url) box.append(Object.assign(document.createElement('img'), { src: url, alt: '' })); else box.append(icon(catIcon(it), 'tile__none'));
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
// #today, #closet, #trips, #recipes, #trip/<id>, #trip/<id>/pack, and #item/<id> (an item over
// the view). A section the member doesn't see isn't there: its address goes home.
let trips = [], parts = noParts(), openTrip = null, ready = false, shown = null, shownHash = '', pushedItem = false, nextMode = 'view';
let events = []; // what happened, a day at a time (public.events): what was worn, a line about the day
const address = () => { const h = location.hash.slice(1); return h.includes('=') ? [] : h.split('/').map((p) => { try { return decodeURIComponent(p); } catch (e) { return p; } }); }; // "=": a sign-in link
// an item opens over the view, its photo growing out of the one tapped (where the browser can)
let zoomFrom = null;
const openItem = (it, mode = 'view', from = null) => { nextMode = mode; pushedItem = true; zoomFrom = from; location.hash = `item/${it.id}`; };
addEventListener('hashchange', route);
const motion = () => !!document.startViewTransition && !calm.matches;

function route() {
  if (!ready) return;
  const [where, id, part] = address();
  if (where === 'item' && can('closet')) {
    if (!shown) showView(...home());
    const it = list.find((x) => x.id === id), from = zoomFrom;
    zoomFrom = null;
    if (it && current !== it) {
      const mode = nextMode, photo = $('.sheet__photo', sheet);
      if (from?.isConnected && motion()) {
        from.style.viewTransitionName = 'garment';
        document.documentElement.classList.add('vt-zoom');
        const vt = document.startViewTransition(() => { from.style.viewTransitionName = ''; photo.style.viewTransitionName = 'garment'; openSheet(it, mode); });
        vt.finished.finally(() => { photo.style.viewTransitionName = ''; document.documentElement.classList.remove('vt-zoom'); });
      } else openSheet(it, mode);
    }
    nextMode = 'view';
    return;
  }
  if (sheet.open) sheet.close();
  if (where === 'trip' && can('trips') && trips.some((t) => t.id === id)) return showView(part === 'pack' ? 'pack' : 'trip', id);
  if (SECTIONS.includes(where) && can(where)) return showView(where);
  showView(...home());
}
// with no address (opening the app, from the Home Screen or a link), Today; for a member without
// Today, their first section
const home = () => [SECTIONS.find(can) || 'recipes'];
const DEPTH = { today: 0, closet: 0, trips: 0, recipes: 0, trip: 1, pack: 2 };
const scrolls = {}; // where each view was scrolled to, so coming back to it lands there
function showView(name, id) {
  const was = shown, wasHash = shownHash, hash = id ? `trip/${id}${name === 'pack' ? '/pack' : ''}` : name;
  if (was) scrolls[wasHash] = scrollY;
  const swap = () => {
    shown = name;
    shownHash = hash;
    const tab = name === 'trip' || name === 'pack' ? 'trips' : name;
    for (const a of $('#tabs').children) {
      if (a.dataset.value === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    }
    for (const s of SECTIONS) $(`#${s}-view`).hidden = tab !== s;
    $('#trip-list-view').hidden = name !== 'trips';
    $('#trip').hidden = name !== 'trip';
    $('#pack-view').hidden = name !== 'pack';
    openTrip = id ? trips.find((t) => t.id === id) : name === 'today' ? nowTrip() : null;
    title();
    const drawn = redraw();
    if (hash !== wasHash) {
      const y = scrolls[hash] || 0;
      scrollTo(0, y);
      if (y) Promise.resolve(drawn).then(() => { if (shownHash === hash) scrollTo(0, y); });
      if (was) $('#app-title').focus({ preventScroll: true }); // where you are now, for VoiceOver
    }
  };
  // going in slides the new view in from the side, coming back slides it back; switching tabs is instant
  const deeper = was && DEPTH[name] !== DEPTH[was] && (DEPTH[name] > DEPTH[was] ? 'in' : 'out');
  if (deeper && motion()) {
    document.documentElement.dataset.vt = deeper;
    document.startViewTransition(swap).finished.finally(() => { delete document.documentElement.dataset.vt; });
  } else swap();
}
// The heading says where you are (on Today, hello, with the date over it), and the way back up
// sits in the bar at the top, beside the badge (kit.js, here())
const hello = (d = new Date()) => `${d.getHours() >= 5 && d.getHours() < 12 ? 'Good morning' : d.getHours() >= 12 && d.getHours() < 17 ? 'Good afternoon' : 'Good evening'}, ${me?.name || 'you'}`;
function title() {
  const t = openTrip, back = shown === 'trip' ? ['#trips', 'Trips'] : shown === 'pack' && t ? [`#trip/${t.id}`, t.name] : null;
  if (shown === 'today') return here({ title: hello(), over: new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }), bar: 'Today' });
  const name = shown === 'trip' && t ? t.name : shown === 'pack' ? 'Packing' : shown === 'trips' ? 'Trips' : shown === 'recipes' ? 'Recipes' : 'Closet';
  here({ title: name, back });
}
// only the sections this member sees, and no tab bar for just one
function tabs() {
  for (const a of $('#tabs').children) a.hidden = !can(a.dataset.value);
  $('#tabs').hidden = sections.length < 2;
}
// the tab you're on, tapped again, goes back to its top
$('#tabs').addEventListener('click', (e) => {
  const a = e.target.closest('a');
  if (a && location.hash === `#${a.dataset.value}` && shown === a.dataset.value) { e.preventDefault(); scrollTo({ top: 0, behavior: calm.matches ? 'auto' : 'smooth' }); }
});
function redraw() {
  if (shown) title();
  if (shown === 'today') return drawToday();
  if (shown === 'trips') return drawTrips();
  if (shown === 'trip') return drawTrip();
  if (shown === 'pack') return drawPack();
  if (shown === 'recipes') return null; // it draws itself (lib/recipes.js)
  return render();
}

// ---------- Trips: where and when, the weather, what to wear each day, what to pack ----------
// Mostly built in ChatGPT (the MCP server's trip tools); here they're shown, the packing is ticked
// off, and a trip can be started or its places and dates changed.
const weatherCache = new Map(); // leg key → Promise of its weather
const openLegs = new Set(); // the legs whose every day is showing ("All 31 days")
const wxKept = kept('wardrobe-wx') || {}; // the last weather each leg had, for when there's no connection
const pad = (n) => String(n).padStart(2, '0');
const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const daysBetween = (a, b) => Math.round((new Date(`${b}T12:00`) - new Date(`${a}T12:00`)) / 864e5);
const addDays = (d, n) => { const x = new Date(`${d}T12:00`); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
const span = (t) => (t.legs.length ? [t.legs[0].from, t.legs[t.legs.length - 1].to] : [null, null]);
const legKey = (l) => `${l.lat},${l.lon},${l.from},${l.to}`;
const legWeatherCached = (l) => {
  const key = legKey(l);
  if (!weatherCache.has(key)) {
    // the days, and the hours of today and tomorrow (for Today), in one request a leg
    weatherCache.set(key, (navigator.onLine ? legWeather(l, isoToday(), { hourly: true }) : Promise.reject(new Error('offline')))
      .then((w) => { if (w) { wxKept[key] = w; keep('wardrobe-wx', wxKept); } return w; })
      .catch(() => wxKept[key] || null));
  }
  return weatherCache.get(key);
};
// a trip's rows of one part (a part whose trip isn't loaded, in the trash, is never shown)
const partsOf = (t, part) => parts[part].filter((r) => r.trip_id === t.id);
// where you are on a date: on a travel day, the place you're going to
const legOn = (t, date) => [...t.legs].reverse().find((l) => l.from <= date && date <= l.to);
const wxOn = async (t, date) => (await wxAt(t, date)).day;
// the same, with the leg's whole weather (its hours and timezone)
const wxAt = async (t, date) => { const l = legOn(t, date), w = l ? await legWeatherCached(l) : null; return { w, day: w?.days.find((d) => d.date === date) || null }; };
// the trip that's on, or else the next one if it starts within two weeks
function nowTrip() {
  const today = isoToday(), dated = trips.filter((t) => t.legs.length).map((t) => [t, ...span(t)]);
  const on = dated.find(([, a, b]) => a <= today && today <= b);
  if (on) return on[0];
  return dated.filter(([, a]) => a > today && daysBetween(today, a) <= 14).sort((x, y) => x[1].localeCompare(y[1]))[0]?.[0] || null;
}
const leaving = (a) => { const d = daysBetween(isoToday(), a); return d > 1 ? `you leave in ${d} days` : d === 1 ? 'you leave tomorrow' : d === 0 ? 'you leave today' : ''; };

// a day's weather, small: its sky, high and low, and the chance of rain when it's 20% or more
function wxSmall(w, cls) {
  const box = el('span', cls);
  box.append(skyIcon(w), tempEl(w.hi), el('span', 'wx-sep', '/'), tempEl(w.lo));
  if ((w.rain ?? 0) >= 20) box.append(el('span', w.kind === 'typical' ? 'wx-typical' : 'wx-rain', `${w.rain}%`));
  if (w.kind === 'typical') box.append(el('span', 'wx-typical', 'typical'));
  box.setAttribute('role', 'img');
  box.setAttribute('aria-label', dayWords(w, 'Weather'));
  return box;
}
// °F or °C, in Settings (the badge): every temperature at once, and it's remembered
const unitsSeg = $('#settings-units');
const paintUnits = () => { for (const b of unitsSeg.children) b.setAttribute('aria-pressed', b.dataset.value === units()); };
paintUnits();
unitsSeg.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || b.dataset.value === units()) return;
  setUnits(b.dataset.value);
  paintUnits();
  if (ready) redraw();
});

function drawTrips() {
  const box = $('#trip-list'), today = isoToday();
  box.textContent = '';
  const sorted = [...trips].sort((a, b) => (span(a)[0] || '9').localeCompare(span(b)[0] || '9'));
  const past = (t) => { const b = span(t)[1]; return b && b < today; };
  const groups = [['Coming up', sorted.filter((t) => !past(t))], ['Been', sorted.filter(past).reverse()]].filter(([, ts]) => ts.length);
  for (const [name, ts] of groups) {
    if (groups.length > 1) box.append(el('h2', 'part-title', name));
    const ul = el('ul', 'trip-cards');
    for (const t of ts) { const li = el('li'); li.append(tripCard(t)); ul.append(li); }
    box.append(ul);
  }
  $('#trips-empty').hidden = trips.length > 0;
  $('#trips-empty').textContent = 'No trips yet. Start one here, or ask ChatGPT or Claude to plan one.';
}
// a trip as a card to tap: how far off it is, its name, dates and places, the outfits planned
function tripCard(t) {
  const [a, b] = span(t), today = isoToday(), card = el('a', 'trip-card');
  card.href = `#trip/${t.id}`;
  const on = a && a <= today && today <= b;
  const status = !a ? 'No dates yet' : on ? `On now · day ${daysBetween(a, today) + 1} of ${daysBetween(a, b) + 1}` : a > today ? cap(leaving(a) || `in ${daysBetween(today, a)} days`) : `${daysBetween(a, b) + 1} days`;
  card.append(el('span', `trip-card__status${on ? ' is-on' : ''}`, status), el('span', 'trip-card__name', t.name), el('span', 'trip-card__when', a ? `${fmtDay(a)} – ${fmtDay(b)}` : ''), el('span', 'trip-card__legs', t.legs.map((l) => l.place).join(' → ')));
  // the outfits planned, as a row of small photos
  const worn = [...new Set(t.days.flatMap((d) => d.items || []))].map((id) => list.find((x) => x.id === id)).filter(Boolean).slice(0, 5);
  if (worn.length) { const row = el('span', 'trip-card__worn'); worn.forEach((it) => row.append(thumb(it, 'trip-card__thumb studio'))); card.append(row); }
  card.append(el('span', 'trip-card__go', '›'));
  card.lastChild.setAttribute('aria-hidden', 'true');
  return card;
}

// An outfit laid flat: its photos on one shared ground, like a lookbook page, top to toe (a jacket
// and top first, then trousers, shoes, the rest). Each piece opens the garment; a piece gone from
// the wardrobe since is a dashed outline. `mini` is the small one for a glance (no buttons).
const BODY = { outerwear: 0, suits: 0, tops: 1, workout: 1, swim: 2, bottoms: 2, shoes: 3, accessories: 4 };
function flatlay(ids, { mini = false } = {}) {
  const pieces = (ids || []).map((id) => list.find((x) => x.id === id) || { id, gone: true })
    .sort((a, b) => (a.gone ? 9 : BODY[a.category] ?? 5) - (b.gone ? 9 : BODY[b.category] ?? 5)).slice(0, mini ? 4 : 6);
  const board = el(mini ? 'span' : 'div', `flatlay studio flatlay--${pieces.length}${mini ? ' flatlay--mini' : ''}`);
  for (const it of pieces) {
    const piece = el(mini || it.gone ? 'span' : 'button', `flatlay__piece${mini || it.gone ? '' : ' outfit__item'}${it.gone ? ' is-gone' : ''}`);
    const url = !it.gone && it.photo_path && links.get(it.photo_path);
    if (url) piece.append(Object.assign(document.createElement('img'), { src: url, alt: '', loading: 'lazy', decoding: 'async' }));
    else piece.append(icon(it.gone ? 'tops' : catIcon(it), 'tile__none'));
    if (!mini && !it.gone) {
      piece.type = 'button';
      piece.setAttribute('aria-label', it.name);
      piece.addEventListener('click', () => openItem(it, 'view', piece));
    } else if (it.gone && !mini) piece.title = 'No longer in the wardrobe';
    board.append(piece);
  }
  if (mini) return board;
  const names = el('p', 'flatlay__names', pieces.map((it) => (it.gone ? 'No longer in the wardrobe' : it.name)).join(' · '));
  const box = el('div', 'look');
  box.append(board, names);
  return box;
}

const packCount = (t) => { const entries = partsOf(t, 'trip_packing'); return [entries.filter((p) => p.status === 'packed').length, entries.length]; };
const packSummary = (t) => {
  const [done, n] = packCount(t);
  return !n ? 'Nothing on the list yet.' : done === n ? `All ${n} packed.` : `${done} of ${n} packed.`;
};
// a ring that fills as the packing does
const ring = (box, t) => { const [done, n] = packCount(t); box.style.setProperty('--fill', n ? done / n : 0); box.classList.toggle('is-done', !!n && done === n); };
function packCard(t) {
  const a = el('a', 'pack-card'), r = el('span', 'ring'), text = el('span', 'pack-card__text');
  a.href = `#trip/${t.id}/pack`;
  r.setAttribute('aria-hidden', 'true');
  ring(r, t);
  const leave = leaving(span(t)[0] || '');
  text.append(el('span', 'pack-card__title', 'Packing'), el('span', '', `${packSummary(t)}${leave && !packSummary(t).startsWith('All') ? ` ${cap(leave)}.` : ''}`));
  const go = el('span', 'pack-card__go', '›');
  go.setAttribute('aria-hidden', 'true');
  a.append(r, text, go);
  return a;
}

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
  const [a, b] = span(t), today = isoToday();
  const total = a ? daysBetween(a, b) + 1 : 0;
  $('#trip-when').textContent = a ? `${fmtDay(a)} – ${fmtDay(b)} · ${plural(total, 'day')} · ${plural(t.legs.length, 'place')}` : 'No dates yet';
  $('#trip-notes-part').hidden = !t.notes;
  $('#trip-notes').textContent = t.notes || '';
  $('#pack-sum').textContent = packSummary(t);
  ring($('#pack-ring'), t);
  $('#pack-open').href = `#trip/${t.id}/pack`;
  // who's going, how they get there, where they stay, the links: each only when there's something
  const people = t.travelers || [];
  $('#trip-who').replaceChildren(...people.map((x) => {
    const li = el('li', 'person'), face = el('span', 'person__face', (x.name || '?')[0].toUpperCase());
    face.setAttribute('aria-hidden', 'true');
    li.append(face, el('span', 'person__name', x.name), ...(x.type && x.type !== 'adult' ? [el('span', 'person__type', spaced(x.type))] : []));
    return li;
  }));
  $('#trip-who').hidden = !people.length;
  // getting there, as boarding cards in the order they happen; staying, each with its map and reference
  const goes = partsOf(t, 'trip_transport').sort((x, y) => x.date.localeCompare(y.date) || (x.departure_time || '').localeCompare(y.departure_time || ''));
  part('trip-go', goes.map((g) => journeyCard(g, t.legs)));
  const stays = partsOf(t, 'trip_lodging').sort((x, y) => x.check_in.localeCompare(y.check_in));
  part('trip-stay', stays.map((l) => stayCard(l, { date: today })));
  part('trip-links', partsOf(t, 'trip_resources').map((r) => infoRow(r.label, r.url, [r.notes])));
  const planned = [...t.days].sort((x, y) => x.date.localeCompare(y.date));
  // what each day so far was: what was worn and its line, from what's logged; a day logged but
  // never planned gets a card too
  const logs = byDay(events), logged = [...logs.keys()].filter((d) => a && a <= d && d <= b && d <= today && (logs.get(d).wore?.item_ids?.length || logs.get(d).journal?.text));
  const shownDays = [...new Set([...planned.map((d) => d.date), ...logged])].sort().map((date) => planned.find((d) => d.date === date) || { date, items: [] });
  $('#days-count').textContent = [planned.length && `${planned.length} of ${total} planned`, logged.length && `${logged.length} logged`].filter(Boolean).join(' · ');
  // the legs, each with its weather day by day, every leg's bars on the trip's one scale
  const weather = await Promise.all(t.legs.map(legWeatherCached));
  if (openTrip !== t || shown !== 'trip') return;
  const legs = $('#legs'), scale = scaleOf(weather);
  legs.textContent = '';
  t.legs.forEach((l, i) => {
    const w = weather[i], here = l.from <= today && today <= l.to, past = l.to < today, li = el('li', `leg${here ? ' is-here' : ''}${past ? ' is-past' : ''}`);
    const head = el('div', 'leg__head');
    head.append(el('h3', 'leg__place', `${l.place}${l.country ? `, ${l.country}` : ''}`), el('p', 'leg__when', `${fmtDay(l.from)} – ${fmtDay(l.to)} · ${plural(daysBetween(l.from, l.to), 'night')}${here ? ' · you\'re here' : past ? ' · been' : ''}`));
    li.append(head);
    if (w) {
      const s = w.summary, line = el('p', 'leg__weather');
      line.append(`${w.kind === 'forecast' ? 'Forecast' : w.kind === 'mixed' ? 'Forecast, then typical' : 'Typically'}: highs `, tempEl(s.hi), ', lows ', tempEl(s.lo), `, about ${plural(s.wet, 'day')} of rain`);
      li.append(line);
      const nowT = here ? hourNow(w.hours, placeNow(w.timezone))?.temp ?? null : null;
      const list = dayList(w, { scale, today, nowTemp: nowT, show: 10, open: openLegs.has(legKey(l)), onOpen: () => openLegs.add(legKey(l)) });
      list.setAttribute('aria-label', `Day by day in ${l.place}`);
      li.append(list);
    } else if (!past) li.append(el('p', 'leg__weather', 'Weather unavailable right now.'));
    legs.append(li);
  });
  // day by day: the planned days, each with its place, weather and outfit laid flat
  const days = $('#days');
  days.textContent = '';
  const wxDay = (date) => { for (const w of weather) { const d = w?.days.find((x) => x.date === date); if (d) return d; } return null; };
  for (const d of shownDays) {
    const li = el('li', `day${d.date === today ? ' is-today' : ''}`), w = wxDay(d.date);
    const log = d.date <= today ? logs.get(d.date) || {} : {}, worn = log.wore?.item_ids?.length ? log.wore.item_ids : null;
    const head = el('div', 'day__head'), when = el('p', 'day__date');
    when.append(el('strong', '', fmtDay(d.date, { weekday: 'short' })), ` · ${legOn(t, d.date)?.place || ''}`);
    head.append(when);
    if (w) head.append(wxSmall(w, 'day__wx'));
    li.append(head);
    if (d.occasion) li.append(el('p', 'day__occasion', d.occasion));
    const acts = activities(d);
    if (acts) li.append(acts);
    // what was worn, once it's logged: as planned, or what instead (laid flat, the plan named under it)
    const asPlanned = worn && sameSet(worn, d.items || []);
    if (worn || d.items?.length) li.append(flatlay(worn || d.items));
    if (worn) li.append(el('p', 'day__worn', asPlanned ? 'Worn as planned ✓' : 'Worn ✓'));
    if (worn && !asPlanned && d.items?.length) li.append(el('p', 'day__note', `Planned: ${d.items.map((id) => list.find((x) => x.id === id)?.name || 'No longer in the wardrobe').join(' · ')}`));
    if (log.journal?.text) li.append(el('p', 'day__journal', `“${log.journal.text}”`));
    if (d.note) li.append(el('p', 'day__note', d.note));
    days.append(li);
  }
  $('#days-empty').hidden = !!shownDays.length;
  $('#days-empty').textContent = 'No outfits planned yet. Ask ChatGPT or Claude to plan what you wear each day.';
}

// ---------- Today: where you are on the trip, the weather, what you're wearing ----------
// A line or two of advice when the weather and the outfit don't agree. The words in an item's
// name, material and notes are all it knows about what's for rain.
const words = (it) => [it.name, it.material, it.notes].join(' ').toLowerCase();
function advice(w, outfit, { hours = [], now = null, plan = null } = {}) {
  if (!w) return [];
  const out = [], left = hoursLeft(hours, w.date, now), spell = left.length >= 3 ? wetSpell(left) : null;
  if (w.rain >= 50) {
    // when it starts, from the hours (today and tomorrow have them)
    const word = spell?.word || 'Rain', started = spell && now && spell.from <= now;
    const what = spell && !spell.all ? (started ? `${word} now (${w.rain}%)` : `${word} likely from about ${hourLabel(spell.from)} (${w.rain}%)`) : `${word} likely (${w.rain}%)`;
    const shell = outfit.find((it) => /rain|waterproof|shell|gore-?tex|trench|\bmac\b|umbrella/.test(words(it)));
    out.push(shell ? `${what}. ${shell.name} is in the outfit.` : outfit.length ? `${what}, and nothing in this outfit is for rain.` : `${what}.`);
    const suede = outfit.find((it) => /suede/.test(words(it)));
    if (suede) out.push(`Maybe not ${suede.name} in the rain.`);
  }
  if (outfit.length && !outfit.some((it) => it.category === 'outerwear' || it.warmth === 'warm')) {
    // an evening plan, and how cool it'll be by then; or else how cold the night gets
    const eve = [...(plan?.activities || [])].filter((a) => (a.start_time || '') >= '17:00').sort((x, y) => x.start_time.localeCompare(y.start_time))[0];
    const then = eve && hours.find((h) => h.time === `${w.date}T${eve.start_time.slice(0, 2)}:00`);
    const coldest = left.length ? left.reduce((a, b) => (b.temp < a.temp ? b : a)) : null;
    if (then && then.temp < 12) out.push(`${eve.title || 'The evening'} at ${eve.start_time}: about ${temp(then.temp)}, and nothing warm in this outfit.`);
    else if (coldest && coldest.temp < 8) out.push(`Down to ${temp(coldest.temp)} by ${hourLabel(coldest.time)}, and nothing warm in this outfit.`);
    else if (!coldest && w.lo != null && w.lo < 8) out.push(`Down to ${temp(w.lo)} later, and nothing warm in this outfit.`);
  }
  if (w.hi != null && w.hi >= 26) { const hot = outfit.find((it) => it.warmth === 'warm'); if (hot) out.push(`Up to ${temp(w.hi)}: warm for ${hot.name}.`); }
  return out;
}

let dayOn = null, slide = ''; // the date Today shows (on a trip it steps through the days), and which way it came in
// home, today and tomorrow, as a leg of its own: the weather where you are when you're not away
const homeLeg = () => ({ place: HOME.place, lat: HOME.lat, lon: HOME.lon, from: isoToday(), to: addDays(isoToday(), 1) });
async function drawToday() {
  const t = openTrip, box = $('#today-view'), today = isoToday();
  const [a, b] = t ? span(t) : [null, null], away = !!t && a <= today; // a trip that's on, or one coming within two weeks (nowTrip)
  if (!away || !dayOn || dayOn < a || dayOn > b) dayOn = today;
  const date = dayOn;
  const ahead = away ? Array.from({ length: Math.min(5, daysBetween(date, b)) }, (_, i) => addDays(date, i + 1)) : [];
  // where you are now (for its clock and money): on a travel day, where you left until you've arrived
  let hereLeg = away ? legOn(t, today) : null;
  if (hereLeg && hereLeg.from === today && partsOf(t, 'trip_transport').some((g) => (g.date === today) && ['soon', 'on'].includes(journeyNow(g, t.legs).state))) hereLeg = t.legs[t.legs.indexOf(hereLeg) - 1] || hereLeg;
  const wxFor = (d) => (away ? wxAt(t, d) : legWeatherCached(homeLeg()).then((w) => ({ w, day: w?.days.find((x) => x.date === d) || null })));
  const [hereW, { w: lw, day: w }, ...wAhead] = await Promise.all([hereLeg ? legWeatherCached(hereLeg) : null, ...[date, ...ahead].map(wxFor)]).then((r) => [r[0], r[1], ...r.slice(2).map((x) => x.day)]);
  if (openTrip !== t || shown !== 'today' || dayOn !== date) return;
  const planned = (d) => (away ? t.days.find((x) => x.date === d) : null);
  const weekday = (d) => fmtDay(d, { weekday: 'long', month: 'long' }).split(',')[0];

  // 1. the next journey, when it's within two days (or under way): the thing to act on comes first
  const goes = t ? partsOf(t, 'trip_transport') : [], next1 = t && nextJourney(goes, t.legs);
  const journey = next1 ? journeyCard(next1, t.legs, { today: true }) : null;

  // 2. what you're wearing: the outfit laid flat (what you logged, once you have; else the plan)
  // with "Wore it" under it, what the day holds, a word when the weather and the outfit disagree,
  // and a line about the day (a day to come has neither)
  const card = el('section', `today-card${slide ? ` slide-${slide}` : ''}`);
  const plan = planned(date), log = byDay(events).get(date) || {};
  const worn = log.wore?.item_ids?.length ? log.wore : null; // logged as worn (one logged empty was cleared)
  const shownIds = worn ? worn.item_ids : plan?.items || [];
  const outfit = shownIds.map((id) => list.find((x) => x.id === id)).filter(Boolean);
  card.setAttribute('aria-label', `What you're wearing ${date === today ? 'today' : weekday(date)}`);
  card.append(el('h2', 'part-title', date === today ? "What you're wearing" : date < today && worn ? `What you wore ${weekday(date)}` : `Planned for ${weekday(date)}`));
  const there = lw ? placeNow(lw.timezone) : null, isNow = date === today && there?.startsWith(date);
  const hours = lw?.hours || [], nowH = isNow ? hourNow(hours, there) : null;
  if (shownIds.length) card.append(flatlay(shownIds));
  else card.append(el('p', 'today-card__none', away ? 'Nothing planned to wear. Ask ChatGPT or Claude to plan it.' : 'Nothing planned for today.'));
  if (worn && plan?.items?.length && !sameSet(worn.item_ids, plan.items)) card.append(el('p', 'today-card__note', `Planned: ${plan.items.map((id) => list.find((x) => x.id === id)?.name || 'No longer in the wardrobe').join(' · ')}`));
  if (date <= today) card.append(woreRow(date, plan, worn));
  if (plan?.occasion) card.append(el('p', 'today-card__occasion', plan.occasion));
  const acts = plan && activities(plan);
  if (acts) card.append(acts);
  if (plan?.note) card.append(el('p', 'today-card__note', plan.note));
  const warn = advice(w, outfit, { hours, now: isNow ? there : null, plan });
  if (warn.length) {
    const box2 = el('div', 'advice');
    box2.setAttribute('role', 'note');
    const lines = el('div');
    for (const l of warn) lines.append(el('p', 'today-card__advice', l));
    box2.append(icon('umbrella', 'advice__icon'), lines);
    card.append(box2);
  }
  if (date <= today) card.append(journalLine(date, log.journal));

  // 3. the weather where you are (or will be that day), on its own sky
  const wxCard = el('section', `today-card today-card--wx${slide ? ` slide-${slide}` : ''}`), panel = el('div', 'sky-panel'), top = el('div', 'today-card__top'), where = el('div');
  slide = '';
  const place = away ? legOn(t, date)?.place || '' : HOME.place;
  wxCard.setAttribute('aria-label', `The weather in ${place}`);
  where.append(el('p', 'today-card__kicker', `${date === today ? 'Today' : weekday(date)}${away ? ` · day ${daysBetween(a, date) + 1}` : ''}`), el('h2', 'today-card__place', place));
  if (date !== today) where.append(el('p', 'today-card__date', fmtDay(date, { weekday: 'long' })));
  // now, as it is there: this hour's sky and temperature (today), or the day's
  const m = mood(w, nowH, isNow ? there : null);
  panel.dataset.sky = m.sky;
  panel.dataset.time = m.time;
  const fx = el('div', 'sky-panel__fx');
  fx.setAttribute('aria-hidden', 'true');
  panel.append(fx);
  const wx = el('div', 'today-card__wx');
  if (w) {
    const cur = nowH ? { ...nowH, kind: 'forecast' } : w, sk = skyOf(cur, nowH ? nowH.day : m.time !== 'night'), big = nowH ? nowH.temp : w.hi;
    const now = el('p', 'today-card__temp');
    now.append(skyIcon(cur, '', nowH ? nowH.day : m.time !== 'night'), temp(big));
    wx.append(now);
    if (w.kind === 'typical') wx.append(el('span', 'today-card__typical', 'Typical, not a forecast'));
    else if (sk.word) wx.append(el('span', 'today-card__word', sk.word));
    const range = el('span', 'today-card__range');
    range.append('H ', tempEl(w.hi), '  L ', tempEl(w.lo));
    wx.append(range);
    if (nowH?.feels != null && Math.abs(nowH.feels - nowH.temp) >= 3) { const f = el('span', 'today-card__feels', 'Feels like '); f.append(tempEl(nowH.feels)); wx.append(f); }
  } else wx.append(el('span', 'today-card__range', 'No weather yet'));
  top.append(where, wx);
  panel.append(top);
  if (w) {
    panel.append(el('p', 'today-card__story', story(w, hours, isNow ? there : null)));
    const strip = nowH ? hourStrip(hours, [w, away ? wAhead[0] : lw.days.find((x) => x.date === addDays(date, 1))], there) : null;
    const small = facts(w, { strip: !!strip, now: isNow ? there : null });
    if (small.length) {
      const ul = el('ul', 'sky-facts');
      for (const [ic, text] of small) { const li = el('li'); li.append(icon(ic, 'sky'), text); ul.append(li); }
      panel.append(ul);
    }
    if (strip) panel.append(strip);
  }
  wxCard.append(panel);

  // on a trip, "Day before" and "Tomorrow" step through it, and so does a swipe across either card
  if (away) {
    const step = el('div', 'today-card__step');
    const go = (d, text, dir) => {
      const btn = el('button', 'link-btn', text);
      btn.type = 'button';
      btn.disabled = d < a || d > b;
      btn.addEventListener('click', () => { dayOn = d; slide = dir; drawToday(); });
      return btn;
    };
    step.append(go(addDays(date, -1), '‹ Day before', 'back'), go(addDays(date, 1), date === today ? 'Tomorrow ›' : 'Next day ›', 'on'));
    card.append(step);
    for (const c of [card, wxCard]) {
      let x0 = null, y0 = 0;
      c.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
      c.addEventListener('touchend', (e) => {
        if (x0 == null || e.target.closest('.hours')) return;
        const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
        x0 = null;
        if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        const btn = step.children[dx < 0 ? 1 : 0];
        if (!btn.disabled) { buzz(); btn.click(); }
      });
    }
  }

  // 4. the trip: where you are on it (a line in legs, the one you're on lit), or that it's coming
  const side = [];
  if (t) {
    const head = el('section', 'today__trip today__part'), name = el('a', 'today__trip-name', t.name);
    name.href = `#trip/${t.id}`;
    head.append(el('h2', 'part-title', away ? 'Your trip' : 'Coming up'), name, el('p', 'today__when', `${fmtDay(a)} – ${fmtDay(b)} · ${away ? `day ${daysBetween(a, today) + 1} of ${daysBetween(a, b) + 1}` : leaving(a)}`));
    const line = el('ol', 'legline');
    line.setAttribute('aria-label', 'The trip, place by place');
    t.legs.forEach((l, i) => {
      const last = i === t.legs.length - 1, end = last ? l.to : t.legs[i + 1].from;
      const now = away && l.from <= today && (today < end || (last && today <= end));
      const li = el('li', `legline__leg${away && end <= today && !now ? ' is-past' : ''}${now ? ' is-now' : ''}`);
      li.style.flexGrow = Math.max(1, daysBetween(l.from, end));
      if (now) li.style.setProperty('--at', Math.min(1, daysBetween(l.from, today) / Math.max(1, daysBetween(l.from, end))));
      li.append(el('span', 'legline__place', l.place));
      if (now) li.append(el('span', 'legline__left', `${plural(daysBetween(today, end), 'day')} left`));
      line.append(li);
    });
    head.append(line);
    // home and away: the time here and at home, and what the money's worth
    const far = homeAway(hereLeg, hereW?.timezone);
    if (far) head.append(far);
    side.push(head);
    // where you sleep that night, its address a tap from Maps
    const bed = partsOf(t, 'trip_lodging').find((l) => l.check_in <= date && date < l.check_out);
    const stay = bed ? stayCard(bed, { date, today: true, kicker: date === today ? (bed.check_in === date ? 'Tonight · check in today' : 'Tonight') : `${weekday(date)} night` }) : null;
    if (stay) { stay.classList.add('today__part'); side.push(stay); }
    // the next few days, a tap away
    if (ahead.length) {
      const next = el('section', 'today__part'), nextHead = el('div', 'today__part-head');
      const allDays = el('a', 'link-btn', 'All days ›');
      allDays.href = `#trip/${t.id}`;
      nextHead.append(el('h2', 'part-title', 'Next few days'), allDays);
      const strip = el('ol', 'next-days');
      ahead.forEach((d, i) => {
        const li = el('li'), btn = el('button', 'next-day'), dw = wAhead[i], on = planned(d)?.items || [];
        btn.type = 'button';
        btn.append(el('span', 'next-day__date', fmtDay(d, { weekday: 'short' })), dw ? wxSmall(dw, 'next-day__wx') : el('span', 'next-day__wx', '–'));
        btn.append(on.length ? flatlay(on, { mini: true }) : el('span', 'next-day__none', 'Nothing planned'));
        btn.addEventListener('click', () => { dayOn = d; slide = 'on'; drawToday(); scrollTo({ top: 0, behavior: calm.matches ? 'auto' : 'smooth' }); });
        li.append(btn);
        strip.append(li);
      });
      next.append(nextHead, strip);
      side.push(next);
    }
    // the packing, and the way to it
    const pack = el('section', 'today__part');
    pack.append(packCard(t));
    side.push(pack);
  } else {
    // no trip on or close: the next one, if there is one, a tap away
    const later = trips.filter((x) => span(x)[0] > today).sort((x, y) => span(x)[0].localeCompare(span(y)[0]))[0];
    if (later) { const part2 = el('section', 'today__part'); part2.append(el('h2', 'part-title', 'Next trip'), tripCard(later)); side.push(part2); }
  }
  const main = el('div', 'today__main'), aside = el('div', 'today__side');
  main.append(...(journey ? [journey] : []), card, wxCard);
  if (journey) journey.classList.add('today__part');
  aside.append(...side);
  // a line being typed stays as it is through a redraw (the weather arriving, a pull)
  const typing = document.activeElement?.id === 'journal-line' ? document.activeElement : null;
  box.replaceChildren(main, ...(side.length ? [aside] : []));
  const line = $('#journal-line');
  if (typing && line && typing.dataset.date === line.dataset.date) { line.value = typing.value; line.focus({ preventScroll: true }); }
}

// ---------- Days: what you wore, and a line about the day ----------
// Each is an event (public.events), only ever added: logging a day again adds another, and the
// newest is what the day says (_shared/days.js; the older ones are its history). Undo moves the
// one just added to the trash. Each says how it was known (the plan that day, whether it was worn
// as planned, how it came in), so a better model can read it again. With no connection they wait
// on the phone (QUEUE_DAYS) and go when it's back.
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
const tripOnDate = (date) => trips.find((t) => { const [a, b] = span(t); return a && a <= date && date <= b; }) || null;
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));
const QUEUE_DAYS = 'wardrobe-days-queue';
const dayQueue = { add: {}, gone: {}, ...kept(QUEUE_DAYS) }; // id → the row to add; id → when it went to the trash (null: back out of it)
const keepDayQueue = () => keep(QUEUE_DAYS, dayQueue);
const waitingDays = () => Object.keys(dayQueue.add).length + Object.keys(dayQueue.gone).length;
const local = () => offline || !navigator.onLine;

// Adds an event: it shows at once and saves as one POST (or waits, with no connection). It's
// stamped after the newest one known, so it's the one that stands even if this phone's clock is
// behind (or two taps land in the same millisecond)
const stamp = () => new Date(Math.max(Date.now(), ...events.map((e) => (Date.parse(String(e.created_at).replace(' ', 'T')) || 0) + 1))).toISOString();
async function logEvent(fields) {
  const row = { id: newId(), item_ids: [], text: null, evidence: {}, source: 'app', recorded_by: me?.name || null, trip_id: tripOnDate(fields.date)?.id || null, created_at: stamp(), ...fields };
  events.push(row);
  redraw();
  if (local()) { dayQueue.add[row.id] = row; keepDayQueue(); keepCopy(); showStatus(); return row; }
  const { error } = await db.from('events').insert(row);
  if (error) { events = events.filter((e) => e !== row); redraw(); toast(`That didn't save: ${error.message}`, true); return null; }
  keepCopy();
  return row;
}
// Moves events to the trash (at: when) or back out of it (at: null). One that never left the phone
// only leaves the queue (or joins it again).
async function trashEvents(list, at) {
  for (const e of list) {
    events = events.filter((x) => x.id !== e.id);
    if (!at) events.push(e);
    if (dayQueue.add[e.id] || e.unsent) {
      if (at) { delete dayQueue.add[e.id]; e.unsent = true; continue; }
      delete e.unsent;
      if (local() || (await db.from('events').insert(e)).error) dayQueue.add[e.id] = e;
      continue;
    }
    if (local()) { dayQueue.gone[e.id] = at; continue; }
    const { error } = await db.from('events').update({ deleted_at: at }).eq('id', e.id);
    if (error) toast(`That didn't save: ${error.message}`, true);
  }
  keepDayQueue();
  keepCopy();
  showStatus();
  redraw();
}
// what waited goes, before anything is loaded: the adds, then what went to the trash
async function sendDays() {
  for (const [id, row] of Object.entries(dayQueue.add)) {
    const { unsent, ...out } = row;
    const { error } = await db.from('events').insert(out);
    if (!error || error.code) delete dayQueue.add[id]; // sent, or refused (23505: it went before): done either way
  }
  for (const [id, at] of Object.entries(dayQueue.gone)) {
    const { error } = await db.from('events').update({ deleted_at: at }).eq('id', id);
    if (!error || error.code) delete dayQueue.gone[id];
  }
  keepDayQueue();
}

// Logs what was worn on a date: the plan in one tap, or the pieces picked; Undo takes it back
async function logWorn(date, ids, plan) {
  const planned = plan?.items || [], asPlanned = !!planned.length && sameSet(ids, planned);
  const ev = await logEvent({ date, kind: 'wore', item_ids: ids, evidence: { ...(planned.length && { planned, as_planned: asPlanned }), how: asPlanned ? 'tapped Wore it' : 'picked the pieces' } });
  if (!ev) return;
  buzz();
  const day = date === isoToday() ? 'today' : fmtDay(date, { weekday: 'long', month: 'long' }).split(',')[0];
  toast(asPlanned ? `Logged ${day}'s outfit as worn.` : `Logged what you wore ${day === 'today' ? day : `on ${day}`}.`, false, () => trashEvents([ev], new Date().toISOString()));
}
// Under the outfit: "Wore it" (the plan, or, with none, the pieces to pick), or once it's logged,
// that it's done and a way to change it
function woreRow(date, plan, worn) {
  const row = el('div', 'wore'), today = date === isoToday(), planned = (plan?.items || []).filter((id) => list.some((x) => x.id === id));
  const button = (cls, text, go) => { const b = el('button', cls, text); b.type = 'button'; b.addEventListener('click', go); return b; };
  if (worn) {
    row.append(el('p', 'wore__done', today ? 'Worn today ✓' : 'Worn ✓'), button('link-btn wore__change', 'Change', () => pickWorn(date, plan, worn)));
    row.lastChild.setAttribute('aria-label', 'Change what you wore');
  } else {
    row.append(button('btn wore__btn', 'Wore it', () => (planned.length ? logWorn(date, planned, plan) : pickWorn(date, plan, null))));
    if (planned.length) row.append(button('link-btn wore__change', 'Something else', () => pickWorn(date, plan, null)));
  }
  return row;
}
// A line about the day: saved when you leave it (or tap Done), the saved one shown
let lineSaved = null; // the date whose line just saved, to say so once it's redrawn
function journalLine(date, entry) {
  const label = el('label', 'journal'), input = el('input');
  const day = date === isoToday() ? 'today' : fmtDay(date, { weekday: 'long', month: 'long' }).split(',')[0];
  Object.assign(input, { type: 'text', id: 'journal-line', maxLength: 500, value: entry?.text || '', placeholder: 'What happened', autocomplete: 'off', enterKeyHint: 'done' });
  input.dataset.date = date;
  label.append(`A line about ${day}`, input);
  if (lineSaved === date) { input.dataset.save = 'saved'; lineSaved = null; setTimeout(() => delete input.dataset.save, 1200); }
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
  input.addEventListener('change', async () => {
    const text = input.value.trim().replace(/\s+/g, ' ');
    if (text === (entry?.text || '')) return;
    input.dataset.save = 'saving';
    lineSaved = date;
    if (!(await logEvent({ date, kind: 'journal', text: text || null }))) { lineSaved = null; input.dataset.save = 'failed'; }
  });
  return label;
}

// What you wore, picked: the closet's pieces (what's logged, or the plan, already picked), in a sheet
const woreSheet = $('#wore-sheet');
let picking = null; // { date, chosen: Set of item ids }
async function pickWorn(date, plan, worn) {
  const from = (worn?.item_ids || plan?.items || []).filter((id) => list.some((x) => x.id === id));
  picking = { date, chosen: new Set(from) };
  const opened = ask(woreSheet, { dirty: () => !!picking && !sameSet([...picking.chosen], from) }); // resets the form, so fill it after
  $('#wore-title').textContent = date === isoToday() ? 'What you wore today' : `What you wore ${fmtDay(date, { weekday: 'short' })}`;
  $('#wore-clear').hidden = !worn;
  paintPicker();
  const v = await opened, ids = picking ? [...picking.chosen] : [];
  picking = null;
  if (!v || !ids.length || (worn && sameSet(ids, worn.item_ids))) return;
  logWorn(date, ids, plan);
}
function paintPicker() {
  if (!picking) return;
  const q = $('#wore-search').value.trim().toLowerCase(), { chosen } = picking;
  const pool = list.filter((it) => !it.retired || chosen.has(it.id))
    .filter((it) => !q || chosen.has(it.id) || [it.name, it.brand, it.colour, it.manufacturer_colour, catName[it.category]].join(' ').toLowerCase().includes(q))
    .sort((a, b) => (BODY[a.category] ?? 5) - (BODY[b.category] ?? 5) || a.name.localeCompare(b.name));
  $('#wore-grid').replaceChildren(...pool.map((it) => {
    const li = el('li'), b = el('button', 'wore-pick');
    b.type = 'button';
    b.dataset.id = it.id;
    b.setAttribute('aria-pressed', chosen.has(it.id));
    b.append(thumb(it, 'tile__photo studio wore-pick__photo'), el('span', 'wore-pick__name', it.name));
    li.append(b);
    return li;
  }));
  $('#wore-empty').hidden = pool.length > 0;
  $('#wore-count').textContent = chosen.size ? `${plural(chosen.size, 'piece')} picked` : 'Tap what you wore';
  $('#wore-ok').disabled = !chosen.size;
}
$('#wore-grid').addEventListener('click', (e) => {
  const b = e.target.closest('.wore-pick');
  if (!b || !picking) return;
  if (!picking.chosen.delete(b.dataset.id)) picking.chosen.add(b.dataset.id);
  b.setAttribute('aria-pressed', picking.chosen.has(b.dataset.id));
  buzz();
  $('#wore-count').textContent = picking.chosen.size ? `${plural(picking.chosen.size, 'piece')} picked` : 'Tap what you wore';
  $('#wore-ok').disabled = !picking.chosen.size;
});
$('#wore-search').addEventListener('input', paintPicker);
$('#wore-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } }); // Enter here isn't Save
// a day taken off the log: what it said goes to the trash, with Undo
$('#wore-clear').addEventListener('click', () => {
  const date = picking?.date;
  picking = null;
  woreSheet.close('');
  const gone = events.filter((e) => e.kind === 'wore' && e.date === date);
  if (!gone.length) return;
  trashEvents(gone, new Date().toISOString());
  toast('Taken off the log.', false, () => trashEvents(gone, null));
});

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
  // how it's going, over the whole list: a suitcase that fills as things go in
  const n = entries.length, done = entries.filter((p) => p.status === 'packed').length;
  const bar = $('#pack-progress');
  bar.hidden = !n;
  bar.style.setProperty('--fill', n ? done / n : 0);
  bar.classList.toggle('is-done', !!n && done === n);
  bar.setAttribute('aria-valuemax', n);
  bar.setAttribute('aria-valuenow', done);
  const leave = leaving(span(t)[0] || '');
  $('#pack-count').textContent = n ? (done === n ? `All ${n} packed` : `${done} of ${n} packed`) : 'Nothing on the list yet';
  $('#pack-leave').textContent = leave ? cap(leave) : '';
  // packed against worn, once the trip's begun: how many days each garment's been worn on it
  const [from, to] = span(t), today = isoToday(), begun = !!from && from <= today;
  const worn = begun ? wears(events, { from, to }) : null;
  const garments = [...new Set(entries.filter((p) => p.item_id && p.status === 'packed').map((p) => p.item_id))];
  $('#pack-worn').textContent = begun && garments.length ? `${garments.filter((id) => worn.has(id)).length} of ${plural(garments.length, 'packed garment')} worn so far` : '';
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
    shown.sort((x, y) => entryName(x).localeCompare(entryName(y))).forEach((p) => ul.append(packRow(t, p, bags, worn)));
    section.append(h, ul);
    box.append(section);
  }
  const empty = !n ? (missing.length ? '' : 'Nothing on the list yet. Add things below, or ask ChatGPT to make the list.')
    : f.status === 'open' && !pool.some((p) => p.status !== 'packed') ? (pool.length ? 'All packed.' : 'Nothing here.') : 'Nothing here.';
  $('#pack-empty').hidden = !!box.childElementCount || !empty;
  $('#pack-empty').textContent = empty;
}

function packRow(t, p, bags, worn = null) {
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
    // on the trip so far: the days it's been worn, or a mark that it hasn't been (words, not a colour)
    if (worn) {
      const n = worn.get(p.item_id)?.times || 0;
      text.append(n ? el('span', 'pack-row__meta pack-row__worn', `Worn ${plural(n, 'day')}`) : el('span', 'pill pack-row__unworn', 'Not worn yet'));
    }
  } else line([whoName(t, p.traveler_key), bag?.label, p.notes]);
  if (p.essential) title.prepend(el('span', 'pack-row__must', 'Essential'));
  open.append(p.item_id ? thumb(it, 'pack-row__photo') : el('span', 'pack-row__photo pack-row__photo--none', (name || '?')[0].toUpperCase()), text);
  open.addEventListener('click', () => openEntry(p));
  const status = el('button', 'pack-row__status', statusName[p.status] || p.status);
  status.type = 'button';
  status.setAttribute('aria-label', `${name}: ${statusName[p.status]}. Tap for ${statusName[NEXT[p.status] || 'ready']}.`);
  status.addEventListener('click', async () => {
    const was = p.status, to = NEXT[was] || 'ready';
    buzz();
    if (to === 'packed') {
      li.classList.add('is-going'); // the tick lands, and with "To pack" showing, the row folds away
      status.textContent = statusName.packed;
      if (!calm.matches) await new Promise((r) => setTimeout(r, packFilter(t).status === 'open' ? 420 : 220));
    }
    const ok = await setEntry(p, { status: to });
    if (!ok) return;
    const undo = () => setEntry(p, { status: was });
    if (to !== 'packed') return toast(packedLine[to](name), false, undo);
    // a bag finished, or everything: a small celebration
    const all = partsOf(t, 'trip_packing'), bagged = p.bag_id && all.filter((x) => x.bag_id === p.bag_id);
    if (all.every((x) => x.status === 'packed')) { celebrate($('#pack-progress')); buzz([10, 60, 10]); toast(`Packed ${name}. That's everything.`, false, undo); }
    else if (bagged?.every((x) => x.status === 'packed')) { celebrate($('#pack-progress')); toast(`Packed ${name}. ${bags.find((x) => x.id === p.bag_id)?.label || 'That bag'} is done.`, false, undo); }
    else toast(packedLine.packed(name), false, undo);
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
    showStatus();
    return true;
  }
  if (!(await partRows.trip_packing.set(p.id, patch))) { Object.assign(p, before); redraw(); paintEntry(); return false; }
  keepCopy();
  return true;
}
// The line under the tabs while offline: how old the copy is, and what's waiting to go
function showStatus(copy = kept(copyKey())) {
  const note = $('#offline-note'), waiting = Object.keys(queue).length + waitingDays();
  note.hidden = !offline;
  if (!offline) return;
  const text = el('span');
  text.append(el('strong', '', 'Offline'), ` · the copy from ${copy ? ago(copy.at) : 'before'}. ${waiting ? `${plural(waiting, 'change')} waiting to send.` : "Packing and what you wore wait here until you're back."}`);
  note.replaceChildren(icon('offline', 'status-line__icon'), text);
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
  if (!packSheet.open) open(packSheet);
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
sheetify(packSheet, () => packSheet.close());
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
const keepCopy = () => { if (uid) keep(copyKey(), { at: Date.now(), list, trips, parts, events, links: [...links] }); };
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
const mine = () => can('today') || can('closet') || can('trips'); // the wardrobe and trips, not only recipes
async function load() {
  let got = null, gotTrips = null, gotParts = null, gotEvents = null;
  if (!mine()) { ready = true; route(); return; }
  if (navigator.onLine && (await db.auth.getSession()).data.session) {
    const waiting = Object.keys(queue).length + waitingDays();
    await sendQueue(); // what was changed offline goes first, so what comes back has it
    await sendDays();
    const sent = waiting - Object.keys(queue).length - waitingDays();
    if (sent > 0) toast(`Back online. Sent ${plural(sent, 'change')}.`);
    let rest, days;
    // the days' record quietly: if it can't be read (before its migration has run), the rest still works
    [got, gotTrips, days, ...rest] = await Promise.all([closet.list('name'), tripRows.list('created_at'), db.from('events').select('*').is('deleted_at', null).order('created_at'), ...PARTS.map((p) => partRows[p].list('created_at'))]);
    if (rest.every(Boolean)) gotParts = Object.fromEntries(PARTS.map((p, i) => [p, rest[i]]));
    if (days.error) console.warn("The days' record didn't load:", days.error.message); else gotEvents = days.data;
  }
  const copy = kept(copyKey());
  if (got && gotTrips && gotParts) {
    offline = failed = false;
    list = got;
    trips = gotTrips;
    parts = gotParts;
    events = gotEvents || copy?.events || [];
    links = await photos.urls(list.map((it) => it.photo_path).filter(Boolean), SIZES.small);
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
    // the days as kept, with what's waiting to go: added, or taken to the trash (or back out of it)
    events = (copy.events || []).filter((e) => !dayQueue.gone[e.id]);
  } else {
    offline = false;
    failed = true;
    list = got || [];
    trips = gotTrips || [];
    parts = gotParts || noParts();
    events = gotEvents || [];
  }
  for (const row of Object.values(dayQueue.add)) if (!events.some((e) => e.id === row.id)) events.push(row); // what's still to go shows too
  showStatus(copy);
  if (openTrip) openTrip = trips.find((t) => t.id === openTrip.id) || null;
  tiles.clear();
  $('#grid').textContent = '';
  ready = true;
  route();
}
const loadRecipes = () => (can('recipes') ? recipes.load({ offline: offline || !navigator.onLine }) : null);
addEventListener('online', () => { if (uid) { load(); loadRecipes(); } });
start(async (user) => {
  uid = user.id;
  me = user;
  sections = user.sections ? SECTIONS.filter((x) => user.sections.includes(x)) : SECTIONS;
  if (!sections.length) sections = ['recipes'];
  tabs();
  unitsSeg.closest('.settings__part').hidden = !mine(); // no weather, no °F or °C
  await load();
  loadRecipes();
}, () => {
  list = []; trips = []; parts = noParts(); events = []; openTrip = null; uid = null; me = null; ready = false; shown = null; tiles.clear(); $('#grid').textContent = '';
  recipes.clear();
}, { offline: true });
fresh(() => { load(); loadRecipes(); });

// Pull to refresh, at the top of any section: the data again, and the weather (it's what changes
// on Today and a trip when nothing else has); a toast says which
pull(async () => {
  if (shown === 'recipes') { await recipes.load({ offline: !navigator.onLine }); return navigator.onLine ? 'Updated' : null; }
  const before = JSON.stringify([list, trips, parts, events]), weathered = ['today', 'trip'].includes(shown);
  weatherCache.clear();
  await load();
  await redraw();
  if (offline) return "You're offline. This is the copy on your phone.";
  return weathered && before === JSON.stringify([list, trips, parts, events]) ? 'Weather updated' : 'Updated';
});

// The service worker that answers from the copy when there's no connection (apps/offline.js)
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/apps/offline.js', { scope: '/apps/' }).catch(() => {});
