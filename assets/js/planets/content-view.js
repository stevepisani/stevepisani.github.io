// Readable surfaces are distinct from the hull that carries them. These measurements use
// actual transformed text planes; a post, the back of a sign or its empty box is not content.
import * as THREE from 'three';
export function contentSurfaces(thing) {
  const out=[];
  thing?.root?.traverse(mesh=>{
    if(!mesh.isMesh||!mesh.userData.content)return;
    mesh.geometry.computeBoundingBox();
    const b=mesh.geometry.boundingBox,at=(x,y)=>new THREE.Vector3(x,y,b.max.z).applyMatrix4(mesh.matrixWorld);
    const centre=at((b.min.x+b.max.x)/2,(b.min.y+b.max.y)/2),normal=new THREE.Vector3(0,0,1).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld));
    const points=[[0,0],[-.35,0],[.35,0],[0,-.16],[0,.16]].map(([x,y])=>at((b.min.x+b.max.x)/2+x*(b.max.x-b.min.x),(b.min.y+b.max.y)/2+y*(b.max.y-b.min.y)));
    out.push({mesh,message:mesh.userData.content.text??mesh.uuid,centre,normal,points,top:at((b.min.x+b.max.x)/2,b.max.y),bottom:at((b.min.x+b.max.x)/2,b.min.y),glyphFraction:mesh.userData.content.glyphFraction||2/3});
  });
  return out;
}
export function contentView(surfaces,camera,pickable,{height,area={x:.9,top:.8,bottom:-.76},minimumGlyphPixels=9}={}) {
  if(!surfaces.length)return null;
  const ray=new THREE.Raycaster(),measurements=surfaces.map(s=>{
    const facing=s.normal.dot(camera.position.clone().sub(s.centre).normalize());
    let visible=0;
    for(const point of s.points) {
      const p=point.clone().project(camera);
      if(p.z<=0||p.z>=1||Math.abs(p.x)>area.x||p.y>area.top||p.y<area.bottom)continue;
      ray.set(camera.position,point.clone().sub(camera.position).normalize());
      ray.far=camera.position.distanceTo(point)+.001; // nothing beyond this surface can obscure its words
      const hit=ray.intersectObjects(pickable,false)[0];
      if(hit?.object===s.mesh)visible++;
    }
    const a=s.top.clone().project(camera),b=s.bottom.clone().project(camera);
    const glyphPixels=Math.hypot((a.x-b.x)*camera.aspect,a.y-b.y)*height/2*s.glyphFraction;
    const visibleFraction=visible/s.points.length;
    return {message:s.message,facing,visibleFraction,glyphPixels,meetsBudget:facing>=.5&&visibleFraction>=.8&&glyphPixels>=minimumGlyphPixels};
  });
  // Identical messages on opposite sides are alternative reading faces. Every distinct
  // message still contributes: an exposed title cannot hide an edge-on personal sentence.
  const quality=m=>(m.facing>=.5&&m.visibleFraction>=.8?10:0)+Math.max(0,m.facing)+4*m.visibleFraction+2*Math.min(1,m.glyphPixels/minimumGlyphPixels);
  const byMessage=new Map();
  for(const m of measurements) {
    const previous=byMessage.get(m.message);
    if(!previous||(m.meetsBudget?100:0)+quality(m)>(previous.meetsBudget?100:0)+quality(previous))byMessage.set(m.message,m);
  }
  const chosen=[...byMessage.values()];
  const facing=Math.min(...chosen.map(m=>m.facing)),visibleFraction=Math.min(...chosen.map(m=>m.visibleFraction)),glyphPixels=Math.min(...chosen.map(m=>m.glyphPixels));
  return {surfaces:measurements.length,messages:chosen.length,facing,visibleFraction,glyphPixels,meetsBudget:chosen.every(m=>m.meetsBudget),score:quality({facing,visibleFraction,glyphPixels})};
}
