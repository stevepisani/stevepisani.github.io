// The wardrobe's in-chat card (docs/apps.md, "The card"): what ChatGPT and Claude show under a
// wardrobe tool's answer, in the sandboxed frame the MCP Apps standard (SEP-1865) gives it. One
// page for every tool; the result's structuredContent.view says what to draw:
//   closet   find_items: a grid of garments, photos first; tap one to open it
//   garment  get_item (and changes): its photos with their roles, what it is, where each fact came from
//   ingest   ingest_item: a dry run's preview with a "File it" button, or what was just filed
//   trip     get_trip: the legs and weather, each planned day's outfit, the packing to tick off
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
let host = {}, toolInput = null, stack = [];
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
  else if (m.method === 'ui/notifications/tool-result') { stack = []; show(m.params); }
  else if (m.method === 'ui/notifications/host-context-changed') context(m.params);
  else if (m.method === 'ui/notifications/tool-cancelled') say('Cancelled.');
  else if (m.id != null) post({ id: m.id, result: {} }); // ping, teardown: nothing to tidy
});
function context(ctx = {}) {
  host = { ...host, ...ctx };
  if (ctx.theme) document.documentElement.dataset.theme = ctx.theme;
  for (const [k, v] of Object.entries(ctx.styles?.variables || {})) if (v) document.documentElement.style.setProperty(k, v);
}
const callTool = async (name, args) => {
  const r = await request('tools/call', { name, arguments: args });
  if (r?.isError) throw new Error(r.content?.[0]?.text || "That didn't work.");
  return r;
};
// tell the host how tall the card is, as it changes
new ResizeObserver(() => notify('ui/notifications/size-changed', { height: Math.ceil(document.documentElement.getBoundingClientRect().height) })).observe(document.documentElement);

// ---------- Parts ----------
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const button = (cls, text, onclick) => { const b = el('button', cls, text); b.type = 'button'; b.addEventListener('click', onclick); return b; };
const CATS = { tops: 'Tops', bottoms: 'Bottoms', outerwear: 'Outerwear', suits: 'Suits', shoes: 'Shoes', accessories: 'Accessories', workout: 'Workout', swim: 'Swim' };
const ROLES = { garment: 'Garment', tag: 'Tag', care_label: 'Care label', detail: 'Detail', other: 'Other' };
const SOURCE = { user: 'you', garment_label: 'garment label', hang_tag: 'hang tag', care_label: 'care label', retailer_page: 'shop page', manufacturer_page: "maker's page", vision_inference: 'from the photo', derived: 'worked out' };
const kind = (s) => (s ? s.replace(/_/g, ' ') : '');
function photo(url, letter, cls = 'w-photo') {
  const box = el('span', cls);
  if (url) { const img = el('img'); img.src = url; img.alt = ''; img.loading = 'lazy'; img.addEventListener('error', () => { img.remove(); box.textContent = letter || ''; }); box.append(img); }
  else box.textContent = letter || '';
  return box;
}
const money = (n, cur) => { try { return Number(n).toLocaleString(host.locale, { style: 'currency', currency: cur || 'USD', maximumFractionDigits: n % 1 ? 2 : 0 }); } catch (e) { return `${n} ${cur || ''}`; } };
const day = (d, opts = { weekday: 'short', day: 'numeric', month: 'short' }) => new Date(`${d}T12:00:00`).toLocaleDateString(host.locale, opts);
function say(text, bad = false) { const p = el('p', bad ? 'w-note w-note--bad' : 'w-note', text); app.prepend(p); return p; }
function back() {
  if (!stack.length) return null;
  return button('w-link', '‹ Back', () => { const prev = stack.pop(); draw(prev, false); });
}
function fullscreen() {
  if (!(host.availableDisplayModes || []).includes('fullscreen') || host.displayMode === 'fullscreen') return null;
  return button('w-link', 'Full screen', () => request('ui/request-display-mode', { mode: 'fullscreen' }).catch(() => {}));
}
// open something by calling its tool, keeping the way back
async function open(name, args, from) {
  try { const r = await callTool(name, args); if (from) stack.push(from); draw(r.structuredContent, false); }
  catch (e) { say(e.message, true); }
}

