// Offline, reproducible import of a selected CC0 family. No downloads or paid generation.
// Review a separate output directory first; never overwrite an accepted asset with new bytes.
import {NodeIO} from '@gltf-transform/core';
import {getBounds} from '@gltf-transform/functions';
import {readFileSync,writeFileSync,mkdirSync,existsSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {optimize} from './meshy.mjs';
import {LIBRARY_STOCK} from '../supabase/functions/_shared/planet-library.js';
const [source,out]=process.argv.slice(2);
if(!source||!out)throw Error('Pass the KayKit-Furniture-Bits-1.0 source checkout and a separate review output folder');
const src=resolve(source),target=resolve(out),gltf=join(src,'addons/kaykit_furniture_bits/Assets/gltf');
const names={'reading-chair':'armchair_pillows','side-table':'table_small',books:'book_set',book:'book_single','table-lamp':'lamp_table'};
const hash=b=>createHash('sha256').update(b).digest('hex');
const io=new NodeIO(),temp=mkdtempSync(join(tmpdir(),'planet-furniture-'));
const provenance={author:'Kay Lousberg',pack:'KayKit Furniture Bits 1.0',source:'https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0',revision:'96d5930a8dbdb363409bbc2d3341718b00e17c9c',license:'CC0-1.0',licenseFile:'KayKit-LICENSE.txt',licenseHash:hash(readFileSync(join(src,'LICENSE.txt'))),assets:[]};
mkdirSync(target,{recursive:true});
const immutable=(file,bytes)=>{if(existsSync(file)&&!bytes.equals(readFileSync(file)))throw Error('Accepted output differs: review a new version instead of overwriting '+file);if(!existsSync(file))writeFileSync(file,bytes);};
try {
 for(const [id,name] of Object.entries(names)) {
  const original=JSON.parse(readFileSync(join(gltf,name+'.gltf'))),files=[name+'.gltf',...original.buffers.map(b=>b.uri),...original.images.map(i=>i.uri)];
  const doc=await io.read(join(gltf,name+'.gltf')),scene=doc.getRoot().listScenes()[0],b=getBounds(scene),s=LIBRARY_STOCK[id].size[1]/(b.max[1]-b.min[1]);
  const holder=doc.createNode(id+': metres, centred foot, Y up');for(const n of [...scene.listChildren()]){scene.removeChild(n);holder.addChild(n);}
  holder.setScale([s,s,s]).setTranslation([-(b.min[0]+b.max[0])*s/2,-b.min[1]*s,-(b.min[2]+b.max[2])*s/2]);scene.addChild(holder);
  for(const m of doc.getRoot().listMaterials())m.setRoughnessFactor(.85);
  await io.write(join(temp,'raw.glb'),doc);optimize(join(temp,'raw.glb'),join(temp,'small.glb'),512);
  const bytes=readFileSync(join(temp,'small.glb')),file=LIBRARY_STOCK[id].file.split('/').pop();immutable(join(target,file),bytes);
  const normalized=getBounds(scene),triangles=doc.getRoot().listMeshes().flatMap(m=>m.listPrimitives()).reduce((n,p)=>n+(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3,0);
  for(let i=0;i<3;i++)if(Math.abs(normalized.max[i]-normalized.min[i]-LIBRARY_STOCK[id].size[i])>2e-5)throw Error(id+': catalog dimensions differ');
  provenance.assets.push({id,sourceModel:name,sourceHashes:Object.fromEntries(files.map(f=>[f,hash(readFileSync(join(gltf,f)))])),file,sha256:hash(bytes),bytes:bytes.length,triangles,size:LIBRARY_STOCK[id].size,origin:'bounding-foot centre at [0,0,0], +Y up; front preserved from source',changes:'uniform metre normalization; roughness .85; meshopt and 512px WebP; no geometry simplification',support:LIBRARY_STOCK[id].support||null});
 }
 immutable(join(target,'KayKit-LICENSE.txt'),readFileSync(join(src,'LICENSE.txt')));
 immutable(join(target,'furniture-provenance.json'),Buffer.from(JSON.stringify(provenance,null,2)+'\n'));
 console.log(JSON.stringify(provenance.assets.map(a=>({id:a.id,bytes:a.bytes,triangles:a.triangles})),null,2));
}finally{rmSync(temp,{recursive:true,force:true});}
