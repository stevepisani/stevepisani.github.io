// A deliberately imagined sky, available offline. No borrowed Earth or live astronomy claims.
import * as THREE from 'three';

export function buildStargazing() {
  const group = new THREE.Group();
  group.visible = false;
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  for (let y=0;y<128;y++) {
    const light=48+9*Math.sin(y*0.25)+4*Math.sin(y*0.77);
    ctx.fillStyle=`hsl(${175+8*Math.sin(y*0.1)} 35% ${light}%)`;
    ctx.fillRect(0,y,256,1);
  }
  const map=new THREE.CanvasTexture(canvas); map.colorSpace=THREE.SRGBColorSpace;
  const planet=new THREE.Mesh(new THREE.SphereGeometry(8,48,32),new THREE.MeshBasicMaterial({map,color:'#b6dbd5'}));
  group.add(planet);
  const ring=new THREE.Mesh(new THREE.RingGeometry(11,16,96),new THREE.MeshBasicMaterial({color:'#dfc192',side:THREE.DoubleSide,transparent:true,opacity:0.8}));
  ring.rotation.set(1.1,0.25,0.25);
  group.add(ring);
  const moon=new THREE.Mesh(new THREE.SphereGeometry(1.3,20,12),new THREE.MeshBasicMaterial({color:'#d5d0bd'}));
  moon.position.set(23,9,-4); group.add(moon);
  group.traverse(o=>o.layers.set(2));
  return {
    group,
    show(thing) {
      group.position.copy(thing.root.localToWorld(new THREE.Vector3(0,90,150)));
      group.quaternion.copy(thing.root.quaternion);
      group.visible=true;
      return group.position.clone();
    },
    hide() { group.visible=false; },
  };
}
