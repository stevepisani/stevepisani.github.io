// Optional, bounded rain around the visitor. Follows the planet's local up, not camera tilt.
// Static streaks under reduced motion; no sound, physics or additional network resources.
import * as THREE from 'three';
export function makeRain(time,reduced=false) {
  const positions=[],seeds=[];let seed=41;
  const rand=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  for(let i=0;i<480;i++) {
    const x=(rand()-.5)*28,z=(rand()-.5)*28,phase=rand()*20;
    for(const y of [0,.2]){positions.push(x,y,z);seeds.push(phase);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('phase',new THREE.Float32BufferAttribute(seeds,1));
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{clock:reduced?{value:0}:time},
    vertexShader:'attribute float phase; uniform float clock; void main(){vec3 p=position;p.y+=10.-mod(phase+clock*5.,20.);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}',
    fragmentShader:`void main(){gl_FragColor=vec4(.72,.82,.8,.22);
      #include <colorspace_fragment>
    }`,
  });
  const rain=new THREE.LineSegments(g,material),up=new THREE.Vector3(0,1,0),dir=new THREE.Vector3();
  rain.frustumCulled=false;rain.name='scene-rain';
  rain.onBeforeRender=(_r,_s,camera)=>{rain.position.copy(camera.position);rain.quaternion.setFromUnitVectors(up,dir.copy(camera.position).normalize());rain.updateMatrixWorld();};
  return rain;
}
