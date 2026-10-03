// The recipe tracker (/apps/recipes, apps/recipes.html): the recipes we're cooking through, each
// with a photo, a rating out of 10, notes and the day it was cooked. Table public.recipes.
import { $, start, rows, saver, ask, photos, toast } from './lib/kit.js';

const recipes = rows('recipes');
const cards = new Map(); // recipe id → its card, built once so typing is never interrupted
let list = [];
let links = new Map(); // photo path → signed link

const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, here rather than in UTC
const day = (d) => new Date(d + 'T12:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(d.slice(0, 4) !== today().slice(0, 4) && { year: 'numeric' }) });
const href = (link) => (/^https?:\/\//i.test(link) ? link : `https://${link}`);
const todo = () => list.filter((r) => !r.cooked);

// Weeks in a row with something cooked, counting back from this week (or from last week, if
// this one hasn't had its turn yet).
function streak() {
  const week = (d) => { const t = new Date(d + 'T12:00'); t.setDate(t.getDate() - ((t.getDay() + 6) % 7)); return Math.round(t / 6048e5); };
  const cooked = new Set(list.filter((r) => r.date_cooked).map((r) => week(r.date_cooked)));
  let w = week(today()), n = 0;
  if (!cooked.has(w)) w--;
  while (cooked.has(w)) { n++; w--; }
  return n;
}

// The numbers above the list, and tonight's pick: the same recipe all day, from what's left.
let picked = null;
function summary() {
  const cooked = list.filter((r) => r.cooked), rated = list.filter((r) => r.rating > 0), left = todo();
  $('#stats').hidden = $('#progress').hidden = !list.length;
  $('#stat-cooked').textContent = `${cooked.length} of ${list.length}`;
  $('#stat-rating').textContent = rated.length ? (rated.reduce((a, r) => a + r.rating, 0) / rated.length).toFixed(1) : '–';
  $('#stat-streak').textContent = streak();
  $('#progress').firstElementChild.style.setProperty('--p', `${list.length ? (100 * cooked.length) / list.length : 0}%`);
  if (!picked || picked.cooked || !list.includes(picked)) {
    const seed = [...today()].reduce((a, c) => a + c.charCodeAt(0), 0);
    picked = left.length ? [...left].sort((a, b) => a.id.localeCompare(b.id))[seed % left.length] : null;
  }
  $('#pick').textContent = picked ? picked.title : list.length ? 'Everything is cooked.' : '';
  $('#pick').disabled = $('#another').hidden = !picked;
}

// Scrolls to a recipe's card and rings it, clearing the search and filter if they hide it.
function goTo(r) {
  if (cards.get(r.id).hidden) { $('#search').value = ''; $('#filter').value = 'all'; render(); }
  const card = cards.get(r.id);
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.classList.add('is-picked');
  setTimeout(() => card.classList.remove('is-picked'), 2500);
}

// Everything on a card that follows from its recipe (the fields being typed in are left alone)
function paint(r) {
  const card = cards.get(r.id);
  const title = $('.item__title', card);
  title.textContent = '';
  if (r.link) title.append(Object.assign(document.createElement('a'), { href: href(r.link), target: '_blank', rel: 'noopener', textContent: r.title || 'Untitled' }));
  else title.textContent = r.title || 'Untitled';
  $('.pill', card).textContent = r.cooked ? 'Cooked' : 'To cook';
  $('.pill', card).classList.toggle('pill--ok', !!r.cooked);
  $('[data-is="when"]', card).textContent = r.date_cooked ? day(r.date_cooked) : '';
  $('[data-do="cook"]', card).hidden = !!r.cooked;
  $('[data-do="uncook"]', card).hidden = !r.cooked;
  $('[data-is="date"]', card).value = r.date_cooked || '';
  card.querySelectorAll('.rating button').forEach((b, i) => b.setAttribute('aria-pressed', i < (r.rating || 0)));
  $('.rating output', card).textContent = r.rating ? `${r.rating}/10` : 'Not rated';
  const img = $('.photo img', card), url = r.photo_path && links.get(r.photo_path);
  if (url && img.src !== url) img.src = url;
  img.hidden = !url;
  $('.photo', card).classList.toggle('has-photo', !!url);
  $('.photo span', card).textContent = url ? 'Change the photo' : 'Add a photo';
}

function build(r) {
  const card = $('#card').content.firstElementChild.cloneNode(true);
  cards.set(r.id, card);
  // save a change, then repaint what follows from it
  const set = async (patch) => {
    if (!(await recipes.set(r.id, patch))) return false;
    Object.assign(r, patch);
    paint(r);
    summary();
    return true;
  };

  const rating = $('.rating', card);
  for (let n = 10; n >= 1; n--) rating.prepend(Object.assign(document.createElement('button'), { type: 'button', textContent: '★', ariaLabel: `${n} out of 10` }));
  rating.addEventListener('click', (e) => {
    const n = [...rating.querySelectorAll('button')].indexOf(e.target) + 1;
    if (n) set({ rating: n === r.rating ? 0 : n }); // the same star again clears it
  });

  for (const field of ['title', 'link', 'notes']) {
    const el = $(`[data-is="${field}"]`, card);
    el.value = r[field] || '';
    saver(el, (value) => set({ [field]: value.trim() }));
  }
  // a date means it's been cooked; no date means it hasn't
  $('[data-is="date"]', card).addEventListener('change', (e) => set({ date_cooked: e.target.value || null, cooked: !!e.target.value }));
  $('[data-do="uncook"]', card).addEventListener('click', () => set({ cooked: false, date_cooked: null }));
  $('[data-do="cook"]', card).addEventListener('click', async () => {
    if (await set({ cooked: true, date_cooked: r.date_cooked || today() })) confetti();
  });
  $('[data-do="remove"]', card).addEventListener('click', async () => {
    if (!confirm(`Remove "${r.title}"?`) || !(await recipes.remove(r.id))) return;
    photos.remove(r.photo_path);
    list = list.filter((x) => x !== r);
    cards.delete(r.id);
    card.remove();
    render();
  });

  const slot = $('.photo', card);
  $('input', slot).addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    slot.classList.add('is-busy');
    const old = r.photo_path, path = await photos.put(file, `recipes/${r.id}`);
    if (path) {
      links.set(path, URL.createObjectURL(file)); // shown straight from the phone; signed next visit
      if (await set({ photo_path: path })) photos.remove(old);
    }
    slot.classList.remove('is-busy');
  });

  paint(r);
  return card;
}

