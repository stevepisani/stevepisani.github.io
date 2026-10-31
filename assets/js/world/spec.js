// A planet's spec, as a page reads it (supabase/functions/_shared/planet.js says what's in one).
// On the homepage it's Steve's, written into the page by Jekyll (_data/planet.json). On the
// preview page (/p/preview/, docs/planets.md) it's someone else's, packed into the address by the
// Planets connector, and unpacked and checked here before anything draws; a friend's planet
// (assets/js/planets/) reads it the same way.
import { checkPlanet, unpackPlanet, composePlanet } from '../../../supabase/functions/_shared/planet.js';
export { planetParts } from '../../../supabase/functions/_shared/planet.js'; // what Steve's places show

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
  return { spec: composePlanet(spec) };
}

/** Tells the chat's card (assets/js/mcp-app/views/planet.js), if this page is in one, how it went. */
export function tellCard(what, detail) {
  if (window.parent !== window) window.parent.postMessage({ planet: what, detail }, '*');
}
