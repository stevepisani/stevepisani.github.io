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
    out.push({mesh,centre,normal,points,top:at((b.min.x+b.max.x)/2,b.max.y),bottom:at((b.min.x+b.max.x)/2,b.min.y),glyphFraction:mesh.userData.content.glyphFraction||2/3});
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
      const hit=ray.intersectObjects(pickable,false)[0];
      if(hit?.object===s.mesh)visible++;
    }
    const a=s.top.clone().project(camera),b=s.bottom.clone().project(camera);
    const glyphPixels=Math.hypot((a.x-b.x)*camera.aspect,a.y-b.y)*height/2*s.glyphFraction;
    const visibleFraction=visible/s.points.length;
    return {facing,visibleFraction,glyphPixels,meetsBudget:facing>=.5&&visibleFraction>=.8&&glyphPixels>=minimumGlyphPixels};
  });
  // Every text surface contributes: a small exposed title must not conceal an edge-on message.
  const facing=Math.min(...measurements.map(m=>m.facing)),visibleFraction=Math.min(...measurements.map(m=>m.visibleFraction)),glyphPixels=Math.min(...measurements.map(m=>m.glyphPixels));
  return {surfaces:measurements.length,facing,visibleFraction,glyphPixels,meetsBudget:measurements.every(m=>m.meetsBudget),score:(facing>=.5&&visibleFraction>=.8?10:0)+Math.max(0,facing)+4*visibleFraction+2*Math.min(1,glyphPixels/minimumGlyphPixels)};
}
