// Soft material footprints derived from the built scene. No terrain or collision changes.
import * as THREE from 'three';
import {DEFAULT_GROUND_BASE} from '../../../supabase/functions/_shared/planet.js';

const FEATHER = 0.85, MARGIN = 0.8;
const clamp = THREE.MathUtils.clamp, smooth = THREE.MathUtils.smoothstep;
export const BASE_COLORS = Object.freeze({rock:'#777b73',grass:'#748566'});
export const COVER_COLORS = Object.freeze({rock:'#777b73',grass:'#84976c',sand:'#cbbd99',snow:'#d8dce0',paving:'#958c78'});
export function groundBase(base){return base==='grass'||base==='rock'?base:DEFAULT_GROUND_BASE;}

// Use tangent rectangles, not the object's tall spherical picking envelope: a canopy or
// screen must not turn half the planet into paving. Nearby rectangles overlap into a scene.
export function sceneGroundZones(things=[]) {
  return things.filter(t=>!t.on&&t.role!=='environment'&&t.center).map(t=>{
    const center=t.center.clone(),up=center.clone().normalize();
    let right=new THREE.Vector3(1,0,0).addScaledVector(up,-up.x).normalize();
    let forward=new THREE.Vector3().crossVectors(right,up).normalize();
    let hx=Math.min(4,t.reach||.7),hz=hx;
    if(t.root&&t.box){
      t.root.updateWorldMatrix(true,false);
      right.setFromMatrixColumn(t.root.matrixWorld,0).normalize();forward.setFromMatrixColumn(t.root.matrixWorld,2).normalize();
      const scale=t.root.getWorldScale(new THREE.Vector3());
      const bounds=t.footprint?{min:{x:-t.footprint[0]/2,z:-t.footprint[1]/2},max:{x:t.footprint[0]/2,z:t.footprint[1]/2}}:t.box;
      hx=clamp((bounds.max.x-bounds.min.x)*scale.x/2,.2,5);hz=clamp((bounds.max.z-bounds.min.z)*scale.z/2,.2,5);
      center.addScaledVector(right,(bounds.min.x+bounds.max.x)*scale.x/2).addScaledVector(forward,(bounds.min.z+bounds.max.z)*scale.z/2);
    }
    return {id:t.id,center,up,right,forward,hx:hx+MARGIN,hz:hz+MARGIN,feather:FEATHER};
  });
}
export function zoneWeight(point,zones){
  let weight=0;
  for(const z of zones){
    const dx=point.x-z.center.x,dy=point.y-z.center.y,dz=point.z-z.center.z;
    // Opposite sides of a sphere can share tangent coordinates.
    if(point.dot(z.up)<z.center.dot(z.up)-5)continue;
    const x=Math.abs(dx*z.right.x+dy*z.right.y+dz*z.right.z)-z.hx;
    const y=Math.abs(dx*z.forward.x+dy*z.forward.y+dz*z.forward.z)-z.hz;
    const distance=Math.hypot(Math.max(0,x),Math.max(0,y));
    weight=Math.max(weight,1-smooth(distance,0,z.feather));
    if(weight===1)return 1;
  }
  return weight;
}

// Read the actual path ribbon, after buildPaths. It contains two vertices at every sample;
// their midpoint is the same receiving-terrain route the visitor sees (including its bend).
export function pathGroundSegments(paths){
  const position=paths?.geometry?.attributes?.position;if(!position)return [];
  const segments=[],connections=new Set(),ix=paths.geometry.index;
  if(ix)for(let j=0;j<ix.count;j+=3)connections.add(`${ix.getX(j)},${ix.getX(j+1)},${ix.getX(j+2)}`);
  for(let i=0;i+3<position.count;i+=2){
    const a=new THREE.Vector3().fromBufferAttribute(position,i).add(new THREE.Vector3().fromBufferAttribute(position,i+1)).multiplyScalar(.5);
    const b=new THREE.Vector3().fromBufferAttribute(position,i+2).add(new THREE.Vector3().fromBufferAttribute(position,i+3)).multiplyScalar(.5);
    // Separate ribbons are indexed independently. Do not clear an invented path between them.
    if(!ix||connections.has(`${i},${i+1},${i+2}`))segments.push({a,b,width:.72});
  }
  return segments;
}
export function pathWeight(point,segments){
  let weight=0;
  for(const {a,b,width} of segments){
    const x=b.x-a.x,y=b.y-a.y,z=b.z-a.z;
    const length=x*x+y*y+z*z;if(length<1e-8)continue;
    const u=clamp(((point.x-a.x)*x+(point.y-a.y)*y+(point.z-a.z)*z)/length,0,1);
    const distance=Math.hypot(point.x-a.x-u*x,point.y-a.y-u*y,point.z-a.z-u*z);
    weight=Math.max(weight,1-smooth(distance,width,width+.25));
  }
  return weight;
}
// Collision, framing role and physical ground coverage are separate concerns. A walk-through
// floor still covers grass; a tabletop prop or a wholly raised decoration does not.
export function groundClearance(things=[]){
  const blockers=[];
  for(const t of things){
    if(t.on||!t.center)continue;
    if(t.root&&t.box){
      t.root.updateWorldMatrix(true,false);
      const scale=t.root.getWorldScale(new THREE.Vector3());
      if(t.box.min.y*scale.y>.35&&!t.footprint)continue;
      const right=new THREE.Vector3().setFromMatrixColumn(t.root.matrixWorld,0).normalize();
      const forward=new THREE.Vector3().setFromMatrixColumn(t.root.matrixWorld,2).normalize();
      const bounds=t.footprint?{min:{x:-t.footprint[0]/2,z:-t.footprint[1]/2},max:{x:t.footprint[0]/2,z:t.footprint[1]/2}}:t.box;
      const center=t.center.clone().addScaledVector(right,(bounds.min.x+bounds.max.x)*scale.x/2).addScaledVector(forward,(bounds.min.z+bounds.max.z)*scale.z/2);
      blockers.push({center,up:t.center.clone().normalize(),right,forward,hx:clamp((bounds.max.x-bounds.min.x)*scale.x/2,.15,6)+.25,hz:clamp((bounds.max.z-bounds.min.z)*scale.z/2,.15,6)+.25});
    }else blockers.push({center:t.center,radius:clamp(t.reach||.5,.15,6)+.35});
  }
  return blockers;
}
export function occupiedGround(point,blockers){
  return blockers.some(b=>{
    if(b.radius!==undefined)return point.distanceToSquared(b.center)<b.radius*b.radius;
    if(point.dot(b.up)<b.center.dot(b.up)-5)return false;
    const x=point.x-b.center.x,y=point.y-b.center.y,z=point.z-b.center.z;
    return Math.abs(x*b.right.x+y*b.right.y+z*b.right.z)<b.hx&&Math.abs(x*b.forward.x+y*b.forward.y+z*b.forward.z)<b.hz;
  });
}
