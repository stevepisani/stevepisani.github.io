// Real migrations/RLS + production data adapter + JSON-RPC, using synthetic records only.
import assert from 'node:assert/strict';
import { wardrobeDb, STEVE, OTHER } from './wardrobe-db.mjs';
import { financeData } from '../supabase/functions/mcp/finance-data.js';
import { rpc, TOOLS } from '../supabase/functions/mcp/server.js';
import { funding, businessActuals, spending } from '../supabase/functions/_shared/finance.js';
import { estimate2026, TAX_INPUTS } from '../supabase/functions/_shared/finance-tax.js';
const {db,q}=await wardrobeDb();
await db.exec('grant usage on schema public, auth to authenticated, anon');
await q('update public.members set finance_enabled=true');
const as=async(owner=STEVE,client)=>{
  await db.exec('reset role');
  await q("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:owner,email:owner===STEVE?'steve@example.com':'other@example.com',role:'authenticated',...(client?{client_id:client}:{})})]);
  await db.exec('set role authenticated');
};
// PostgREST-shaped adapter backed by actual SQL. Identifiers are only from production's allowlist.
const rest={
  async rpc(name) {try{return {data:(await q(`select public.${name}() as value`))[0].value};}catch(error){return {error};}},
  from(table) {
    const conditions=[],values=[],order=[]; let offset=0,limit=500;
    const f=(key,op,v)=>{values.push(v);conditions.push(`"${key}" ${op} $${values.length}`);return query;};
    const query={select:()=>query,eq:(k,v)=>f(k,'=',v),gte:(k,v)=>f(k,'>=',v),lte:(k,v)=>f(k,'<=',v),order:k=>{order.push(`"${k}"`);return query;},range:(a,b)=>{offset=a;limit=b-a+1;return query;},
      async then(resolve,reject){try{resolve({data:await q(`select * from public.${table} where ${conditions.join(' and ')} order by ${order.join(',')} limit ${limit} offset ${offset}`,values)});}catch(error){resolve({error});}}
    };return query;
  },
};
const now=()=>new Date('2026-11-23T12:00:00Z');
const ctx={finance:financeData(rest,STEVE),now};
const call=async(name,args={},context=ctx)=>(await rpc({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}},context)).result;
let checks=0;
const check=(v)=>{assert.ok(v);checks++;};
const denied=async(fn)=>{await assert.rejects(fn,/permission denied|row-level security/);checks++;};
for(const [owner,key] of [[STEVE,'own'],[OTHER,'other']]) {
 await as(owner);
 const a=(await q("insert into finance_accounts(source_key,name,kind,balance_cents,as_of) values ($1,$1,'cash',9000000,'2026-11-22') returning id",[key]))[0].id;
 await q("insert into finance_transactions(account_id,source_key,posted_on,description,amount_cents,treatment,category) values ($1,'income','2026-11-01',$2,1000000,'business_income','Income'),($1,'contractor','2026-11-02',$2,-250000,'contractor','Contractors'),($1,'food','2026-11-03',$2,-10000,'personal','Food'),($1,'refund','2026-11-04',$2,2000,'personal','Food'),($1,'review','2026-11-05',$2,-3000,'review','Unknown')",[a,key]);
 await q("insert into finance_plans(year,monthly_target_cents,retirement_goal_cents,tax_reserve_cents,contractor_reserve_cents,operations_reserve_cents,household_reserve_cents,expected_receipts_cents,reviewed_on,assumptions) values (2026,100000,200000,300000,100000,50000,100000,500000,'2026-11-22','Synthetic')");
 await q("insert into finance_budgets(month,category,target_cents) values ('2026-11-01','Food',20000)");
 await q("insert into finance_tax_scenarios(year,source_key,name,profit_cents,federal_cents,state_cents,paid_cents,retirement_cents,assumptions,reviewed_on) values (2026,'test','Synthetic scenario',750000,100000,20000,10000,0,'Synthetic reviewed assumptions','2026-11-22')");
}
await as(STEVE,'chat-one');
check((await call('get_finance_summary')).isError);
for(const t of ['finance_accounts','finance_transactions','finance_plans','finance_budgets','finance_tax_scenarios']) check((await q(`select * from ${t}`)).length===0);
await denied(()=>q("insert into finance_connector_grants(client_id) values ('chat-one')"));
await as();
await denied(()=>q("insert into finance_connector_grants(owner,client_id) values ($1,'chat-one')",[OTHER]));
await q("insert into finance_connector_grants(client_id) values ('chat-one')");
await as(STEVE,'chat-one');
const summary=await call('get_finance_summary',{year:2026});
check(!summary.isError); const s=summary.structuredContent;
check(s.accounts.length===1&&s.accounts[0].name==='own'&&!('owner' in s.accounts[0]));
assert.deepEqual(s.funding,funding(s.accounts,s.plan,now())); checks++;
const raw=await ctx.finance.rows('finance_transactions',2026);
assert.deepEqual(s.business_actuals,businessActuals(raw,2026));checks++;
check(s.business_actuals.profit===750000);
check((await call('get_finance_spending',{month:'2026-11'})).structuredContent.spent_cents===spending(raw,'2026-11').spent);
check((await call('get_finance_tax_scenarios',{year:2026})).structuredContent.scenarios.length===1);
const page=await call('find_finance_transactions',{year:2026,limit:2});check(page.structuredContent.total===5&&page.structuredContent.next_offset===2&&page.structuredContent.transactions.length===2);
check((await call('find_finance_transactions',{year:2026,query:'other'})).structuredContent.total===0);
check((await call('find_finance_transactions',{year:2026,month:'2025-01'})).isError);
for(const args of [{year:2026,owner:OTHER},{year:2026,limit:101},{year:2026,offset:-1},{year:2026,treatment:'made-up'}]) check((await call('find_finance_transactions',args)).isError);
const tax={...Object.fromEntries(Object.keys(TAX_INPUTS).map(k=>[k,k==='profit_cents'?10000000:0])),research_percent:35,claim_qbi:true};
assert.deepEqual((await call('estimate_finance_tax',tax)).structuredContent.estimate,estimate2026(tax));checks++;
check((await call('estimate_finance_tax',{})).isError);
// Read grant must never admit writes, grant management or imports, including direct REST.
check(!(await q('select can_finance() as ok'))[0].ok);
for(const t of ['finance_accounts','finance_transactions','finance_plans','finance_budgets','finance_tax_scenarios']) {
 check((await q(`delete from ${t} returning *`)).length===0);
 check((await q(`update ${t} set owner=owner returning *`)).length===0);
}
await denied(()=>q("insert into finance_accounts(source_key,name,kind,balance_cents,as_of) values ('bad','bad','cash',0,now())"));
check((await q('select * from finance_connector_grants')).length===0);
check((await q('delete from finance_connector_grants returning *')).length===0);
await assert.rejects(()=>q(`select finance_import('{"schema_version":1}'::jsonb)`), /Finance access required/);checks++;
await as(STEVE,'chat-two');check((await call('get_finance_summary')).isError);
await as(OTHER,'chat-one');check((await call('get_finance_summary',{}, {finance:financeData(rest,OTHER),now})).isError);
await as(OTHER);await q("insert into finance_connector_grants(client_id) values ('chat-one')");
await as(OTHER,'chat-one');
const otherSummary=await call('get_finance_summary',{year:2026},{finance:financeData(rest,OTHER),now});
check(otherSummary.structuredContent.accounts.length===1&&otherSummary.structuredContent.accounts[0].name==='other');
check((await ctx.finance.rows('finance_accounts',2026)).length===0,'an explicit foreign-owner filter cannot bypass RLS');

