// Recipes, a section of SJPJr (the Recipes tab; its markup is _includes/recipes.html, in
// apps/index.html): the recipes we're cooking through, each with a photo, a rating out of 10,
// notes and the day it was cooked. Table public.recipes, shared by the members who see it.
// wardrobe.js mounts it: load() when the tab is there for whoever signed in, clear() when they
// sign out. (It was its own page, /apps/recipes, until Oct 2026; that address leads here.)
import { $, rows, saver, ask, photos, toast, calm, celebrate } from './kit.js';

const recipes = rows('recipes');
const cards = new Map(); // recipe id → its card, built once so typing is never interrupted
let list = [];
let links = new Map(); // photo path → signed link
let failed = false; // the list didn't load ('offline': there's no connection)
// what's shown and in what order, remembered on this phone
let view = { filter: 'all', sort: 'title' };
try { Object.assign(view, JSON.parse(localStorage.getItem('recipes-view'))); } catch (e) {}

const today = () => { const d = new Date(), two = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`; }; // here, not in UTC
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

// Above the list: tonight's pick (the same recipe all day, from what's left), and how it's going.
let picked = null;
function summary() {
  const cooked = list.filter((r) => r.cooked), rated = list.filter((r) => r.rating > 0), left = todo(), weeks = streak();
  $('#recipe-hero').hidden = !list.length;
  $('#recipe-tally').textContent = [
    `${cooked.length} of ${list.length} cooked`,
    rated.length && `${(rated.reduce((a, r) => a + r.rating, 0) / rated.length).toFixed(1)} average`,
    weeks > 1 && `${weeks} weeks in a row`,
  ].filter(Boolean).join(' · ');
  const bar = $('#recipe-progress');
  bar.firstElementChild.style.setProperty('--p', `${list.length ? (100 * cooked.length) / list.length : 0}%`);
  bar.setAttribute('aria-valuemax', list.length);
  bar.setAttribute('aria-valuenow', cooked.length);
  if (!picked || picked.cooked || !list.includes(picked)) {
    const seed = [...today()].reduce((a, c) => a + c.charCodeAt(0), 0);
    picked = left.length ? [...left].sort((a, b) => a.id.localeCompare(b.id))[seed % left.length] : null;
  }
  $('#recipe-pick').textContent = picked ? picked.title : "Everything's cooked.";
  $('#recipe-pick').disabled = !picked;
  $('#recipe-another').hidden = left.length < 2;
  const counts = { all: list.length, todo: left.length, cooked: cooked.length };
  for (const b of $('#recipe-filter').children) {
    b.setAttribute('aria-pressed', b.dataset.value === view.filter);
    $('span', b).textContent = counts[b.dataset.value];
  }
}

// Scrolls to a recipe's card and rings it, clearing the search and filter if they hide it.
function goTo(r) {
  if (cards.get(r.id).hidden) { $('#recipe-search').value = ''; view.filter = 'all'; render(); }
  const card = cards.get(r.id);
  card.scrollIntoView({ behavior: calm.matches ? 'auto' : 'smooth', block: 'center' });
  card.classList.add('is-picked');
  setTimeout(() => card.classList.remove('is-picked'), 2500);
}

// Everything on a card that follows from its recipe (the fields being typed in are left alone).
// One still to cook is just its name and "Cooked it"; the rating, photo and date come once it's
// cooked. Its notes show if it has any, or while it's being edited.
function paint(r) {
  const card = cards.get(r.id), name = r.title || 'Untitled', open = !$('.item__edit', card).hidden;
  const title = $('.item__title', card);
  title.textContent = '';
  if (r.link) title.append(Object.assign(document.createElement('a'), { href: href(r.link), target: '_blank', rel: 'noopener', textContent: name }));
  else title.textContent = name;
  card.querySelectorAll('[data-for="cooked"]').forEach((el) => { el.hidden = !r.cooked; });
  $('[data-is="when"]', card).textContent = r.date_cooked ? day(r.date_cooked) : '';
  $('[data-do="cook"]', card).hidden = !!r.cooked;
  $('[data-do="uncook"]', card).hidden = !r.cooked;
  $('[data-is="date"]', card).value = r.date_cooked || '';
  const notes = $('[data-is="notes"]', card);
  notes.hidden = !r.cooked && !open && !notes.value && document.activeElement !== notes;
  // filled up to the rating; only the rating's own star is "pressed", so it reads as one choice
  card.querySelectorAll('.rating button').forEach((b, i) => {
    b.textContent = i < (r.rating || 0) ? '★' : '☆';
    b.classList.toggle('is-on', i < (r.rating || 0));
    b.setAttribute('aria-pressed', i + 1 === r.rating);
  });
  $('.rating output', card).textContent = r.rating ? `${r.rating}/10` : 'Not rated';
  const img = $('.item__photo', card), url = r.cooked && r.photo_path && links.get(r.photo_path);
  if (url && img.src !== url) img.src = url;
  img.alt = `${name}, as we made it`;
  img.hidden = !url;
  $('.photo-btn span', card).textContent = url ? 'Change the photo' : 'Add a photo';
}

function build(r) {
  const card = $('#recipe-card').content.firstElementChild.cloneNode(true);
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
  for (let n = 10; n >= 1; n--) rating.prepend(Object.assign(document.createElement('button'), { type: 'button', ariaLabel: `${n} out of 10` }));
  rating.addEventListener('click', (e) => {
    const n = [...rating.querySelectorAll('button')].indexOf(e.target.closest('button')) + 1;
    if (n) set({ rating: n === r.rating ? 0 : n }); // the same star again clears it
  });

  for (const field of ['title', 'link', 'notes']) {
    const el = $(`[data-is="${field}"]`, card);
    el.value = r[field] || '';
    saver(el, (value) => set({ [field]: value.trim() }));
  }
  const edit = $('[data-do="edit"]', card);
  edit.addEventListener('click', () => {
    const panel = $('.item__edit', card);
    panel.hidden = !panel.hidden;
    edit.setAttribute('aria-expanded', !panel.hidden);
    edit.textContent = panel.hidden ? 'Edit' : 'Done';
    paint(r);
  });
  // a date means it's been cooked; no date means it hasn't
  $('[data-is="date"]', card).addEventListener('change', async (e) => {
    if (!(await set({ date_cooked: e.target.value || null, cooked: !!e.target.value }))) paint(r); // back to what's saved
  });
  $('[data-do="uncook"]', card).addEventListener('click', () => set({ cooked: false, date_cooked: null }));
  $('[data-do="cook"]', card).addEventListener('click', async () => {
    if (await set({ cooked: true, date_cooked: r.date_cooked || today() })) celebrate();
  });
  $('[data-do="remove"]', card).addEventListener('click', async () => {
    if (!confirm(`Remove "${r.title}"?`) || !(await recipes.remove(r.id))) return;
    photos.remove(r.photo_path);
    list = list.filter((x) => x !== r);
    cards.delete(r.id);
    card.remove();
    render();
  });

  const slot = $('.photo-btn', card);
  $('input', slot).addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || slot.classList.contains('is-busy')) return;
    slot.classList.add('is-busy');
    const old = r.photo_path, path = await photos.put(file, `recipes/${r.id}`);
    if (path) {
      links.set(path, URL.createObjectURL(file)); // shown straight from the phone; signed next visit
      photos.remove((await set({ photo_path: path })) ? old : path); // whichever nothing points at now
    }
    slot.classList.remove('is-busy');
  });

  paint(r);
  return card;
}

// Puts the cards in order and hides the ones the search and filter leave out
function render() {
  const q = $('#recipe-search').value.trim().toLowerCase(), { filter } = view;
  const by = {
    title: (a, b) => (a.title || '').localeCompare(b.title || ''),
    added: (a, b) => b.created_at.localeCompare(a.created_at),
    cooked: (a, b) => (b.date_cooked || '').localeCompare(a.date_cooked || ''),
    rating: (a, b) => (b.rating || 0) - (a.rating || 0),
  }[view.sort];
  let shown = 0;
  for (const r of [...list].sort((a, b) => by(a, b) || (a.title || '').localeCompare(b.title || ''))) {
    const card = cards.get(r.id) || build(r);
    const match = (!q || `${r.title} ${r.notes || ''}`.toLowerCase().includes(q)) && (filter === 'all' || (filter === 'cooked') === !!r.cooked);
    card.hidden = !match;
    if (match) shown++;
    $('#recipe-cards').append(card);
  }
  $('#recipe-empty').hidden = shown > 0;
  $('#recipe-empty').textContent = failed === 'offline' ? "You're offline. Recipes need a connection." : failed ? "The recipes didn't load. Pull down to try again." : list.length ? 'Nothing matches that.' : 'No recipes yet. Add one, or import a list.';
  summary();
}

async function add(values) {
  const added = await recipes.add(values);
  if (!added) return null;
  list.push(...added);
  render();
  return added;
}

const look = (change) => {
  Object.assign(view, change);
  try { localStorage.setItem('recipes-view', JSON.stringify(view)); } catch (e) {}
  render();
};
$('#recipe-search').addEventListener('input', render);
$('#recipe-sort').value = view.sort;
$('#recipe-sort').addEventListener('input', (e) => look({ sort: e.target.value }));
$('#recipe-filter').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) look({ filter: b.dataset.value }); });
$('#recipe-pick').addEventListener('click', () => picked && goTo(picked));
$('#recipe-another').addEventListener('click', () => {
  const others = todo().filter((r) => r !== picked);
  if (others.length) picked = others[Math.floor(Math.random() * others.length)];
  summary();
  if (picked) goTo(picked);
});
$('#recipe-add').addEventListener('click', async () => {
  const v = await ask($('#recipe-add-dialog'));
  const added = v && (await add([{ title: v.title.trim(), link: v.link.trim() }]));
  if (added) goTo(added[0]);
});
$('#recipe-import').addEventListener('click', async () => {
  const v = await ask($('#recipe-import-dialog'));
  if (!v) return;
  const lines = v.list.split(/\r?\n/).map((line) => { const [title, ...rest] = line.split('|'); return { title: title.trim(), link: rest.join('|').trim() }; }).filter((r) => r.title);
  const added = lines.length && (await add(lines));
  if (added) toast(`Added ${added.length} recipe${added.length > 1 ? 's' : ''}.`);
});
// Ctrl/Cmd+K searches, while the recipes are showing
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k' && !$('#recipes-view').hidden) { e.preventDefault(); $('#recipe-search').focus(); }
});

// Loads (or reloads) the recipes and draws them; with no connection, says they need one
export async function load({ offline = false } = {}) {
  const got = offline ? null : await recipes.list();
  failed = offline ? 'offline' : !got;
  list = got || [];
  links = await photos.urls(list.map((r) => r.photo_path).filter(Boolean));
  cards.clear();
  $('#recipe-cards').textContent = '';
  render();
}
// Forgets them (signing out)
export function clear() {
  list = [];
  cards.clear();
  $('#recipe-cards').textContent = '';
}
