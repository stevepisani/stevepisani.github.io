import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {getBounds} from '@gltf-transform/functions';
import {MeshoptDecoder} from 'meshoptimizer';
import {Matrix4,Vector3} from 'three';
import {checkPlanet,composePlanet,lookOver,placeThings,STOCK} from '../supabase/functions/_shared/planet.js';
import {LIBRARY_STOCK} from '../supabase/functions/_shared/planet-library.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/planet-reading.json',import.meta.url)));
assert.deepEqual(checkPlanet(fixture),[]);assert.deepEqual(lookOver(composePlanet(fixture)),[]);
for(const scale of [.5,1,2])for(const turn of [-75,0,90]) {
 const spec=structuredClone(fixture);spec.things[1].scale=scale;spec.things[1].turn=turn;
 assert.deepEqual(checkPlanet(spec),[],'parent scale/turn must preserve local tabletop fit');
 const placed=placeThings(spec.things);assert(placed.get('lamp')&&placed.get('books'),'the map includes mounted props');
}
const bad=(change,match)=>{const spec=structuredClone(fixture);change(spec);assert(checkPlanet(spec).some(e=>match.test(e)),JSON.stringify(checkPlanet(spec)));};
bad(s=>s.things[2].on.of='chair',/declared flat support/);
bad(s=>s.things[0].seatView.toward='missing',/another thing/);
bad(s=>s.things[0].seatView.toward='',/activity target/);
bad(s=>s.things[0].seatView.toward='chair',/another thing/);
bad(s=>s.things[0].seatView.pitch=-.1,/instead of an absolute pitch/);
bad(s=>s.things[2].on.of='books',/earlier/);
bad(s=>s.things[2].on.at=[.4,0],/whole prop/);
bad(s=>s.things[2].on.at=[0,0,1],/needs \[x, z\]/);
bad(s=>s.things[2].on.at[0]=Infinity,/needs \[x, z\]/);
bad(s=>s.things[2].on.at=null,/needs \[x, z\]/);
bad(s=>s.things[2].on={of:'table',at:[0,0],url:'https://invalid'},/not part/);
bad(s=>s.things[2].at={bearing:0,distance:5},/exactly one/);
bad(s=>s.things[2].solid=true,/solid: false/);
bad(s=>s.things[2].use='sit',/optional switch/);
bad(s=>s.things[2].scale=3,/whole prop/);
bad(s=>s.things[2].parts={some:'invalid producer output'},/should be/);
bad(s=>{s.things[2].turn=45;s.things[2].on.at=[-.24,0];},/whole prop/);
bad(s=>s.things[3].on.at=[-.17,-.16],/overlap/);
bad(s=>s.things[1].near.of='books',/listed before/);
bad(s=>{delete s.things[2].stock;s.things[2].parts=[{shape:'box',size:[.1,.1,.1],at:[0,1,0]}];},/foot must be/);
const edit=structuredClone(fixture);edit.things.push({id:'new-book',name:'One more story',stock:'book',on:{of:'table',at:[-.17,.14]},solid:false,role:'support'});edit.reveal='new-book';
assert.deepEqual(checkPlanet(edit),[]);const first=composePlanet(fixture),next=composePlanet(edit);
assert(first.things.every(t=>JSON.stringify(t)===JSON.stringify(next.things.find(n=>n.id===t.id))),'a tabletop addition preserves every original object and setting');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});await MeshoptDecoder.ready;
const base=new URL('../assets/models/planets/library/',import.meta.url),provenance=JSON.parse(readFileSync(new URL('furniture-provenance.json',base)));
let total=0;
for(const [id,k] of Object.entries(LIBRARY_STOCK)) {
 assert(!k.model&&STOCK[id].file,'ready sources must never request paid generation');
 const bytes=readFileSync(new URL(k.file.split('/').pop(),base)),rec=provenance.assets.find(a=>a.id===id);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),rec.sha256,'accepted bytes must match provenance');total+=bytes.length;
 const doc=await io.readBinary(bytes),bounds=getBounds(doc.getRoot().listScenes()[0]);
 for(let i=0;i<3;i++)assert(Math.abs(bounds.max[i]-bounds.min[i]-k.size[i])<.002,'decoded geometry must match layout dimensions');
 assert(Math.abs(bounds.min[1])<.001,'asset foot must be normalized');
 assert.equal(doc.getRoot().listAnimations().length,0,'this is an explicitly static family');
 if(k.support) {
  assert(Math.abs(k.support.height-bounds.max[1])<.001,'the declared flat top must coincide with the geometry');
  const top=[];
  doc.getRoot().listScenes()[0].traverse(node=>{const matrix=new Matrix4().fromArray(node.getWorldMatrix());for(const p of node.getMesh()?.listPrimitives()||[]){const a=p.getAttribute('POSITION'),ix=p.getIndices(),count=ix?.getCount()||a.getCount(),v=[];for(let i=0;i<count;i+=3){const points=[];for(let j=0;j<3;j++){a.getElement(ix?ix.getScalar(i+j):i+j,v);points.push(new Vector3(...v).applyMatrix4(matrix));}if(points.every(p=>Math.abs(p.y-k.support.height)<.001))top.push(points);}}});
  const cross=(a,b,x,z)=>(b.x-a.x)*(z-a.z)-(b.z-a.z)*(x-a.x);
  for(const x of [-k.support.half[0],0,k.support.half[0]])for(const z of [-k.support.half[1],0,k.support.half[1]])assert(top.some(([a,b,c])=>{const signs=[cross(a,b,x,z),cross(b,c,x,z),cross(c,a,x,z)];return signs.every(v=>v>=-1e-5)||signs.every(v=>v<=1e-5);}),`declared support point ${x},${z} must lie on an actual flat top triangle`);
 }
}
assert(total<70000,'the selected family must remain a small first-reveal download');
console.log(`Library: 5 CC0 files (${total} bytes), hashes/decoded envelopes, tabletop fit and invalid producer outputs, stable addition and no paid requests passed.`);
