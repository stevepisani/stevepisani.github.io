// Trips' view in the card (card.js is the shell):
//   trip     get_trip: legs, the next outfit, packing so far; Open trip for days and packing
import { app, back, button, callTool, cap, css, day, draw, el, full, goFull, openItem, photo, say, span, ui, views } from '../card.js';
import { label } from './wardrobe.js';

// A trip. Inline: where and when, the next outfit, how the packing's going. Full screen: every
// day's outfit as photos (the names are one tap away, not repeated down the page) and packing.
function trip(data) {
  const t = data.trip, big = full() || ui.open;
  // each garment comes once, in t.garments; days and packing name them by id: fill them in, once
  if (t.garments && !t.filled) {
    const g = (id) => ({ id, name: '(no longer in the wardrobe)', ...t.garments[id] });
    for (const d of t.days) d.items = d.items.map((i) => (typeof i === 'string' ? g(i) : i));
    for (const p of t.packing) Object.assign(p, p.item_id ? { ...g(p.item_id), id: undefined } : { name: p.label });
    t.filled = true;
  }
  const head = el('header', 'w-head'); const b = back(); if (b) head.append(b);
  const titles = el('div'); titles.append(el('h2', 'w-title', t.name));
  if (t.legs.length) titles.append(el('p', 'w-sub', span(t.legs[0].from, t.legs[t.legs.length - 1].to)));
  head.prepend(titles);
  app.append(head);
  const legs = el('ul', 'w-legs');
  for (const l of t.legs) {
    const li = el('li'), w = l.weather?.summary;
    li.append(el('strong', null, l.place), ` ${span(l.from, l.to)}`);
    if (w) li.append(el('span', 'w-dim', ` · ${l.weather.kind === 'forecast' ? '' : 'typically '}${Math.round(w.hi)}°/${Math.round(w.lo)}°${w.wet ? `, ${w.wet} wet day${w.wet === 1 ? '' : 's'}` : ''}`));
    legs.append(li);
  }
  app.append(legs);
  const worn = new Map(); for (const d of t.days) for (const it of d.items) worn.set(it.id, (worn.get(it.id) || 0) + 1);
  const bar = el('div', 'w-progress'), fill = el('span'), count = el('span', 'w-count');
  const tally = () => { const n = t.packing.filter((p) => p.packed).length; count.textContent = `${n} of ${t.packing.length} packed`; fill.style.width = `${t.packing.length ? (100 * n) / t.packing.length : 0}%`; };
  if (t.packing.length) { bar.append(fill); const pk = el('div', 'w-packed'); pk.append(bar, count); app.append(pk); tally(); }
  const outfit = (d) => {
    const fit = el('div', 'w-fit');
    for (const it of d.items) { const s = button('w-sq', null, () => openItem(it.id, data)); s.setAttribute('aria-label', it.name); s.title = it.name; s.append(photo(it.hero_photo, it, 'w-sq__img')); fit.append(s); }
    return fit;
  };
  if (!big) {
    const today = new Date().toISOString().slice(0, 10);
    const next = t.days.find((d) => d.date >= today) || t.days[0];
    if (next) {
      const box = el('div', 'w-next');
      box.append(el('p', 'w-cap', `${next.date >= today ? 'Next' : 'First'}: ${day(next.date)}${next.occasion ? ` · ${next.occasion}` : ''}`), outfit(next));
      app.append(box);
    }
    const open = async (tab) => { ui.tab = tab; if (!(await goFull())) ui.open = true; draw(data, false); };
    const actions = el('div', 'w-actions');
    if (t.days.length) actions.append(button('w-btn w-btn--primary', 'Open trip', () => open('days')));
    if (t.packing.length) actions.append(button('w-btn', 'Packing list', () => open('pack')));
    if (actions.childElementCount) app.append(actions);
    return;
  }
  const tab = ui.tab || (t.days.length ? 'days' : 'pack');
  const seg = el('div', 'w-seg w-tabs'); seg.setAttribute('role', 'tablist');
  for (const [k, name] of [['days', `Days ${t.days.length}`], ['pack', `Packing ${t.packing.length}`]]) {
    const s = button('w-seg__b', name, () => { ui.tab = k; draw(data, false); });
    s.setAttribute('role', 'tab'); s.setAttribute('aria-selected', k === tab); s.setAttribute('aria-pressed', k === tab);
    seg.append(s);
  }
  app.append(seg);
  if (tab === 'days') {
    const days = el('ol', 'w-days');
    for (const d of t.days) {
      const li = el('li', 'w-day');
      const h = el('p', 'w-day__head'); h.append(el('strong', null, day(d.date)), ` ${d.place || ''}`);
      if (d.weather) h.append(el('span', 'w-dim', ` · ${Math.round(d.weather.hi)}°/${Math.round(d.weather.lo)}°${d.weather.rain >= 40 ? `, ${d.weather.rain}% rain` : ''}`));
      li.append(h);
      if (d.occasion) li.append(el('p', 'w-day__occ', d.occasion));
      li.append(outfit(d));
      if (d.note) li.append(el('p', 'w-dim', d.note));
      days.append(li);
    }
    app.append(days);
    return;
  }
  // packing: ticked ones dim where they are (nothing moves under your finger); twins by colour
  const twins = new Map(); for (const p of t.packing) if (p.item_id) twins.set(p.name, (twins.get(p.name) || 0) + 1);
  const ul = el('ul', 'w-pack');
  for (const p of t.packing) {
    const li = el('li'), row = el('label', 'w-pack__row'), box = el('input'), text = el('span', 'w-pack__name');
    box.type = 'checkbox'; box.checked = !!p.packed; li.classList.toggle('is-packed', !!p.packed);
    const n = p.item_id ? label(p, twins).name : p.name;
    text.append(el('span', null, `${n}${p.qty > 1 ? ` ×${p.qty}` : ''}`));
    const meta = [worn.get(p.item_id) ? `worn ${worn.get(p.item_id)}×` : null, n !== p.name ? p.name : null].filter(Boolean).join(' · ');
    if (meta) text.append(el('span', 'w-dim', meta));
    box.addEventListener('change', async () => {
      const want = box.checked; box.disabled = true;
      try { await callTool('tick_packing', { trip_id: t.id, ...(p.item_id ? { item_id: p.item_id } : { label: p.label }), packed: want }); p.packed = want; li.classList.toggle('is-packed', want); tally(); }
      catch (e) { box.checked = !want; say(e.message, true); }
      box.disabled = false;
    });
    row.append(p.item_id ? photo(p.hero_photo, p, 'w-pack__img') : el('span', 'w-pack__img'), text, box);
    li.append(row); ul.append(li);
  }
  app.append(ul);
}

