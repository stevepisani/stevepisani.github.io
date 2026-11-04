// A bounded reversible state change, not a script or a simulation of the named activity.
import * as THREE from 'three';
export function responsePart(mesh,part){
  const from={position:mesh.position.clone(),scale:mesh.scale.clone()},to={position:new THREE.Vector3().fromArray(part.after.at||part.at||[0,part.size[1]/2,0]),scale:mesh.scale.clone()};
  if(part.after.size)for(let k=0;k<3;k++)to.scale.setComponent(k,from.scale.getComponent(k)*part.after.size[k]/part.size[k]);
  return {mesh,apply(k){mesh.position.lerpVectors(from.position,to.position,k);mesh.scale.lerpVectors(from.scale,to.scale,k);if(mesh.material.userData.vapor)mesh.material.uniforms.amount.value=k;}};
}
export function responseState(parts,{hold=null}={}){
  let value=0,from=0,to=0,start=0,reduced=false;
  const apply=k=>{value=k;for(const p of parts)p.apply(k);};
  return {
    toggle(now,settled=false){from=value;to=to?0:1;start=now;reduced=settled;if(reduced){from=to;apply(to);}return !!to;},
    update(now){if(to&&hold!==null&&now>=start+(reduced?0:1.2)+hold){const until=start+(reduced?0:1.2)+hold;from=1;to=0;start=until;if(reduced){from=0;apply(0);}}const k=THREE.MathUtils.clamp((now-start)/1.2,0,1);apply(from+(to-from)*k*k*(3-2*k));},
    get value(){return value;},
    get active(){return !!to;},
    get reduced(){return reduced;},
  };
}
