// The actual consent module in a browser, with a synthetic authenticated API.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const out='/tmp/sjpj-finance-access';mkdirSync(out,{recursive:true});
const mock=`
export const $=s=>document.querySelector(s);
export const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e;};
export const start=(open,close)=>{window.openAccess=open;window.closeAccess=close;open({id:'owner'});};
window.allowed=true;window.grants=[];window.writes=[];window.currentUser='owner';window.fail=false;
export const db={rpc:async()=>({data:window.allowed}),auth:{getUser:async()=>({data:{user:{id:window.currentUser}}}),oauth:{listGrants:async()=>({data:[{client:{id:'11111111-1111-4111-8111-111111111111',name:'Synthetic ChatGPT'}},{client:{id:'22222222-2222-4222-8222-222222222222',name:'<img src=x onerror=alert(1)>'}}]})}},from:()=>{
 let action='select',payload,id;const query={select:()=>query,eq:(k,v)=>{if(k==='client_id')id=v;return query;},insert:p=>{action='insert';payload=p;return query;},delete:()=>{action='delete';return query;},then:resolve=>{
 if(window.fail)return resolve({error:{message:'Synthetic failure'}});
 if(action==='insert'){window.writes.push(payload);window.grants.push({...payload,granted_at:'2026-11-23T12:00:00Z'});return resolve({data:[payload]});}
 if(action==='delete'){window.writes.push({deleted:id});window.grants=window.grants.filter(g=>g.client_id!==id);return resolve({data:[{client_id:id}]});}
 resolve({data:window.grants});}};return query;}};
`;
const result=await build({entryPoints:['assets/js/apps/finance-access.js'],bundle:true,write:false,format:'iife',plugins:[{name:'synthetic-kit',setup(b){b.onResolve({filter:/\/kit\.js$/},()=>({path:'kit',namespace:'fake'}));b.onLoad({filter:/.*/,namespace:'fake'},()=>({contents:mock,loader:'js'}));}}]});
const body=readFileSync('apps/finance-access.html','utf8').replace(/^---[\s\S]*?---/,'').replace(/{{[^}]+}}/g,'/apps/#finance');
const css=readFileSync('assets/css/site.css','utf8')+readFileSync('assets/css/apps.css','utf8');
writeFileSync(out+'/index.html',`<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><body class="app-page"><main style="max-width:800px;margin:24px auto;padding:16px"><h1>Finance connections</h1>${body}</main><script>${result.outputFiles[0].text}</script></body></html>`);
const browser=await chromium.launch({headless:true});
try {for(const width of [1280,390]){
 const page=await browser.newPage({viewport:{width,height:1000}}), errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('file://'+out+'/index.html?client=11111111-1111-4111-8111-111111111111');
 await page.getByRole('button',{name:'Allow Finance read access'}).first().waitFor();
 assert.equal(await page.locator('img').count(),0);
 assert.equal(await page.evaluate(()=>window.writes.length),0,'no implicit grant');
 assert.equal(await page.getByText('Requested by this chat',{exact:true}).count(),1);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:`${out}/connections-${width}.png`,fullPage:true});
 await page.getByRole('button',{name:'Allow Finance read access'}).first().click();
 await page.getByRole('button',{name:'Remove Finance access'}).waitFor();
 assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Remove Finance access');
 assert.deepEqual(await page.evaluate(()=>window.writes[0]),{client_id:'11111111-1111-4111-8111-111111111111'});
 await page.getByRole('button',{name:'Remove Finance access'}).click();
 await page.getByText('Finance access removed. Future reads are blocked.').waitFor();
 assert.equal(await page.evaluate(()=>window.grants.length),0);
 await page.evaluate(()=>window.fail=true);
 await page.getByRole('button',{name:'Allow Finance read access'}).first().click();
 await page.getByText('Access was not changed. Reload and try again.').waitFor();
 assert.equal(await page.getByRole('button',{name:'Allow Finance read access'}).first().isEnabled(),true);
 await page.evaluate(()=>{window.fail=false;window.currentUser='other';});
 await page.getByRole('button',{name:'Allow Finance read access'}).first().click();
 await page.getByText('Sign in again before changing access.').waitFor();
 assert.equal(await page.evaluate(()=>window.writes.length),2);
 await page.evaluate(()=>{window.currentUser='owner';window.allowed=false;return window.openAccess({id:'owner'});});
 await page.getByText('Finance access is not enabled for this web session.').waitFor();
 assert.equal(await page.locator('#finance-connections button').count(),0);
 await page.evaluate(()=>window.closeAccess());
 assert.equal(await page.locator('#finance-connections').textContent(),'');
 assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close();}
console.log('Finance consent: desktop/phone explicit grant, revoke, failure, changed user, denial, text escaping and focus passed.');
