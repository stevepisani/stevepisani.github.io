// Real 3D models for someone's things (My Tiny Planet, docs/planets.md). A thing described in
// words (`model` in its spec) gets a model made from them by Meshy (tools/planet-models.mjs, run
// by the Planet models workflow) into assets/models/planets/, listed in its manifest.json under
// "<slug>/<thing id>" with the words it was made from. Once it's here it takes the place of the
// thing's simple shapes, which show until then, and still do if the words have changed since.
// A stock thing (stock in its spec) gets the stock model, made once for every planet
// ("stock/<name>", from the words in STOCK). A thing whose words have no model here yet may have one
// being made while the chat waits (supabase/functions/planets/models.js, started by its preview):
// the planet asks the connector how those are coming, every few seconds while it's open, and swaps
// each in when it's made.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { STOCK } from '../../../supabase/functions/_shared/planet.js';
import { modelKey, MODELS_URL } from '../../../supabase/functions/_shared/planet-models.js';

const BASE = new URL('../../models/planets/', import.meta.url);

// how often to ask about models being made, and for how long (they take about 3 to 5 minutes)
const ASK_EVERY = 10_000, ASK_FOR = 12 * 60_000;

/**
 * Loads the models made for this planet's things and swaps each in (things.swap); resolves to how
 * many, once those already made are in. Those still being made come in later, as they're made.
 */
export async function loadModels(spec, things) {
  const wanted = (spec.things || []).filter((t) => t.model || t.stock);
  if (!wanted.length) return 0;
  let made = {};
  try { made = await (await fetch(new URL('manifest.json', BASE))).json(); } catch { /* none here: maybe some are being made */ }
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const swap = async (t, url) => {
    try { things.swap(t, (await loader.loadAsync(url)).scene); return true; } catch (e) { console.warn(`${t.id}: its model didn't load`, e); return false; }
  };
  let n = 0;
  const later = [];
  // one at a time, so the walk keeps drawing between them (each is parsed on the main thread)
  for (const t of wanted) {
    const [key, words] = t.stock ? [`stock/${t.stock}`, STOCK[t.stock].model] : [`${spec.slug}/${t.id}`, t.model];
    const m = made[key];
    if (m && m.model === words) { if (await swap(t, new URL(m.file, BASE).href)) n++; }
    else if (!t.stock) later.push(t);
  }
  if (later.length) whileMade(later, swap);
  return n;
}

// the models being made while the chat waits: asked after until each is in, has failed, or it's
// been long enough
async function whileMade(list, swap) {
  const keys = new Map();
  for (const t of list) keys.set(t, await modelKey(t.model));
  const until = Date.now() + ASK_FOR;
  while (keys.size && Date.now() < until) {
    if (!document.hidden) {
      let now = null;
      try {
        const res = await fetch(`${MODELS_URL}?models=${[...new Set(keys.values())].join(',')}`);
        if (res.ok) now = await res.json();
      } catch { /* offline for a moment */ }
      // a failed ask is tried again next time; an answer that knows none of them (a planet from an
      // old link, or the cap) means nothing will come
      if (now && ![...keys.values()].some((k) => now[k])) return;
      if (now) for (const [t, k] of [...keys]) {
        if (now[k]?.status === 'failed') keys.delete(t);
        else if (now[k]?.status === 'done') { keys.delete(t); await swap(t, now[k].url); }
      }
    }
    if (keys.size) await new Promise((r) => setTimeout(r, ASK_EVERY));
  }
}
