// Controlled cold-network proof with real accepted files, entirely offline. No source/spec edits,
// model generation or sends. This complements deterministic timing tests with streaming fetch.
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,existsSync,statSync,mkdirSync} from 'node:fs';
import {resolve,join,extname} from 'node:path';
import {chromium} from './chromium.mjs';
import {rpc} from '../supabase/functions/planets/server.js';
import {packPlanet} from '../supabase/functions/_shared/planet.js';
import {ASSET_LOAD_POLICY} from '../assets/js/planets/asset-loading.js';
const arg=(key,otherwise)=>{const i=process.argv.indexOf(key);return i<0?otherwise:process.argv[i+1];};
const site=resolve(arg('--site','_site')),out=resolve(arg('--out','/private/tmp/planet-loading-review'));
mkdirSync(out,{recursive:true});
const fixture=JSON.parse(readFileSync(new URL('./fixtures/planet-ready-models.json',import.meta.url)));
const result=(await rpc({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'prepare_planet',arguments:{spec:fixture}}},{})).result;
if(result.isError)throw Error(result.content[0].text);
const packed=await packPlanet(result.structuredContent.spec);
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.wasm':'application/wasm'};
let mode='progress',requests=[],responses=new Set(),timers=new Set();
const report={policy:ASSET_LOAD_POLICY,offline:true,paidJobs:0,sends:0,fixture:'tools/fixtures/planet-ready-models.json',cases:[]};
const server=createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;let file=join(site,decodeURIComponent(pathname));
 if(!resolve(file).startsWith(site+'/')){res.writeHead(403);return res.end();}
 if(existsSync(file)&&statSync(file).isDirectory())file=join(file,'index.html');
 if(!existsSync(file)){res.writeHead(404);return res.end();}
 const bytes=readFileSync(file),isModel=pathname.includes('/models/planets/stock/')&&pathname.endsWith('.glb');
 if(!isModel){res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream'});return res.end(bytes);}
 const entry={pathname,attempt:requests.filter(r=>r.pathname===pathname).length+1,startedAt:Date.now(),bytes:0};requests.push(entry);responses.add(res);res.on('close',()=>{entry.closedAt=Date.now();responses.delete(res);});
 res.writeHead(200,{'content-type':'model/gltf-binary','content-length':bytes.byteLength,'cache-control':'no-store'});res.flushHeaders();
 const stuck=mode==='stall'||mode==='retry'&&entry.attempt===1;
 if(stuck){res.write(bytes.subarray(0,1));entry.bytes=1;return;}
 if(mode==='progress'){
  let at=0;const timer=setInterval(()=>{const end=Math.min(bytes.length,at+Math.ceil(bytes.length/10));res.write(bytes.subarray(at,end));entry.bytes+=end-at;at=end;if(at===bytes.length){clearInterval(timer);timers.delete(timer);entry.finishedAt=Date.now();res.end();}},2000);timers.add(timer);res.on('close',()=>{clearInterval(timer);timers.delete(timer);});
 }else{entry.bytes=bytes.length;entry.finishedAt=Date.now();res.end(bytes);}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
try{
 for(mode of ['progress','retry','stall']){
  requests=[];const context=await browser.newContext({viewport:{width:700,height:440},reducedMotion:'reduce'}),page=await context.newPage(),record={mode,errors:[],warnings:[],requests};report.cases.push(record);
  await context.route(/.*/,route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  page.on('pageerror',e=>record.errors.push(e.message));page.on('console',m=>{if(m.type()==='warning')record.warnings.push(m.text());});
  await page.goto(origin+'/p/preview/?test=1#'+packed);const began=Date.now();
  await page.waitForFunction(()=>window.__planet?.ready||document.getElementById('planet').dataset.state==='failed',null,{timeout:60000});
  record.elapsedMs=Date.now()-began;record.ready=await page.evaluate(()=>!!window.__planet?.ready);record.status=await page.locator('#veil-status').textContent();
  await page.screenshot({path:join(out,mode+'.png'),timeout:120000});
  if(mode==='progress'){
   if(!record.ready||!requests.every(r=>r.finishedAt-r.startedAt>15000))throw Error('A genuinely progressing >15s cold download failed');
  }else if(mode==='retry'){
   if(!record.ready||!requests.some(r=>r.attempt===2))throw Error('A stalled first attempt did not recover');
  }else{
   if(record.ready||!record.warnings.some(w=>/asset-stalled; phase=body/.test(w))||requests.some(r=>r.attempt>2))throw Error('A permanently stalled transfer did not fail with a bounded retained cause');
   for(const response of responses)response.end();await page.waitForTimeout(300);if(await page.evaluate(()=>!!window.__planet?.ready))throw Error('Late body completion revived a failed reveal');
  }
  if(record.errors.length)throw Error('Page errors: '+record.errors.join(','));
  writeFileSync(join(out,'review.json'),JSON.stringify(report,null,2)+'\n');await context.close();
  console.log(`${mode}: ready=${record.ready}; ${record.elapsedMs}ms; ${requests.length} source attempts`);
 }
}finally{
 for(const timer of timers)clearInterval(timer);for(const response of responses)response.destroy();await browser.close();await new Promise(r=>server.close(r));writeFileSync(join(out,'review.json'),JSON.stringify(report,null,2)+'\n');
}
