// Real 3D models for someone's things (My Tiny Planet, docs/planets.md). A thing described in
// words (`model` in its spec) gets a model made from them by Meshy (tools/planet-models.mjs, run
// by the Planet models workflow) into assets/models/planets/, listed in its manifest.json under
// "<slug>/<thing id>" with the words it was made from. Once it's here it takes the place of the
// thing's simple shapes. Available matching models load before the first reveal; shapes remain
// for models still being made, or whose words have changed since.
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
const loader = () => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

import { createAssetLoadSession, AssetLoadError } from './asset-loading.js';

// Accepted library assets share the first-reveal budget with all other required models.
export async function loadSceneAssets(spec, session) {
  const own=!session;session ||= createAssetLoadSession();
  const library=new Map();
  try {
    if((spec.things||[]).some(t=>t.craft==='birch')) {
      const url=new URL('library/birch.glb',BASE);
      const tree=await session.load(url,async bytes=>(await loader().parseAsync(bytes,BASE.href)).scene);
      session.check();tree.traverse(o=>{if(o.isMesh)o.castShadow=o.receiveShadow=true;});library.set('birch',tree);
    }
    return library;
  } catch(error){session.abort(error);throw error;}
  finally {if(own)session.close();}
}

// how often to ask about models being made, and for how long (they take about 3 to 5 minutes)
const ASK_EVERY = 10_000, ASK_FOR = 12 * 60_000;

/** Load each required source once, at most three at a time. No model is swapped until
 * the entire batch is ready, so a failed/retried download cannot leave a partial reveal. */
export async function loadModels(spec, things, session) {
  const wanted=(spec.things||[]).filter(t=>t.model||t.stock);
  if(!wanted.length)return 0;
  const own=!session;session ||= createAssetLoadSession();
  const gltf=loader(),later=[],ready=[],loaded=[];
  const swap=async(t,url)=>{
    try{things.swap(t,(await gltf.loadAsync(url)).scene);return true;}
    catch(e){console.warn(`${t.id}: its model didn't load`,e);return false;}
  };
  try {
    const made=wanted.some(t=>!t.stock||STOCK[t.stock].model)?await session.json(new URL('manifest.json',BASE)):{};
    for(const t of wanted) {
      if(t.stock&&STOCK[t.stock].file){ready.push({t,url:new URL(STOCK[t.stock].file,BASE).href});continue;}
      const [key,words]=t.stock?[`stock/${t.stock}`,STOCK[t.stock].model]:[`${spec.slug}/${t.id}`,t.model];
      const m=made[key];
      if(m&&m.model===words)ready.push({t,url:new URL(m.file,BASE).href});
      else if(!t.stock)later.push(t);
      else throw new AssetLoadError('asset-missing',{phase:'manifest',resource:`stock/${t.stock}`});
    }
    let next=0;
    await Promise.all(Array.from({length:Math.min(3,ready.length)},async()=>{
      while(next<ready.length) {
        const entry=ready[next++];
        const source=await session.load(entry.url,async bytes=>(await gltf.parseAsync(bytes,new URL('.',entry.url).href)).scene);
        session.check();loaded.push({t:entry.t,model:source.clone(true)});
      }
    }));
    session.check();for(const {t,model} of loaded)things.swap(t,model);
  } catch(error){session.abort(error);throw error;}
  finally {if(own)session.close();}
  if(later.length)whileMade(later,swap);
  return ready.length;
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
