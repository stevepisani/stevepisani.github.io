// Activity-independent settings and edited arrivals must keep original data and total caps.
import assert from 'node:assert/strict';
import {checkPlanet,composePlanet,lookOver,LIMITS} from '../supabase/functions/_shared/planet.js';
const base={version:1,slug:'test-unfamiliar-craft',who:{name:'A maker'},look:{sky:{period:'day'}},things:[
  {id:'loom',name:'A weaving frame',at:{bearing:24,distance:6},turn:25,role:'focus',parts:[{shape:'box',size:[1.8,1.8,.3],color:'#a78869'}]},
]};
for(const edge of ['wall','windows','railing',undefined])for(const planting of ['woodland',undefined]) {
  if(!edge&&!planting)continue;
  const design={...structuredClone(base),setting:{around:'loom',...(edge?{edge}:{}),...(planting?{planting}:{})}},raw=JSON.stringify(design);
  assert.deepEqual(checkPlanet(design),[]);
  const compiled=composePlanet(design);
  assert.equal(JSON.stringify(design),raw,'compilation cannot mutate the design');
  assert.deepEqual(checkPlanet(compiled),[]);assert.deepEqual(lookOver(compiled),[]);
  assert.deepEqual(composePlanet(compiled),compiled,'compiled settings are idempotent');
  assert.deepEqual(compiled.things[0],base.things[0],'setting cannot alter an activity');
  assert(compiled.routes[0].to.distance<base.things[0].at.distance,'the approach joins the open front, not the backdrop behind the activity');
  assert(!compiled.things.some(t=>t.use||t.craft==='cat'||t.craft==='palm'),'setting must not invent a hobby, pet or theme');
  assert.deepEqual(compiled.look,base.look,'setting must not invent time, weather or ground treatment');
  const edited=structuredClone(design);
  edited.things.push({id:'new-shuttle',name:'A painted shuttle',near:{of:'loom',side:'left',gap:.6},parts:[{shape:'box',size:[.6,.8,.4],color:'#ba674e'}]});
  edited.reveal='new-shuttle';const next=composePlanet(edited);
  assert.deepEqual(checkPlanet(next),[]);
  assert(compiled.things.every(t=>JSON.stringify(t)===JSON.stringify(next.things.find(n=>n.id===t.id))),'an edit preserves both original things and setting layers');
  assert.equal(next.things.length,compiled.things.length+1);
}
for(const bad of [null,[],{}, {around:'absent',edge:'wall'},{around:'loom',edge:'castle'},{around:'loom',planting:'rainforest'},{around:'loom',edge:'wall',color:'red'}])assert(checkPlanet({...base,setting:bad}).length);
assert(checkPlanet({...base,things:{},setting:{around:'loom',edge:'wall'}}).length,'malformed things should be rejected without crashing');
assert(checkPlanet({...base,reveal:'absent'}).some(e=>e.startsWith('reveal')));
assert(checkPlanet({...base,scenes:[null],reveal:'absent'}).length,'bad scene intent must not be compiled while validating reveal');
const collision=structuredClone(base);collision.setting={around:'loom',edge:'wall'};collision.things.push({...structuredClone(base.things[0]),id:'loom-setting-edge-0'});
assert(checkPlanet(collision).some(e=>e.includes('collides')),'generated IDs cannot replace custom objects');
const full=structuredClone(base);full.setting={around:'loom',planting:'woodland'};
while(full.things.length<LIMITS.things)full.things.push({...structuredClone(base.things[0]),id:`item-${full.things.length}`});
assert(checkPlanet(full).some(e=>e.includes('more than')),'settings must share the existing object budget');
const named=structuredClone(base);named.things[0].id='an-unusually-long-activity-id';named.setting={around:named.things[0].id,edge:'windows'};
assert.deepEqual(checkPlanet(named),[],'valid anchor IDs must not produce overlong generated IDs');
for(const turn of [-120,0,65]) {
  const design=structuredClone(base);design.things[0].turn=turn;design.things[0].at.distance=9;
  design.setting={around:'loom',edge:'windows',shelter:'canopy'};
  const original=composePlanet(design),edited=structuredClone(design);
  edited.setting.extras=['window-seat'];edited.reveal='loom-setting-seat';
  assert.deepEqual(checkPlanet(edited),[],'generated setting additions must be valid reveal targets');
  const result=composePlanet(edited),seat=result.things.find(t=>t.id===edited.reveal);
  assert.equal(seat.use,'sit');assert.equal(seat.frameWith,'loom');
  assert(original.things.every(t=>JSON.stringify(t)===JSON.stringify(result.things.find(n=>n.id===t.id))),'a window-seat edit cannot change existing activity, windows or roof');
  assert.deepEqual(composePlanet(result),result,'a prepared shelter edit must remain idempotent');
  assert(original.things.find(t=>t.id==='loom-setting-canopy').parts.filter(p=>p.ground).length>=4,'each canopy foot is independently grounded');
}
for(const setting of [{around:'loom',shelter:'castle'},{around:'loom',edge:'wall',extras:['window-seat']},{around:'loom',edge:'windows',extras:['window-seat','window-seat']},{around:'loom',edge:'windows',extras:'window-seat'}])assert(checkPlanet({...base,setting}).length);
assert(checkPlanet({...base,things:[{...base.things[0],frameWith:'loom'}]}).some(e=>e.includes('frameWith')),'framing context cannot refer to itself or a missing object');
const context={...structuredClone(base),things:[...structuredClone(base.things),{id:'small-addition',name:'A small addition',at:{bearing:0,distance:5},frameWith:'loom',parts:[{shape:'box',size:[.5,.5,.5]}]}]};
assert.deepEqual(checkPlanet(context),[],'absolute placement and framing context are independent');
console.log('Settings: independent activity/atmosphere, valid geometry, stable edits, malformed input, ID collisions and shared budgets passed.');
