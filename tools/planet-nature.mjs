// Offline import of the selected CC0 Quaternius tree. Supply its original glTF, bin and
// textures in a local directory; never downloads or generates paid assets. See library/README.
import {NodeIO} from '@gltf-transform/core';
import {getBounds} from '@gltf-transform/functions';
import {Vector3,Matrix4} from 'three';
import {mkdirSync,mkdtempSync,rmSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {optimize} from './meshy.mjs';

const source=process.argv[2];
if(!source)throw Error('Pass the folder containing the original BirchTree_1.gltf and its resources');
const io=new NodeIO(),doc=await io.read(resolve(source,'BirchTree_1.gltf'));
const scene=doc.getRoot().listScenes()[0],bounds=getBounds(scene),s=5.5/(bounds.max[1]-bounds.min[1]);
const feet=[],point=new Vector3(),matrix=new Matrix4(),v=[];
scene.traverse(node=>{
  matrix.fromArray(node.getWorldMatrix());
  for(const p of node.getMesh()?.listPrimitives()||[]) {
    const a=p.getAttribute('POSITION');
    for(let i=0;i<a.getCount();i++) {
      a.getElement(i,v);point.fromArray(v).applyMatrix4(matrix);
      if(point.y<bounds.min[1]+.002*(bounds.max[1]-bounds.min[1]))feet.push(point.clone());
    }
  }
});
const footX=(Math.min(...feet.map(p=>p.x))+Math.max(...feet.map(p=>p.x)))/2;
const footZ=(Math.min(...feet.map(p=>p.z))+Math.max(...feet.map(p=>p.z)))/2;
const holder=doc.createNode('Birch: 5.5 m, foot at origin, y up');
for(const node of [...scene.listChildren()]){scene.removeChild(node);holder.addChild(node);}
holder.setScale([s,s,s]).setTranslation([-footX*s,-bounds.min[1]*s,-footZ*s]);
scene.addChild(holder);
// Opaque cutout leaves have predictable depth/shadows; no per-leaf transparent sorting.
for(const m of doc.getRoot().listMaterials()) {
  m.setRoughnessFactor(.9);
  if(m.getAlphaMode()==='BLEND')m.setAlphaMode('MASK').setAlphaCutoff(.45).setBaseColorFactor([.35,.72,.5,1]);
}
const out=resolve(import.meta.dirname,'../assets/models/planets/library');mkdirSync(out,{recursive:true});
const temp=mkdtempSync(join(tmpdir(),'planet-nature-'));
try {
  await io.write(join(temp,'birch.glb'),doc);optimize(join(temp,'birch.glb'),join(temp,'small.glb'),512);
  const bytes=readFileSync(join(temp,'small.glb')),target=join(out,'birch.glb');
  if(existsSync(target)&&!bytes.equals(readFileSync(target)))throw Error('Accepted birch differs. Review a separately versioned file and loader mapping; never overwrite the existing asset.');
  if(!existsSync(target))writeFileSync(target,bytes);
}
finally{rmSync(temp,{recursive:true,force:true});}
