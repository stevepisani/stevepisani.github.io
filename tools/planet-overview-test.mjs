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
// The roof is a frame around the useful furniture, not an object that must fit in full.
// Changing its overhang must not move the first activity farther down the curved horizon.
for(const aspect of [366/440,700/440]) {
  const bench=make('sheltered bench',1.4,.85,[0,19,-6]);
  const roof=make('canopy',6.4,.12,[0,19,-6],'support');roof.craft='canopy';roof.solid=false;
  roof.root.children[0].position.y=3.2;
  const small=overviewFrame([bench,roof],{aspect,fov:72,surface:()=>RADIUS});
  roof.root.children[0].scale.x=1.5;
  const large=overviewFrame([bench,roof],{aspect,fov:72,surface:()=>RADIUS});
  assert(!small.ids.includes(roof.id),'shelter architecture must not enlarge the activity union');
  assert(small.dir.distanceTo(large.dir)<1e-8,'roof overhang must not shrink the first activity');
  assert.equal(small.eye,1.8,'the sheltered approach remains below the roof');
  fits(small,aspect,72);
}
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
// An addition behind a tall activity needs another surface view, not a wider group photo.
const anchor=make('tall activity',2.5,2.5,[0,19,-6]);
const keepsake=make('new keepsake',.45,.65,[0,18.4,-8.4]);keepsake.near={of:anchor.id};
const unrelated=make('other nearby activity',7,3,[4,19,-7]);
const absoluteAddition=make('absolute addition',.55,.7,[2,19,-6]);absoluteAddition.frameWith=anchor.id;
const absoluteFrame=overviewFrame([anchor,unrelated,absoluteAddition],{aspect:700/440,fov:54,height:440,surface:()=>RADIUS,focusId:absoluteAddition.id});
assert(absoluteFrame.ids.includes(anchor.id),'an absolutely placed addition can keep its explicitly named activity in frame');
assert(!absoluteFrame.ids.includes(unrelated.id),'explicit context does not pull in other nearby activities');
for(const [width,height] of [[366,440],[700,440]]) {
  const editedFrame=overviewFrame([anchor,unrelated,keepsake],{aspect:width/height,fov:width<400?72:54,height,surface:()=>RADIUS,focusId:keepsake.id});
  assert(editedFrame.fits && editedFrame.detail?.meetsBudget,'a small obscured addition needs a visible, sufficiently large featured view');
  assert(editedFrame.ids.includes(anchor.id),'keep the addition’s immediate anchor in context');
  assert(!editedFrame.ids.includes(unrelated.id),'unrelated nearby activities must not shrink the edited reveal');
}
for(const root of objects)root.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
console.log('Overview: portrait/landscape bounds, environmental invariance, personal addition, open silhouettes, tolerant greeting targets and arrival clearance passed.');
