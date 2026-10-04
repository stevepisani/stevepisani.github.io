// The wardrobe (/apps/wardrobe, apps/wardrobe.html): Steve's clothes, each with a photo cut out
// of its background, what it is, and where to buy another. Private to its owner (table
// public.wardrobe_items; photos under photos/wardrobe/<owner id>/). ChatGPT reads and edits the
// same rows through the wardrobe MCP server (docs/apps.md).
import { $, db, start, fresh, rows, saver, ask, photos, toast } from './lib/kit.js';

const items = rows('wardrobe_items');
const CATS = [['tops', 'Tops'], ['bottoms', 'Bottoms'], ['outerwear', 'Outerwear'], ['suits', 'Suits'], ['shoes', 'Shoes'], ['accessories', 'Accessories'], ['workout', 'Workout'], ['swim', 'Swim']];
const catName = Object.fromEntries(CATS);
let list = [], links = new Map(), failed = false, uid = null;
let view = { cat: '', season: '', dress: '', shelf: 'in' };
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

// ---------- Loading ----------
async function load() {
  const got = await items.list('name');
  failed = !got;
  list = got || [];
  links = await photos.urls(list.map((it) => it.photo_path).filter(Boolean));
  tiles.clear();
  $('#grid').textContent = '';
  render();
}
start(async (user) => { uid = user.id; await load(); }, () => { list = []; tiles.clear(); $('#grid').textContent = ''; });
fresh(load);
