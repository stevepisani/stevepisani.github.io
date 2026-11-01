// Local rendered preflight for one design, before any customer card or paid job.
// node tools/planet-scene-review.mjs --design <json> --baseline <json> --out <dir>
// Optional --action <id> --seat <id> --extra hammock|birdbath. Inputs can remain outside the repo.
import {readFileSync,writeFileSync,mkdirSync,existsSync,statSync} from 'node:fs';
import {resolve,join,extname} from 'node:path';
import {createHash} from 'node:crypto';
import {rpc} from '../supabase/functions/planets/server.js';
import {chromium} from './chromium.mjs';
const arg=(key,fallback=null)=>{const i=process.argv.indexOf('--'+key);return i<0?fallback:process.argv[i+1];};
const design=JSON.parse(readFileSync(arg('design'),'utf8')),out=resolve(arg('out')),site=resolve(arg('site','_site'));
mkdirSync(out,{recursive:true});
const tool=async(name,spec)=>(await rpc({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:{spec}}},{})).result;
const prepared=await tool('prepare_planet',design);
if(prepared.isError)throw Error(prepared.content[0].text);
const final=prepared.structuredContent.spec;
const cases=[['after',final]];
if(arg('baseline'))cases.push(['before',JSON.parse(readFileSync(arg('baseline'),'utf8'))]);
const partsOnly=structuredClone(final);partsOnly.things.forEach(t=>{if(t.craft==='birch')delete t.craft;});
if(final.things.some(t=>t.craft==='birch'))cases.push(['primitive-trees',partsOnly]);
let edited;
if(arg('extra')){const next=structuredClone(design);next.scenes[0].extras=[arg('extra')];const p=await tool('prepare_planet',next);if(p.isError)throw Error(p.content[0].text);edited=p.structuredContent.spec;cases.push(['edit',edited]);}
const urls=new Map();
for(const [name,spec] of cases){const r=await tool('preview_planet',spec);if(r.isError)throw Error(r.content[0].text);urls.set(name,r.structuredContent.url.replace('/p/preview/#','/p/preview/?test=1#'));}
const hash=value=>createHash('sha256').update(value).digest('hex');
const report={designHash:hash(JSON.stringify(design)),specHash:hash(JSON.stringify(final)),rendererHash:hash(readFileSync(join(site,'assets/js/dist/planets.js'))),rendered:false,productionGate:false,aestheticAcceptance:'Pending owner review; this tool captures evidence and does not select an aesthetic winner.',paidJobs:0,externalRequestsAllowed:false,geometry:prepared.structuredContent.diagnostics,comparison:'Before/after opening views use each spec’s actual arrival. Fixed-camera images explicitly reuse the final arrival pose; they are QA observers, not first reveals.',originalObjectsPreserved:edited?final.things.every(t=>JSON.stringify(t)===JSON.stringify(edited.things.find(e=>e.id===t.id))):null,views:[]};
const types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.glb':'model/gltf-binary','.woff2':'font/woff2','.wasm':'application/wasm'};
const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
try {
for(const [device,viewport] of [['desktop',{width:1280,height:720}],['phone',{width:390,height:844}]]) {
  const context=await browser.newContext({viewport,hasTouch:device==='phone',isMobile:device==='phone',reducedMotion:'reduce'});
  await context.route(/.*/,r=>r.abort());
  await context.route('https://stevenpisani.com/**',r=>{let f=join(site,decodeURIComponent(new URL(r.request().url()).pathname));if(existsSync(f)&&statSync(f).isDirectory())f=join(f,'index.html');return existsSync(f)?r.fulfill({body:readFileSync(f),contentType:types[extname(f)]||'application/octet-stream'}):r.fulfill({status:404});});
  let pose;
  for(const [name] of cases) {
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error'&&!/ERR_FAILED|ERR_BLOCKED|Failed to load resource/.test(m.text()))errors.push(m.text());});
    const view={device,stage:name,errors};report.views.push(view);
    const shot=async suffix=>{const file=`${device}-${name}${suffix?'-'+suffix:''}.png`;await page.screenshot({path:join(out,file),timeout:120000});return file;};
    try {
      await page.goto(urls.get(name));await page.waitForFunction(()=>window.__planet?.ready,null,{timeout:90000});await page.locator('#veil').waitFor({state:'hidden'});
      view.arrival=await shot('arrival');report.rendered=true;
      view.opening=await page.evaluate(()=>{const w=window.__planet,f=w.opening();return {fits:f.fits,visible:f.visible,tappable:f.tappable,dir:f.dir.toArray(),target:f.target.toArray(),eye:w.player.eye,pitch:w.player.pitch,metrics:w.metrics(),realTrees:w.spec.things.filter(t=>t.craft==='birch').length};});
      if(name==='after')pose=view.opening;
      else {await page.evaluate(p=>{const w=window.__planet,V=w.camera.position.constructor;w.player.eye=p.eye;w.player.spawn(new V(...p.dir),new V(...p.target),p.pitch);w.player.applyToCamera(performance.now()/1000);w.camera.updateMatrixWorld(true);},pose);view.fixedCamera=await shot('fixed-camera');}
      if(name==='edit')view.additions=await page.evaluate(ids=>ids.map(id=>{
        const w=window.__planet,t=w.spec.things.find(t=>t.id===id),V=w.camera.position.constructor,B=t.hull.constructor,p=w.screenOf(id),points=[];
        t.root.traverse(o=>{if(o.isMesh)points.push(new B().setFromObject(o).getCenter(new V()));});
        const visible=points.some(p=>{const q=p.project(w.camera),x=(q.x+1)*innerWidth/2,y=(1-q.y)*innerHeight/2;return q.z<1&&Math.abs(q.x)<.95&&Math.abs(q.y)<.95&&w.pickAt(x,y)===id;});
        return{id,inView:!!p,visibleMeshTargetAtFixedCamera:visible};
      }),edited.things.filter(t=>!final.things.some(o=>o.id===t.id)).map(t=>t.id));
      if(view.additions?.some(t=>!view.opening.visible.includes(t.id)))throw Error('An addition has no visible mesh target in its actual arrival');
      if(name==='after')for(const [actionName,id] of [['action',arg('action')],['seat',arg('seat')]].filter(([,id])=>id)) {
        if(actionName==='seat') {
          await page.evaluate(id=>{const w=window.__planet,t=w.spec.things.find(t=>t.id===id),V=w.camera.position.constructor;w.player.face(t.root.localToWorld(new V(0,.6,0)),()=>{},{down:true});},id);
          await page.waitForFunction(()=>!window.__planet.player.facing,null,{timeout:10000});
        }
        const point=await page.evaluate(id=>{const w=window.__planet,t=w.spec.things.find(t=>t.id===id),V=w.camera.position.constructor,B=t.hull.constructor;w.camera.updateMatrixWorld(true);const points=[];t.root.traverse(o=>{if(o.isMesh)points.push(new B().setFromObject(o).getCenter(new V()));});for(const p of points){const q=p.project(w.camera),x=(q.x+1)*innerWidth/2,y=(1-q.y)*innerHeight/2;if(q.z<1&&Math.abs(q.x)<.95&&Math.abs(q.y)<.95&&w.pickAt(x,y)===id)return{x,y};}return null;},id);
        if(!point)throw Error('No visible action target: '+id);
        await page.mouse.click(point.x,point.y);
        await page.waitForFunction(id=>{const w=window.__planet,t=w.spec.things.find(t=>t.id===id);return !w.busy()&&(t.use==='greet'?!!t.greeting:t.use==='sit'?w.seated()===id:false);},id,{timeout:60000});
        view[actionName]={id,point,observer:actionName==='action'?'Real tap and walking from the opening; no observer staging.':'Turned in place toward the seat using the player controller, then real tap/walk; position never teleported.',image:await shot(actionName)};
        if(actionName==='seat'){await page.locator('#stand').click();await page.waitForFunction(()=>!window.__planet.busy());}
      }
      if(name==='after') {await page.evaluate(()=>{const w=window.__planet;w.player.stop();w.player.look(Math.PI,0);});view.reverse=await shot('reverse');}
      console.log(`${device} ${name}: rendered, fits ${view.opening.fits}${view.action?', action passed':''}`);
    }catch(e){view.error=e.message;console.log(`${device} ${name}: ${e.message}`);}
    await page.close();writeFileSync(join(out,'review.json'),JSON.stringify(report,null,2)+'\n');
  }
  if(final.things.some(t=>t.craft==='birch')) {
    const page=await context.newPage();await page.route('**/library/birch.glb',r=>r.fulfill({status:404}));
    await page.goto(urls.get('after'));await page.waitForFunction(()=>document.getElementById('planet')?.dataset.state==='failed',null,{timeout:30000});
    const failure=await page.evaluate(()=>({ready:!!window.__planet?.ready,message:document.getElementById('veil-status').textContent}));
    if(failure.ready||!/reload/i.test(failure.message))throw Error('Missing required assets must not reveal an unfinished scene');
    report.views.push({device,stage:'missing-required-asset',expectedFailure:failure,errors:[]});await page.close();
  }
  await context.close();
}
}finally{await browser.close();}
writeFileSync(join(out,'review.json'),JSON.stringify(report,null,2)+'\n');
if(report.views.some(v=>v.error||v.errors.length))throw Error('Rendered preflight failed; see review.json');
