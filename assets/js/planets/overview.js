// Frame the actual primary activity, independently of its theme, on the receiving viewport.
// Environmental silhouettes can frame its edges; remote discoveries do not shrink the hero.
import * as THREE from 'three';
import { RADIUS } from '../world/planet.js';
import { BODY } from '../world/player.js';
import { pickThing } from './picking.js';
const UP = new THREE.Vector3(0,1,0);

export function overviewFrame(things, { aspect, fov, surface, colliders = [], height = 720 }) {
  for(const t of things)t.root?.updateWorldMatrix(true,true);
  const primary = things.find(t=>t.root && t.role==='focus') || things.find(t=>t.root && t.solid!==false) || things.find(t=>t.root);
  if (!primary) return null;
  const bounds = new THREE.Box3().setFromObject(primary.root), ids = [primary.id];
  for (const t of things) {
    if (t===primary || !t.root || t.center.distanceTo(primary.center)>5.5 || t.role==='environment' || (!t.role && t.solid===false && !t.use)) continue;
    const b=new THREE.Box3().setFromObject(t.root), size=b.getSize(new THREE.Vector3());
    // A narrow trunk's broad canopy is environmental framing, rather than a huge solid hero.
    if (!t.role && !t.use && t.footprint && Math.max(size.x,size.z)>3*Math.max(...t.footprint)*(t.scale||1)) continue;
    bounds.union(b);ids.push(t.id);
  }
  const size=bounds.getSize(new THREE.Vector3()),target=bounds.getCenter(new THREE.Vector3());
  const toward=primary.center.clone().addScaledVector(UP,-primary.center.y).normalize();
  if (!toward.lengthSq()) toward.set(0,0,-1);
  const side=new THREE.Vector3().crossVectors(UP,toward);

  const start=-UP.angleTo(primary.center.clone().normalize())*RADIUS+1.5;
  const corners=[];
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])corners.push(new THREE.Vector3(x,y,z));
  const probe=new THREE.PerspectiveCamera(fov,aspect,.05,2000);
  const pickable=[];
  for(const t of things)t.root?.traverse(o=>{if(o.isMesh){o.geometry.computeBoundingBox();pickable.push(o);}});
  const focus=things.filter(t=>ids.includes(t.id) && (t.role==='focus'||(!t.role&&['greet','look'].includes(t.use))||t===primary));
  const caster=new THREE.Raycaster();
  const samples=new Map();
  for(const t of focus) {
    const points=[new THREE.Box3().setFromObject(t.root).getCenter(new THREE.Vector3())];
    // A frame, branch or a pair of planters can have an empty box centre. Sample real faces
    // as well, so an arbitrary gap does not force the camera farther away from the activity.
    t.root.traverse(o=>{
      if(!o.isMesh)return;
      const g=o.geometry,p=g.attributes.position,index=g.index,count=index?index.count:p.count;
      for(let k=0;k<5;k++) {
        const start=3*Math.floor((count/3-1)*k/4),v=new THREE.Vector3();
        for(let j=0;j<3;j++)v.add(new THREE.Vector3().fromBufferAttribute(p,index?index.getX(start+j):start+j));
        points.push(v.multiplyScalar(1/3).applyMatrix4(o.matrixWorld));
      }
    });
    samples.set(t.id,points);
  }
  let best=null,bestScore=-1,fallback={dir:UP.clone(),target,eye:3,pitch:-.3,bounds,ids,fits:false,visible:[]};
  // Search stable walking-surface positions, not a free-floating orbital camera or a flight.
  for(let b=start;b<=14;b+=.2) for(const angle of [.45,-.45,0,.9,-.9]) {
    const back=toward.clone().negate().addScaledVector(side,angle).normalize();
    const dir=UP.clone().multiplyScalar(Math.cos(b/RADIUS)).addScaledVector(back,Math.sin(b/RADIUS)).normalize();
    const foot=dir.clone().multiplyScalar(surface(dir));
    if(colliders.some(c=>foot.distanceTo(c.center)<c.radius+BODY+.1)) continue;
    const eye=THREE.MathUtils.clamp(size.y*.7+2,2.8,7);
    probe.position.copy(foot).addScaledVector(dir,eye);probe.up.copy(dir);probe.lookAt(target);probe.updateMatrixWorld(true);
    const projected=corners.map(p=>p.clone().project(probe));
    const fits=projected.every(p=>Math.abs(p.x)<.83 && p.y<.8 && p.y>-.76 && p.z>0 && p.z<1);
    const pitch=Math.asin(target.clone().sub(probe.position).normalize().dot(dir));
    fallback={dir,target,eye,pitch,bounds,ids,fits:false,visible:[]};
    if(!fits)continue;
    const visible=focus.map(t=>{
      return samples.get(t.id).some(point=>{
        caster.set(probe.position,point.clone().sub(probe.position).normalize());
        return pickThing(caster,things,pickable)?.id===t.id;
      });
    });
    // A readable fragment is not enough for a small companion. Prefer a clear body-sized
    // tap patch, so a chair edge cannot steal the greeting at a slightly rounded pixel.
    const greetings=focus.filter(t=>t.use==='greet');
    const tappable=greetings.filter(t=>{
      const centre=new THREE.Box3().setFromObject(t.root).getCenter(new THREE.Vector3()).project(probe);
      return [[0,0],[-5,0],[5,0],[0,-5],[0,5]].every(([x,y])=>{
        caster.setFromCamera(new THREE.Vector2(centre.x+2*x/(height*aspect),centre.y+2*y/height),probe);
        return pickThing(caster,things,pickable)?.id===t.id;
      });
    });
    const score=visible.filter(Boolean).length+tappable.length*2;
    const frame={dir,target,eye,pitch,bounds,ids,fits,visible:focus.filter((_,i)=>visible[i]).map(t=>t.id),tappable:tappable.map(t=>t.id)};
    if(score>bestScore){best=frame;bestScore=score;}
    if(visible.every(Boolean) && tappable.length===greetings.length)return frame;
  }
  return best||fallback;
}
