// The wardrobe's views in the card (card.js is the shell):
//   closet   find_items: a row of photos; See all, and tap one to open it
//   garment  get_item (and changes): its photos, what it is; tap a photo to say what it is
//   ingest   ingest_item: a dry run's preview (only what was guessed up front), then Add
import { BADGE, CATS, ROLES, SOURCE, app, back, button, callTool, cap, css, day, draw, el, full, goFull, guessed, money, openItem, photo, plain, say, span, start, toolInput, ui, views, words } from '../card.js';


// The closet. Garments that share a name (one shirt in three colours) are told apart by colour,
// the thing that differs, rather than three cut-off copies of the same name.
export function label(it, twins) {
  const colour = plain(it.manufacturer_colour || it.colour);
  if (twins.get(it.name) > 1 && colour) return { name: cap(colour), meta: [it.brand, it.size].filter(Boolean).join(' · ') };
  return { name: it.name, meta: [it.brand, it.hero_photo ? null : colour, it.size].filter(Boolean).join(' · ') };
}
function tile(it, twins, from) {
  const { name, meta } = label(it, twins);
  const b = button('w-tile', null, () => openItem(it.id, from));
  b.setAttribute('aria-label', [it.name, meta].filter(Boolean).join(', '));
  b.append(photo(it.hero_photo, it), el('span', 'w-tile__name', name));
  if (meta) b.append(el('span', 'w-tile__meta', meta));
  return b;
}
const ROW = 8;
function closet(data) {
  const items = data.items || [];
  if (!items.length) { app.append(el('p', 'w-note', 'Nothing matches.')); return; }
  const twins = new Map(); for (const it of items) twins.set(it.name, (twins.get(it.name) || 0) + 1);
  if (!full() && !ui.all) { // a glance: one row that scrolls sideways, the next tile peeking in
    const row = el('div', 'w-row');
    for (const it of items.slice(0, ROW)) row.append(tile(it, twins, data));
    if (items.length > ROW) {
      const more = button('w-tile w-tile--more', null, async () => { if (!(await goFull())) ui.all = true; draw(data, false); });
      more.append(el('span', 'w-photo w-more', `+${items.length - ROW}`), el('span', 'w-tile__name', 'See all'));
      row.append(more);
    }
    app.append(row);
    return;
  }
  // everything, with a filter when there's more than one kind
  const head = el('header', 'w-head'); const b = back(); if (b) head.append(b);
  head.append(el('h2', 'w-title', 'Wardrobe'));
  app.append(head);
  const cats = [...new Set(items.map((i) => i.category))].filter(Boolean);
  const shown = ui.cat ? items.filter((i) => i.category === ui.cat) : items;
  if (cats.length > 1) {
    const chips = el('div', 'w-chips'); chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', 'Show');
    for (const c of [null, ...cats]) {
      const n = c ? items.filter((i) => i.category === c).length : items.length;
      const chip = button('w-chip', `${c ? CATS[c] || words(c) : 'All'} ${n}`, () => { ui.cat = c; draw(data, false); });
      chip.setAttribute('aria-pressed', (ui.cat || null) === c);
      chips.append(chip);
    }
    app.append(chips);
  }
  const grid = el('div', 'w-grid');
  for (const it of shown) grid.append(tile(it, twins, data));
  app.append(grid);
}

