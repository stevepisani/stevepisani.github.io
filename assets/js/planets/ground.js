// Every planet has a consistent rock or grass base. Its own scene treatments stay local,
// with soft edges derived from the actual built scene; its hills remain seeded by its slug.
// Like Steve's (world/planet.js), the height is a function of direction, so the mesh and your feet
// always agree.
import * as THREE from 'three';
import { RADIUS } from '../world/planet.js';
import { groundMaterial, addGrass } from './ground-surface.js';
import {groundBase,BASE_COLORS,COVER_COLORS,sceneGroundZones,zoneWeight,pathGroundSegments,pathWeight,occupiedGround} from './ground-zones.js';
import { rippleWater } from '../world/water.js';

// a number from 0 to 1 for each character of the slug, so the hills are the planet's own
function seeded(slug) {
  let s = 2166136261;
  for (const c of slug) s = Math.imul(s ^ c.charCodeAt(0), 16777619) >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/**
 * { mesh, surface(dir) } for the planet `slug`: `surface` is the ground's distance from the
 * centre in a direction (for Player), `mesh` what's drawn and what a tap lands on.
 * `ground`: { color: '#rrggbb', hills: 0..1 } from a built planet (optional).
 */
export function buildGround(slug, { color, base:baseChoice, hills = 0.6, coast, cover, time = { value: 0 }, quality = { high: false } } = {}) {
  const rand = seeded(slug),baseKind=groundBase(baseChoice);
  const sceneCover=cover||baseKind,mode={grass:0,sand:1,snow:2,paving:3}[sceneCover];
  const waves = Array.from({ length: 4 }, (_, i) => ({
    k: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize().multiplyScalar(2 + i * 1.7 + rand()),
    phase: rand() * Math.PI * 2,
    a: (0.5 / (i + 1)) * hills * 2,
  }));
  const coastDir = coast && new THREE.Vector3(Math.sin(coast.bearing * Math.PI/180) * Math.sin(coast.distance/RADIUS), Math.cos(coast.distance/RADIUS), -Math.cos(coast.bearing * Math.PI/180) * Math.sin(coast.distance/RADIUS));
  const right = coastDir && new THREE.Vector3(1,0,0).addScaledVector(coastDir,-coastDir.x).normalize();
  const ahead = coastDir && new THREE.Vector3().crossVectors(coastDir,right).normalize();
  // The same irregular radius drives the basin, wet margin and water cap. No circular blue sticker.
  const reach = (a) => 1 + 0.1 * Math.sin(3*a + 1.1) + 0.06 * Math.sin(5*a + 2.3);
  const shoreDistance = (dir) => coastDir ? Math.acos(THREE.MathUtils.clamp(dir.dot(coastDir),-1,1)) * RADIUS / reach(Math.atan2(dir.dot(ahead),dir.dot(right))) : Infinity;
  const waterLevel = RADIUS - 0.24;
  const height = (dir) => {
    const natural = waves.reduce((h, w) => h + w.a * Math.sin(dir.dot(w.k) + w.phase), 0);
    if (!coast) return natural;
    // A continuous basin with a sandy lip, shared by mesh, props and walking. No blue disk
    // sitting on top of the land, and no unsupported rim along the curved surface.
    const basin = 1 - THREE.MathUtils.smoothstep(shoreDistance(dir), coast.radius - 0.8, coast.radius + 0.7);
    return THREE.MathUtils.lerp(natural, -0.85, basin);
  };
  const surface = (dir) => RADIUS + height(_d.copy(dir).normalize());

  const geo = new THREE.IcosahedronGeometry(RADIUS, quality.high ? 96 : 64);
  const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3);
  const base = new THREE.Color(BASE_COLORS[baseKind]),sceneColor=new THREE.Color(color||COVER_COLORS[sceneCover]), c = new THREE.Color(), d = new THREE.Vector3();
  const naturalColors=new Float32Array(pos.count*3),sceneColors=new Float32Array(pos.count*3),blends=new Float32Array(pos.count*4);
  // patches of a second, duller tone and of pale dust, at their own scales, so it isn't one flat colour
  const patches = Array.from({ length: 6 }, (_, i) => ({ k: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize().multiplyScalar(5 + i * 3 + rand() * 2), phase: rand() * Math.PI * 2 }));
  const patch = (dir, from) => patches.slice(from, from + 3).reduce((a, w) => a + Math.sin(dir.dot(w.k) + w.phase), 0) / 3;
  const wet = new THREE.Color('#9b9d78');
  const dull = base.clone().offsetHSL(0.03, -0.12, -0.07), dust = base.clone().offsetHSL(-0.01, -0.15, 0.08);
  for (let i = 0; i < pos.count; i++) {
    d.fromBufferAttribute(pos, i).normalize();
    const h = height(d);
    pos.setXYZ(i, d.x * (RADIUS + h), d.y * (RADIUS + h), d.z * (RADIUS + h));
    // a little lighter on the tops, darker in the hollows, and a grain of noise so it reads as ground
    c.copy(base).lerp(dull, THREE.MathUtils.smoothstep(patch(d, 0), -0.1, 0.5) * 0.8).lerp(dust, THREE.MathUtils.smoothstep(patch(d, 3), 0.3, 0.8) * 0.6);
    const shade=0.8+h*.4+(rand()-.5)*.06;
    c.multiplyScalar(shade).toArray(naturalColors,i*3);
    c.copy(sceneColor).multiplyScalar(shade).toArray(sceneColors,i*3);
    c.fromArray(naturalColors,i*3).toArray(colors,i*3);
    if(baseKind==='grass')blends[i*4]=1;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('groundBlend',new THREE.BufferAttribute(blends,4));
  geo.computeVertexNormals();
  const material = groundMaterial();
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  let dressing=[];
  const wetWeight=dir=>coast?1-THREE.MathUtils.smoothstep(shoreDistance(dir),coast.radius-.5,coast.radius+1.2):0;
  // A local sand apron belongs to the shoreline, never the whole sphere.
  const shoreWeight=dir=>coast?1-THREE.MathUtils.smoothstep(shoreDistance(dir),coast.radius+.4,coast.radius+2.1):0;
  const isWater=dir=>!!coast&&shoreDistance(dir)<=coast.radius+.35&&surface(dir)<waterLevel;
  const dress=(things=[],routes=[],paths=null)=>{
    for(const item of dressing){mesh.remove(item);item.geometry.dispose();item.material.dispose();}dressing=[];
    const zones=sceneGroundZones(things),segments=pathGroundSegments(paths);
    mesh.userData.groundZones=zones;mesh.userData.groundBase=baseKind;
    const blend=geo.getAttribute('groundBlend'),vertex=geo.getAttribute('color'),sand=new THREE.Color(COVER_COLORS.sand),sceneTint=new THREE.Color(),values=[0,0,0,0];
    for(let i=0;i<pos.count;i++){
      p.fromBufferAttribute(pos,i);d.copy(p).normalize();
      const weight=zoneWeight(p,zones),shore=shoreWeight(d),wetness=wetWeight(d);
      c.fromArray(naturalColors,i*3).lerp(sceneTint.fromArray(sceneColors,i*3),weight);
      // Reuse the same seeded broad variation, even in the coast treatment.
      if(shore>0)c.lerp(sand,shore*.82);if(wetness>0)c.lerp(wet,wetness*.6);
      vertex.setXYZ(i,c.r,c.g,c.b);
      values[0]=baseKind==='grass'?1:0;values[1]=values[2]=values[3]=0;
      for(let k=0;k<4;k++)values[k]*=1-weight;
      if(mode!==undefined)values[mode]+=weight;
      for(let k=0;k<4;k++)values[k]*=1-shore;values[1]+=shore;
      blend.setXYZW(i,...values);
    }
    vertex.needsUpdate=blend.needsUpdate=true;
    const clear=point=>!occupiedGround(point,things)&&pathWeight(point,segments)<.02;
    const coverAt=(point,dir)=>({scene:zoneWeight(point,zones),shore:shoreWeight(dir)});
    const stoneRand=seeded(slug+':stones'),stoneCount=baseKind==='grass'?(quality.high?650:400):(quality.high?2800:1800);
    const stones=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,0),new THREE.MeshStandardMaterial({color:new THREE.Color(BASE_COLORS.rock).multiplyScalar(.72),roughness:.96,flatShading:true}),stoneCount);let n=0;
    for(let i=0;i<stoneCount;i++){
      d.set(stoneRand()-.5,stoneRand()-.5,stoneRand()-.5).normalize();
      const radius=.025+Math.pow(stoneRand(),4)*.22,turn=[stoneRand()*6,stoneRand()*6,stoneRand()*6],sy=.5+stoneRand()*.4,sz=.7+stoneRand()*.5;
      p.copy(d).multiplyScalar(surface(d)-radius*.35);
      const weights=coverAt(p,d);
      if(weights.scene>.02||weights.shore>.02||isWater(d)||!clear(p))continue;
      q.setFromEuler(new THREE.Euler(...turn));m.compose(p,q,sc.set(radius,radius*sy,radius*sz));stones.setMatrixAt(n++,m);
    }
    stones.count=n;stones.name='ground-stones';stones.receiveShadow=true;mesh.add(stones);dressing.push(stones);
    if(baseKind==='grass'||sceneCover==='grass'){
      const grass=addGrass(mesh,surface,seeded(slug+':grass'),quality,things,(point,dir)=>{
        const weights=coverAt(point,dir),grassWeight=baseKind==='grass'?(sceneCover==='grass'?1:1-weights.scene):sceneCover==='grass'?weights.scene:0;
        return grassWeight>.98&&weights.shore<.02&&!isWater(dir)&&pathWeight(point,segments)<.02;
      });dressing.push(grass);
    }
    return {zones,segments};
  };
  const colliders = [];
  if (coast) {
    // Curved water cap cut from a sphere, wholly inside the depressed basin. The opaque
    // shallows grade to deep teal; thin wave arcs follow the same surface.
    const center = coastDir.clone();
    const vertices = [], shades = [], triangles = [], rings = 28, segments = 96;
    const shallow = new THREE.Color('#75b8ac'), deep = new THREE.Color(coast.color || '#368e97');
    const point = (r,a,level=waterLevel) => center.clone().multiplyScalar(Math.cos(r/RADIUS)).addScaledVector(right,Math.sin(r/RADIUS)*Math.cos(a)).addScaledVector(ahead,Math.sin(r/RADIUS)*Math.sin(a)).multiplyScalar(level);
    for (let j=0;j<=rings;j++) for (let i=0;i<=segments;i++) {
      const a=i/segments*Math.PI*2, r = (coast.radius + 0.35)*reach(a)*j/rings;
      vertices.push(...point(r,a).toArray());
      const c = deep.clone().lerp(shallow,THREE.MathUtils.smoothstep(j/rings,0.55,1));
      c.multiplyScalar(0.98+0.02*Math.sin(a*12+j)); c.toArray(shades,shades.length);
      if(j && i) { const k=j*(segments+1)+i; triangles.push(k,k-1,k-segments-1,k-1,k-segments-2,k-segments-1); }
    }
    const waterGeo = new THREE.BufferGeometry();
    waterGeo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    waterGeo.setAttribute('color',new THREE.Float32BufferAttribute(shades,3)); waterGeo.setIndex(triangles); waterGeo.computeVertexNormals();
    const waterMaterial = rippleWater(new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.18,metalness:0,side:THREE.DoubleSide}), {time,center:point(0,0),tangent:right,bitangent:ahead,normal:center,sky:'#778dba'});
    const water = new THREE.Mesh(waterGeo,waterMaterial);
    water.name = 'lagoon-water'; mesh.add(water);
    // Three broken groups of low stones connect sand and water; no uniform retaining ring.
    const shoreRocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,0),new THREE.MeshStandardMaterial({color:'#93958c',roughness:0.95,flatShading:true}),30);
    for(let i=0;i<30;i++) {
      const a=[0.7,2.5,4.8][Math.floor(i/10)]+(rand()-0.5)*0.8;
      d.copy(point((coast.radius+0.32+rand()*0.4)*reach(a),a)).normalize();
      const size=0.12+rand()*0.22;
      p.copy(d).multiplyScalar(surface(d)+size*0.05);
      q.setFromUnitVectors(new THREE.Vector3(0,1,0),d);
      m.compose(p,q,sc.set(size*(1+rand()),size*0.55,size));
      shoreRocks.setMatrixAt(i,m);
    }
    shoreRocks.castShadow=shoreRocks.receiveShadow=true; mesh.add(shoreRocks);
    // Conservatively enclose every lobe: a low broad collision circle keeps the current walking controller on dry sand.
    colliders.push({center:coastDir.clone().multiplyScalar(waterLevel),radius:(coast.radius+0.35)*1.16});
  }
  return {mesh,surface,colliders,dress,isWater};
}
const _d = new THREE.Vector3();
