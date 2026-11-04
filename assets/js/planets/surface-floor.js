// A thin explicitly authored setting surface conforms to the same terrain the player walks.
// Bake each small panel into thing-local coordinates, then solve its base at every vertex;
// this preserves supports/activity transforms instead of pretending a flat disc is walkable.
import * as THREE from 'three';
export function conformSurfaceFloor(mesh,root,surface) {
  root.updateWorldMatrix(true,false);mesh.updateMatrix();
  const g=mesh.geometry.clone().applyMatrix4(mesh.matrix),p=g.attributes.position;
  const radius=root.position.length(),scale=root.scale.y,point=new THREE.Vector3();
  for(let i=0;i<p.count;i++) {
    const x=p.getX(i),z=p.getZ(i),offset=(x*x+z*z)*scale*scale;
    let ground=0;
    for(let k=0;k<8;k++) {
      point.set(x,ground,z);root.localToWorld(point);const r=surface(point.normalize());
      if(!Number.isFinite(r)||r*r<=offset)throw Error('The setting surface is outside its terrain');
      ground=(Math.sqrt(r*r-offset)-radius)/scale;
    }
    p.setY(i,p.getY(i)+ground);
  }
  g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();
  // The primitive/shared source geometry is still owned by the renderer cache.
  mesh.geometry=g;mesh.position.set(0,0,0);mesh.rotation.set(0,0,0);mesh.scale.setScalar(1);
  mesh.userData.terrainSurface=true;
  return mesh;
}
