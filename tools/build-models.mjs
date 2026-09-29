// Merges the Kenney CC0 source models in tools/models/<kit>/*.glb into one
// assets/models/props.glb: one download, shared palette textures deduplicated,
// geometry meshopt-compressed. Each source file becomes a top-level node named
// "<kit>_<model>" (e.g. "pirate-kit_palm-bend"; three.js strips "/" from names),
// which world code clones by name. Only models the world code actually clones
// (a literal prop('<kit>_<model>') in assets/js/world/) go in; the rest stay here as sources.
//
//   cd tools && npm install && npm run models
import fs from 'node:fs';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, quantize, meshopt, mergeDocuments, unpartition, flatten } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder,
  'meshopt.decoder': MeshoptDecoder,
});

const SRC = path.resolve('models');
const OUT = path.resolve('../assets/models/props.glb');

const WORLD = path.resolve('../assets/js/world');
const used = new Set();
for (const f of fs.readdirSync(WORLD).filter((f) => f.endsWith('.js'))) {
  for (const m of fs.readFileSync(path.join(WORLD, f), 'utf8').matchAll(/prop\('([\w-]+_[\w-]+)'/g)) used.add(m[1]);
}

const target = new Document();
target.createBuffer();
const scene = target.createScene('props');

for (const kit of fs.readdirSync(SRC).filter((d) => d.endsWith('-kit')).sort()) {
  for (const file of fs.readdirSync(path.join(SRC, kit)).filter((f) => f.endsWith('.glb')).sort()) {
    if (!used.has(`${kit}_${file.replace(/\.glb$/, '')}`)) continue;
    const src = await io.read(path.join(SRC, kit, file));
    const map = mergeDocuments(target, src);
    const srcScene = src.getRoot().listScenes()[0];
    const group = target.createNode(`${kit}_${file.replace(/\.glb$/, '')}`);
    for (const child of srcScene.listChildren()) group.addChild(map.get(child));
    scene.addChild(group);
  }
}
// drop the extra scenes mergeDocuments brought along
for (const s of target.getRoot().listScenes()) if (s !== scene) s.dispose();
target.getRoot().setDefaultScene(scene);

await target.transform(
  unpartition(),
  dedup(),
  weld(),
  prune({ keepLeaves: false }),
  quantize(),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
await io.write(OUT, target);
const tex = target.getRoot().listTextures().length;
console.log(`wrote ${path.relative('..', OUT)}: ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB, ${scene.listChildren().length} models, ${tex} textures`);

