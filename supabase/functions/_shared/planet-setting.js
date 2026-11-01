// Setting is independent of activity: the same edges can surround a repair bench, a meal
// or an unfamiliar hobby. Explicit choices only; no interview keywords or invented biography.
import {treeEnvelope,woodlandFloor} from './planet-painting.js';
const DEG=Math.PI/180;
const box=(size,at,color,extra={})=>({shape:'box',size,at,color,round:.06,...extra});
export function settingErrors(spec) {
  if(spec.setting===undefined)return [];
  const s=spec.setting,e=[],fail=(k,m)=>e.push(`setting${k?'.'+k:''}: ${m}`);
  if(!s||typeof s!=='object'||Array.isArray(s))return ['setting: should be an object'];
  for(const k of Object.keys(s))if(!['around','edge','planting','color'].includes(k))fail(k,'not part of a setting');
  if(!Array.isArray(spec.things)||!spec.things.some(t=>t?.id===s.around))fail('around','should name an existing custom thing');
  if(s.edge!==undefined&&!['wall','windows','railing'].includes(s.edge))fail('edge','should be wall, windows or railing');
  if(s.planting!==undefined&&s.planting!=='woodland')fail('planting','only woodland is available here; tropical scenes supply their own planting');
  if(s.edge===undefined&&s.planting===undefined)fail('','choose an edge or planting');
  if(s.color!==undefined&&!(typeof s.color==='string'&&/^#[0-9a-f]{6}$/i.test(s.color)))fail('color','should be a colour like #ad9278');
  return e;
}

export function composeSetting(spec,placed) {
  if(!spec.setting)return spec;
  const out=structuredClone(spec),s=out.setting;delete out.setting;
  const anchor=placed.get(s.around),b=anchor.bearing*DEG,a=(anchor.bearing-anchor.turn)*DEG;
  const cx=Math.sin(b)*anchor.distance,cn=Math.cos(b)*anchor.distance;
  const color=s.color||'#a8957b',wood='#78604d';
  // A fixed setting frame is intentionally independent of later additions. An edit cannot
  // silently move its walls, trees or route by changing the activity's union bounds.
  const add=(id,name,x,z,parts,extra={})=>{
    const px=cx+x*Math.cos(a)-z*Math.sin(a),pn=cn-x*Math.sin(a)-z*Math.cos(a);
    const bearing=Math.atan2(px,pn)/DEG;
    out.things.push({id:`${s.around.slice(0,15)}-setting-${id}`,name,at:{bearing,distance:Math.hypot(px,pn)},turn:((bearing-a/DEG+540)%360)-180,parts,role:'environment',solid:false,...extra});
  };
  if(s.edge) {
    // Separate short bays follow the curved ground. The front and both approaches stay open.
    for(const [i,x] of [[0,-2.05],[1,0],[2,2.05]]) {
      let parts;
      if(s.edge==='railing')parts=[
        ...[-.9,.9].map(x=>box([.1,1.2,.1],[x,.58,0],wood,{ground:true,surface:'wood'})),
        box([1.95,.1,.12],[0,1.18,0],wood,{surface:'wood'}),
        box([1.85,.08,.08],[0,.52,0],wood,{surface:'wood'}),
      ];
      else {
        parts=[box([1.98,.65,.22],[0,.31,0],color,{ground:true}),box([2.04,.1,.28],[0,.68,0],wood,{surface:'wood'})];
        if(s.edge==='windows')parts.push(
          ...[-.93,.93].map(x=>box([.12,2.8,.18],[x,1.38,0],wood,{ground:true,surface:'wood'})),
          box([1.98,.2,.24],[0,2.7,0],color),
          box([1.72,1.85,.05],[0,1.72,-.04],'#b0cad0',{finish:'glass'}),
          box([.07,1.94,.1],[0,1.7,.03],wood,{surface:'wood'}),
          box([1.85,.07,.1],[0,1.7,.03],wood,{surface:'wood'}),
        );
      }
      add(`edge-${i}`,s.edge==='windows'?'Windows behind the activity':s.edge==='railing'?'A railing along the edge':'A low enclosing wall',x,-3.6,parts,{footprint:[2,.25]});
    }
    if(s.edge!=='railing')for(const [i,x] of [[0,-3.25],[1,3.25]])add(`return-${i}`,'A short return beside the activity',x,-2.6,[
      box([.22,.65,1.75],[0,.31,0],color,{ground:true}),box([.28,.1,1.81],[0,.68,0],wood,{surface:'wood'}),
    ],{footprint:[.25,1.8]});
  }
  if(s.planting==='woodland') {
    for(const [i,x,z,scale] of [[0,-4,-.8,1],[1,4,-1,1.1],[2,-3,-5,1.25],[3,2.8,-5.7,1.3],[4,0,-7.6,1.2]])add(`tree-${i}`,'Birch at the woodland edge',x,z,treeEnvelope(),{craft:'birch',footprint:[.4,.4],scale});
    for(const [i,x,z] of [[0,-3.2,1],[1,3.2,1],[2,-2,-4.4],[3,2,-4.4]])add(`floor-${i}`,'Ferns at the woodland edge',x,z,woodlandFloor(),{craft:'woodland-floor',footprint:[1.7,1]});
  }
  out.arrival='overview';
  out.routes||=[];
  if(!out.routes.length) {
    const x=cx-Math.sin(a)*2.8,n=cn-Math.cos(a)*2.8;
    out.routes.push({from:{bearing:0,distance:1.2},to:{bearing:Math.atan2(x,n)/DEG,distance:Math.hypot(x,n)}});
  }
  return out;
}
