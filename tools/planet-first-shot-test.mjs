// A failed or corrected generation must never replace first-attempt evidence.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {freezeRun,addInterview,submitAttempt,renderAttempt,additiveDesign} from './planet-first-shot.mjs';

const scratch=mkdtempSync(join(tmpdir(),'planet-first-shot-'));
try {
  const run=join(scratch,'run'),site=join(scratch,'site'),input=join(scratch,'interview.txt'),candidate=join(scratch,'candidate.json');
  mkdirSync(join(site,'assets/js/dist'),{recursive:true});writeFileSync(join(site,'assets/js/dist/planets.js'),'frozen test renderer');
  writeFileSync(input,'A synthetic person wants a quiet seat beside their reading lamp.');
  await freezeRun({out:run,site});
  const protocol=JSON.parse(readFileSync(join(run,'protocol.json')));
  assert(protocol.kit.first_reveal.coverage&&protocol.instructions.includes('painting'),'freeze the real connector guidance, not a separate prompt-only generator');
  await assert.rejects(()=>freezeRun({out:run,site}),/EEXIST/);
  assert.throws(()=>addInterview({run,id:'../escape',input,provenance:'synthetic-development'}));
  addInterview({run,id:'quiet',input,provenance:'synthetic-development'});
  assert.throws(()=>addInterview({run,id:'quiet',input,provenance:'synthetic-development'}),/EEXIST/);
  assert(readFileSync(join(run,'cases/quiet/generation-input.txt'),'utf8').includes('A synthetic person'));
  writeFileSync(candidate,'invalid first model output');
  const submit=reason=>submitAttempt({run,id:'quiet',candidate,generator:'unit-test stub; not a model evaluation',reason});
  const first=await submit();assert(!first.prepared&&first.errors.length);
  assert.equal(readFileSync(join(run,'cases/quiet/attempt-1/candidate.json'),'utf8'),'invalid first model output','keep raw invalid output');
  const spec={version:1,slug:'test-quiet',who:{name:'Quiet'},arrival:'overview',things:[{id:'seat',name:'Reading seat',stock:'chair',at:{bearing:0,distance:5},use:'sit'}]};
  const output={spec,firstAction:'seat',coverage:{represented:['quiet seat'],unsupported:[],omitted:[]},edit:{suggestion:'Add a reading lamp beside the seat.',thing:{id:'lamp',name:'Reading lamp',stock:'lamp-post',near:{of:'seat',side:'right',gap:.5},light:{color:'#ffcc88',strength:.5},use:'switch'}}};
  writeFileSync(candidate,JSON.stringify(output));
  await assert.rejects(()=>submit(),/reason/);
  const second=await submit('Correct the invalid JSON without changing the intended seat');
  assert(second.prepared&&second.originalObjectsPreserved,JSON.stringify(second));
  assert.equal(second.number,2);assert.equal(second.paidJobs,0);
  assert.equal(readFileSync(join(run,'cases/quiet/attempt-1/candidate.json'),'utf8'),'invalid first model output');
  const duplicate=structuredClone(output);duplicate.edit.thing.id='seat';writeFileSync(candidate,JSON.stringify(duplicate));
  const third=await submit('A deliberately invalid duplicate-id correction must consume budget');assert(!third.prepared);
  await assert.rejects(()=>submit('fourth attempt'),/budget exhausted/);
  await assert.rejects(()=>renderAttempt({run,id:'quiet',attempt:3}),/Preparation failed/);
  assert(!existsSync(join(run,'cases/quiet/attempt-3/render')));
  assert.throws(()=>additiveDesign({...output,edit:{...output.edit,sceneExtra:{id:'s',kind:'hammock'}}}),/exactly one/);
  const raw=readFileSync(join(run,'cases/quiet/interview.txt'));writeFileSync(join(run,'cases/quiet/interview.txt'),'changed');
  await assert.rejects(()=>submit('try replacing intake'),/interview bytes changed/);writeFileSync(join(run,'cases/quiet/interview.txt'),raw);
  const initial=join(run,'cases/quiet/attempt-1/candidate.json');writeFileSync(initial,'replacement');
  await assert.rejects(()=>submit('try replacing first output'),/saved candidate changed/);writeFileSync(initial,'invalid first model output');
  writeFileSync(join(site,'assets/js/dist/planets.js'),'changed renderer');
  await assert.rejects(()=>submit('try changing engine'),/renderer changed/);
  console.log('First-shot evidence: real kit frozen, invalid originals retained, bounded corrections, stable edits, intake/candidate/renderer changes refused.');
} finally {rmSync(scratch,{recursive:true,force:true});}
