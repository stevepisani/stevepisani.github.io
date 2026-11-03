// Layered metre-scale grain and guarded bump, as on the honed homepage terrain.
// The terrain stays one surface: its material weights change only inside soft scene patches.
import * as THREE from 'three';
export function groundMaterial() {
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.96,metalness:0});
  material.customProgramCacheKey=()=>`planet-ground-zones-2`;
  material.onBeforeCompile=s=>{
    s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vGround;\nattribute vec4 groundBlend;\nvarying vec4 vGroundBlend;').replace('#include <begin_vertex>','#include <begin_vertex>\nvGround=position;vGroundBlend=groundBlend;');
    s.fragmentShader=s.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 vGround;
      varying vec4 vGroundBlend;
      float gh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float gn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(gh(i),gh(i+vec2(1,0)),f.x),mix(gh(i+vec2(0,1)),gh(i+vec2(1)),f.x),f.y);}
      vec2 groundGrain(vec2 p){
        float fine=gn(p*19.7),mid=gn(p*3.7),broad=gn(p*.43);
        float rock=(.76+.4*fine)*(.88+.24*mid)*(.85+.3*broad);
        float grass=.82+.19*mid+.13*fine;
        vec4 blend=clamp(vGroundBlend,0.,1.);float stone=max(0.,1.-dot(blend,vec4(1.)));
        float sand=1.,snow=1.,paving=1.,grout=0.;
        if(blend.y>.001)sand=.92+.065*sin(p.x*9.+gn(p*.7)*5.)+.045*gn(p*70.);
        if(blend.z>.001)snow=.97+.035*gn(p*3.)+.02*gn(p*40.);
        if(blend.w>.001){
          vec2 tile=p*1.6;tile.x+=mod(floor(tile.y),2.)*.5;vec2 edge=min(fract(tile),1.-fract(tile));
          grout=1.-smoothstep(.015,.04,min(edge.x,edge.y));paving=mix(.87+gh(floor(tile))*.16,.52,grout);
        }
        float tone=rock*stone+dot(vec4(grass,sand,snow,paving),blend);
        float bump=(fine*.4+mid*.6)*(stone*.10+blend.x*.035+blend.y*.025+blend.z*.012)-grout*blend.w*.045;
        return vec2(tone,bump);
      }
    `).replace('#include <color_fragment>',`#include <color_fragment>
      vec3 weights=pow(abs(normalize(vGround)),vec3(8.));weights/=dot(weights,vec3(1.));
      vec2 groundDetail=groundGrain(vGround.yz)*weights.x+groundGrain(vGround.xz)*weights.y+groundGrain(vGround.xy)*weights.z;
      diffuseColor.rgb*=groundDetail.x;
    `).replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      vec3 sx=dFdx(-vViewPosition),sy=dFdy(-vViewPosition);
      vec3 r1=cross(sy,normal),r2=cross(normal,sx);
      float det=dot(sx,r1)*faceDirection;
      vec3 bumped=abs(det)*normal-sign(det)*(dFdx(groundDetail.y)*r1+dFdy(groundDetail.y)*r2);
      float bumpLength=dot(bumped,bumped);
      normal=bumpLength>1e-10?bumped*inversesqrt(bumpLength):normal;
    `).replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(.96,.78,clamp(vGroundBlend.z,0.,1.));');
  };
  return material;
}

// Stable candidates are consumed before testing exclusions. An additive prop clears only
// nearby tufts, without moving vegetation elsewhere or changing its random sequence.
export function addGrass(mesh,surface,rand,quality,things=[],accept=()=>true) {
  const positions=[],colors=[],leaf=new THREE.Color(),vertices=[[0,0,0],[-.035,.08,0],[.018,.19,.015]];
  for(let j=0;j<6;j++) {
    const a=j*Math.PI/3,dx=Math.cos(a),dz=Math.sin(a);leaf.set(j%2?'#a6b280':'#c4ce91');
    for(const [x,y,z] of vertices){positions.push(x*dx-z*dz,y,x*dz+z*dx);colors.push(...leaf.toArray());}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
  const material=new THREE.MeshStandardMaterial({color:'#81966b',vertexColors:true,roughness:1,side:THREE.DoubleSide});
  const count=quality.high?3600:1600,grass=new THREE.InstancedMesh(geometry,material,count),dir=new THREE.Vector3(),point=new THREE.Vector3(),q=new THREE.Quaternion(),scale=new THREE.Vector3(),matrix=new THREE.Matrix4(),up=new THREE.Vector3(0,1,0);let n=0;
  for(let i=0;i<count;i++) {
    const size=.65+rand()*.7;
    dir.set(rand()-.5,rand()-.5,rand()-.5).normalize();point.copy(dir).multiplyScalar(surface(dir)-.015);
    if(!accept(point,dir)||things.some(t=>!t.on&&t.solid!==false&&t.center&&point.distanceTo(t.center)<(t.reach||.5)+.35))continue;
    q.setFromUnitVectors(up,dir);matrix.compose(point,q,scale.setScalar(size));grass.setMatrixAt(n++,matrix);
  }
  grass.count=n;grass.name='ground-grass';grass.receiveShadow=true;mesh.add(grass);return grass;
}
