// Bounded soft vapor for an explicitly authored response. No images, simulation, audio or
// generated assets; local motion stays inside its sphere envelope and never moves the camera.
import * as THREE from 'three';
export function vaporMaterial(color='#dce8e5') {
  const material=new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,side:THREE.FrontSide,
    uniforms:{color:{value:new THREE.Color(color)},time:{value:0},amount:{value:1}},
    vertexShader:`varying vec3 local; varying vec3 normalView; varying vec3 toward;
      void main(){local=position*2.0;vec4 view=modelViewMatrix*vec4(position,1.0);normalView=normalMatrix*normal;toward=-view.xyz;gl_Position=projectionMatrix*view;}`,
    fragmentShader:`uniform vec3 color;uniform float time;uniform float amount;
      varying vec3 local;varying vec3 normalView;varying vec3 toward;
      float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      void main(){
        float facing=max(0.0,dot(normalize(normalView),normalize(toward)));
        float rim=smoothstep(0.0,0.65,facing);
        vec3 p=local*3.1-vec3(time*.025,time*.14,0.0);
        float density=0.65*noise(p)+0.35*noise(p*2.03+1.7);
        float alpha=clamp(amount,0.0,1.0)*rim*smoothstep(.25,.75,density)*.42;
        if(alpha<.003)discard;
        gl_FragColor=vec4(color*(.84+.16*density),alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  material.userData.vapor=true;
  return material;
}