// One garment: the photo, what it is, the few facts that matter (what was asked about first),
// the rest folded. A guessed fact says so; tap any fact to see where it came from.
function garment(data, receipt) {
  const it = data.item, p = data.product || {}, v = data.variant || {}, own = data.owned_item || {};
  const head = el('div', 'w-bar'); const b = back(); if (b) head.append(b);
  if (head.childElementCount) app.append(head);
  if (receipt) app.append(receipt);
  const wrap = el('article', 'w-garment');
  // the photos: the main one big; the rest small, a badge on any that isn't the garment itself.
  // Saying what a photo is only comes up when you tap one (or one's role isn't known).
  const photos = data.photos || [];
  let looking = photos.find((x) => x.hero) || photos[0] || null, editing = false, touched = false;
  const fig = el('figure', 'w-hero'), thumbs = el('div', 'w-thumbs'), tools = el('div', 'w-tools');
  const paint = () => {
    fig.replaceChildren(photo(looking?.url || it.hero_photo, it, 'w-hero__img'));
    thumbs.replaceChildren(...photos.map((x) => {
      const t = button('w-thumb', null, () => { looking = x; editing = false; touched = true; paint(); });
      t.dataset.role = x.role;
      t.setAttribute('aria-pressed', x === looking);
      t.setAttribute('aria-label', `${ROLES[x.role]} photo${x.hero ? ', the main one' : ''}`);
      t.append(photo(x.url, it, 'w-thumb__img'));
      const badge = x.origin === 'reference' ? 'Shop' : BADGE[x.role]; // a shop's picture says so; so does a tag or label
      if (badge) t.append(el('span', 'w-badge', badge));
      return t;
    }));
    thumbs.hidden = photos.length < 2;
    tools.replaceChildren();
    if (!looking) return;
    const unknown = looking.role === 'other';
    if (looking.hero && !editing && !unknown && !touched) return; // the main photo, untouched: nothing to ask
    if (editing || unknown) {
      const seg = el('div', 'w-seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'This photo is');
      for (const [r, name] of Object.entries(ROLES)) {
        const s = button('w-seg__b', name, () => setRole(looking, { role: r }));
        s.setAttribute('aria-pressed', looking.role === r);
        seg.append(s);
      }
      tools.append(el('span', 'w-cap', unknown && !editing ? 'What is this photo?' : 'This photo is'), seg);
      return;
    }
    const from = { catalog: 'Catalog image', reference: 'Shop picture', own: 'Your photo' }[looking.origin || 'own'];
    tools.append(el('span', 'w-cap', `${from}${looking.role !== 'garment' ? ` · ${ROLES[looking.role]}` : ''}`), button('w-link', 'Change', () => { editing = true; paint(); }));
    if (looking.role === 'garment' && !looking.hero) tools.append(button('w-btn', 'Make it the main photo', () => setRole(looking, { make_hero: true })));
    // any photo can go to the trash (restorable for 30 days): two taps
    const gone = button('w-link w-link--bad', 'Delete', async () => {
      if (!gone.dataset.sure) { gone.dataset.sure = '1'; gone.textContent = 'Move to trash?'; return; }
      try { draw({ ...(await callTool('delete_photo', { photo_id: looking.id })), view: 'garment' }, false); }
      catch (e) { say(e.message, true); }
    });
    tools.append(gone);
  };
  const setRole = async (x, change) => {
    try {
      const r = await callTool('set_photo_role', { photo_id: x.id, ...change });
      const next = { ...r, view: 'garment' };
      const keep = (next.photos || []).find((y) => y.id === x.id);
      draw(next, false);
      if (keep && !keep.hero) app.querySelector(`.w-thumb:nth-child(${next.photos.indexOf(keep) + 1})`)?.click(); // stay on the photo you were fixing
    } catch (e) { say(e.message, true); }
  };
  paint();
  wrap.append(fig, thumbs, tools);

  // what it is
  const colour = v.manufacturer_colour ? (v.colour && !v.manufacturer_colour.toLowerCase().includes(v.colour.toLowerCase()) ? `${v.manufacturer_colour} (${v.colour})` : v.manufacturer_colour) : it.colour;
  wrap.append(el('h2', 'w-title', it.name), el('p', 'w-sub', [it.brand, colour && cap(plain(colour)), v.manufacturer_size || it.size].filter(Boolean).join(' · ') + (it.retired ? ' · retired' : '')));
  const src = (...ks) => { for (const k of ks) for (const s of [own.sources, v.sources, p.sources]) if (s?.[k]) return s[k]; return null; };
  const facts = [
    ['size', 'Size', v.manufacturer_size && it.size && v.manufacturer_size !== it.size ? `${v.manufacturer_size} (${it.size})` : null, src('manufacturer_size', 'size')],
    ['material', 'Material', it.material, src('material')],
    ['fit', 'Fit', it.fit, src('fit', 'default_fit')],
    ['price', 'Paid', own.price != null ? money(own.price, own.currency) : null, src('price')],
    ['price', 'Retail', v.price != null ? money(v.price, v.currency) : null, v.sources?.price],
    ['bought', 'Bought', own.bought_on && day(own.bought_on, { month: 'short', year: 'numeric' }), src('bought_on')],
    ['condition', 'Condition', own.condition],
    ['measurements', 'Measurements', Object.entries(v.measurements || {}).map(([k, x]) => `${k} ${x}`).join(', ')],
    ['style_number', 'Style no.', p.style_number, src('style_number')],
    ['origin', 'Made in', p.country_of_origin, src('country_of_origin')],
    ['kind', 'Kind', cap(words(it.subcategory)) || CATS[it.category]],
  ].filter((f) => f[2]);
  const focus = (toolInput?.id === it.id && Array.isArray(toolInput.focus)) ? toolInput.focus : [];
  facts.sort((a, b) => (focus.includes(a[0]) ? 0 : 1) - (focus.includes(b[0]) ? 0 : 1));
  const list = (fs) => {
    const dl = el('dl', 'w-facts');
    for (const [, name, val, s] of fs) {
      const dd = el('dd');
      if (s) { // tap to see where it came from
        const t = button('w-fact', null, () => { note.hidden = !note.hidden; });
        t.append(val); if (guessed(s)) t.append(el('span', 'w-guess', SOURCE[s.source] || 'guessed'));
        const note = el('span', 'w-why', `${cap(SOURCE[s.source] || s.source)}${s.raw ? `: “${s.raw}”` : ''}${s.confidence != null && s.confidence < 1 ? ` · ${Math.round(s.confidence * 100)}% sure` : ''}`); note.hidden = true;
        dd.append(t, note);
      } else dd.append(val);
      dl.append(el('dt', null, name), dd);
    }
    return dl;
  };
  const SHOW = full() ? facts.length : Math.max(4, focus.length);
  wrap.append(list(facts.slice(0, SHOW)));
  const pills = el('p', 'w-pills');
  for (const t of [...(it.seasons || []), it.warmth && (it.warmth === 'mid' ? 'mid-weight' : it.warmth), it.dressiness, ...(it.dressiness_also || []).map((d) => `also ${d}`), ...(it.style_tags || [])].filter(Boolean)) pills.append(el('span', 'w-pill', t));
  if (pills.childElementCount) wrap.append(pills);
  const rest = facts.slice(SHOW);
  if (rest.length || it.notes) {
    const d = el('details', 'w-more-details'); d.open = full();
    d.append(el('summary', null, 'More details'));
    if (rest.length) d.append(list(rest));
    if (it.notes) d.append(el('p', 'w-notes', it.notes));
    wrap.append(d);
  }
  app.append(wrap);
}

// What the server said, for Steve: the notes meant for the model (fields without a source) stay
// out, and the rest is one line, not a stack of boxes.
const heads = (ws) => [...new Set((ws || []).map((w) =>
  /^No source given|^When it was bought|^No style number/.test(w) ? null
    : /^No photos/.test(w) ? 'No photo yet'
      : /^No garment photo/.test(w) ? 'No photo of the garment itself'
        : /^Matched an existing product on brand and name/.test(w) ? "Matched on the name alone: check it's the same one"
          : /didn't come through/.test(w) ? "A photo didn't come through: attach it again"
            : / here; you read /.test(w) ? 'The tag says something different from what’s filed; kept what’s filed'
              : w).filter(Boolean))];
function warn(ws) { const h = heads(ws); return h.length ? el('p', 'w-warn', h.join(' · ')) : null; }

// Filing: what it is and whether it's new, then only what was guessed; the facts read off a tag
// are folded (nobody needs to re-read a tag the AI just read). One button.
function ingest(data) {
  if (!data.dry_run) {
    const n = data.item_ids?.length || 1;
    const box = el('div', 'w-receipt');
    box.append(el('p', 'w-done', data.owned_item_created ? (n > 1 ? `Added ${n} to your wardrobe` : 'Added to your wardrobe') : 'Already in your wardrobe'));
    const w = warn(data.warnings); if (w) box.append(w);
    return garment(data, box);
  }
  const pv = data.preview || {}, P = pv.product, V = pv.variant, I = pv.item || {};
  const f = { ...(P?.fields || {}), ...(V?.fields || {}) };
  app.append(el('p', 'w-kicker', !P ? 'New piece' : !P.existing ? 'New to your wardrobe' : !V?.existing ? 'New colour or size' : 'Another one'));
  app.append(el('h2', 'w-title', f.name ? `${f.brand ? `${f.brand} ` : ''}${f.name}` : I.fields?.name || 'A garment'));
  app.append(el('p', 'w-sub', [cap(words(I.fields?.subcategory)) || CATS[I.fields?.category], cap(plain(f.manufacturer_colour || f.colour)), f.manufacturer_size || f.size, pv.quantity > 1 ? `×${pv.quantity}` : null].filter(Boolean).join(' · ')));
  if (P?.existing) app.append(el('p', 'w-note', V?.existing ? 'You have one like this already; this adds another.' : 'You have this in another colour or size.'));
  // every value with its source; what was guessed goes first, the rest folds
  const all = [];
  const fmt = (k, val) => k === 'price' ? money(val, f.currency) : Array.isArray(val) ? val.join(', ') : typeof val === 'object' ? Object.entries(val).map(([a, b]) => `${a} ${b}`).join(', ') : words(val);
  for (const lvl of ['product', 'variant', 'item']) for (const [k, val] of Object.entries(pv[lvl]?.fields || {})) {
    if (val == null || (Array.isArray(val) && !val.length) || k === 'currency' || ((k === 'colour' && f.manufacturer_colour) || (k === 'size' && f.manufacturer_size))) continue;
    all.push({ k, val: fmt(k, val), s: pv[lvl].sources?.[k] });
  }
  const row = (dl, { k, val, s }) => { const dd = el('dd', null, val); if (s && guessed(s)) dd.append(el('span', 'w-guess', SOURCE[s.source] || 'guessed')); dl.append(el('dt', null, cap(words(k).replace(/^manufacturer /, ''))), dd); };
  const check = all.filter((x) => guessed(x.s) && !/category$/.test(x.k));
  if (check.length) {
    app.append(el('p', 'w-cap', 'Guessed, so worth a look'));
    const dl = el('dl', 'w-facts'); check.forEach((x) => row(dl, x)); app.append(dl);
  }
  const rest = all.filter((x) => !check.includes(x) && !/^(brand|name)$/.test(x.k));
  if (rest.length) {
    const from = [...new Set(rest.map((x) => x.s?.source).filter(Boolean))];
    const d = el('details', 'w-more-details');
    d.append(el('summary', null, `${rest.length} more detail${rest.length > 1 ? 's' : ''}${from.length === 1 && !guessed(rest[0].s) ? `, from the ${SOURCE[from[0]] || words(from[0])}` : ''}`));
    const dl = el('dl', 'w-facts'); rest.forEach((x) => { const dd = el('dd', null, x.val); if (x.s && from.length > 1) dd.append(el('span', 'w-src', SOURCE[x.s.source] || x.s.source)); dl.append(el('dt', null, cap(words(x.k).replace(/^manufacturer /, ''))), dd); });
    d.append(dl); app.append(d);
  }
  const w = warn(data.warnings); if (w) app.append(w);
  const go = button('w-btn w-btn--primary', 'Add to wardrobe', async () => {
    if (!toolInput) { say('Ask in the chat to add it.'); return; }
    go.disabled = true; go.textContent = 'Adding…';
    const { dry_run, ...args } = toolInput;
    try { start(await callTool('ingest_item', args)); }
    catch (e) { go.disabled = false; go.textContent = 'Add to wardrobe'; say(e.message, true); }
  });
  const actions = el('div', 'w-actions'); actions.append(go); app.append(actions);
}

Object.assign(views, { closet, garment, ingest });

css(`
.w-row { display: grid; grid-auto-flow: column; grid-auto-columns: min(38%, 150px); gap: 10px; overflow-x: auto; scroll-snap-type: x mandatory; scroll-padding-inline: 14px; margin: 0 -14px; padding: 0 14px 2px; scrollbar-width: none; }
.w-row::-webkit-scrollbar { display: none; }
.w-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 14px 10px; }
.w-tile { display: grid; align-content: start; gap: 2px; width: 100%; padding: 0; border: 0; background: none; text-align: left; cursor: pointer; scroll-snap-align: start; }
.w-photo { aspect-ratio: 1; border-radius: var(--w-r); margin-bottom: 4px; }
.w-photo img { padding: 8%; }
.w-more { font-size: var(--w-t); font-weight: 600; color: var(--w-accent); }
.w-tile__name { font-weight: 600; line-height: 1.25; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.w-tile__meta { font-size: var(--w-c); color: var(--w-ink2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.w-tile:focus-visible .w-photo, .w-thumb:focus-visible .w-thumb__img, .w-sq:focus-visible .w-sq__img { outline: 2px solid var(--w-accent); outline-offset: 2px; }
.w-chips { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
.w-chip { flex: none; min-height: 36px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--w-line); background: none; cursor: pointer; font-size: var(--w-c); }
.w-chip[aria-pressed="true"] { background: var(--w-ink); color: var(--w-bg); border-color: var(--w-ink); }
.w-garment { display: grid; gap: 10px; }
.w-hero { margin: 0; }
.w-hero__img { aspect-ratio: 4 / 3; max-height: 300px; width: 100%; border-radius: var(--w-r); }
.is-full .w-hero__img { max-height: 46vh; }
.w-hero__img.w-none { aspect-ratio: auto; height: 88px; }
.w-hero__img img { padding: 4%; }
.w-thumbs { display: flex; gap: 8px; overflow-x: auto; }
.w-thumb { position: relative; flex: none; padding: 0; border: 0; background: none; cursor: pointer; }
.w-thumb__img { width: 56px; height: 56px; border-radius: 10px; border: 1px solid var(--w-line); }
.w-thumb[aria-pressed="true"] .w-thumb__img { outline: 2px solid var(--w-accent); outline-offset: 1px; }
.w-badge { position: absolute; left: 3px; bottom: 3px; font-size: 10px; line-height: 1; padding: 3px 5px; border-radius: 6px; background: var(--w-ink); color: var(--w-bg); }
.w-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; }
.w-tools:empty { display: none; }
.w-tools .w-cap { width: 100%; }
.w-tools .w-cap + .w-link { margin-left: -6px; }
.w-tools .w-cap:has(+ .w-link) { width: auto; }
.w-link--bad { color: var(--color-text-danger, #b3261e); }
.w-facts { display: grid; grid-template-columns: max-content 1fr; gap: 2px 16px; margin: 0; }
.w-facts dt { color: var(--w-ink2); min-height: 28px; display: flex; align-items: center; }
.w-facts dd { margin: 0; display: flex; flex-wrap: wrap; gap: 0 8px; align-items: center; min-height: 28px; }
.w-fact { padding: 0; border: 0; background: none; text-align: left; cursor: pointer; display: inline-flex; flex-wrap: wrap; gap: 0 8px; align-items: baseline; }
.w-why { width: 100%; font-size: var(--w-c); color: var(--w-ink2); }
.w-guess, .w-src { font-size: var(--w-c); color: var(--w-ink2); }
.w-guess { color: var(--w-warn); }
.w-guess::before { content: "· "; }
.w-pills { display: flex; flex-wrap: wrap; gap: 6px; }
.w-pill { font-size: var(--w-c); padding: 2px 10px; border-radius: 999px; background: var(--w-bg2); color: var(--w-ink2); }
.w-notes { white-space: pre-wrap; margin-top: 6px; }
.w-receipt { display: grid; gap: 2px; }
.w-done { color: var(--w-ok); font-weight: 600; }
.w-done::before { content: "✓ "; }
`);
