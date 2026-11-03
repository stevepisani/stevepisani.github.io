// One hit policy for real taps and opening-view visibility checks. Gaps in a solid object's
// visual hull still belong to it; a decorative canopy does not claim the empty space below it.
import * as THREE from 'three';
const localRay=new THREE.Ray(),inverse=new THREE.Matrix4(),point=new THREE.Vector3();
export function pickThing(caster, things, pickable, limit=Infinity, occupiedSeat=null) {
  const hit=caster.intersectObjects(pickable,false)[0];
  let best=hit && hit.distance<=limit?hit.object.userData.thing:null,d=best?hit.distance:limit;
  for(const t of things) {
    // Looking out of a seat may cross its empty hull above an armrest. Only its real mesh
    // should block that view; keep ordinary standing hull picks and actual mesh occlusion.
    if(!t.root||!t.hull||t.solid===false||t.id===occupiedSeat)continue;
    localRay.copy(caster.ray).applyMatrix4(inverse.copy(t.root.matrixWorld).invert());
    if(t.hull.containsPoint(localRay.origin))continue;
    const p=localRay.intersectBox(t.hull,point),k=p&&p.applyMatrix4(t.root.matrixWorld).distanceTo(caster.ray.origin);
    if(k!==null&&k<d){best=t;d=k;}
  }
  return best;
}