// ---------- Views ----------
let current = null;
function show(result) {
  if (result?.isError || !result?.structuredContent) { app.textContent = ''; return; } // the text answer says it
  draw(result.structuredContent, false);
}
function draw(data, keep = true) {
  if (keep && current) stack.push(current);
  current = data;
  app.textContent = '';
  const views = { closet, garment, ingest, trip };
  (views[data?.view] || (() => {}))(data);
}

function closet(data) {
  const head = el('header', 'w-head');
  head.append(el('h2', 'w-title', data.count ? `${data.count} garment${data.count === 1 ? '' : 's'}` : 'Nothing matches'));
  const fs = fullscreen(); if (fs && data.count > 12) head.append(fs);
  app.append(head);
  const grid = el('ul', 'w-grid');
  const add = (it) => {
    const li = el('li'), b = button('w-card', null, () => open('get_item', { id: it.id }, data));
    b.append(photo(it.hero_photo, (CATS[it.category] || '?')[0]), el('span', 'w-card__name', it.name), el('span', 'w-card__meta', [it.brand, it.manufacturer_colour || it.colour, it.size].filter(Boolean).join(' · ')));
    li.append(b); grid.append(li);
  };
  data.items.slice(0, 12).forEach(add);
  app.append(grid);
  if (data.items.length > 12) app.append(button('w-link w-more', `Show all ${data.items.length}`, (e) => { data.items.slice(12).forEach(add); e.target.remove(); }));
}

