import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const handlers={},writes=[],reads=[];
let responseHeaders={},offline=false;
const sandbox={URL,Response,navigator:{onLine:true},location:{origin:'https://example.test'},self:{addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting(){},clients:{claim(){}}},
fetch:async()=>{if(offline)throw new Error('offline');return new Response('synthetic',{headers:responseHeaders});},
caches:{open:async()=>({put:async(req)=>writes.push(req.url)}),match:async(req)=>{reads.push(req.url);return new Response('cached');}}};
vm.runInNewContext(readFileSync(new URL('../apps/offline.js',import.meta.url),'utf8'),sandbox);
async function request(path,options={}){
  let answer;const pending=[];const req=new Request('https://example.test'+path,options);
  handlers.fetch({request:req,respondWith:p=>answer=p,waitUntil:p=>pending.push(p)});
  if(answer)await answer;await Promise.all(pending);return answer!==undefined;
}
assert.equal(await request('/assets/app.js'),true);assert.equal(writes.length,1);
for(const cacheControl of ['private, max-age=60','no-store','no-cache']){responseHeaders={'Cache-Control':cacheControl};await request('/apps/response');}
assert.equal(writes.length,1);
for(const options of [{cache:'no-store'},{headers:{Authorization:'Bearer synthetic'}}])assert.equal(await request('/apps/response',options),false);
for(const path of ['/rest/v1/finance_accounts','/api/finance/balances','/rpc/finance_import'])assert.equal(await request(path),false);
offline=true;assert.equal(await request('/apps/response',{cache:'no-store'}),false);assert.equal(reads.length,0);
await request('/assets/app.js');assert.equal(reads.length,1);
console.log('Finance cache: private/no-store responses, authorized requests and finance API routes never enter offline cache; public assets still work.');
