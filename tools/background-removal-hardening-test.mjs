import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hardenBackgroundRemoval} from './background-removal-hardening.mjs';
const original=readFileSync(new URL('../node_modules/@imgly/background-removal/dist/index.mjs',import.meta.url),'utf8');
const patched=hardenBackgroundRemoval(original);
assert.throws(()=>hardenBackgroundRemoval(original+'\n'),/changed/);
// Exercise the actual embedded parser without loading image inference or network resources.
const start=patched.indexOf('// ../../node_modules/.pnpm/zod@');
const end=patched.indexOf('// package.json',start);
const z=new Function(patched.slice(start,end)+';return z;')();
const huge=new Proxy(new Array(1_000_000),{get(target,key){if(/^\d+$/.test(String(key)))throw new Error('Must reject before reading any element');return Reflect.get(target,key);}});
for(const schema of [z.array(z.string()),z.array(z.string()).max(3),z.array(z.string()).length(3)]){
  const result=schema.safeParse(huge);assert.equal(result.success,false);assert.equal(result.error.issues.length,1);
  const asyncResult=await schema.safeParseAsync(huge);assert.equal(asyncResult.success,false);assert.equal(asyncResult.error.issues.length,1);
}
assert.deepEqual(z.array(z.string()).parse(['a','b']),['a','b']);
assert.equal(z.function().args(z.string(),z.number(),z.number()).returns(z.void()).parse(()=>{})('fetch',1,2),undefined);
assert.ok(patched.includes('model: z.preprocess('));
console.log('Background-removal mitigation: oversized arrays rejected before element reads; valid collections and progress callback preserved.');
