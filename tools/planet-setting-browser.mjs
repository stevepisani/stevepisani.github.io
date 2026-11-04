// Generic capability controls, separate from frozen interview evidence.
import {readFileSync} from 'node:fs';
export async function settingResponses(page,shot,{base,rpc,packPlanet}) {
  const load=async spec=>{
    const prepared=(await rpc({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'prepare_planet',arguments:{spec}}},{})).result;
    if(prepared.isError)throw Error(prepared.content[0].text);
    await page.goto('about:blank');await page.goto(`${base}/p/preview/?test=1#${await packPlanet(prepared.structuredContent.spec)}`);
    await page.waitForFunction(()=>window.__planet?.ready,null,{timeout:120000});await page.locator('#veil').waitFor({state:'hidden'});
  };
  for(const motion of ['reduce','no-preference']) {
    await page.emulateMedia({reducedMotion:motion});
    const source=JSON.parse(readFileSync(new URL('./fixtures/planet-setting-response.json',import.meta.url)));
    // Exercise the allowed longest hold so the real software-rendered peak can be captured.
    source.things.find(t=>t.id==='vessel').response.hold=8;
    await load(source);await shot(`brief-${motion}-initial`);
    const point=await page.evaluate(()=>{
      const w=window.__planet,t=w.spec.things.find(t=>t.id==='vessel'),V=w.camera.position.constructor;w.camera.updateMatrixWorld(true);let hit;
      t.body.traverse(o=>{if(!o.isMesh||hit)return;const p=o.geometry.attributes.position,ix=o.geometry.index,n=ix?ix.count:p.count;for(let k=0;k<24&&!hit;k++){
        const j=3*Math.floor((n/3-1)*k/23),v=new V();for(let a=0;a<3;a++)v.add(new V().fromBufferAttribute(p,ix?ix.getX(j+a):j+a));
        const q=v.multiplyScalar(1/3).applyMatrix4(o.matrixWorld).project(w.camera),x=(q.x+1)*innerWidth/2,y=(1-q.y)*innerHeight/2;
        if(q.z>0&&q.z<1&&Math.abs(q.x)<.9&&Math.abs(q.y)<.7&&w.pickAt(x,y)===t.id)hit={x,y};
      }});return hit;
    });
    if(!point)throw Error('No visible first-action target');await page.mouse.click(point.x,point.y);
    await page.waitForFunction(()=>window.__planet.spec.things.find(t=>t.id==='vessel').responseState.value>.99,null,{timeout:60000});
    const peak=await page.evaluate(()=>{
      const w=window.__planet,t=w.spec.things.find(t=>t.id==='vessel'),puffs=[];
      t.body.traverse(o=>{if(o.isMesh&&o.material.userData.vapor)puffs.push({amount:o.material.uniforms.amount.value,time:o.material.uniforms.time.value,transparent:o.material.transparent,depthWrite:o.material.depthWrite});});
      return {puffs,glError:document.querySelector('canvas').getContext('webgl2').getError()};
    });
    if(peak.glError||!peak.puffs.length||peak.puffs.some(p=>!p.transparent||p.depthWrite||p.amount<.99||!Number.isFinite(p.time)||motion==='reduce'&&p.time!==0))throw Error('Invalid vapor shader/state '+JSON.stringify(peak));
    await shot(`brief-${motion}-vapor`);
    await page.waitForFunction(()=>{const t=window.__planet.spec.things.find(t=>t.id==='vessel');return !t.responded&&t.responseState.value<.001;},null,{timeout:15000});
    await page.getByText('Ready to replay',{exact:false}).waitFor({state:'visible'});
    await shot(`brief-${motion}-returned`);
    await page.getByRole('button',{name:'Step back',exact:true}).click();await page.waitForFunction(()=>!window.__planet.responseView()&&!window.__planet.busy());
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  await load(JSON.parse(readFileSync(new URL('./fixtures/planet-setting-floor.json',import.meta.url))));
  await shot('timber-floor');
}