// Puts the cards in order and hides the ones the search and filter leave out
function render() {
  const q = $('#search').value.trim().toLowerCase(), filter = $('#filter').value;
  const by = {
    title: (a, b) => (a.title || '').localeCompare(b.title || ''),
    added: (a, b) => b.created_at.localeCompare(a.created_at),
    cooked: (a, b) => (b.date_cooked || '').localeCompare(a.date_cooked || ''),
    rating: (a, b) => (b.rating || 0) - (a.rating || 0),
  }[$('#sort').value];
  let shown = 0;
  for (const r of [...list].sort((a, b) => by(a, b) || (a.title || '').localeCompare(b.title || ''))) {
    const card = cards.get(r.id) || build(r);
    const match = (!q || `${r.title} ${r.notes || ''}`.toLowerCase().includes(q)) && (filter === 'all' || (filter === 'cooked') === !!r.cooked);
    card.hidden = !match;
    if (match) shown++;
    $('#cards').append(card);
  }
  $('#empty').hidden = shown > 0;
  $('#empty').textContent = list.length ? 'Nothing matches that.' : 'No recipes yet. Add one, or import a list.';
  summary();
}

async function add(values) {
  const added = await recipes.add(values);
  if (!added) return null;
  list.push(...added);
  render();
  return added;
}

// A short burst when something gets cooked (not for anyone who's asked for less motion)
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = Object.assign(document.createElement('canvas'), { width: innerWidth, height: innerHeight });
  canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:30';
  document.body.append(canvas);
  const ctx = canvas.getContext('2d'), colors = ['#e0531f', '#ffb347', '#1f7a45', '#3a7bd5', '#b3261e'];
  const bits = Array.from({ length: 120 }, (_, i) => ({ x: Math.random() * innerWidth, y: -Math.random() * innerHeight, s: 5 + Math.random() * 8, v: 4 + Math.random() * 5, c: colors[i % colors.length] }));
  (function fall() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const b of bits) { b.y += b.v; ctx.fillStyle = b.c; ctx.fillRect(b.x, b.y, b.s, b.s * 0.6); }
    if (bits.some((b) => b.y < canvas.height)) requestAnimationFrame(fall); else canvas.remove();
  })();
}

for (const id of ['search', 'filter', 'sort']) $(`#${id}`).addEventListener('input', render);
$('#pick').addEventListener('click', () => picked && goTo(picked));
$('#another').addEventListener('click', () => {
  const others = todo().filter((r) => r !== picked);
  if (others.length) picked = others[Math.floor(Math.random() * others.length)];
  summary();
  if (picked) goTo(picked);
});
$('#add').addEventListener('click', async () => {
  const v = await ask($('#add-dialog'));
  const added = v && (await add([{ title: v.title.trim(), link: v.link.trim() }]));
  if (added) goTo(added[0]);
});
$('#import').addEventListener('click', async () => {
  const v = await ask($('#import-dialog'));
  if (!v) return;
  const lines = v.list.split(/\r?\n/).map((line) => { const [title, ...rest] = line.split('|'); return { title: title.trim(), link: rest.join('|').trim() }; }).filter((r) => r.title);
  const added = lines.length && (await add(lines));
  if (added) toast(`Added ${added.length} recipe${added.length > 1 ? 's' : ''}.`);
});
// Ctrl/Cmd+K searches
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); $('#search').focus(); }
});

start(async () => {
  list = (await recipes.list()) || [];
  links = await photos.urls(list.map((r) => r.photo_path).filter(Boolean));
  cards.clear();
  $('#cards').textContent = '';
  render();
});
