// Shared content contracts: recognizable stock fallbacks and supported feet on curved terrain.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {checkPlanet,partsOf,STOCK} from '../supabase/functions/_shared/planet.js';
import {fitGroundSupport} from '../assets/js/planets/ground-support.js';
import {buildGround} from '../assets/js/planets/ground.js';
const base={version:1,slug:'test-craft',who:{name:'Stock review'}};
for(const kind of Object.keys(STOCK)) {
  const parts=partsOf({stock:kind});
  assert(STOCK[kind].file ? parts.length===1 : parts.length>1,`${kind}: ready library has a measured diagnostic envelope; legacy stock keeps its recognizable fallback`);
  assert(parts.length<=40,`${kind} must respect the per-thing parts cap`);
  assert.deepEqual(checkPlanet({...base,things:[{id:'prop',name:kind,parts,at:{bearing:0,distance:5}}]}),[],`${kind} fallback must obey the public authoring contract`);
}
for(const terrain of [()=>20,dir=>20+.5*Math.sin(dir.x*4+dir.z*2)])for(const scale of [.5,1,2])for(const bearing of [-1,0,1]){
  const root=new THREE.Group(),dir=new THREE.Vector3(Math.sin(bearing)*.2,1,-.3).normalize();root.position.copy(dir).multiplyScalar(terrain(dir));root.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir);root.scale.setScalar(scale);
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(.1,2,.1),new THREE.MeshBasicMaterial());mesh.position.set(2.4,1,1.6);root.add(mesh);root.updateMatrixWorld(true);
  const top=root.localToWorld(new THREE.Vector3(2.4,2,1.6));
  assert(fitGroundSupport(mesh,root,terrain),'a supported upright foot should fit');root.updateMatrixWorld(true);
  const after=mesh.localToWorld(new THREE.Vector3(0,1,0)),bottom=mesh.localToWorld(new THREE.Vector3(0,-1,0));
  assert(after.distanceTo(top)<1e-7,'the top attachment must remain fixed');
  assert(Math.abs(bottom.length()-terrain(bottom.clone().normalize()))<.016,'the bottom must meet the curved surface with a slight sink');
  mesh.geometry.dispose();mesh.material.dispose();
}
const original=buildGround(base.slug,{hills:.4}),directions=[[0,1,0],[.4,1,-.3],[-.5,.5,.2]];
for(const cover of ['grass','sand','snow','paving']){
 const g=buildGround(base.slug,{hills:.4,cover});
 for(const values of directions){const dir=new THREE.Vector3(...values).normalize();assert.equal(g.surface(dir),original.surface(dir),'surface treatment must not move terrain or walking');}
 if(cover==='grass'){const t={solid:true,center:new THREE.Vector3(0,g.surface(new THREE.Vector3(0,1,0)),0),reach:1};g.dress([t]);const grass=g.mesh.getObjectByName('ground-grass'),m=new THREE.Matrix4(),p=new THREE.Vector3();assert(grass.count<=1600,'phone cover must be bounded');for(let i=0;i<grass.count;i++){grass.getMatrixAt(i,m);p.setFromMatrixPosition(m);assert(p.distanceTo(t.center)>=1.34,'ground cover must leave usable props clear');}}
 g.mesh.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
}
// An additive prop may clear cover at its own foot, but must not reshuffle existing cover.
const ga=buildGround(base.slug,{hills:.4,cover:'grass'}),gb=buildGround(base.slug,{hills:.4,cover:'grass'});
ga.dress([]);gb.dress([{solid:true,center:new THREE.Vector3(0,20,0),reach:2}]);
const positions=g=>{const grass=g.mesh.getObjectByName('ground-grass'),matrix=new THREE.Matrix4(),out=[];for(let i=0;i<grass.count;i++){grass.getMatrixAt(i,matrix);out.push(matrix.elements.map(n=>n.toFixed(5)).join(','));}return out;};
const initial=new Set(positions(ga));assert(positions(gb).every(p=>initial.has(p)),'an additive edit must not reshuffle cover elsewhere');
for(const g of [ga,gb])g.mesh.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
original.mesh.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
console.log('Craft: nine valid stock silhouettes; top anchors preserved; feet grounded at varied orientations/scales; surface/cover bounds passed.');