await as();await q("delete from finance_connector_grants where client_id='chat-one'");
await as(STEVE,'chat-one');check((await call('get_finance_summary')).isError);
await as();await q("insert into finance_connector_grants(client_id) values ('chat-one')");
await db.exec('reset role');await q("update members set finance_enabled=false where email='steve@example.com'");
await as(STEVE,'chat-one');check((await call('get_finance_summary')).isError);
await db.exec('reset role');await q("update members set finance_enabled=true where email='steve@example.com'");
await as(STEVE,'chat-one');
let permissionChecks=0;
check((await call('get_finance_summary',{}, {finance:{...ctx.finance,allowed:async()=>++permissionChecks===1},now})).isError);
const stale=await call('get_finance_summary',{}, {...ctx,now:()=>new Date('2027-01-10T12:00:00Z')});check(stale.structuredContent.plan===null);
const old=await call('get_finance_summary',{year:2026}, {...ctx,now:()=>new Date('2027-01-10T12:00:00Z')});check(old.structuredContent.funding.available===null);
check(TOOLS.filter(t=>t.name.includes('finance')).every(t=>t.annotations.readOnlyHint));
await as();
await q("insert into finance_transactions(account_id,source_key,posted_on,description,amount_cents,treatment) select id,'page-'||n,'2026-11-06','Synthetic pagination',1,'transfer' from finance_accounts cross join generate_series(1,501) n");
await as(STEVE,'chat-one');
const many=await call('find_finance_transactions',{year:2026,offset:500,limit:100});check(many.structuredContent.total===506&&many.structuredContent.transactions.length===6&&many.structuredContent.next_offset===null);
await db.exec('reset role');await q("delete from members where email='steve@example.com'");
await as(STEVE,'chat-one');check((await call('get_finance_summary')).isError);

await db.exec('reset role');await db.exec('set role anon');await denied(()=>q('select can_read_finance()'));await denied(()=>q('select * from finance_connector_grants'));
await db.close();console.log(`Finance MCP: ${checks} checks passed (real RLS, owner/client isolation, revocation, writes denied, shared calculations and RPC).`);
