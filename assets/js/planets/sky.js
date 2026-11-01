// Bounded art-directed atmosphere for anyone's planet. Legacy/night skies retain buildSpace.
// This is a visual time and cloud cover, not live weather or a changing astronomical clock.
import * as THREE from 'three';
import { buildSpace } from '../world/sky.js';
import { RADIUS } from '../world/planet.js';

export function buildPlanetSky(sky, quality, time) {
  const period=sky.period||'night',overcast=sky.clouds==='overcast';
  if(period==='night' && !overcast) return {group:buildSpace({quality,uniforms:{time},tint:sky.color}),key:sky.light||0xc8d6ff,keyStrength:2.2,fill:sky.light||0x9aa0b8,fillStrength:1.1,environment:.2};
  const dusk=period==='dusk',night=period==='night';
  const group=new THREE.Group(),up={value:new THREE.Vector3(0,1,0)};
  const zenith=new THREE.Color(night?'#131b27':dusk?'#6b5b92':overcast?'#84999f':'#528fb9');
  if(sky.color) zenith.lerp(new THREE.Color(sky.color),.25);
  const dip={value:0};
  const material=new THREE.ShaderMaterial({
    uniforms:{uUp:up,uDip:dip,uZenith:{value:zenith},uHorizon:{value:new THREE.Color(night?'#243342':dusk?'#e1a78c':overcast?'#bdc9c8':'#8ec8e1')},uCloud:{value:overcast?1:.2}},
    side:THREE.BackSide,depthWrite:false,
    vertexShader:'varying vec3 vDir; void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec3 vDir; uniform vec3 uUp,uZenith,uHorizon;uniform float uCloud,uDip;
      float hash(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
      float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      void main(){vec3 d=normalize(vDir);float h=clamp((dot(d,uUp)-uDip)/(1.-uDip),0.,1.);float n=noise(d*4.)*.6+noise(d*9.+3.)*.3+noise(d*20.)*.1;
        vec3 c=mix(uHorizon,uZenith,pow(h,.55));float cloud=smoothstep(.42,.7,n)*uCloud*smoothstep(0.,.25,h);
        c=mix(c,mix(uHorizon,vec3(.65,.69,.72),.35),cloud*.7);gl_FragColor=vec4(c,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const dome=new THREE.Mesh(new THREE.SphereGeometry(800,32,16),material);dome.renderOrder=-2;
  dome.onBeforeRender=(_r,_s,camera)=>{
    up.value.copy(camera.position).normalize();
    const ratio=Math.min(1,RADIUS/Math.max(RADIUS,camera.position.length()));
    dip.value=-Math.sqrt(1-ratio*ratio); // the visible limb is below the tangent horizon on a tiny planet
  };
  group.add(dome);
  return {group,key:sky.light||(night?'#98acc2':dusk?'#edc3b4':'#fff2dc'),keyStrength:night?.7:dusk?1.2:overcast?1.15:2.3,fill:night?'#8398b0':overcast?'#c9d6d8':dusk?'#aaa6c6':'#bcd7e7',fillStrength:night?.9:dusk?1.2:overcast?2:1.7,environment:night?.15:dusk?.25:.45};
}
