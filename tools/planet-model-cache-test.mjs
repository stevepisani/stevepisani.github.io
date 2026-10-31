// Offline regression of changed references, interrupted jobs and legacy-library migration.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { modelSource, currentModel, pendingModel, pictureName } from './planet-model-cache.mjs';
import { make, wanted, planets } from './planet-models.mjs';

const dir = mkdtempSync(join(tmpdir(), 'planet-cache-'));
try {
  const pictures = dir + '/pictures/', output = dir + '/models/', temp = dir + '/raw/';
  mkdirSync(pictures); mkdirSync(output);
  writeFileSync(pictures + 'test-fixture-cat.png', 'obsolete-reference');
  const manifest = { 'test-fixture/cat': { model: 'A blue cat', style: 'storybook', file: 'old.glb' } };
  writeFileSync(output + 'old.glb', 'accepted-asset');
  const requests = [], completed = [], downloaded = [];
  let interrupted = true;
  const deps = {
    pictures, output, temp,
    task: async (body) => { requests.push(body); return 'task-' + requests.length; },
    finished: async (id, label) => {
      completed.push(id);
      if (label.endsWith('model') && interrupted) throw Error('connection interrupted while waiting');
      return label.endsWith('picture') ? { image_urls: ['new-reference'] } : { model_urls: { glb: 'new-model' } };
    },
    get: async (url) => { downloaded.push(url); return { arrayBuffer: async () => Buffer.from(url) }; },
    optimize: (from, to) => cpSync(from, to),
  };
  const item = { key: 'test-fixture/cat', slug: 'test-fixture', thing: { model: 'An orange tabby cat' } };
  await assert.rejects(make(item, manifest, () => {}, new Set(), deps), /interrupted/);
  assert.equal(requests.length, 2);
  assert.match(requests[0].prompt, /^An orange tabby cat/);
  assert.equal(Buffer.from(requests[1].image_url.split(',')[1], 'base64').toString(), 'new-reference');
  assert.equal(requests[1].ai_model, 'meshy-7.1');
  assert.equal(manifest[item.key].file, 'old.glb');
  assert.equal(manifest[item.key].model, 'A blue cat');
  assert.equal(manifest[item.key].pending.model3d, 'task-2');
  interrupted = false;
  await make(item, manifest, () => {}, new Set(), deps);
  assert.equal(requests.length, 2, 'an interrupted job resumes without a duplicate purchase');
  assert.equal(manifest[item.key].pending, undefined);
  assert.equal(manifest[item.key].model, item.thing.model);
  assert.equal(readFileSync(output + 'old.glb', 'utf8'), 'accepted-asset');
  assert.equal(readFileSync(output + manifest[item.key].file, 'utf8'), 'new-model');
  assert(currentModel(manifest[item.key], item.thing.model));
  const rec = {};
  const first = pendingModel(rec, 'A small palm'); first.picture = 'keep-task';
  assert.equal(pendingModel(rec, 'A small palm').picture, 'keep-task');
  const redoRec={};const redoPending=pendingModel(redoRec,'A palm',true);redoPending.model3d='keep-redo-task';
  assert.equal(pendingModel(redoRec,'A palm').model3d,'keep-redo-task','a retry without --redo still resumes a pending redo');
  assert.notEqual(pictureName(pendingModel(rec, 'A tall palm')), pictureName(first));
  assert.notEqual(modelSource('A tall palm').inputId, modelSource('A small palm').inputId);
  assert(currentModel({ model: 'A cat', style: 'storybook', file: 'existing.glb' }, 'A cat'));
  const realManifest = JSON.parse(readFileSync(new URL('../assets/models/planets/manifest.json', import.meta.url)));
  const completedLibrary = planets().map(p=>({...p,things:p.things.filter(t=>realManifest[`${p.slug}/${t.id}`]?.file && realManifest[`${p.slug}/${t.id}`].model===t.model)}));
  assert.equal(wanted(completedLibrary, realManifest).length, 0, 'migration must not buy the existing library again');
  const sample=completedLibrary.find(p=>p.things.length),sampleThing=sample.things[0],sampleKey=`${sample.slug}/${sampleThing.id}`;
  const resumingManifest=structuredClone(realManifest);
  resumingManifest[sampleKey].pending={inputId:modelSource(sampleThing.model).inputId,model3d:'resume-replacement'};
  assert.equal(wanted([{...sample,things:[sampleThing]}],resumingManifest).length,1,'keep a pending replacement queued even while the old file is usable');
  const legacyPending = {[item.key]:{model:item.thing.model,style:'storybook',model3d:'keep-legacy-task'}};
  await assert.rejects(make(item,legacyPending,()=>{},new Set(),deps),/unfinished legacy task/);
  assert.equal(legacyPending[item.key].model3d,'keep-legacy-task');
  console.log('Model cache: fresh reference on changed words, pinned model, interruption resume, immutable output and legacy library preservation passed.');
} finally { rmSync(dir, { recursive: true, force: true }); }
