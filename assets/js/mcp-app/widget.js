// The wardrobe's in-chat card (docs/apps.md, "The card"): what ChatGPT and Claude show under a
// wardrobe tool's answer, in the sandboxed frame the MCP Apps standard (SEP-1865) gives it. One
// page for every tool; the result's structuredContent.view says what to draw. Two levels, as both
// hosts' guidelines ask: inline, a glance (a row of photos, one garment, a preview, a trip's
// summary) with at most two actions; the detail opens full screen (the whole closet with filters,
// a garment's every fact, a trip's days and packing). The model does the talking, so the card has
// no counts or prose it would say anyway; facts carry their source only where they were guessed.
//   closet   find_items: a row of photos; See all, and tap one to open it
//   garment  get_item (and changes): its photos, what it is; tap a photo to say what it is
//   ingest   ingest_item: a dry run's preview (only what was guessed up front), then Add
//   trip     get_trip: legs, the next outfit, packing so far; Open trip for days and packing
// It talks to the host with the standard's JSON-RPC over postMessage: ui/initialize, then the
// tool's input and result arrive as notifications, and tools/call runs a tool (as Steve) from a
// tap. A few lines here rather than the 445 KB SDK; tools/smoke.mjs drives this against the
// SDK's own host side (AppBridge). Styled with the host's variables where it gives them.
const PROTOCOL = '2026-01-26';
const app = document.getElementById('app');

// ---------- The bridge ----------
let nextId = 1;
const waiting = new Map();
const post = (msg) => window.parent.postMessage({ jsonrpc: '2.0', ...msg }, '*');
const request = (method, params) => new Promise((resolve, reject) => {
  const id = nextId++;
  waiting.set(id, { resolve, reject });
  post({ id, method, params });
});
const notify = (method, params) => post({ method, params });
let host = {}, toolInput = null, root = null, current = null, stack = [], ui = {};
window.addEventListener('message', (e) => {
  if (e.source !== window.parent) return;
  const m = e.data;
  if (!m || m.jsonrpc !== '2.0') return;
  if (m.id != null && !m.method) { // an answer to something asked
    const w = waiting.get(m.id);
    if (w) { waiting.delete(m.id); m.error ? w.reject(m.error) : w.resolve(m.result); }
    return;
  }
  if (m.method === 'ui/notifications/tool-input') toolInput = m.params?.arguments || null;
  else if (m.method === 'ui/notifications/tool-result') show(m.params);
  else if (m.method === 'ui/notifications/host-context-changed') context(m.params);
  else if (m.method === 'ui/notifications/tool-cancelled') say('Cancelled.');
  else if (m.id != null) post({ id: m.id, result: {} }); // ping, teardown: nothing to tidy
});
function context(ctx = {}) {
  const was = host.displayMode;
  host = { ...host, ...ctx };
  if (ctx.theme) document.documentElement.dataset.theme = ctx.theme;
  for (const [k, v] of Object.entries(ctx.styles?.variables || {})) if (v) document.documentElement.style.setProperty(k, v);
  // closed full screen from the host: back to the glance it started from
  if (ctx.displayMode && was && ctx.displayMode !== was && root) {
    if (ctx.displayMode === 'fullscreen') draw(current, false); else start(root);
  }
}
// A result's data with its photos back in: the server sends the signed photo links in the
// result's _meta (for the card only, not the model) and short references ("p1") in their place
function hydrate(r) {
  const photos = r?._meta?.photos || {};
  const walk = (v) => Array.isArray(v) ? v.map(walk) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, (k === 'hero_photo' || k === 'url') && typeof x === 'string' ? photos[x] || (/^(https?:|data:)/.test(x) ? x : null) : walk(x)])) : v;
  return walk(r?.structuredContent);
}
const callTool = async (name, args) => {
  const r = await request('tools/call', { name, arguments: args });
  if (r?.isError) throw new Error(r.content?.[0]?.text || "That didn't work.");
  return hydrate(r);
};
// what Steve is looking at, so "what goes with this?" in the chat knows
const tell = (text) => request('ui/update-model-context', { content: [{ type: 'text', text }] }).catch(() => {});
const full = () => host.displayMode === 'fullscreen';
async function goFull() {
  if (full()) return true;
  if (!(host.availableDisplayModes || []).includes('fullscreen')) return false;
  try { const r = await request('ui/request-display-mode', { mode: 'fullscreen' }); host.displayMode = r?.mode || host.displayMode; } catch (e) { /* stays inline */ }
  return full();
}
// tell the host how tall the card is, as it changes
new ResizeObserver(() => notify('ui/notifications/size-changed', { height: Math.ceil(document.documentElement.getBoundingClientRect().height) })).observe(document.documentElement);