Object.assign(views, { trip });

css(`
.w-legs { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.w-packed { display: flex; align-items: center; gap: 10px; }
.w-progress { flex: 1; height: 6px; border-radius: 3px; background: var(--w-bg2); overflow: hidden; }
.w-progress span { display: block; height: 100%; background: var(--w-ok); transition: width .3s; }
.w-count { font-size: var(--w-c); white-space: nowrap; }
.w-next { display: grid; gap: 6px; }
.w-fit { display: flex; flex-wrap: wrap; gap: 8px; }
.w-sq { padding: 0; border: 0; background: none; cursor: pointer; }
.w-sq__img { width: 64px; height: 64px; border-radius: 12px; }
.w-sq__img img { padding: 6%; }
.w-tabs { align-self: start; }
.w-days { list-style: none; margin: 0; padding: 0; display: grid; gap: 18px; }
.w-day { display: grid; gap: 6px; }
.w-day__occ { font-weight: 600; }
.w-pack { list-style: none; margin: 0; padding: 0; }
.w-pack__row { display: flex; align-items: center; gap: 12px; min-height: 56px; border-bottom: 1px solid var(--w-line); cursor: pointer; }
.w-pack__img { width: 40px; height: 40px; border-radius: 8px; flex: none; }
.w-pack__name { flex: 1; display: grid; }
.w-pack__name .w-dim { font-size: var(--w-c); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.w-pack__name { min-width: 0; }
.w-pack input { width: 26px; height: 26px; accent-color: var(--w-ok); flex: none; }
.is-packed .w-pack__name, .is-packed .w-pack__img { opacity: .45; }
.is-packed .w-pack__name > span:first-child { text-decoration: line-through; }
@media (prefers-reduced-motion: reduce) { .w-progress span { transition: none; } }
`);
