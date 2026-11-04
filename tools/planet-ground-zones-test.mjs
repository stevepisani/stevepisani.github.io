import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildGround} from '../assets/js/planets/ground.js';
import {groundBase,sceneGroundZones,zoneWeight,pathGroundSegments,pathWeight,groundClearance,occupiedGround} from '../assets/js/planets/ground-zones.js';
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
const thing=(x,z=0)=>{const root=new THREE.Group();root.position.set(x,20,z);root.updateMatrixWorld(true);return {id:`thing-${x}-${z}`,root,center:root.position.clone(),box:new THREE.Box3(V(-1,0,-1),V(1,2,1)),reach:1.4};};
assert.equal(groundBase(undefined,'paving'),'rock');assert.equal(groundBase(undefined,'grass'),'rock');assert.equal(groundBase('grass','snow'),'grass');
const first=thing(0),next=thing(3),zones=sceneGroundZones([first,next]);
for(let x=-1;x<=4;x+=.2)assert(zoneWeight(V(x,20,0),zones)>.95,'nearby scene furnishings must share a continuous material patch');
assert.equal(zoneWeight(V(0,-20,0),zones),0,'a local treatment must not reach the opposite side of the planet');
assert.equal(zoneWeight(V(10,18,0),zones),0,'non-scene areas retain the common base');
assert(zoneWeight(V(2.2,20,-2.2),sceneGroundZones([first]))>0&&zoneWeight(V(2.2,20,-2.2),sceneGroundZones([first]))<1,'patch edges must feather instead of ending as a sticker');
assert.equal(sceneGroundZones([{...first,role:'environment'},{...next,on:{of:'table'}}]).length,0,'remote scenery and tabletop objects cannot repaint terrain');
const pathGeo=new THREE.BufferGeometry();pathGeo.setAttribute('position',new THREE.Float32BufferAttribute([-.45,20,0,.45,20,0,-.45,20,-3,.45,20,-3, 4,20,0,5,20,0,4,20,-3,5,20,-3],3));pathGeo.setIndex([0,1,2,1,3,2,4,5,6,5,7,6]);
const segments=pathGroundSegments({geometry:pathGeo});assert.equal(segments.length,2,'separate ribbons must not invent a connecting path');assert.equal(pathWeight(V(0,20,-1),segments),1);assert.equal(pathWeight(V(2.4,20,-1),segments),0);
const matrixPositions=mesh=>{const matrix=new THREE.Matrix4(),out=[];for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);out.push(matrix.elements.map(n=>n.toFixed(5)).join(','));}return out;};
const config={base:'grass',cover:'paving',hills:.1,color:'#b08e67'};
const a=buildGround('ground-contract',config),b=buildGround('ground-contract',config);a.dress([first],[],{geometry:pathGeo});b.dress([first,next],[],{geometry:pathGeo});
assert.deepEqual([...a.mesh.geometry.attributes.position.array],[...b.mesh.geometry.attributes.position.array],'scene patches and additions must not move terrain or walking');
const before=new Set(matrixPositions(a.mesh.getObjectByName('ground-grass')));assert(matrixPositions(b.mesh.getObjectByName('ground-grass')).every(p=>before.has(p)),'an additive prop must only clear nearby tufts');
const stonesBefore=new Set(matrixPositions(a.mesh.getObjectByName('ground-stones')));assert(matrixPositions(b.mesh.getObjectByName('ground-stones')).every(p=>stonesBefore.has(p)),'an additive prop must only clear nearby pebbles');
const grass=a.mesh.getObjectByName('ground-grass'),m=new THREE.Matrix4(),point=new THREE.Vector3();for(let i=0;i<grass.count;i++){grass.getMatrixAt(i,m);point.setFromMatrixPosition(m);assert(zoneWeight(point,a.mesh.userData.groundZones)<.02);assert(pathWeight(point,segments)<.02);}
const blend=a.mesh.geometry.attributes.groundBlend,positions=a.mesh.geometry.attributes.position;let scene=0,outside=0,feather=0;for(let i=0;i<blend.count;i++){const paving=blend.getW(i);if(paving>.98)scene++;else if(paving<.02)outside++;else feather++;assert(blend.getX(i)+blend.getY(i)+blend.getZ(i)+paving<=1.000001);}
assert(scene>0&&outside>scene*10&&feather>0,'scene flooring must stay local within a predominantly standard base');
const bare=buildGround('ground-contract',{base:'grass',hills:.1});bare.dress([]);const colorsA=a.mesh.geometry.attributes.color,colorsBare=bare.mesh.geometry.attributes.color;let unchangedOutside=0;for(let i=0;i<positions.count;i++){point.fromBufferAttribute(positions,i);if(zoneWeight(point,zones)!==0)continue;assert.equal(colorsA.getX(i),colorsBare.getX(i));assert.equal(colorsA.getY(i),colorsBare.getY(i));assert.equal(colorsA.getZ(i),colorsBare.getZ(i));unchangedOutside++;}assert(unchangedOutside>1000,'scene tint cannot recolor the rest of a planet');
const water=buildGround('coast-ground',{base:'grass',cover:'sand',hills:.1,coast:{bearing:0,distance:6,radius:3}});water.dress([]);for(const name of ['ground-grass','ground-stones']){const instances=water.mesh.getObjectByName(name);for(let i=0;i<instances.count;i++){instances.getMatrixAt(i,m);point.setFromMatrixPosition(m);assert(!water.isWater(point.clone().normalize()),'no tufts or loose pebbles may cover water');}}
// A low, nonblocking environment floor remains physical ground coverage. It must not
// acquire a scene material zone merely to keep tufts from showing through its thin surface.
const floorRoot=new THREE.Group();floorRoot.position.set(0,20,0);floorRoot.rotateY(.55);floorRoot.scale.setScalar(1.2);floorRoot.updateMatrixWorld(true);
const floor={id:'walk-through-floor',solid:false,role:'environment',root:floorRoot,center:floorRoot.position.clone(),footprint:[8,6],box:new THREE.Box3(V(-4,0,-3),V(4,.08,3)),reach:5};
const openGrass=buildGround('low-floor-clearance',{base:'grass',hills:0}),floorGrass=buildGround('low-floor-clearance',{base:'grass',hills:0});openGrass.dress([]);floorGrass.dress([floor]);
assert.equal(sceneGroundZones([floor]).length,0,'an environment floor must stay outside scene-patch inference');
assert.deepEqual([...floorGrass.mesh.geometry.attributes.color.array],[...openGrass.mesh.geometry.attributes.color.array],'dressing clearance must not recolor the base beneath an environment floor');
let originallyUnderFloor=0;
for(const name of ['ground-grass','ground-stones']){
 const original=openGrass.mesh.getObjectByName(name),cleared=floorGrass.mesh.getObjectByName(name),outside=new Set(matrixPositions(original));
 for(let i=0;i<original.count;i++){original.getMatrixAt(i,m);point.setFromMatrixPosition(m);const local=floorRoot.worldToLocal(point.clone());if(local.y>-3&&Math.abs(local.x)<4&&Math.abs(local.z)<3)originallyUnderFloor++;}
 for(let i=0;i<cleared.count;i++){cleared.getMatrixAt(i,m);point.setFromMatrixPosition(m);const local=floorRoot.worldToLocal(point.clone());assert(local.y<=-3||Math.abs(local.x)>=4+.25/1.2||Math.abs(local.z)>=3+.25/1.2,'no grass or pebble may poke through a nonblocking floor');}
 assert(matrixPositions(cleared).every(p=>outside.has(p)),'adding a nonblocking floor may only clear existing dressing candidates');
}
assert(originallyUnderFloor>0,'the low-floor fixture must actually cover existing dressing before the fix');
const raised={...floor,id:'raised-banner',footprint:undefined,box:new THREE.Box3(V(-4,2,-3),V(4,3,3))};assert.equal(groundClearance([raised]).length,0,'a wholly raised decoration must not clear ground');
assert.equal(groundClearance([{...floor,on:{of:'table'}}]).length,0,'a mounted prop must not clear ground under its table');
const wide={...floor,root:floorRoot.clone(),box:new THREE.Box3(V(-30,0,-30),V(30,.1,30)),footprint:[60,60]};assert(!occupiedGround(V(12,20,0),groundClearance([wide])),'clearance reach must stay bounded for large imported envelopes');
for(const g of [openGrass,floorGrass])g.mesh.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
for(const g of [a,b,bare,water])g.mesh.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});pathGeo.dispose();
console.log('Ground zones: local feathered treatments, coherent neighboring footprints, shared base, exact path/water clearance, nonblocking low-floor coverage and stable additive dressing pass.');
