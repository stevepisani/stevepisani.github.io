// Render the real finance module with a synthetic transport, never a live backend.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const out='/tmp/sjpj-finance-ui';mkdirSync(out,{recursive:true});
const now=new Date().toISOString(), day=now.slice(0,10), month=day.slice(0,7);
const fixture={
finance_accounts:[{id:'cash',source_key:'bank:cash',name:'Synthetic checking',kind:'cash',balance_cents:12000000,as_of:now,included:true},{id:'card',source_key:'bank:card',name:'Synthetic card',kind:'credit',balance_cents:200000,as_of:now,included:true}],
finance_plans:[{year:Number(day.slice(0,4)),monthly_target_cents:1200000,retirement_goal_cents:2000000,retirement_funded_cents:500000,tax_reserve_cents:2500000,contractor_reserve_cents:3000000,operations_reserve_cents:300000,household_reserve_cents:2400000,expected_receipts_cents:4000000,reviewed_on:day,assumptions:'Synthetic plan. Expected receipts have not cleared.'}],
finance_budgets:[{month:month+'-01',category:'Food',target_cents:150000}],
finance_transactions:[{id:'t1',source_key:'t1',account_id:'cash',description:'Synthetic restaurant',posted_on:day,amount_cents:-7500,category:'Food',treatment:'personal',pending:false,updated_at:now},{id:'t2',source_key:'t2',account_id:'cash',description:'<img src=x onerror=alert(1)>',posted_on:day,amount_cents:-2000,category:'Uncategorized',treatment:'review',pending:false,updated_at:now}],
finance_tax_scenarios:[{year:Number(day.slice(0,4)),name:'Reviewed example',profit_cents:20000000,federal_cents:4000000,state_cents:1000000,paid_cents:2500000,retirement_cents:2000000,assumptions:'Synthetic scenario, not tax advice.',reviewed_on:day}]
};
const mock=`export const $=s=>document.querySelector(s); export const el=(tag,cls,text)=>Object.assign(document.createElement(tag),cls?{className:cls}:{},text!=null?{textContent:text}:{});
export const db={auth:{getUser:async()=>({data:{user:{id:'owner'}}}),onAuthStateChange:fn=>{window.authEvent=fn}},rpc:async(name,args)=>{if(name==='finance_import'){window.lastImport=args.payload;return {data:{written:0}}}return {data:true}},from:table=>{let patch=null,id=null,year=null;const q={select:()=>q,order:()=>q,range:(a,b)=>new Promise(resolve=>setTimeout(()=>resolve({data:structuredClone(window.fixture[table].slice(a,b+1))}),window.delay||0)),update:p=>{patch=p;return q},insert:p=>{const row={...p,id:crypto.randomUUID()};window.fixture[table].push(row);id=row.id;return q},eq:(key,v)=>{if(key==='id')id=v;if(key==='year')year=v;return q},then:resolve=>{const row=window.fixture[table].find(r=>year!==null?r.year===year:r.id===id);if(row)Object.assign(row,patch);resolve({data:row?[{id}]:[]})}};return q}};`;
const result=await build({stdin:{contents:`import * as f from './assets/js/apps/lib/finance.js';window.finance=f;`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',plugins:[{name:'fake-kit',setup(b){b.onResolve({filter:/\/kit\.js$/},()=>({path:'kit',namespace:'fake'}));b.onLoad({filter:/.*/,namespace:'fake'},()=>({contents:mock,loader:'js'}));}}]});
const css=readFileSync('assets/css/site.css','utf8')+readFileSync('assets/css/apps.css','utf8');
writeFileSync(out+'/index.html',`<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><body><main style="max-width:1080px;margin:24px auto;padding:16px"><h1>Finance</h1><section id="finance-view"><div id="finance-content"></div></section></main><script>window.fixture=${JSON.stringify(fixture)};</script><script>${result.outputFiles[0].text}</script></body></html>`);
const browser=await chromium.launch({headless:true});
try{
for(const width of [1280,390]){
const page=await browser.newPage({viewport:{width,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('file://'+out+'/index.html');
await page.evaluate(async()=>{await finance.permission({id:'owner'});await finance.enter();});
await page.getByRole('heading',{name:'Available after reserves'}).waitFor();
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
await page.screenshot({path:`${out}/${width}.png`,fullPage:true});
await page.getByRole('button',{name:/Needs review/}).click();
assert.equal(await page.locator('.finance-detail img').count(),0);
await page.locator('.finance-detail select').selectOption('business_expense');
await page.getByRole('button',{name:'Save',exact:true}).click();
await page.getByText('No transactions in this category.').waitFor();
assert.equal(await page.evaluate(()=>window.fixture.finance_transactions[1].treatment),'business_expense');
await page.getByRole('button',{name:'Import',exact:true}).click();
await page.getByLabel('Finance import file').setInputFiles({name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from('{"schema_version":1,"accounts":[]}')});
await page.getByText(/0 accounts · 0 transactions/).waitFor();
assert.equal(await page.evaluate(()=>window.lastImport),undefined);
await page.getByRole('button',{name:'Import records',exact:true}).click();
await page.getByRole('heading',{name:'Available after reserves'}).waitFor();
assert.equal(await page.evaluate(()=>window.lastImport.schema_version),1);
await page.getByRole('button',{name:'Edit plan',exact:true}).click();
await page.getByLabel('Monthly household target',{exact:true}).fill('13000.25');
await page.getByRole('button',{name:'Save reviewed plan',exact:true}).click();
await page.getByRole('heading',{name:'Available after reserves'}).waitFor();
assert.equal(await page.evaluate(()=>window.fixture.finance_plans[0].monthly_target_cents),1300025);
const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export backup'}).click();
const download=await downloadPromise;const backup=JSON.parse(readFileSync(await download.path(),'utf8'));
assert.equal(backup.transactions[0].account_source_key,'bank:cash');assert.equal(backup.accounts[0].id,undefined);
await page.getByRole('button',{name:'Import',exact:true}).click();
await page.getByLabel('Finance import file').setInputFiles({name:'bank.csv',mimeType:'text/csv',buffer:Buffer.from('Date,Description,Debit,Credit\n2026-01-02,Example cafe,12.34,')});
await page.getByLabel('Destination account').selectOption('bank:cash');
await page.getByText(/1 td transactions to review/).waitFor();
await page.getByRole('button',{name:'Import records',exact:true}).click();
await page.getByRole('heading',{name:'Available after reserves'}).waitFor();
assert.equal(await page.evaluate(()=>window.lastImport.transactions[0].amount_cents),-1234);
await page.getByRole('button',{name:'Update balance',exact:true}).first().click();
await page.getByLabel('Balance in dollars (positive for debt owed)',{exact:true}).fill('120001.25');
await page.getByRole('button',{name:'Save balance',exact:true}).click();
await page.getByRole('heading',{name:'Available after reserves'}).waitFor();
assert.equal(await page.evaluate(()=>window.fixture.finance_accounts[0].balance_cents),12000125);
await page.getByRole('button',{name:'Add account',exact:true}).click();
await page.getByLabel('Account label',{exact:true}).fill('Another synthetic account');
await page.getByLabel('Balance in dollars (positive for debt owed)',{exact:true}).fill('20');
await page.getByRole('button',{name:'Save balance',exact:true}).click();
await page.getByRole('heading',{name:'Available after reserves'}).waitFor();
assert.equal(await page.evaluate(()=>window.fixture.finance_accounts.length),3);
await page.getByRole('button',{name:'Model a tax scenario',exact:true}).click();
await page.getByLabel('Scenario name',{exact:true}).fill('Synthetic browser scenario');
await page.getByLabel('Annual business profit before home office',{exact:true}).fill('500000');
await page.getByLabel('Qualified owner research time (%)',{exact:true}).fill('35');
await page.getByRole('button',{name:'Calculate',exact:true}).click();
await page.getByRole('button',{name:'Save scenario',exact:true}).click();
await page.getByRole('heading',{name:'Available after reserves'}).waitFor();
assert.equal(await page.evaluate(()=>window.fixture.finance_tax_scenarios.length),2);
assert.equal(await page.evaluate(()=>window.fixture.finance_tax_scenarios[1].inputs.research_percent),35);
assert.equal(await page.evaluate(()=>window.fixture.finance_tax_scenarios[1].inputs.usable_credit_cents),0);
// A pending response must not restore finance after logout.
await page.evaluate(()=>{window.delay=100;window.pendingLoad=finance.load();});
await page.evaluate(()=>authEvent('SIGNED_OUT',null));
await page.evaluate(()=>window.pendingLoad);
assert.equal(await page.locator('.finance-amount').count(),0);
assert.match(await page.locator('#finance-content').innerText(),/Sign in/);
assert.equal(await page.evaluate(()=>localStorage.length),0);
assert.deepEqual(errors,[]);
await page.close();
}
console.log('Finance UI: desktop/phone render, no overflow, safe text, review correction, sign-out race and no persistent storage passed.');
}finally{await browser.close();}
