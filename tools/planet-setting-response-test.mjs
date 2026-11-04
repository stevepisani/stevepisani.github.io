// Shared controls: fixed setting surfaces and transient, locally bounded responses.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {checkPlanet,composePlanet} from '../supabase/functions/_shared/planet.js';
import {responsePart,responseState} from '../assets/js/planets/response.js';
import {vaporMaterial} from '../assets/js/planets/vapor.js';
import {conformSurfaceFloor} from '../assets/js/planets/surface-floor.js';
import {buildThings} from '../assets/js/planets/things.js';
const activity={version:1,slug:'test-surface-control',who:{name:'Surface control'},arrival:'overview',things:[{id:'activity',name:'The activity',role:'focus',at:{bearing:25,distance:7},turn:52,parts:[{shape:'box',size:[1.5,.5,.8],at:[0,.25,0]}]}]};
for(const floor of ['timber','paving'])for(const turn of [-100,0,120]) {
 const design=structuredClone(activity);design.things[0].turn=turn;design.setting={around:'activity',edge:'windows',floor};const saved=JSON.stringify(design);
 assert.deepEqual(checkPlanet(design),[]);const c=composePlanet(design);assert.equal(JSON.stringify(design),saved);assert.deepEqual(checkPlanet(c),[]);assert.deepEqual(composePlanet(c),c);
 const panels=c.things.filter(t=>t.id.includes('-floor-'));assert.equal(panels.length,9);assert.equal(c.things.filter(t=>t.id.endsWith('-threshold')).length,1);
 assert(panels.every(t=>t.solid===false&&t.role==='environment'&&Math.max(...t.footprint)<=2.14),'short independent surface panels do not become furniture or physical barriers');
 // Node collision control excludes browser-only canvas materials; actual surface shading is checked in Chromium.
 const collisionThings=structuredClone(c.things);collisionThings.forEach(t=>t.parts?.forEach(p=>delete p.surface));const runtime=buildThings(collisionThings,()=>20);assert.equal(runtime.colliders.length,1,'setting surfaces do not invent walking collisions');
 assert(c.things.filter(t=>t.id.includes('floor-')).every(t=>t.parts.every(p=>p.size[1]===.065&&p.at[1]===-.02)),'floor is a surface cue, never a raised walk plane');
 const edit=structuredClone(design);edit.things.push({id:'addition',name:'A small addition',near:{of:'activity',side:'left',gap:1},parts:[{shape:'box',size:[.5,.8,.5]}]});const e=composePlanet(edit);
 assert(c.things.every(t=>JSON.stringify(t)===JSON.stringify(e.things.find(x=>x.id===t.id))),'additions cannot resize or relocate floor/edge/threshold');
}
assert.deepEqual(checkPlanet({...structuredClone(activity),setting:{around:'activity',floor:'timber'}}),[],'floor can independently establish an activity surface');
assert(checkPlanet({...structuredClone(activity),setting:{around:'activity',floor:'marble-palace'}}).length,'unknown surface intent remains strict');
const m=new THREE.Mesh(new THREE.SphereGeometry(.5),vaporMaterial());m.position.set(0,.8,0);m.scale.setScalar(.01);
const p={shape:'sphere',size:[.01,.01,.01],at:[0,.8,0],finish:'vapor',after:{size:[.7,1,.7],at:[.1,1.5,0]}};
const r=responseState([responsePart(m,p)],{hold:3});assert(r.toggle(10));r.update(11.25);assert.equal(r.value,1);assert.equal(m.material.uniforms.amount.value,1);r.update(14.199);assert(r.active&&r.value===1);r.update(14.2);assert(!r.active);r.update(15.5);assert.equal(r.value,0);assert.equal(m.material.uniforms.amount.value,0);assert(m.position.distanceTo(new THREE.Vector3(0,.8,0))<1e-8);
assert(r.toggle(20,true));assert.equal(r.value,1);assert(r.reduced);r.update(22.9);assert.equal(r.value,1);r.update(23);assert(!r.active&&r.value===0,'reduced motion holds a settled appearance then clears without an animated reversal');
r.toggle(25);r.update(100);assert(!r.active&&r.value===0,'a late frame cannot restart a response after its bounded return elapsed');
r.toggle(30);r.update(30.6);const midway=r.value;assert(midway>.49&&midway<.51);assert.equal(r.toggle(30.6),false);r.update(31.9);assert.equal(r.value,0,'manual reversal during a transient still restores the original state');
const source={id:'vessel',name:'A warm vessel',at:{bearing:0,distance:6},use:'change',response:{label:'Release a little vapor',done:'A little vapor rises',hold:3},parts:[{shape:'cylinder',size:[.8,.8,.8]},p]};
const world=buildThings([structuredClone(source)],()=>20),thing=world.pickable[0].userData.thing,box=thing.hull.clone(),responsive=world.pickable.find(m=>m.userData.responding);world.respond(thing,true);world.update(performance.now()/1000);assert(thing.responded&&responsive.material.uniforms.time.value===0);thing.responseState.update(performance.now()/1000+4);world.update(performance.now()/1000+4);assert(!thing.responded&&thing.responseState.value===0);assert.deepEqual(thing.hull,box,'transient response never changes the reserved collision/picking envelope');
assert(m.material.transparent&&!m.material.depthWrite&&!m.castShadow,'soft vapor has no solid depth/shadow envelope');
assert(!/Math\.random|fetch\(/.test(vaporMaterial.toString()),'effect has no random placement or network assets');
// Curved/noisy ground must meet the whole panel, not only its centre or support foot.
const root=new THREE.Group();root.position.set(0,20,0);const panel=new THREE.Mesh(new THREE.BoxGeometry(2,.065,1.8,4,1,4),new THREE.MeshBasicMaterial());panel.position.set(0,-.02,0);conformSurfaceFloor(panel,root,()=>20);root.add(panel);root.updateMatrixWorld(true);const pos=panel.geometry.attributes.position;
for(let i=0;i<pos.count;i++)if(pos.getY(i)>-.04){const q=new THREE.Vector3().fromBufferAttribute(pos,i);panel.localToWorld(q);assert(Math.abs(q.length()-20.0125)<.0001,'every top vertex lies just above the same curved walking surface');}
console.log('Setting/response: independent floor intent, fixed curved-ground panels, stable edits, strict input, finite transient state, reversal, reduced motion and stable hulls passed.');
