// Extend an upright support down to the shared curved terrain while preserving its top joint.
// Only explicit vertical box/cylinder supports use this; roofs and personal objects never move.
import * as THREE from 'three';
export function fitGroundSupport(mesh,root,surface) {
  root.updateMatrixWorld(true);
  mesh.geometry.computeBoundingBox();
  const box=mesh.geometry.boundingBox,oldBottom=mesh.position.y+box.min.y*mesh.scale.y,top=mesh.position.y+box.max.y*mesh.scale.y;
  const scale=root.scale.y,radius=root.position.length(),offset=(mesh.position.x**2+mesh.position.z**2)*scale*scale;
  let y=oldBottom;
  for(let i=0;i<8;i++) {
    const point=root.localToWorld(new THREE.Vector3(mesh.position.x,y,mesh.position.z)),r=surface(point.clone().normalize());
    if(r*r<=offset)return false;
    y=(Math.sqrt(r*r-offset)-radius)/scale;
  }
  const bottom=y-.015/scale;
  if(bottom>=top-.01)return false;
  mesh.scale.y*=(top-bottom)/(top-oldBottom);
  mesh.position.y=top-box.max.y*mesh.scale.y;
  mesh.userData.grounded=true;
  return true;
}