// ---------- Parts ----------
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const button = (cls, text, onclick) => { const b = el('button', cls, text); b.type = 'button'; b.addEventListener('click', onclick); return b; };
const CATS = { tops: 'Tops', bottoms: 'Bottoms', outerwear: 'Outerwear', suits: 'Suits', shoes: 'Shoes', accessories: 'Accessories', workout: 'Workout', swim: 'Swim' };
const ROLES = { garment: 'Garment', tag: 'Tag', care_label: 'Care label', detail: 'Detail', other: 'Other' };
const BADGE = { tag: 'Tag', care_label: 'Care', detail: 'Detail', other: '?' };
const SOURCE = { user: 'you said', garment_label: 'garment label', hang_tag: 'hang tag', care_label: 'care label', retailer_page: 'shop page', manufacturer_page: "maker's page", vision_inference: 'from the photo', derived: 'worked out' };
const words = (s) => (s ? String(s).replace(/_/g, ' ') : '');
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
const plain = (c) => (c ? String(c).replace(/^\s*\d+\s+/, '') : ''); // "38 Dark Brown" → "Dark Brown"
const guessed = (s) => s && (s.source === 'vision_inference' || s.source === 'derived' || (s.confidence != null && s.confidence < 0.8));
const money = (n, cur) => { try { return Number(n).toLocaleString(host.locale, { style: 'currency', currency: cur || 'USD', maximumFractionDigits: n % 1 ? 2 : 0 }); } catch (e) { return `${n} ${cur || ''}`; } };
const day = (d, opts = { weekday: 'short', day: 'numeric', month: 'short' }) => new Date(`${d}T12:00:00`).toLocaleDateString(host.locale, opts);
const span = (a, b) => { const m = { month: 'short' }; const A = new Date(`${a}T12:00:00`), B = new Date(`${b}T12:00:00`); return A.getMonth() === B.getMonth() ? `${day(a, { ...m, day: 'numeric' })}–${B.getDate()}` : `${day(a, { ...m, day: 'numeric' })} – ${day(b, { ...m, day: 'numeric' })}`; };
// a photo, or for a garment with none, a tile in its colour with what it is
function photo(url, it, cls = 'w-photo') {
  const box = el('span', cls);
  const none = () => {
    box.classList.add('w-none');
    const c = plain(it?.manufacturer_colour || it?.colour).toLowerCase().split(/\s+/).pop();
    if (c && CSS.supports('color', c)) box.style.setProperty('--sw', c);
    box.append(el('span', 'w-none__t', cls === 'w-thumb__img' || cls === 'w-pack__img' ? '' : CATS[it?.category] || (cls === 'w-sq__img' ? '' : 'No photo')));
  };
  if (url) { const img = el('img'); img.src = url; img.alt = it?.name || ''; img.loading = 'lazy'; img.addEventListener('error', () => { img.remove(); none(); }); box.append(img); }
  else none();
  return box;
}
function say(text, bad = false) { const p = el('p', bad ? 'w-note w-note--bad' : 'w-note', text); app.prepend(p); return p; }
function back() {
  if (!stack.length) return null;
  return button('w-link w-back', '‹ Back', () => draw(stack.pop(), false));
}
// open a garment: full screen where the host has it (no drilling down inside the chat), else here
async function openItem(id, from) {
  await goFull();
  try {
    const r = await callTool('get_item', { id });
    if (from) stack.push(from);
    draw(r, false);
    tell(`Steve opened ${r.item?.name || 'a garment'} (item ${id}) in the wardrobe card.`);
  } catch (e) { say(e.message, true); }
}

