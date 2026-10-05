// Trips' view in the card (card.js is the shell):
//   trip     get_trip: legs, the next day, packing so far; Open trip for days and packing, by who it's for
import { app, back, button, callTool, cap, css, day, draw, el, full, goFull, openItem, photo, say, span, ui, views } from '../card.js';
import { label } from './wardrobe.js';

// A trip. Inline: where and when, the next day, how the packing's going. Full screen: every day
// (its activities and outfit as photos; the names are one tap away) and the packing list, by who
// it's for. get_trip names each garment once (data.garments); days and packing point at them.
const STATUS = { needed: 'needed', to_buy: 'to buy', ready: 'ready', packed: 'packed' };
function trip(data) {
  const t = data.trip, big = full() || ui.open, legs = data.legs || [], days = data.days || [], packing = data.packing?.items || [];
  if (!data.filled) {
    const g = (id) => ({ id, name: '(no longer in the wardrobe)', ...data.garments?.[id] });
    for (const d of days) d.items = (d.items || []).map((i) => (typeof i === 'string' ? g(i) : i));
    for (const p of packing) Object.assign(p, p.item_id ? { ...g(p.item_id), id: p.id } : { name: p.label });
    data.filled = true;
  }
  const who = new Map((data.travelers || []).map((x) => [x.key, x.name]));
  const head = el('header', 'w-head'); const b = back(); if (b) head.append(b);
  const titles = el('div'); titles.append(el('h2', 'w-title', t.name));
  if (t.start) titles.append(el('p', 'w-sub', `${span(t.start, t.end)}${who.size ? ` · ${[...who.values()].join(', ')}` : ''}`));
  head.prepend(titles);
  app.append(head);
  const legList = el('ul', 'w-legs');
  for (const l of legs) {
    const li = el('li'), w = l.weather?.summary;
    li.append(el('strong', null, l.place), ` ${span(l.from, l.to)}`);
    if (w) li.append(el('span', 'w-dim', ` · ${l.weather.kind === 'forecast' ? '' : 'typically '}${Math.round(w.hi)}°/${Math.round(w.lo)}°${w.wet ? `, ${w.wet} wet day${w.wet === 1 ? '' : 's'}` : ''}`));
    legList.append(li);
  }
  app.append(legList);
  const worn = new Map(); for (const d of days) for (const it of d.items) worn.set(it.id, (worn.get(it.id) || 0) + 1);
  const bar = el('div', 'w-progress'), fill = el('span'), count = el('span', 'w-count');
  const tally = () => { const n = packing.filter((p) => p.status === 'packed').length; count.textContent = `${n} of ${packing.length} packed`; fill.style.width = `${packing.length ? (100 * n) / packing.length : 0}%`; };
  if (packing.length) { bar.append(fill); const pk = el('div', 'w-packed'); pk.append(bar, count); app.append(pk); tally(); }
  const outfit = (d) => {
    const fit = el('div', 'w-fit');
    for (const it of d.items) { const s = button('w-sq', null, () => openItem(it.id, data)); s.setAttribute('aria-label', it.name); s.title = it.name; s.append(photo(it.hero_photo, it, 'w-sq__img')); fit.append(s); }
    return fit;
  };
  const plans = (d) => { const ul = el('ul', 'w-acts'); for (const x of d.activities || []) ul.append(el('li', null, `${x.start_time ? `${x.start_time}${x.end_time ? `–${x.end_time}` : ''} ` : ''}${x.title}`)); return ul; };
  if (!big) {
    const today = new Date().toISOString().slice(0, 10);
    const next = days.find((d) => d.date >= today) || days[0];
    if (next) {
      const box = el('div', 'w-next');
      box.append(el('p', 'w-cap', `${next.date >= today ? 'Next' : 'First'}: ${day(next.date)}${next.occasion ? ` · ${next.occasion}` : ''}`));
      if (next.items.length) box.append(outfit(next)); else if (next.activities?.length) box.append(plans(next));
      app.append(box);
    }
    const open = async (tab) => { ui.tab = tab; if (!(await goFull())) ui.open = true; draw(data, false); };
    const actions = el('div', 'w-actions');
    if (days.length) actions.append(button('w-btn w-btn--primary', 'Open trip', () => open('days')));
    if (packing.length) actions.append(button('w-btn', 'Packing list', () => open('pack')));
    if (actions.childElementCount) app.append(actions);
    return;
  }
  const tab = ui.tab || (days.length ? 'days' : 'pack');
  const seg = el('div', 'w-seg w-tabs'); seg.setAttribute('role', 'tablist');
  for (const [k, name] of [['days', `Days ${days.length}`], ['pack', `Packing ${packing.length}`]]) {
    const s = button('w-seg__b', name, () => { ui.tab = k; draw(data, false); });
    s.setAttribute('role', 'tab'); s.setAttribute('aria-selected', k === tab); s.setAttribute('aria-pressed', k === tab);
    seg.append(s);
  }
  app.append(seg);
  if (tab === 'days') {
    const list = el('ol', 'w-days');
    for (const d of days) {
      const li = el('li', 'w-day');
      const h = el('p', 'w-day__head'); h.append(el('strong', null, day(d.date)), ` ${d.place || ''}`);
      if (d.weather) h.append(el('span', 'w-dim', ` · ${Math.round(d.weather.hi)}°/${Math.round(d.weather.lo)}°${d.weather.rain >= 40 ? `, ${d.weather.rain}% rain` : ''}`));
      li.append(h);
      if (d.occasion) li.append(el('p', 'w-day__occ', d.occasion));
      if (d.activities?.length) li.append(plans(d));
      if (d.items.length) li.append(outfit(d));
      if (d.note) li.append(el('p', 'w-dim', d.note));
      list.append(li);
    }
    app.append(list);
    return;
  }
  // packing, by who it's for: ticked ones dim where they are (nothing moves under your finger)
  const keys = [...new Set(packing.map((p) => (who.has(p.traveler) ? p.traveler : 'shared')))];
  const order = [...who.keys(), 'shared'].filter((k) => keys.includes(k));
  const whose = ui.who && order.includes(ui.who) ? ui.who : '';
  if (order.length > 1) {
    const chips = el('div', 'w-seg w-who'); chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', 'For');
    for (const [k, name] of [['', 'Everyone'], ...order.map((k) => [k, who.get(k) || 'Shared'])]) {
      const c = button('w-seg__b', name, () => { ui.who = k; draw(data, false); });
      c.setAttribute('aria-pressed', k === whose);
      chips.append(c);
    }
    app.append(chips);
  }
  const twins = new Map(); for (const p of packing) if (p.item_id) twins.set(p.name, (twins.get(p.name) || 0) + 1);
  const bagOf = new Map((data.bags || []).map((x) => [x.key, x.label]));
  const ul = el('ul', 'w-pack');
  for (const p of packing.filter((x) => !whose || (who.has(x.traveler) ? x.traveler : 'shared') === whose)) {
    const li = el('li'), row = el('label', 'w-pack__row'), box = el('input'), text = el('span', 'w-pack__name');
    box.type = 'checkbox'; box.checked = p.status === 'packed'; li.classList.toggle('is-packed', box.checked);
    const n = p.item_id ? label(p, twins).name : p.name;
    text.append(el('span', null, `${n}${p.qty > 1 ? ` ×${p.qty}` : ''}`));
    const meta = [!whose && who.get(p.traveler), p.bag && (bagOf.get(p.bag) || p.bag), p.status !== 'packed' && p.status !== 'needed' && STATUS[p.status], p.essential && 'essential', worn.get(p.item_id) ? `worn ${worn.get(p.item_id)}×` : null, n !== p.name ? p.name : null].filter(Boolean).join(' · ');
    if (meta) text.append(el('span', 'w-dim', meta));
    const was = p.status === 'packed' ? 'ready' : p.status; // unticking goes back to where it was, or ready
    box.addEventListener('change', async () => {
      const want = box.checked ? 'packed' : was; box.disabled = true;
      try { await callTool('set_packing_status', { packing_item_ids: [p.id], status: want }); p.status = want; li.classList.toggle('is-packed', want === 'packed'); tally(); }
      catch (e) { box.checked = !box.checked; say(e.message, true); }
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
.w-acts { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; font-size: var(--w-c); }
.w-who { align-self: start; flex-wrap: wrap; }
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
