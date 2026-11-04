// Generic message surfaces, transformed and occluded independently of their supporting hull.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {contentSurfaces,contentView} from '../assets/js/planets/content-view.js';
import {overviewFrame} from '../assets/js/planets/overview.js';
import {RADIUS} from '../assets/js/world/planet.js';
const roots=[];
const material=()=>new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
function sign(id,turn=0,scale=1){
 const root=new THREE.Group();root.position.set(1,RADIUS,-5);root.rotation.y=turn;root.scale.setScalar(scale);
 const plate=new THREE.Mesh(new THREE.BoxGeometry(1.8,.7,.06),material());plate.position.y=.95;root.add(plate);
 const text=new THREE.Mesh(new THREE.PlaneGeometry(1.6,.36),material());text.position.set(0,.95,.045);text.rotation.z=.1;text.userData.content={glyphFraction:2/3};root.add(text);
 const post=new THREE.Mesh(new THREE.BoxGeometry(.08,1.7,.08),material());post.position.y=.5;root.add(post);root.updateMatrixWorld(true);roots.push(root);
 const t={id,root,center:root.position.clone(),role:'focus',footprint:[1.8,.2]};root.traverse(m=>{if(m.isMesh)m.userData.thing=t;});return {t,text,plate};
}
const sign1=sign('generic-message',Math.PI/2,1.3),surfaces=contentSurfaces(sign1.t),mesh=[];sign1.t.root.traverse(o=>{if(o.isMesh)mesh.push(o)});
assert.equal(surfaces.length,1);assert(surfaces[0].normal.distanceTo(new THREE.Vector3(1,0,0))<1e-6,'actual part/root normal must rotate, rather than use fixedworld +z');
const centre=surfaces[0].centre,cam=new THREE.PerspectiveCamera(54,700/440,.05,2000);cam.position.copy(centre).addScaledVector(surfaces[0].normal,2);cam.up.set(0,1,0);cam.lookAt(centre);cam.updateMatrixWorld(true);
const front=contentView(surfaces,cam,mesh,{height:440});assert(front.meetsBudget,'a close transformed front message must expose real content');
cam.position.copy(centre).addScaledVector(surfaces[0].normal,-2);cam.lookAt(centre);cam.updateMatrixWorld(true);assert(!contentView(surfaces,cam,mesh,{height:440}).meetsBudget,'DoubleSide text is still not readable from its mirrored back');
cam.position.copy(centre).add(new THREE.Vector3(0,0,2));cam.lookAt(centre);cam.updateMatrixWorld(true);assert(!contentView(surfaces,cam,mesh,{height:440}).meetsBudget,'an edge-on message is not rescued by its tall post');
cam.position.copy(centre).addScaledVector(surfaces[0].normal,2);cam.lookAt(centre);cam.updateMatrixWorld(true);
const blocker=new THREE.Mesh(new THREE.BoxGeometry(.3,2,3),material());blocker.position.copy(centre).addScaledVector(surfaces[0].normal,1);blocker.updateMatrixWorld(true);assert(!contentView(surfaces,cam,[blocker,...mesh],{height:440}).meetsBudget,'a real foreground occluder blocks content even when its own thing has visible geometry');
for(const [w,h]of [[366,440],[700,440]])for(const turn of [0,Math.PI/2,Math.PI,-.8]){
 const {t}=sign('addition',turn,.9);const anchor=sign('main-activity',-.2,1).t;anchor.root.position.set(-1,RADIUS,-5);anchor.root.updateMatrixWorld(true);anchor.center.copy(anchor.root.position);t.frameWith=anchor.id;
 const before=[anchor,t].map(t=>t.root.matrixWorld.toArray());const opts={aspect:w/h,fov:w<400?72:54,height:h,surface:()=>RADIUS};
 const detail=overviewFrame([anchor,t],{...opts,focusId:t.id});assert(detail.fits);assert(detail.content?.facing>=.5,'edited view must select actual message face at either viewport');assert(detail.content.visibleFraction>=.8,'message points must clear their own support and other meshes');
 const whole=overviewFrame([anchor,t],{...opts,contentId:t.id});assert(whole.fits);assert(whole.content?.facing>=.5,'whole-place return must not turn a new message backwards');assert(whole.content.visibleFraction>=.8,'whole-place return must expose the message plane, not merely its hull');
 assert.deepEqual([anchor,t].map(t=>t.root.matrixWorld.toArray()),before,'view selection must not rotate, resize or move scene objects');
}
// A far, large contextual structure must not make the message a tiny distant speck.
for(const [width,height] of [[366,440],[700,440]]) {
 const {t:message,text}=sign('long-unrelated-message',Math.PI/2,.8);
 text.scale.y=.45;message.root.updateMatrixWorld(true);
 const {t:architecture}=sign('large-unrelated-anchor',0,3);
 architecture.root.position.set(-2,RADIUS,-8);architecture.root.updateMatrixWorld(true);architecture.center.copy(architecture.root.position);message.frameWith=architecture.id;
 const frame=overviewFrame([architecture,message],{aspect:width/height,fov:width<400?72:54,height,surface:()=>RADIUS,focusId:message.id});
 assert(frame.fits&&frame.content.meetsBudget,'addition-close framing must feature the actual narrow message, with a large anchor as context');
 assert(frame.ids.includes(architecture.id),'declared context remains identified without requiring its entire envelope');
}
for(const r of roots)r.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});blocker.geometry.dispose();blocker.material.dispose();
console.log('Content views: transformed front/edge/back, glyph extent, true occlusion, both addition/whole-place sizes and stable geometry passed.');