function garment(data, banner) {
  const it = data.item, p = data.product, v = data.variant, own = data.owned_item || {};
  const top = el('div', 'w-bar'); const b = back(); if (b) top.append(b);
  if (top.childElementCount) app.append(top);
  if (banner) app.append(banner);
  const wrap = el('article', 'w-garment');
  // the photos: the one shown big, the rest beside it with their roles; tap one to look, or to say what it is
  const photos = data.photos || [];
  let looking = photos.find((x) => x.hero) || photos[0] || null;
  const fig = el('figure', 'w-hero'), thumbs = el('div', 'w-thumbs'), roles = el('div', 'w-roles');
  const paint = () => {
    fig.replaceChildren(photo(looking?.url || it.hero_photo, (CATS[it.category] || '?')[0], 'w-hero__img'));
    if (looking && !looking.hero) fig.append(el('figcaption', 'w-hero__cap', `${ROLES[looking.role]} photo`));
    thumbs.replaceChildren(...photos.map((x) => {
      const t = button('w-thumb', null, () => { looking = x; paint(); });
      t.setAttribute('aria-pressed', x === looking);
      t.append(photo(x.url, ROLES[x.role][0], 'w-thumb__img'), el('span', 'w-thumb__role', `${ROLES[x.role]}${x.hero ? ' · shown' : ''}`));
      return t;
    }));
    thumbs.hidden = photos.length < 2;
    roles.replaceChildren();
    if (looking && photos.length) {
      const seg = el('div', 'w-seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'This photo is');
      for (const [r, label] of Object.entries(ROLES)) {
        const s = button('w-seg__b', label, () => setRole(looking, { role: r }));
        s.setAttribute('aria-pressed', looking.role === r);
        seg.append(s);
      }
      roles.append(el('span', 'w-label', 'This photo is'), seg);
      if (!looking.hero) roles.append(button('w-btn', 'Show this one', () => setRole(looking, { make_hero: true })));
    }
  };
  const setRole = async (x, change) => {
    try { const r = await callTool('set_photo_role', { photo_id: x.id, ...change }); current = { ...r.structuredContent, view: 'garment' }; app.textContent = ''; garment(current); }
    catch (e) { say(e.message, true); }
  };
  paint();
  wrap.append(fig, thumbs, roles);
  // what it is
  wrap.append(el('h2', 'w-title', it.name), el('p', 'w-kind', [CATS[it.category], kind(it.subcategory)].filter(Boolean).join(' · ') + (it.retired ? ' · retired' : '')));
  const facts = el('dl', 'w-facts');
  const fact = (k, val) => { if (val == null || val === '') return; facts.append(el('dt', null, k), el('dd', null, String(val))); };
  fact('Brand', it.brand); fact('Colour', v?.manufacturer_colour ? `${v.manufacturer_colour}${v.colour ? ` (${v.colour})` : ''}` : it.colour);
  fact('Size', v?.manufacturer_size || it.size);
  for (const [k, val] of Object.entries(v?.measurements || {})) fact(k[0].toUpperCase() + k.slice(1), val);
  fact('Material', it.material); fact('Fit', it.fit); fact('Style', p?.style_number); fact('Made in', p?.country_of_origin);
  if (v?.price != null) fact('Retail', money(v.price, v.currency));
  if (own.price != null) fact('Paid', money(own.price, own.currency));
  fact('Bought', own.bought_on && day(own.bought_on, { month: 'short', year: 'numeric' })); fact('Condition', own.condition);
  wrap.append(facts);
  const pills = el('p', 'w-pills');
  for (const t of [...(it.seasons || []), it.warmth && `${it.warmth === 'mid' ? 'mid-weight' : it.warmth}`, it.dressiness, ...(it.dressiness_also || []).map((d) => `also ${d}`), ...(it.style_tags || [])].filter(Boolean)) pills.append(el('span', 'w-pill', t));
  if (pills.childElementCount) wrap.append(pills);
  if (it.notes) wrap.append(el('p', 'w-notes', it.notes));
  // where each fact came from
  const srcs = [...Object.entries(p?.sources || {}), ...Object.entries(v?.sources || {}), ...Object.entries(own.sources || {}).filter(([k]) => k !== 'migrated_from')];
  if (srcs.length) {
    const d = el('details', 'w-sources'); d.append(el('summary', null, 'Where these facts came from'));
    const ul = el('ul');
    for (const [k, s] of srcs) ul.append(el('li', null, `${kind(k)}: ${SOURCE[s.source] || s.source}${s.confidence != null && s.confidence < 1 ? ` (${Math.round(s.confidence * 100)}% sure)` : ''}${s.raw ? ` · "${s.raw}"` : ''}`));
    d.append(ul); wrap.append(d);
  }
  app.append(wrap);
}

function ingest(data) {
  if (!data.dry_run) {
    const banner = el('p', 'w-banner', data.owned_item_created ? `Filed: ${[data.product ? (data.product_created ? 'new product' : 'existing product') : 'no product', data.variant ? (data.variant_created ? 'new variant' : 'existing variant') : null, `${data.item_ids?.length || 1} new item${(data.item_ids?.length || 1) > 1 ? 's' : ''}`].filter(Boolean).join(' · ')}` : 'Already filed: nothing was added twice.');
    const box = el('div'); box.append(banner); for (const w of data.warnings || []) box.append(el('p', 'w-warn', w));
    return garment(data, box);
  }
  const pv = data.preview || {};
  app.append(el('p', 'w-kicker', 'Ready to file'));
  const f = { ...(pv.product?.fields || {}), ...(pv.variant?.fields || {}) };
  app.append(el('h2', 'w-title', f.name ? `${f.brand ? `${f.brand} ` : ''}${f.name}` : pv.item?.fields?.name || 'A garment'));
  const levels = el('ul', 'w-levels');
  if (pv.product) levels.append(el('li', null, pv.product.existing ? `Product: already here (matched on ${pv.product.matched_by})` : 'Product: new'));
  if (pv.variant) levels.append(el('li', null, `${[pv.variant.fields.manufacturer_colour || pv.variant.fields.colour, pv.variant.fields.manufacturer_size || pv.variant.fields.size].filter(Boolean).join(' / ') || 'Variant'}: ${pv.variant.existing ? 'already here' : 'new'}`));
  if (!pv.product) levels.append(el('li', null, 'No product: it stands alone'));
  levels.append(el('li', null, `${pv.quantity > 1 ? `${pv.quantity} new pieces` : 'One new piece'}${pv.photos?.length ? `, with ${pv.photos.map((r) => ROLES[r].toLowerCase()).join(', ')} photo${pv.photos.length > 1 ? 's' : ''}` : ', no photos'}`));
  app.append(levels);
  // every value, and where it came from
  const table = el('dl', 'w-facts');
  const show = (k, val) => k === 'price' ? money(val, f.currency) : Array.isArray(val) ? val.join(', ') : typeof val === 'object' ? Object.entries(val).map(([a, b]) => `${a} ${b}`).join(', ') : /category$/.test(k) ? String(val).replace(/_/g, ' ') : String(val);
  const row = (k, val, s) => { if (val == null || (Array.isArray(val) && !val.length) || (k === 'currency' && f.price != null)) return; const dd = el('dd', null, show(k, val)); if (s) dd.append(el('span', `w-src w-src--${s.source}`, SOURCE[s.source] || s.source)); table.append(el('dt', null, kind(k)), dd); };
  for (const lvl of ['product', 'variant', 'item']) for (const [k, val] of Object.entries(pv[lvl]?.fields || {})) row(k, val, pv[lvl].sources?.[k]);
  app.append(table);
  for (const w of data.warnings || []) app.append(el('p', 'w-warn', w));
  const go = button('w-btn w-btn--primary', 'File it', async () => {
    if (!toolInput) { say('Ask in the chat to file it.'); return; }
    go.disabled = true; go.textContent = 'Filing…';
    const { dry_run, ...args } = toolInput;
    try { const r = await callTool('ingest_item', args); draw(r.structuredContent, false); }
    catch (e) { go.disabled = false; go.textContent = 'File it'; say(e.message, true); }
  });
  app.append(go);
}

function trip(data) {
  const t = data.trip;
  const head = el('header', 'w-head');
  head.append(el('h2', 'w-title', t.name));
  const fs = fullscreen(); if (fs) head.append(fs);
  app.append(head);
  if (t.legs.length) app.append(el('p', 'w-kind', `${day(t.legs[0].from)} – ${day(t.legs[t.legs.length - 1].to)}`));
  const legs = el('ul', 'w-legs');
  for (const l of t.legs) {
    const li = el('li', 'w-leg'), w = l.weather?.summary;
    li.append(el('strong', null, l.place), el('span', null, `${day(l.from, { day: 'numeric', month: 'short' })} – ${day(l.to, { day: 'numeric', month: 'short' })}`));
    if (w) li.append(el('span', 'w-leg__wx', `${l.weather.kind === 'forecast' ? '' : 'typically '}${Math.round(w.hi)}° / ${Math.round(w.lo)}°, ${w.wet} wet day${w.wet === 1 ? '' : 's'}`));
    legs.append(li);
  }
  app.append(legs);
  if (t.days.length) {
    app.append(el('h3', 'w-sub', 'What you\'re wearing'));
    const days = el('ol', 'w-days');
    for (const d of t.days) {
      const li = el('li', 'w-day');
      const h = el('p', 'w-day__head'); h.append(el('strong', null, day(d.date)), ` ${d.place || ''}${d.weather ? ` · ${Math.round(d.weather.hi)}°/${Math.round(d.weather.lo)}°, ${d.weather.rain}% rain` : ''}`);
      li.append(h);
      if (d.occasion) li.append(el('p', 'w-day__occ', d.occasion));
      const fit = el('div', 'w-fit');
      for (const it of d.items) { const b = button('w-fit__item', null, () => open('get_item', { id: it.id }, data)); b.append(photo(it.hero_photo, (CATS[it.category] || it.name || '?')[0], 'w-fit__img'), el('span', null, it.name)); fit.append(b); }
      li.append(fit);
      if (d.note) li.append(el('p', 'w-day__note', d.note));
      days.append(li);
    }
    app.append(days);
  }
  if (t.packing.length) {
    const h = el('h3', 'w-sub'), count = el('span', 'w-count');
    const tally = () => { const n = t.packing.filter((p) => p.packed).length; count.textContent = `${n} of ${t.packing.length} packed`; };
    h.append('Packing ', count); tally();
    app.append(h);
    const ul = el('ul', 'w-pack');
    for (const p of t.packing) {
      const li = el('li'), label = el('label', 'w-pack__row'), box = el('input');
      box.type = 'checkbox'; box.checked = !!p.packed;
      box.addEventListener('change', async () => {
        const want = box.checked; box.disabled = true;
        try { await callTool('tick_packing', { trip_id: t.id, ...(p.item_id ? { item_id: p.item_id } : { label: p.label }), packed: want }); p.packed = want; tally(); }
        catch (e) { box.checked = !want; say(e.message, true); }
        box.disabled = false;
      });
      label.append(p.item_id ? photo(p.hero_photo, (p.name || '?')[0], 'w-pack__img') : el('span', 'w-pack__img'), el('span', 'w-pack__name', `${p.name}${p.qty > 1 ? ` ×${p.qty}` : ''}`), box);
      li.append(label); ul.append(li);
    }
    app.append(ul);
  }
}

// ---------- Looks: the host's variables where given, else the site's colours ----------
const style = el('style');
style.textContent = `
:root { color-scheme: light dark; --w-bg: var(--color-background-primary, #fbf8f3); --w-bg2: var(--color-background-secondary, #f1ece3); --w-ink: var(--color-text-primary, #1d1b18); --w-ink2: var(--color-text-secondary, #6b645a); --w-line: var(--color-border-primary, #e2dccf); --w-accent: var(--color-ring-primary, #c2471d); --w-warn-bg: var(--color-background-warning, #fbf1d9); --w-warn: var(--color-text-warning, #7a5300); --w-ok: var(--color-text-success, #1f7a45); --w-r: var(--border-radius-lg, 14px); font-family: var(--font-sans, system-ui, -apple-system, "Segoe UI", sans-serif); }
:root[data-theme="dark"] { --w-bg: var(--color-background-primary, #1b1d22); --w-bg2: var(--color-background-secondary, #262930); --w-ink: var(--color-text-primary, #f2efe8); --w-ink2: var(--color-text-secondary, #a9a49a); --w-line: var(--color-border-primary, #383b43); --w-warn-bg: var(--color-background-warning, #3a2f14); --w-warn: var(--color-text-warning, #f1c86b); }
* { box-sizing: border-box; }
html, body { margin: 0; background: transparent; color: var(--w-ink); font-size: 15px; line-height: 1.45; }
#app { padding: 14px; display: grid; gap: 12px; }
#app:empty { display: none; }
button { font: inherit; color: inherit; }
.w-head, .w-bar { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.w-title { margin: 0; font-size: 1.2rem; line-height: 1.25; }
.w-kicker { margin: 0; font-size: .75rem; letter-spacing: .06em; text-transform: uppercase; color: var(--w-accent); font-weight: 600; }
.w-kind, .w-note { margin: 0; color: var(--w-ink2); }
.w-note--bad { color: var(--color-text-danger, #b3261e); }
.w-link { min-height: 44px; padding: 0; border: 0; background: none; color: var(--w-accent); cursor: pointer; }
.w-more { justify-self: start; }
.w-btn { min-height: 44px; padding: 0 16px; border-radius: 999px; border: 1px solid var(--w-line); background: var(--w-bg); cursor: pointer; font-weight: 600; justify-self: start; }
.w-btn--primary { background: var(--w-accent); border-color: var(--w-accent); color: #fff; }
.w-btn:disabled { opacity: .6; cursor: progress; }
.w-grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 12px 10px; }
.w-card { display: grid; gap: 3px; width: 100%; padding: 0; border: 0; background: none; text-align: left; cursor: pointer; }
.w-photo, .w-hero__img, .w-thumb__img, .w-fit__img, .w-pack__img { display: grid; place-items: center; overflow: hidden; background: var(--w-bg2); color: var(--w-ink2); font-weight: 600; }
.w-photo { aspect-ratio: 1; border-radius: var(--w-r); font-size: 1.6rem; }
.w-photo img, .w-hero__img img, .w-thumb__img img, .w-fit__img img, .w-pack__img img { width: 100%; height: 100%; object-fit: contain; }
.w-photo img { padding: 8%; }
.w-card__name { font-weight: 600; font-size: .92rem; line-height: 1.25; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.w-card__meta { font-size: .8rem; color: var(--w-ink2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.w-card:focus-visible .w-photo, .w-thumb:focus-visible .w-thumb__img { outline: 2px solid var(--w-accent); outline-offset: 2px; }
.w-garment { display: grid; gap: 10px; }
.w-hero { margin: 0; display: grid; gap: 4px; }
.w-hero__img { aspect-ratio: 4 / 3; max-height: 340px; border-radius: var(--w-r); font-size: 2.4rem; }
.w-hero__img img { padding: 4%; }
.w-hero__cap { font-size: .8rem; color: var(--w-ink2); }
.w-thumbs { display: flex; gap: 8px; overflow-x: auto; }
.w-thumbs[hidden] { display: none; }
.w-thumb { flex: none; display: grid; gap: 3px; width: 72px; padding: 0; border: 0; background: none; cursor: pointer; text-align: left; }
.w-thumb__img { width: 72px; height: 72px; border-radius: 10px; border: 1px solid var(--w-line); }
.w-thumb[aria-pressed="true"] .w-thumb__img { outline: 2px solid var(--w-accent); outline-offset: 1px; }
.w-thumb__role { font-size: .72rem; color: var(--w-ink2); }
.w-roles { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.w-roles:empty { display: none; }
.w-label { font-size: .75rem; letter-spacing: .05em; text-transform: uppercase; color: var(--w-ink2); width: 100%; }
.w-seg { display: flex; flex-wrap: wrap; border: 1px solid var(--w-line); border-radius: 999px; overflow: hidden; }
.w-seg__b { min-height: 44px; padding: 0 12px; border: 0; background: none; cursor: pointer; font-size: .88rem; }
.w-seg__b + .w-seg__b { border-left: 1px solid var(--w-line); }
.w-seg__b[aria-pressed="true"] { background: var(--w-ink); color: var(--w-bg); font-weight: 600; }
.w-facts { display: grid; grid-template-columns: auto 1fr; gap: 4px 14px; margin: 0; }
.w-facts dt { color: var(--w-ink2); text-transform: capitalize; }
.w-facts dd { margin: 0; display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }
.w-src { font-size: .72rem; padding: 1px 7px; border-radius: 999px; background: var(--w-bg2); color: var(--w-ink2); }
.w-src--vision_inference, .w-src--derived { font-style: italic; }
.w-pills { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; }
.w-pill { font-size: .78rem; padding: 2px 9px; border-radius: 999px; background: var(--w-bg2); color: var(--w-ink2); }
.w-notes { margin: 0; white-space: pre-wrap; }
.w-sources summary { cursor: pointer; color: var(--w-accent); min-height: 44px; display: flex; align-items: center; }
.w-sources ul { margin: 0; padding-left: 18px; color: var(--w-ink2); font-size: .88rem; }
.w-levels { margin: 0; padding-left: 18px; }
.w-warn { margin: 0; padding: 8px 12px; border-radius: 10px; background: var(--w-warn-bg); color: var(--w-warn); font-size: .9rem; }
.w-banner { margin: 0; padding: 10px 12px; border-radius: 10px; background: var(--w-bg2); color: var(--w-ok); font-weight: 600; }
.w-sub { margin: 4px 0 0; font-size: 1rem; display: flex; justify-content: space-between; gap: 8px; }
.w-count { font-weight: 400; color: var(--w-ink2); font-size: .88rem; }
.w-legs { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.w-leg { display: flex; flex-wrap: wrap; gap: 4px 12px; padding: 10px 12px; border: 1px solid var(--w-line); border-radius: 12px; }
.w-leg__wx { color: var(--w-ink2); }
.w-days { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.w-day { display: grid; gap: 6px; padding: 10px 12px; border-left: 3px solid var(--w-accent); background: var(--w-bg2); border-radius: 0 12px 12px 0; }
.w-day p { margin: 0; }
.w-day__head { color: var(--w-ink2); }
.w-day__head strong { color: var(--w-ink); }
.w-day__occ { font-weight: 600; }
.w-day__note { color: var(--w-ink2); font-size: .9rem; }
.w-fit { display: flex; flex-wrap: wrap; gap: 8px; }
.w-fit__item { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 3px 12px 3px 3px; border: 1px solid var(--w-line); border-radius: 999px; background: var(--w-bg); cursor: pointer; font-size: .88rem; }
.w-fit__img { width: 38px; height: 38px; border-radius: 50%; font-size: .9rem; }
.w-pack { list-style: none; margin: 0; padding: 0; }
.w-pack__row { display: flex; align-items: center; gap: 12px; min-height: 56px; border-bottom: 1px solid var(--w-line); cursor: pointer; }
.w-pack__img { width: 40px; height: 40px; border-radius: 8px; flex: none; font-size: .9rem; }
.w-pack__name { flex: 1; }
.w-pack input { width: 26px; height: 26px; accent-color: var(--w-ok); }
`;
document.head.append(style);

// ---------- Start ----------
request('ui/initialize', { appInfo: { name: 'wardrobe-card', version: '1.0.0' }, appCapabilities: {}, protocolVersion: PROTOCOL })
  .then((r) => { context(r?.hostContext || {}); notify('ui/notifications/initialized', {}); })
  .catch(() => {});
