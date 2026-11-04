// A tap chooses a clear surface approach, then a deliberate view of both response states.
// Reuse the homepage's obstacle routing and the planet's ordinary geometry/visibility fitter.
import * as THREE from 'three';
import { onPlanet } from '../world/route.js';
import { BODY } from '../world/player.js';
import { RADIUS } from '../world/planet.js';
import { overviewFrame } from './overview.js';
import { pickThing } from './picking.js';
export function actionBounds(thing) {
  thing.root.updateWorldMatrix(true,true);
  // box is the authored union of both endpoints, measured before placement, rotation and scale.
  return thing.box?.clone().applyMatrix4(thing.root.matrixWorld)||new THREE.Box3().setFromObject(thing.root);
}
export function approachRoute(from,to,colliders,surface) {
  return onPlanet(from,to,colliders,{R:RADIUS,body:BODY+.1}).map(up=>up.multiplyScalar(surface(up)));
}
export function responseFrame(thing,things,{aspect,fov,height,surface,colliders}) {
  // Upper controls finish at 116 px; the response caption sits below the framed geometry.
  // Use both endpoint bounds so the user can reverse without another camera move.
  return overviewFrame(things,{aspect,fov,height,surface,colliders,focusId:thing.id,focusOnly:true,boundsFor:t=>t===thing?actionBounds(t):null,frameArea:{x:.88,top:1-264/height,bottom:-1+242/height}});
}

// Rotation must not teleport an inspecting visitor to a newly searched surface position.
// Refit the same ground point by changing only the deliberate inspection eye and lens.
export function responseFrameAt(thing,things,{point,eye,fov,aspect,height}) {
  const bounds=actionBounds(thing),target=bounds.getCenter(new THREE.Vector3()),up=point.clone().normalize();
  const area={x:.88,top:1-264/height,bottom:-1+242/height},corners=[];
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])corners.push(new THREE.Vector3(x,y,z));
  const probe=new THREE.PerspectiveCamera(fov,aspect,.05,2000),eyes=[eye],lenses=[fov],pickable=[],samples=[target],ray=new THREE.Raycaster();
  for(const t of things)t.root?.traverse(o=>{if(o.isMesh)pickable.push(o);});
  thing.body?.traverse(o=>{
    if(!o.isMesh)return;const g=o.geometry,p=g.attributes.position,ix=g.index,count=ix?ix.count:p.count;
    for(let i=0;i<5;i++){const n=3*Math.floor((count/3-1)*i/4),v=new THREE.Vector3();for(let j=0;j<3;j++)v.add(new THREE.Vector3().fromBufferAttribute(p,ix?ix.getX(n+j):n+j));samples.push(v.multiplyScalar(1/3).applyMatrix4(o.matrixWorld));}
  });
  for(let h=1.6;h<=12;h+=.5)if(Math.abs(h-eye)>.01)eyes.push(h);
  for(let lens=fov+2.5;lens<=100; lens+=2.5)lenses.push(lens);
  let best=null,score=Infinity;
  for(const lens of lenses)for(const h of eyes) {
    const cost=Math.abs(lens-fov)+15*Math.abs(h-eye);if(cost>=score)continue;
    probe.fov=lens;probe.updateProjectionMatrix();probe.position.copy(point).addScaledVector(up,h);probe.up.copy(up);probe.lookAt(target);probe.updateMatrixWorld(true);
    if(!corners.every(p=>{const q=p.clone().project(probe);return Math.abs(q.x)<area.x&&q.y<area.top&&q.y>area.bottom&&q.z>0&&q.z<1;}))continue;
    if(!samples.some(p=>{ray.set(probe.position,p.clone().sub(probe.position).normalize());return pickThing(ray,things,pickable)?.id===thing.id;}))continue;
    score=cost;best={point:point.clone(),dir:up.clone(),target,bounds,eye:h,fov:lens,pitch:Math.asin(target.clone().sub(probe.position).normalize().dot(up)),fits:true};
  }
  return best;
}