// ---------- Views ----------
function show(result) {
  if (result?.isError || !result?.structuredContent) { app.textContent = ''; return; } // the text answer says it
  start(hydrate(result));
}
function start(data) { root = data; stack = []; ui = {}; draw(data, false); }
function draw(data, keep = true) {
  if (keep && current) stack.push(current);
  current = data;
  app.textContent = '';
  document.documentElement.classList.toggle('is-full', full());
  const views = { closet, garment, ingest, trip };
  (views[data?.view] || (() => {}))(data);
}

// The closet. Garments that share a name (one shirt in three colours) are told apart by colour,
// the thing that differs, rather than three cut-off copies of the same name.
function label(it, twins) {
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
  let looking = photos.find((x) => x.hero) || photos[0] || null, editing = false;
  const fig = el('figure', 'w-hero'), thumbs = el('div', 'w-thumbs'), tools = el('div', 'w-tools');
  const paint = () => {
    fig.replaceChildren(photo(looking?.url || it.hero_photo, it, 'w-hero__img'));
    thumbs.replaceChildren(...photos.map((x) => {
      const t = button('w-thumb', null, () => { looking = x; editing = false; paint(); });
      t.dataset.role = x.role;
      t.setAttribute('aria-pressed', x === looking);
      t.setAttribute('aria-label', `${ROLES[x.role]} photo${x.hero ? ', the main one' : ''}`);
      t.append(photo(x.url, it, 'w-thumb__img'));
      if (BADGE[x.role]) t.append(el('span', 'w-badge', BADGE[x.role]));
      return t;
    }));
    thumbs.hidden = photos.length < 2;
    tools.replaceChildren();
    if (!looking) return;
    const unknown = looking.role === 'other';
    if (looking.hero && !editing && !unknown) return; // the main photo is a garment photo: nothing to ask
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
    tools.append(el('span', 'w-cap', `${ROLES[looking.role]} photo`), button('w-link', 'Change', () => { editing = true; paint(); }));
    if (looking.role === 'garment') tools.append(button('w-btn', 'Make it the main photo', () => setRole(looking, { make_hero: true })));
  };
  const setRole = async (x, change) => {
    try {
      const r = await callTool('set_photo_role', { photo_id: x.id, ...change });
      const next = { ...r, view: 'garment' };
      const keep = (next.photos || []).find((y) => y.id === x.id);
      current = next; app.textContent = ''; garment(next, receipt);
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

// A trip. Inline: where and when, the next outfit, how the packing's going. Full screen: every
// day's outfit as photos (the names are one tap away, not repeated down the page) and packing.
function trip(data) {
  const t = data.trip, big = full() || ui.open;
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

// ---------- Looks: the host's variables where given, else the site's colours. Three sizes
// (title, body, caption), two weights. ----------
const style = el('style');
style.textContent = `
:root { color-scheme: light dark; --w-bg: var(--color-background-primary, #fbf8f3); --w-bg2: var(--color-background-secondary, #f1ece3); --w-ink: var(--color-text-primary, #1d1b18); --w-ink2: var(--color-text-secondary, #6b645a); --w-line: var(--color-border-primary, #e2dccf); --w-accent: var(--color-ring-primary, #c2471d); --w-warn: var(--color-text-warning, #8a5a00); --w-ok: var(--color-text-success, #1f7a45); --w-r: var(--border-radius-lg, 14px); --w-t: 17px; --w-b: 15px; --w-c: 13px; font-family: var(--font-sans, system-ui, -apple-system, "Segoe UI", sans-serif); }
:root[data-theme="dark"] { --w-bg: var(--color-background-primary, #1b1d22); --w-bg2: var(--color-background-secondary, #262930); --w-ink: var(--color-text-primary, #f2efe8); --w-ink2: var(--color-text-secondary, #a9a49a); --w-line: var(--color-border-primary, #383b43); --w-warn: var(--color-text-warning, #f1c86b); --w-ok: var(--color-text-success, #6fd39a); }
* { box-sizing: border-box; }
html, body { margin: 0; background: transparent; color: var(--w-ink); font-size: var(--w-b); line-height: 1.45; }
#app { padding: 14px; display: grid; gap: 12px; min-width: 0; }
#app:empty { display: none; }
p { margin: 0; }
button { font: inherit; color: inherit; }
[hidden] { display: none !important; }
.w-head, .w-bar { display: flex; align-items: center; gap: 4px 12px; flex-wrap: wrap; }
.w-head > div { flex: 1; }
.w-back { margin-left: -2px; }
.w-title { margin: 0; font-size: var(--w-t); font-weight: 600; line-height: 1.25; }
.w-sub, .w-note, .w-dim, .w-count { color: var(--w-ink2); }
.w-cap, .w-kicker { font-size: var(--w-c); color: var(--w-ink2); }
.w-kicker { color: var(--w-accent); font-weight: 600; }
.w-note--bad { color: var(--color-text-danger, #b3261e); }
.w-link { min-height: 44px; padding: 0 2px; border: 0; background: none; color: var(--w-accent); cursor: pointer; }
.w-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.w-btn { min-height: 44px; padding: 0 18px; border-radius: 999px; border: 1px solid var(--w-line); background: var(--w-bg); cursor: pointer; font-weight: 600; }
.w-btn--primary { background: var(--w-accent); border-color: var(--w-accent); color: #fff; }
.w-btn:disabled { opacity: .6; cursor: progress; }
.w-photo, .w-hero__img, .w-thumb__img, .w-sq__img, .w-pack__img { display: grid; place-items: center; overflow: hidden; background: var(--w-bg2); color: var(--w-ink2); }
.w-photo img, .w-hero__img img, .w-thumb__img img, .w-sq__img img, .w-pack__img img { width: 100%; height: 100%; object-fit: contain; }
.w-none { background: color-mix(in srgb, var(--sw, var(--w-bg2)) 45%, var(--w-bg2)); }
.w-none__t { font-size: var(--w-c); padding: 2px 8px; border-radius: 999px; background: var(--w-bg); color: var(--w-ink2); }
.w-none__t:empty { display: none; }
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
.w-seg { display: flex; flex-wrap: wrap; border: 1px solid var(--w-line); border-radius: 999px; overflow: hidden; }
.w-seg__b { flex: 1 0 auto; min-height: 44px; padding: 0 12px; border: 0; background: none; cursor: pointer; font-size: var(--w-c); }
.w-seg__b + .w-seg__b { border-left: 1px solid var(--w-line); }
.w-seg__b[aria-pressed="true"] { background: var(--w-ink); color: var(--w-bg); font-weight: 600; }
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
.w-more-details summary { cursor: pointer; color: var(--w-accent); min-height: 44px; display: flex; align-items: center; }
.w-warn { font-size: var(--w-c); color: var(--w-warn); }
.w-receipt { display: grid; gap: 2px; }
.w-done { color: var(--w-ok); font-weight: 600; }
.w-done::before { content: "✓ "; }
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
`;
document.head.append(style);

// ---------- Start ----------
request('ui/initialize', { appInfo: { name: 'wardrobe-card', version: '1.1.0' }, appCapabilities: {}, protocolVersion: PROTOCOL })
  .then((r) => { context(r?.hostContext || {}); notify('ui/notifications/initialized', {}); })
  .catch(() => {});
