import assert from 'node:assert/strict';
import {assemblePlanet} from '../supabase/functions/_shared/planet-assembly.js';
import {SEAT_VIEW_RANGES} from '../supabase/functions/_shared/planet-authoring.js';
import {checkPlanet,LIMITS} from '../supabase/functions/_shared/planet.js';
import {rpc} from '../supabase/functions/planets/server.js';

// Generic control: a visitor sits at a small activity. No interview-specific data.
const valid={version:1,slug:'test-authoring',who:{name:'A little place'},things:[{
  id:'seat',name:'A place to pause',at:{bearing:0,distance:5},use:'sit',
  seatView:{eye:1.2,pitch:-0.15},parts:[{shape:'box',size:[0.9,0.45,0.6],color:'#8eaa92'}],
}]};
const copy=()=>structuredClone(valid);
assert.deepEqual(checkPlanet(valid),[]);
assert.deepEqual(assemblePlanet(valid),{spec:valid,adjustments:[]},'valid hints and optional absence retain existing behavior');
const absent=copy();delete absent.things[0].seatView;
assert.deepEqual(assemblePlanet(absent),{spec:absent,adjustments:[]});

for(const [key,[lo,hi]]of Object.entries(SEAT_VIEW_RANGES)) {
  for(const [value,expected]of [[lo-5,lo],[hi+5,hi],[lo,lo],[hi,hi]]) {
    const raw=copy();raw.things[0].seatView[key]=value;const original=structuredClone(raw);
    const result=assemblePlanet(raw);
    assert.deepEqual(raw,original,'authoring never rewrites the caller or saved first output');
    assert.equal(result.spec.things[0].seatView[key],expected);
    assert.deepEqual(checkPlanet(result.spec),[],'normalization returns a supported seated view');
    assert.deepEqual(assemblePlanet(result.spec),{spec:result.spec,adjustments:[]},'prepared views are idempotent');
    assert.deepEqual(result.spec.things[0].parts,raw.things[0].parts);
    assert.deepEqual(result.spec.things[0].at,raw.things[0].at,'camera normalization cannot move the activity');
    assert.deepEqual(result.adjustments,value===expected?[]:[{path:`things[0].seatView.${key}`,kind:'presentation-hint',original:value,value:expected}]);
  }
  for(const bad of [null,'1',false,NaN,Infinity,-Infinity,[],{}]) {
    const raw=copy();raw.things[0].seatView[key]=bad;
    const result=assemblePlanet(raw);
    assert.deepEqual(result.spec.things[0].seatView[key],bad,'invalid hint types are never coerced');
    assert.equal(result.adjustments.length,0);
    assert(checkPlanet(result.spec).some(e=>e.includes(`seatView.${key}`)),'strict validation retains malformed hints');
  }
}

for(const mutate of [
  s=>s.things[0].seatView='low',
  s=>s.things[0].seatView=[],
  s=>{s.things[0].use='change';s.things[0].seatView.pitch=-4;},
  s=>s.things[0].seatView.roll=0,
  s=>s.things[0].seatView.toward='missing',
  s=>s.things[0].at.distance=0.2,
  s=>s.things[0].parts[0].size=[-1,1,1],
  s=>s.things[0].id='bad id',
]) {
  const raw=copy();mutate(raw);
  assert(checkPlanet(assemblePlanet(raw).spec).length,'unrelated geometry, references and unsupported fields remain rejected');
}
const irrelevant=copy();delete irrelevant.things[0].use;irrelevant.things[0].seatView.pitch=-4;
assert.equal(assemblePlanet(irrelevant).spec.things[0].seatView.pitch,-4,'an unsupported non-seat hint is not normalized');
const targeted=copy();delete targeted.things[0].seatView.pitch;targeted.things[0].seatView.toward='view';
targeted.things.push({id:'view',name:'A favorite view',at:{bearing:20,distance:7},parts:[{shape:'box',size:[1,1,1]}]});
assert.deepEqual(assemblePlanet(targeted),{spec:targeted,adjustments:[]},'named view targets remain intact');
assert.deepEqual(checkPlanet(targeted),[]);
const conflicting=copy();conflicting.things[0].seatView.toward='seat';conflicting.things[0].seatView.pitch=-4;
assert(checkPlanet(assemblePlanet(conflicting).spec).some(e=>e.includes('seatView.toward')),'normalizing pitch never removes a conflicting target');

const oversize=copy();oversize.who.name='x'.repeat(LIMITS.bytes+1);oversize.things[0].seatView.pitch=-4;
assert.equal(assemblePlanet(oversize).spec,oversize,'compaction cannot conceal an oversized raw request');
assert.equal(assemblePlanet(oversize).spec.things[0].seatView.pitch,-4);
const combined=copy();combined.things[0].seatView.pitch=-4;combined.who.name='a'.repeat(38)+'🌿 longer';
const assembled=assemblePlanet(combined);assert.equal(assembled.spec.who.name,'a'.repeat(38)+'…');
assert.deepEqual(assembled.adjustments.map(x=>x.kind),['display-label','presentation-hint'],'combined assembly retains both reported originals');

const raw=copy();raw.things[0].seatView.pitch=-4;const expected=assemblePlanet(raw);
const call=async(name,spec,ctx={})=>(await rpc({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:{spec}}},ctx)).result;
for(const name of ['prepare_planet','preview_planet']) {
  const result=await call(name,raw);assert(!result.isError,`${name} can deliver a bounded optional view without a correction round`);
  assert.deepEqual(result.structuredContent.diagnostics.adjustments,expected.adjustments);
  if(name==='prepare_planet')assert.deepEqual(result.structuredContent.spec,expected.spec);
}
let sends=0;const ctx={send:async()=>{sends++;return 'test-only';}};
assert((await call('send_planet',raw,ctx)).isError,'sending rejects the invalid unreviewed raw view');
assert.equal(sends,0);
const sent=await call('send_planet',expected.spec,ctx);assert(!sent.isError&&sent.structuredContent.sent);
assert.equal(sends,1,'an already-valid reviewed spec uses the existing submission contract');
console.log('Authoring: bounded optional seated views, preserved originals, idempotence, strict malformed/geometry rejection, raw-byte cap and reviewed-send boundary passed.');
