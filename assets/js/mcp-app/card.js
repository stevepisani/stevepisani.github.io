// SJPJr's in-chat card (docs/apps.md, "The card"): what ChatGPT and Claude show under a tool's
// answer, in the sandboxed frame the MCP Apps standard (SEP-1865) gives it. This file is the shell
// every area shares: the bridge to the host, the parts, the way between views, and the common
// look. Each area's views (and their styles) are a file in views/, which adds them to `views` by
// the name a result's structuredContent.view gives; widget.js loads them all.
// Two levels, as both hosts' guidelines ask: inline, a glance with at most two actions; the
// detail opens full screen. The model does the talking, so a view has no counts or prose it would
// say anyway, and facts carry their source only where they were guessed.
// It talks to the host with the standard's JSON-RPC over postMessage: ui/initialize, then the
// tool's input and result arrive as notifications, and tools/call runs a tool (as Steve) from a
// tap. A few lines here rather than the 445 KB SDK; tools/smoke.mjs drives this against the
// SDK's own host side (AppBridge). Styled with the host's variables where it gives them.
const PROTOCOL = '2026-01-26';
export const app = document.getElementById('app');

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
export let host = {}, toolInput = null, ui = {};
let root = null, current = null, stack = [];
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
export const callTool = async (name, args) => {
  const r = await request('tools/call', { name, arguments: args });
  if (r?.isError) throw new Error(r.content?.[0]?.text || "That didn't work.");
  return hydrate(r);
};
// what Steve is looking at, so "what goes with this?" in the chat knows
export const tell = (text) => request('ui/update-model-context', { content: [{ type: 'text', text }] }).catch(() => {});
export const full = () => host.displayMode === 'fullscreen';
export async function goFull() {
  if (full()) return true;
  if (!(host.availableDisplayModes || []).includes('fullscreen')) return false;
  try { const r = await request('ui/request-display-mode', { mode: 'fullscreen' }); host.displayMode = r?.mode || host.displayMode; } catch (e) { /* stays inline */ }
  return full();
}
// tell the host how tall the card is, as it changes
new ResizeObserver(() => notify('ui/notifications/size-changed', { height: Math.ceil(document.documentElement.getBoundingClientRect().height) })).observe(document.documentElement);

// ---------- Parts ----------
export const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
export const button = (cls, text, onclick) => { const b = el('button', cls, text); b.type = 'button'; b.addEventListener('click', onclick); return b; };
export const CATS = { tops: 'Tops', bottoms: 'Bottoms', outerwear: 'Outerwear', suits: 'Suits', shoes: 'Shoes', accessories: 'Accessories', workout: 'Workout', swim: 'Swim' };
export const ROLES = { garment: 'Garment', tag: 'Tag', care_label: 'Care label', detail: 'Detail', other: 'Other' };
export const BADGE = { tag: 'Tag', care_label: 'Care', detail: 'Detail', other: '?' };
export const SOURCE = { user: 'you said', garment_label: 'garment label', hang_tag: 'hang tag', care_label: 'care label', retailer_page: 'shop page', manufacturer_page: "maker's page", vision_inference: 'from the photo', derived: 'worked out' };
export const words = (s) => (s ? String(s).replace(/_/g, ' ') : '');
export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
export const plain = (c) => (c ? String(c).replace(/^\s*\d+\s+/, '') : ''); // "38 Dark Brown" → "Dark Brown"
export const guessed = (s) => s && (s.source === 'vision_inference' || s.source === 'derived' || (s.confidence != null && s.confidence < 0.8));
export const money = (n, cur) => { try { return Number(n).toLocaleString(host.locale, { style: 'currency', currency: cur || 'USD', maximumFractionDigits: n % 1 ? 2 : 0 }); } catch (e) { return `${n} ${cur || ''}`; } };
export const day = (d, opts = { weekday: 'short', day: 'numeric', month: 'short' }) => new Date(`${d}T12:00:00`).toLocaleDateString(host.locale, opts);
export const span = (a, b) => { const m = { month: 'short' }; const A = new Date(`${a}T12:00:00`), B = new Date(`${b}T12:00:00`); return A.getMonth() === B.getMonth() ? `${day(a, { ...m, day: 'numeric' })}–${B.getDate()}` : `${day(a, { ...m, day: 'numeric' })} – ${day(b, { ...m, day: 'numeric' })}`; };
// a photo, or for a garment with none, a tile in its colour with what it is
export function photo(url, it, cls = 'w-photo') {
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
export function say(text, bad = false) { const p = el('p', bad ? 'w-note w-note--bad' : 'w-note', text); app.prepend(p); return p; }
export function back() {
  if (!stack.length) return null;
  return button('w-link w-back', '‹ Back', () => draw(stack.pop(), false));
}
// open a garment: full screen where the host has it (no drilling down inside the chat), else here
export async function openItem(id, from) {
  await goFull();
  try {
    const r = await callTool('get_item', { id });
    if (from) stack.push(from);
    draw(r, false);
    tell(`Steve opened ${r.item?.name || 'a garment'} (item ${id}) in the card.`);
  } catch (e) { say(e.message, true); }
}

// ---------- Views ----------
function show(result) {
  if (result?.isError || !result?.structuredContent) { app.textContent = ''; return; } // the text answer says it
  start(hydrate(result));
}
export function start(data) { root = data; stack = []; ui = {}; draw(data, false); }
export function draw(data, keep = true) {
  if (keep && current) stack.push(current);
  current = data;
  app.textContent = '';
  document.documentElement.classList.toggle('is-full', full());
  (views[data?.view] || (() => {}))(data);
}

// ---------- The views, by name (views/*.js add theirs) ----------
export const views = {};

// ---------- Looks: the host's variables where given, else the site's colours. Three sizes
// (title, body, caption), two weights. A view file adds its own with css(). ----------
export const css = (text) => { const s = el('style'); s.textContent = text; document.head.append(s); };
css(`
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
.w-seg { display: flex; flex-wrap: wrap; border: 1px solid var(--w-line); border-radius: 999px; overflow: hidden; }
.w-seg__b { flex: 1 0 auto; min-height: 44px; padding: 0 12px; border: 0; background: none; cursor: pointer; font-size: var(--w-c); }
.w-seg__b + .w-seg__b { border-left: 1px solid var(--w-line); }
.w-seg__b[aria-pressed="true"] { background: var(--w-ink); color: var(--w-bg); font-weight: 600; }
.w-more-details summary { cursor: pointer; color: var(--w-accent); min-height: 44px; display: flex; align-items: center; }
.w-warn { font-size: var(--w-c); color: var(--w-warn); }
`);

// ---------- Start ----------
request('ui/initialize', { appInfo: { name: 'sjpjr-card', version: '2.0.0' }, appCapabilities: {}, protocolVersion: PROTOCOL })
  .then((r) => { context(r?.hostContext || {}); notify('ui/notifications/initialized', {}); })
  .catch(() => {});
