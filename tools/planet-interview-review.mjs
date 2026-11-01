// Visual development review, called only by planet-live --interviews. No model generation,
// live APIs, contact, or send tool. These frozen agent-authored cases are not unseen evals.
import {readFileSync,writeFileSync,existsSync,statSync,mkdirSync} from 'node:fs';
import {join,extname} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from './chromium.mjs';

const types={'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.wasm':'application/wasm','.glb':'model/gltf-binary'};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function reviewInterviews({tool,site,shots,phase, arrivalsOnly=false, onlyCases=null}) {
  const fixture=JSON.parse(readFileSync(new URL('./fixtures/planet-interviews.json',import.meta.url),'utf8'));
  const report={phase,capturedStages:arrivalsOnly?['arrival']:['arrival','action','edit'],purpose:fixture.purpose,fixtureHash:hash(fixture),rendererHash:createHash('sha256').update(readFileSync(join(site,'assets/js/dist/planets.js'))).digest('hex'),screenshots:'actual local engine; software Chromium, not physical-device performance',requestedButUnsupported:[...(phase==='baseline'?['Daylight and dusk are not supported in this baseline']:[]),'Rain animation and weather audio','Riding the bicycle','Animated dog greeting','Baking and music performance'],cases:[]};
  mkdirSync(shots,{recursive:true});
  const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  try { for(const c of fixture.cases.filter(c=>!onlyCases||onlyCases.includes(c.id))) {
    const spec=structuredClone(c.spec);
    if(phase!=='baseline') {
      spec.look.sky={...spec.look.sky,...c.requestedSky};
      if(c.requestedCover)spec.look.ground.cover=c.requestedCover;
      spec.things.forEach(t=>{t.role=c.roles[t.id];});
    }
    const edited=structuredClone(spec);edited.things.push({...c.edit.thing,...(phase!=='baseline'?{role:'focus'}:{})});
    const p=await tool('prepare_planet',{spec}),e=await tool('prepare_planet',{spec:edited});
    const item={id:c.id,intake:c.intake,inputHash:hash(c.spec),renderedSpecHash:hash(spec),geometryAndPlacementUnchanged:spec.things.every((t,i)=>{const copy={...t};delete copy.role;return JSON.stringify(copy)===JSON.stringify(c.spec.things[i]);}),roles:phase==='baseline'?null:c.roles,requestedSky:c.requestedSky,requestedCover:c.requestedCover,diagnostics:p.structuredContent?.diagnostics,edit:{suggestion:c.edit.suggestion,originalObjectsUnchanged:!!e.structuredContent?.spec && spec.things.every(t=>JSON.stringify(t)===JSON.stringify(e.structuredContent.spec.things.find(x=>x.id===t.id)))},views:[]};
    report.cases.push(item);
    if(p.isError||e.isError) {item.error=[p.isError?p.content:null,e.isError?e.content:null];continue;}
    const shown=await tool('preview_planet',{spec:p.structuredContent.spec}),changed=await tool('preview_planet',{spec:e.structuredContent.spec});
    if(shown.isError||changed.isError){item.error='preview refused';continue;}
    for(const [device,viewport] of [['desktop',{width:1280,height:720}],['phone',{width:390,height:844}]]) {
      const context=await browser.newContext({viewport,hasTouch:device==='phone',isMobile:device==='phone',reducedMotion:'reduce'});
      await context.route(/.*/,r=>r.abort());
      await context.route('https://stevenpisani.com/**',r=>{
        let f=join(site,decodeURIComponent(new URL(r.request().url()).pathname));
        if(existsSync(f)&&statSync(f).isDirectory())f=join(f,'index.html');
        return existsSync(f)?r.fulfill({body:readFileSync(f),contentType:types[extname(f)]||'application/octet-stream'}):r.fulfill({status:404});
      });
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/ERR_FAILED|ERR_BLOCKED|Failed to load resource/.test(m.text()))errors.push(m.text());});
      const file=label=>`${c.id}-${device}-${label}.png`;
      const shot=label=>page.screenshot({path:join(shots,file(label)),timeout:120000});
      const ready=async url=>{await page.goto('about:blank');await page.goto(url.replace('/p/preview/#','/p/preview/?test=1#'));await page.waitForFunction(()=>window.__planet?.ready,null,{timeout:120000});await page.locator('#veil').waitFor({state:'hidden'});};
      try {
        await ready(shown.structuredContent.url);await shot('arrival');
        const layout=await page.evaluate(id=>{
          const w=window.__planet,t=w.spec.things[0],B=t.hull.constructor,box=new B().setFromObject(t.root),V=w.camera.position.constructor;
          const corners=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])corners.push(new V(x,y,z).project(w.camera).toArray());
          const action=w.spec.things.find(t=>t.id===id);
          return {pose:{pos:w.player.pos.toArray(),quat:w.player.quat.toArray(),eye:w.player.eye,pitch:w.player.pitch},opening:w.opening?.()?{fits:w.opening().fits,ids:w.opening().ids,visible:w.opening().visible}:null,primary:w.screenOf(t.id),primaryBoundsInside:corners.every(p=>Math.abs(p[0])<=1&&Math.abs(p[1])<=1&&p[2]<1),action:w.screenOf(id),intensity:action?.lamp?.intensity,metrics:w.metrics()};
        },c.firstAction);
        const view={device,arrival:file('arrival'),layout,errors};item.views.push(view);
        if(!arrivalsOnly) {
        if(layout.action){await page.mouse.click(layout.action.x,layout.action.y);view.actionPassed=await page.waitForFunction(({id,intensity})=>{const w=window.__planet,t=w.spec.things.find(t=>t.id===id);return !w.busy()&&(t.use==='sit'?w.seated()===id:t.use==='switch'?t.lamp.intensity!==intensity:false);},{id:c.firstAction,intensity:layout.intensity},{timeout:30000}).then(()=>true,()=>false);}
        else view.actionPassed=false;
        // The old centre tap is retained as a comparison probe. An object's geometric centre
        // may be a gap or behind a foreground prop: also exercise a genuinely visible control.
        if(!view.actionPassed) {
          await ready(shown.structuredContent.url); // independent first-reveal probe, with no prior sitting/standing transition
          const point=await page.evaluate(id=>{
            const w=window.__planet,V=w.camera.position.constructor,t=w.spec.things.find(t=>t.id===id),B=t.hull.constructor;
            w.camera.updateMatrixWorld(true);
            const points=[];if(t.light)points.push(t.root.localToWorld(new V(...(t.light.at||[0,2,0]))));
            t.root.traverse(o=>{if(o.isMesh)points.push(new B().setFromObject(o).getCenter(new V()));});
            for(const p of points){const q=p.project(w.camera),x=(q.x+1)/2*innerWidth,y=(1-q.y)/2*innerHeight;if(q.z<1&&Math.abs(q.x)<.95&&Math.abs(q.y)<.95&&w.pickAt(x,y)===id)return{x,y};}
            return null;
          },c.firstAction);
          view.visibleControlPoint=point;view.visibleControlProbe='Fresh preview after a separate centre-tap probe; real tap on a visible control, no observer teleport.';
          if(point){await page.mouse.click(point.x,point.y);view.visibleControlPassed=await page.waitForFunction(({id,intensity})=>{const w=window.__planet,t=w.spec.things.find(t=>t.id===id);return !w.busy()&&(t.use==='sit'?w.seated()===id:t.use==='switch'?t.lamp.intensity!==intensity:false);},{id:c.firstAction,intensity:layout.intensity},{timeout:30000}).then(()=>true,()=>false);}
        } else view.visibleControlPassed=true;
        view.observed=await page.evaluate(id=>({card:document.getElementById('thing').hidden?null:document.getElementById('thing-name').textContent,seated:window.__planet.seated(),light:window.__planet.spec.things.find(t=>t.id===id)?.lamp?.intensity}),c.firstAction);
        if(await page.locator('#thing').isVisible())await page.locator('#thing-close').click();
        await shot('action');view.action=file('action');
        await ready(changed.structuredContent.url);await shot('edit');view.edit=file('edit');
        view.editVisible=!!(await page.evaluate(id=>window.__planet.screenOf(id),c.edit.thing.id));
        }
        console.log(`${phase}: ${c.id} ${device}: primary ${!!layout.primary}; bounds ${layout.primaryBoundsInside}${arrivalsOnly?' (arrival-only capture)':`; centre tap ${view.actionPassed}; visible control ${view.visibleControlPassed}; edit ${view.editVisible}`}`);
      }catch(error){item.views.push({device,error:error.message,errors});console.log(`${phase}: ${c.id} ${device}: ${error.message}`);}
      await context.close();
      writeFileSync(join(shots,'review.json'),JSON.stringify(report,null,2)+'\n');
    }
  }}finally{await browser.close();}
  writeFileSync(join(shots,'review.json'),JSON.stringify(report,null,2)+'\n');
  if(report.cases.some(c=>c.error||c.views.some(v=>v.error||v.errors.length)))throw new Error('Interview review has technical errors; see review.json');
  return report;
}
