// A reusable, code-painted watercolour study on paper. Canvas texture, not floating 3D blobs.
// Deliberately generic scenery, never presented as the person's own artwork.
import * as THREE from 'three';
let material;
export function watercolour() {
  if(!material) {
    const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
    const c=canvas.getContext('2d');let seed=71;
    const rand=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
    c.fillStyle='#eee6cf';c.fillRect(0,0,512,512);c.save();c.beginPath();c.rect(28,28,456,456);c.clip();
    const sky=c.createLinearGradient(0,40,0,420);sky.addColorStop(0,'#c7d7d1');sky.addColorStop(1,'#ede8d0');c.fillStyle=sky;c.fillRect(28,28,456,456);
    for(const [y,color] of [[325,'#b2bea1'],[390,'#8f9e80'],[445,'#758b72']]) {
      c.globalAlpha=.65;c.fillStyle=color;c.beginPath();c.moveTo(0,y);c.bezierCurveTo(140,y-80,240,y+70,512,y-30);c.lineTo(512,512);c.lineTo(0,512);c.fill();
    }
    for(const [x,y,s] of [[150,360,.9],[345,400,1.2],[405,315,.6]]) {
      c.globalAlpha=.55;c.strokeStyle='#77765b';c.lineWidth=3*s;c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x-8*s,y-75*s,x+7*s,y-155*s);c.stroke();
      for(let i=0;i<22;i++) {
        const px=x+(rand()-.5)*92*s,py=y-100*s-rand()*90*s;
        c.globalAlpha=.08+rand()*.15;c.fillStyle=i%2?'#557a67':'#7c9776';
        c.beginPath();c.ellipse(px,py,(12+rand()*20)*s,(8+rand()*13)*s,rand(),0,Math.PI*2);c.fill();
      }
    }
    c.restore();
    for(let i=0;i<4500;i++){c.globalAlpha=.025+rand()*.035;c.fillStyle=i%2?'#fffdf0':'#7e8166';c.fillRect(rand()*512,rand()*512,1+rand()*2,1);}
    const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
    material=new THREE.MeshStandardMaterial({map,roughness:1});
  }
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1.04,.98),material);
  mesh.position.set(0,1.53,.112);mesh.receiveShadow=true;return mesh;
}
