// Shared behavior, not example-specific camera values: obstacle routing and the full response
// envelope at the two real card sizes. The same target keeps both states below the controls.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Player,BODY} from '../assets/js/world/player.js';
import {RADIUS} from '../assets/js/world/planet.js';
import {buildThings} from '../assets/js/planets/things.js';
import {approachRoute,actionBounds,responseFrame,responseFrameAt} from '../assets/js/planets/action-view.js';
const surface=()=>RADIUS,at=z=>new THREE.Vector3(0,Math.cos(z/RADIUS)*RADIUS,Math.sin(z/RADIUS)*RADIUS);
// A visible action behind a bench requires real path corners; a direct target stalls.
const from=at(3),to=at(-7),obstacle={center:at(-1),radius:1};
for(const withRoute of [false,true]) {
 const camera=new THREE.PerspectiveCamera(),p=new Player(camera,{surface,colliders:[obstacle]});p.spawn(from,to);p.enabled=true;let arrived=false,stuck=false;
 const via=withRoute?approachRoute(p.pos,to,p.colliders,surface):[];
 if(withRoute)assert(via.length>0,'an intervening solid must produce walking corners');
 p.walkTo(to,{via,onArrive:()=>{arrived=true;},onStuck:()=>{stuck=true;}});
 let minimum=Infinity;
 for(let i=0;i<800&&!arrived&&!stuck;i++){p.update(.05);minimum=Math.min(minimum,p.pos.distanceTo(obstacle.center));}
 assert(minimum>=obstacle.radius+BODY-.015,'the approach must not tunnel through the bench');
 assert.equal(arrived,withRoute,'only the routed real walk can arrive');assert.equal(stuck,!withRoute);
}
// The first mesh state is small, but a later response becomes tall/wide. Frame the union,
// including root rotation/scale, rather than the current or axis-aligned unplaced part size.
const spec=[{id:'changing-display',name:'Changing display',at:{bearing:0,distance:7},use:'change',response:{label:'Expand it',done:'Expanded'},scale:1.1,turn:13,parts:[{shape:'box',size:[2,2,.15],at:[0,2,0],after:{size:[5,5,.15],at:[0,3,0]},color:'#8ea675'}]}];
const world=buildThings(spec,surface,new Map()),thing=spec[0],box=actionBounds(thing);
const label=new THREE.Mesh(new THREE.PlaneGeometry(1,.2),new THREE.MeshBasicMaterial());label.position.set(0,1,0);label.userData.content={glyphFraction:2/3};thing.body.add(label); // incidental label inside the existing endpoint envelope

assert(box.max.y-box.min.y>4,'both endpoint positions/sizes must affect the world envelope');
for(const [width,height,fov]of [[700,440,54],[366,440,72]]){
 const frame=responseFrame(thing,spec,{aspect:width/height,fov,height,surface,colliders:world.colliders});
 assert.equal(frame?.content??null,null,'response inspection fits endpoints instead of prioritizing incidental label text');
 assert(frame?.fits&&frame.visible.includes(thing.id),'the whole supported response needs a clear surface view');
 const probe=new THREE.PerspectiveCamera(fov,width/height,.05,2000),up=frame.dir.clone();probe.position.copy(up).multiplyScalar(surface(up)+frame.eye);probe.up.copy(up);probe.lookAt(frame.target);probe.updateMatrixWorld(true);
 for(const k of [0,1]){
  if(k)world.respond(thing,true);thing.root.updateMatrixWorld(true);const actual=new THREE.Box3().setFromObject(thing.body);
  for(const x of [actual.min.x,actual.max.x])for(const y of [actual.min.y,actual.max.y])for(const z of [actual.min.z,actual.max.z]){const p=new THREE.Vector3(x,y,z).project(probe);assert(Math.abs(p.x)<.88&&p.y<.4&&p.y>-.45&&p.z>0&&p.z<1,'both rendered states must remain below the buttons and above the caption');}
  if(k)world.respond(thing,true);
 }
 assert(world.colliders.every(c=>frame.dir.clone().multiplyScalar(surface(frame.dir)).distanceTo(c.center)>=c.radius+BODY),'view feet remain outside solid footprints');
}
// A rotated viewport refits optics/eye at the same physical surface point, rather than
// teleporting to the different foot position found by another overview search.
const initial=responseFrame(thing,spec,{aspect:700/440,fov:54,height:440,surface,colliders:world.colliders});
const fixed=initial.dir.clone().multiplyScalar(surface(initial.dir));
for(const [width,height]of [[366,440],[700,440],[440,700]]){
 const view=responseFrameAt(thing,spec,{point:fixed,eye:initial.eye,fov:54,aspect:width/height,height});
 assert(view?.fits,'current physical point must receive a complete resized inspection view');
 assert(view.point.distanceTo(fixed)<1e-12,'resize must not choose a new walking location');
 assert(view.fov>=54&&view.fov<=100&&view.eye<=12,'inspection optics and eye remain bounded');
 const probe=new THREE.PerspectiveCamera(view.fov,width/height,.05,2000);probe.position.copy(fixed).addScaledVector(view.dir,view.eye);probe.up.copy(view.dir);probe.lookAt(view.target);probe.updateMatrixWorld(true);
 const bound=actionBounds(thing);
 for(const x of [bound.min.x,bound.max.x])for(const y of [bound.min.y,bound.max.y])for(const z of [bound.min.z,bound.max.z]){const p=new THREE.Vector3(x,y,z).project(probe);assert(Math.abs(p.x)<.88&&p.y<1-264/height&&p.y> -1+242/height&&p.z>0&&p.z<1);}
}
console.log('Action view: real blocked/routed walking, no tunneling, transformed endpoint bounds and complete two-state card framing and fixed-position viewport refitting passed.');
