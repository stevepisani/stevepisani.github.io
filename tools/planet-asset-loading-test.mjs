import assert from 'node:assert/strict';
import { Group } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadModels, loadSceneAssets } from '../assets/js/planets/models.js';
import { createAssetLoadSession, ASSET_LOAD_POLICY, assetFailureDetail } from '../assets/js/planets/asset-loading.js';

const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function clock() {
  let now=0,id=0;const tasks=new Map();
  return {setTimeout:(fn,ms)=>{const key=++id;tasks.set(key,{at:now+ms,fn});return key;},clearTimeout:key=>tasks.delete(key),
    advance:async ms=>{const end=now+ms;await flush();while(true){const due=[...tasks].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;now=due[1].at;tasks.delete(due[0]);due[1].fn();await flush();}now=end;await flush();},pending:()=>tasks.size};
}
function streamed(c, chunks, {stuck=false}={}) {
  let at=0,cancelled=false;
  return {ok:true,status:200,body:{getReader:()=>({
    read:()=>new Promise(resolve=>{const item=chunks[at++];if(item)c.setTimeout(()=>resolve({value:new Uint8Array(item.bytes),done:false}),item.delay);else if(!stuck)resolve({done:true});}),
    cancel:()=>{cancelled=true;return Promise.resolve();},releaseLock:()=>{},
  })},cancelled:()=>cancelled};
}
const result=p=>p.then(value=>({value}),error=>({error}));
{
  const c=clock();let requests=0;const s=createAssetLoadSession({clock:c,fetcher:async()=>{requests++;return streamed(c,Array.from({length:5},()=>({delay:4000,bytes:20})));}});
  const p=result(s.load('https://example.invalid/slow.glb',bytes=>bytes.byteLength));await c.advance(20001);assert.equal((await p).value,100);assert.equal(requests,1);s.close();assert.equal(c.pending(),0,'progress watchdog is cleaned after success');
}
{
  const c=clock();let requests=0;const s=createAssetLoadSession({clock:c,fetcher:async()=>{requests++;return requests===1?new Promise(()=>{}):streamed(c,[{delay:0,bytes:4}]);}});
  const p=result(s.load('/retry.glb',bytes=>bytes.byteLength));await c.advance(8001);assert.equal((await p).value,4);assert.equal(requests,2,'a stalled header receives exactly one fresh attempt');s.close();assert.equal(c.pending(),0);
}
{
  const c=clock();let requests=0,aborts=0;const s=createAssetLoadSession({clock:c,fetcher:async(_url,{signal})=>{requests++;signal.addEventListener('abort',()=>aborts++);return streamed(c,[{delay:0,bytes:9}],{stuck:true});}});
  const p=result(s.load('https://example.invalid/model.glb?private=discarded',()=>assert.fail('stalled model must not decode')));await c.advance(12001);const e=(await p).error;assert.equal(e.code,'asset-stalled');assert.equal(e.detail.phase,'body');assert.equal(e.detail.attempt,2);assert.equal(e.detail.bytes,9);assert.equal(requests,2);assert.equal(aborts,2);assert(!assetFailureDetail(e).includes('private'));s.close();assert.equal(c.pending(),0);
}
{
  const c=clock();const s=createAssetLoadSession({clock:c,fetcher:async()=>streamed(c,Array.from({length:100},()=>({delay:1000,bytes:1})))});
  const p=result(s.load('/forever.glb',()=>assert.fail('endless progress must remain bounded')));await c.advance(45001);assert.equal((await p).error.code,'asset-budget-exceeded');s.close();
}
{
  const c=clock();let finish,decoded=0;const s=createAssetLoadSession({clock:c,fetcher:async()=>streamed(c,[{delay:0,bytes:1}])});
  const p=result(s.load('/decode.glb',()=>new Promise(resolve=>{finish=()=>{decoded++;resolve('late');};})));await c.advance(10001);assert.equal((await p).error.code,'asset-decode-timeout');finish();await flush();assert.equal(decoded,1);assert.equal(s.signal.aborted,true);s.close();
}
{
  const c=clock();let requests=0;const s=createAssetLoadSession({clock:c,fetcher:async()=>{requests++;return {ok:false,status:404};}});
  const p=result(s.load('/missing.glb',()=>{}));await c.advance(1);assert.equal((await p).error.code,'asset-http-error');assert.equal(requests,1,'a missing asset is not hidden by repeated retries');s.close();
}
{
  const c=clock();let parses=0,requests=0;const s=createAssetLoadSession({clock:c,fetcher:async()=>{requests++;return streamed(c,[{delay:0,bytes:1}]);}});
  const parse=()=>{parses++;return {};};const a=s.load('/shared.glb',parse),b=s.load('/shared.glb',parse);await c.advance(1);assert.equal(await a,await b);assert.equal(requests,1);assert.equal(parses,1);s.close();
}
{
  const c=clock();let requests=0;const s=createAssetLoadSession({clock:c,fetcher:async()=>++requests===1?{ok:false,status:503}:streamed(c,[{delay:0,bytes:2}])});
  const p=result(s.load('/temporary.glb',bytes=>bytes.byteLength));await c.advance(1);assert.equal((await p).value,2);assert.equal(requests,2);s.close();
}
{
  const c=clock();let requests=0;const s=createAssetLoadSession({clock:c,fetcher:async()=>{requests++;return streamed(c,[{delay:0,bytes:2}]);}});
  const p=result(s.load('/corrupt.glb',()=>{throw Error('bad binary');}));await c.advance(1);const e=(await p).error;assert.equal(e.code,'asset-decode-error');assert.equal(e.detail.bytes,2);assert.equal(requests,1,'a corrupt accepted file is retained as a decode failure, not retried');s.close();
}
// Exercise the real model batch's transaction and shared scene/model budget. Only GLB
// parsing is substituted; session scheduling, download failure and swaps are real production code.
{
  const original=GLTFLoader.prototype.parseAsync;GLTFLoader.prototype.parseAsync=async()=>({scene:new Group()});
  try {
    const c=clock();let swaps=0,requests=0;
    const s=createAssetLoadSession({clock:c,fetcher:async url=>{requests++;return String(url).includes('side-table')?{ok:false,status:404}:streamed(c,[{delay:0,bytes:3}]);}});
    const p=result(loadModels({things:[{id:'chair',stock:'reading-chair'},{id:'table',stock:'side-table'}]},{swap:()=>swaps++},s));
    await c.advance(1);assert.equal((await p).error.code,'asset-http-error');assert.equal(swaps,0,'one failed required model prevents all initial swaps');s.close();
    const d=clock();let active=0,peak=0;const session=createAssetLoadSession({clock:d,fetcher:async()=>{active++;peak=Math.max(peak,active);const res=streamed(d,[{delay:1000,bytes:1}]);const reader=res.body.getReader();const read=reader.read;reader.read=async()=>{const r=await read();if(r.done)active--;return r;};res.body.getReader=()=>reader;return res;}});
    let instances=[];const success=result(loadModels({things:Array.from({length:5},(_,i)=>({id:'chair-'+i,stock:'reading-chair'}))},{swap:(_t,model)=>instances.push(model)},session));
    await d.advance(1001);assert.equal((await success).value,5);assert.equal(peak,1,'repeated stock shares a download');assert.equal(new Set(instances).size,5,'each placement receives an independent clone');session.close();
    const q=clock();const shared=createAssetLoadSession({clock:q,fetcher:async()=>streamed(q,Array.from({length:5},()=>({delay:4000,bytes:1})))});
    const tree=result(loadSceneAssets({things:[{craft:'birch'}]},shared));await q.advance(20000);assert((await tree).value.has('birch'));
    const model=result(loadModels({things:[{id:'chair',stock:'reading-chair'}]},{swap:()=>{}},shared));await q.advance(20000);assert.equal((await model).value,1,'tree and model may make steady progress within the one reveal budget');shared.close();
    const b=clock();const budget=createAssetLoadSession({clock:b,fetcher:async()=>streamed(b,Array.from({length:10},()=>({delay:4000,bytes:1})))});
    const first=result(loadSceneAssets({things:[{craft:'birch'}]},budget));await b.advance(40000);assert((await first).value.has('birch'));
    let committed=0;const queued=result(loadModels({things:[{id:'chair',stock:'reading-chair'}]},{swap:()=>committed++},budget));await b.advance(5001);assert.equal((await queued).error.code,'asset-budget-exceeded');assert.equal(committed,0,'a later phase cannot reset the total reveal budget');budget.close();

  } finally {GLTFLoader.prototype.parseAsync=original;}
}
assert(ASSET_LOAD_POLICY.totalMs<60000,'the shared session leaves time inside the host loading budget');
console.log('Planet asset loading: progressing cold transfers, bounded retry/stall/decode/total, redaction and source reuse pass');
