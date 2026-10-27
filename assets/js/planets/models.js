// Real 3D models for someone's things (My Tiny Planet, docs/planets.md). A thing described in
// words (`model` in its spec) gets a model made from them by Meshy (tools/planet-models.mjs, run
// by the Planet models workflow) into assets/models/planets/, listed in its manifest.json under
// "<slug>/<thing id>" with the words it was made from. Once it's here it takes the place of the
// thing's simple shapes, which show until then, and still do if the words have changed since.
// A stock thing (stock in its spec) gets the stock model, made once for every planet
// ("stock/<name>", from the words in STOCK).
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { STOCK } from '../../../supabase/functions/_shared/planet.js';

const BASE = new URL('../../models/planets/', import.meta.url);

/** Loads the models made for this planet's things and swaps each in (things.swap); resolves to how many. */
export async function loadModels(spec, things) {
  const wanted = (spec.things || []).filter((t) => t.model || t.stock);
  if (!wanted.length) return 0;
  let made;
  try { made = await (await fetch(new URL('manifest.json', BASE))).json(); } catch { return 0; }
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  let n = 0;
  // one at a time, so the walk keeps drawing between them (each is parsed on the main thread)
  for (const t of wanted) {
    const [key, words] = t.stock ? [`stock/${t.stock}`, STOCK[t.stock].model] : [`${spec.slug}/${t.id}`, t.model];
    const m = made[key];
    if (!m || m.model !== words) continue;
    try {
      things.swap(t, (await loader.loadAsync(new URL(m.file, BASE).href)).scene);
      n++;
    } catch (e) { console.warn(`${t.id}: its model didn't load`, e); }
  }
  return n;
}
