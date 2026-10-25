// The planet's spec, as the world reads it (supabase/functions/_shared/planet.js says what's in one).
// On the homepage it's Steve's, written into the page by Jekyll (_data/planet.json). On the
// preview page (/p/preview/, docs/planets.md) it's someone else's, packed into the address by the
// Planets connector: unpacked and checked here before anything draws, then the page's own text
// (top bar, menu, the launch screen's sign) is filled in from it, as Jekyll does for Steve's.
import { checkPlanet, unpackPlanet } from '../../../supabase/functions/_shared/planet.js';
export { planetParts, planetHas } from '../../../supabase/functions/_shared/planet.js'; // what the places show, and what's on the planet

const KEPT = 'planet-preview'; // the last good preview in this tab, for a reload after the # has moved on

/** { spec } to draw, or { errors } saying why there's nothing to. */
export async function readSpec(root, data) {
  if (!('preview' in root.dataset)) return { spec: data.spec };
  let packed = location.hash.slice(1), spec = await unpackPlanet(packed);
  if (!spec) {
    try { packed = sessionStorage.getItem(KEPT) || ''; } catch (e) { packed = ''; }
    spec = await unpackPlanet(packed);
  }
  if (!spec) return { errors: ['There’s no planet in this address. Ask your ChatGPT or Claude for a new preview link.'] };
  const errors = checkPlanet(spec);
  if (errors.length) return { errors };
  try { sessionStorage.setItem(KEPT, packed); } catch (e) { /* private mode: a reload needs the link again */ }
  return { spec };
}

// a link as the menu shows it: a site path only means something on Steve's site, so in a preview
// it's shown without going anywhere (an <a> with no href)
const link = (l, menu) => {
  const outside = /^(https:|mailto:)/.test(l.href);
  const a = document.createElement('a');
  a.dataset.order = l.id;
  if (outside) { a.href = l.href; a.target = '_blank'; a.rel = 'noopener'; }
  if (!menu) { a.textContent = l.label; return a; }
  const label = Object.assign(document.createElement('span'), { className: 'menu__label', textContent: l.label });
  if (outside) label.append(Object.assign(document.createElement('span'), { className: 'menu__ext', title: 'Opens in a new tab', textContent: ' ↗' }));
  a.append(label, Object.assign(document.createElement('span'), { className: 'menu__note', textContent: l.note || '' }));
  return a;
};

/** The page's own text from the spec, for a preview (Jekyll writes Steve's into the homepage). */
export function fillPage(spec, parts) {
  const $ = (id) => document.getElementById(id);
  document.title = `${parts.sign}: a tiny planet`;
  const bar = parts.has.includes('tiki-bar');
  $('world-canvas').setAttribute('aria-label', `${parts.sign}: ${bar ? 'a tiki bar on ' : ''}a tiny planet. Click or tap to walk, drag to look around. Everything here is also in the Menu.`);
  $('topbar-name').textContent = spec.who.name;
  $('topbar-line').textContent = spec.look && spec.look.home ? `A tiny planet in ${spec.look.home}` : 'A tiny planet';
  const links = spec.links || [];
  document.querySelector('.topbar__nav').replaceChildren(...links.map((l) => link(l, false)));
  document.querySelector('.menu__list').replaceChildren(...links.map((l) => { const li = document.createElement('li'); li.append(link(l, true)); return li; }));
  document.querySelector('.menu__bar').textContent = parts.sign;
  $('eyepiece-mag').textContent = parts.engraving;
  // (the launch screen paints Steve's sign only on his own planet: a preview's has none)
}

/** Tells the chat's card (assets/js/mcp-app/views/planet.js), if this page is in one, how it went. */
export function tellCard(what, detail) {
  if (window.parent !== window) window.parent.postMessage({ planet: what, detail }, '*');
}
