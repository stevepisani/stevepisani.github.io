// Material cues in metres, independent of a person's theme, story, or prop layout.
// These are surface treatments, not new terrain heights or simulated weather.
import * as THREE from 'three';
export function groundMaterial(cover) {
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:cover==='snow'?.78:.95,metalness:0});
  if(!cover)return material;
  const mode={grass:0,sand:1,snow:2,paving:3}[cover];
  material.customProgramCacheKey=()=>`planet-ground-${cover}-1`;
  material.onBeforeCompile=s=>{
    s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vGround;').replace('#include <begin_vertex>','#include <begin_vertex>\nvGround=position;');
    s.fragmentShader=s.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 vGround;
      float gh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float gn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(gh(i),gh(i+vec2(1,0)),f.x),mix(gh(i+vec2(0,1)),gh(i+vec2(1)),f.x),f.y);}
      float detail(vec2 p){
        ${mode===0?'return mix(.76,1.16,gn(p*2.)*.65+gn(p*18.)*.35);':mode===1?'return .91+.09*sin(p.x*9.+gn(p*.7)*5.)+.045*gn(p*70.);':mode===2?'return .97+.035*gn(p*3.)+.02*gn(p*40.);':`p*=1.6;p.x+=mod(floor(p.y),2.)*.5;vec2 edge=min(fract(p),1.-fract(p));float grout=1.-smoothstep(.015,.04,min(edge.x,edge.y));return mix(.85+gh(floor(p))*.2,.48,grout);`}
      }
    `).replace('#include <color_fragment>',`#include <color_fragment>
      vec3 weights=pow(abs(normalize(vGround)),vec3(8.));weights/=dot(weights,vec3(1.));
      diffuseColor.rgb*=detail(vGround.yz)*weights.x+detail(vGround.xz)*weights.y+detail(vGround.xy)*weights.z;
    `);
  };
  return material;
}

// Short, instanced cover stays out of usable things. It follows the same analytic surface
// as walking, rather than scattering onto an imaginary flat plane below the miniature.
export function addGrass(mesh,surface,rand,quality,things=[]) {
  const positions=[],colors=[],leaf=new THREE.Color(),vertices=[[0,0,0],[-.035,.08,0],[.018,.19,.015]];
  for(let j=0;j<6;j++) {
    const a=j*Math.PI/3,dx=Math.cos(a),dz=Math.sin(a);leaf.set(j%2?'#a6b280':'#c4ce91');
    for(const [x,y,z] of vertices){positions.push(x*dx-z*dz,y,x*dz+z*dx);colors.push(...leaf.toArray());}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
  const material=new THREE.MeshStandardMaterial({color:'#81966b',vertexColors:true,roughness:1,side:THREE.DoubleSide});
  const count=quality.high?3600:1600,grass=new THREE.InstancedMesh(geometry,material,count),dir=new THREE.Vector3(),point=new THREE.Vector3(),q=new THREE.Quaternion(),scale=new THREE.Vector3(),matrix=new THREE.Matrix4(),up=new THREE.Vector3(0,1,0);let n=0;
  for(let i=0;i<count;i++) {
    const size=.65+rand()*.7; // consume the same seed values even when a new prop clears this tuft
    dir.set(rand()-.5,rand()-.5,rand()-.5).normalize();point.copy(dir).multiplyScalar(surface(dir)-.015);
    if(things.some(t=>t.solid!==false && point.distanceTo(t.center)<t.reach+.35))continue;
    q.setFromUnitVectors(up,dir);matrix.compose(point,q,scale.setScalar(size));grass.setMatrixAt(n++,matrix);
  }
  grass.count=n;grass.name='ground-grass';grass.receiveShadow=true;mesh.add(grass);return grass;
}
