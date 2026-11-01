// Framing contracts, independent of a particular interview or tropical layout.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {overviewFrame} from '../assets/js/planets/overview.js';
import {RADIUS} from '../assets/js/world/planet.js';
const objects=[];
function make(id,width,height,position,role='focus') {
  const root=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(width,height,1),new THREE.MeshBasicMaterial());
  mesh.position.y=height/2;root.position.fromArray(position);root.add(mesh);root.updateMatrixWorld(true);objects.push(root);
  const t={id,root,center:root.position.clone(),footprint:[width,1],role};mesh.userData.thing=t;return t;
}
function fits(frame,aspect,fov) {
  assert(frame?.fits,'a supported primary activity should fit');
  const cam=new THREE.PerspectiveCamera(fov,aspect,.05,2000);cam.position.copy(frame.dir).multiplyScalar(RADIUS+frame.eye);cam.up.copy(frame.dir);cam.lookAt(frame.target);cam.updateMatrixWorld(true);
  for(const x of [frame.bounds.min.x,frame.bounds.max.x])for(const y of [frame.bounds.min.y,frame.bounds.max.y])for(const z of [frame.bounds.min.z,frame.bounds.max.z]) {
    const p=new THREE.Vector3(x,y,z).project(cam);assert(Math.abs(p.x)<.85 && Math.abs(p.y)<.85 && p.z<1,'bounds should clear the viewport edges');
  }
}
for(const [w,h] of [[1,2],[5,4],[3,7]])for(const aspect of [390/844,1280/720]) {
  const focus=make('activity',w,h,[0,19,-6]);const fov=aspect<1?72:54;
  const frame=overviewFrame([focus],{aspect,fov,surface:()=>RADIUS});fits(frame,aspect,fov);
  const far=make('distant scenery',12,12,[18,8,-15],'environment');
  const withScenery=overviewFrame([focus,far],{aspect,fov,surface:()=>RADIUS});
  assert(frame.dir.distanceTo(withScenery.dir)<1e-8,'remote environmental scenery must not shrink the first activity');
}
const focus=make('main',2,2,[0,19,-6]),addition=make('personal addition',.6,1,[2,19,-6]);
const frame=overviewFrame([focus,addition],{aspect:390/844,fov:72,surface:()=>RADIUS});
assert(frame.ids.includes(addition.id),'a nearby personal addition participates in the opening frame');fits(frame,390/844,72);
const feet=frame.dir.clone().multiplyScalar(RADIUS),collider={center:feet,radius:.5};
const clear=overviewFrame([focus,addition],{aspect:390/844,fov:72,surface:()=>RADIUS,colliders:[collider]});
assert(clear.dir.clone().multiplyScalar(RADIUS).distanceTo(collider.center)>.8,'arrival feet must clear nearby solids');
const open=make('open shape',1,1,[0,19,-6]);open.solid=false;
const original=open.root.children[0];open.root.remove(original);
for(const x of [-1.5,1.5]) {const m=original.clone();m.position.x=x;open.root.add(m);}
open.root.updateMatrixWorld(true);
const openFrame=overviewFrame([open],{aspect:390/844,fov:72,surface:()=>RADIUS});
assert(openFrame.visible.includes(open.id),'an open silhouette is visible even when its bounding centre is air');
// A narrow foreground post leaves the body partly visible while stealing its centre tap.
// This arrangement failed the former surface-sample-only view; the greeting needs a clear patch.
const activity=make('workspace',2,1,[0,19,-6]);
const companion=make('small companion',.5,.8,[-1,19,-5]);companion.use='greet';
companion.root.children[0].scale.z=.5;
const post=make('foreground post',.12,1.4,[-.4,19,-4.8],'support');post.root.children[0].scale.z=.12;
const greetingFrame=overviewFrame([activity,companion,post],{aspect:1.6,fov:54,height:800,surface:()=>RADIUS});
assert(greetingFrame.tappable.includes(companion.id),'a visible companion should have a clear, tolerant greeting target');
for(const root of objects)root.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
console.log('Overview: portrait/landscape bounds, environmental invariance, personal addition, open silhouettes, tolerant greeting targets and arrival clearance passed.');
