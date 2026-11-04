// Public API contracts for opt-in shared controls, using unrelated synthetic source data.
import assert from 'node:assert/strict';
import {checkPlanet} from '../supabase/functions/_shared/planet.js';
import {RESPONSE_HOLD_RANGE} from '../supabase/functions/_shared/planet-authoring.js';
import {buildThings} from '../assets/js/planets/things.js';
import {rpc} from '../supabase/functions/planets/server.js';
const source={version:1,slug:'test-brief-moment',who:{name:'A brief moment'},arrival:'overview',setting:{around:'display',floor:'timber'},things:[{id:'display',name:'A small working display',role:'focus',at:{bearing:0,distance:6},use:'change',response:{label:'A brief release',done:'A soft cloud rises',hold:3},parts:[{shape:'box',size:[.8,.4,.8],at:[0,.2,0],color:'#667b81'},{shape:'sphere',finish:'vapor',size:[.08,.08,.08],at:[0,.6,0],color:'#dddddd',after:{size:[.6,.8,.6],at:[0,1.2,0]}}]}]};
const original=structuredClone(source);
const staticVapor=structuredClone(source.things[0]);staticVapor.id='static-vapor';delete staticVapor.use;delete staticVapor.response;delete staticVapor.parts[1].after;
const staticWorld=buildThings([staticVapor],()=>20);let amount;
staticWorld.group.traverse(o=>{if(o.isMesh&&o.material.userData.vapor)amount=o.material.uniforms.amount.value;});assert.equal(amount,1,'an accepted static vapor finish is visible without an action');
const changingWorld=buildThings([structuredClone(source.things[0])],()=>20);
changingWorld.group.traverse(o=>{if(o.isMesh&&o.material.userData.vapor)assert.equal(o.material.uniforms.amount.value,0,'a responding puff starts hidden until requested');});
assert.deepEqual(checkPlanet(source),[]);
for(const hold of [1,8.1,NaN,Infinity,-Infinity,'3',null]){const s=structuredClone(source);s.things[0].response.hold=hold;assert(checkPlanet(s).some(e=>e.includes('response.hold')),'invalid transient duration is rejected, not silently repaired');}
for(const hold of RESPONSE_HOLD_RANGE){const s=structuredClone(source);s.things[0].response.hold=hold;assert.deepEqual(checkPlanet(s),[]);}
for(const shape of ['box','text','cylinder']){const s=structuredClone(source);s.things[0].parts[0].finish='vapor';s.things[0].parts[0].shape=shape;assert(checkPlanet(s).some(e=>e.includes('vapor needs a sphere')));}
for(const floor of ['stone','full-room',true,{}]){const s=structuredClone(source);s.setting.floor=floor;assert(checkPlanet(s).some(e=>e.includes('floor')),'unavailable setting choices stay strict');}
const call=async(name,args={})=>(await rpc({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}},{})).result;
const kit=(await call('get_kit')).structuredContent;
assert.deepEqual(kit.authoring_constraints.response.hold_seconds,RESPONSE_HOLD_RANGE);
assert(kit.things.response.includes('vapor')&&kit.setting.floor.includes('timber'));
const prepared=await call('prepare_planet',{spec:source});assert(!prepared.isError,prepared.content?.[0]?.text);
assert.equal(prepared.structuredContent.spec.things.find(t=>t.id==='display').response.hold,3);
assert(!('setting' in prepared.structuredContent.spec),'setting compiles into ordinary geometry');
assert.deepEqual(source,original,'preparation must preserve source and transient intent');
let sends=0;const bad=structuredClone(source);bad.things[0].response.hold=500;
const sent=(await rpc({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'send_planet',arguments:{spec:bad}}},{send:()=>{sends++;}})).result;
assert(sent.isError&&sends===0,'submission never rescues invalid transient settings or sends an invalid planet');
console.log('Shared payoff API: opt-in surfaces and vapor, strict transient bounds, kit contract, source preservation and invalid-send rejection passed.');
