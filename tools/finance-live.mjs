// Production proof AFTER deployment, using temporary synthetic users and records only.
// Credentials stay in memory; logs contain check counts only. Never import personal records.
import {readFileSync} from 'node:fs';
import {randomUUID,randomBytes} from 'node:crypto';
const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token)throw new Error('SUPABASE_ACCESS_TOKEN is required for deployed finance checks');
const ref=readFileSync(new URL('../_config.yml',import.meta.url),'utf8').match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1];
const base=`https://${ref}.supabase.co`;
let phase='initialization',checks=0,service,anon;
const users=[];
const check=(value)=>{if(!value)throw new Error(`Finance live check failed: ${phase}`);checks++;};
async function request(url,{method='GET',headers={},body}={}){
  const response=await fetch(url,{method,headers:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(30000)});
  const text=await response.text();let data;try{data=text?JSON.parse(text):null;}catch{data=null;}
  return {status:response.status,ok:response.ok,data};
}
async function management(path,body){
  const result=await request(`https://api.supabase.com/v1/projects/${ref}${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`},body});
  check(result.ok);return result.data;
}
const sql=query=>management('/database/query',{query});
const api=(path,bearer=anon,body,method=body?'POST':'GET')=>request(base+path,{method,headers:{apikey:anon,Authorization:`Bearer ${bearer}`,Prefer:'return=representation'},body});
try{
  phase='API key discovery';const keys=await management('/api-keys');service=keys.find(k=>k.name==='service_role')?.api_key;anon=keys.find(k=>k.name==='anon')?.api_key;check(!!service&&!!anon);
  for(let i=0;i<2;i++){
    phase='synthetic user creation';const email=`finance-check-${randomUUID()}@example.invalid`,password=randomBytes(32).toString('base64url');
    const created=await api('/auth/v1/admin/users',service,{email,password,email_confirm:true});check(created.ok&&!!created.data?.id);
    const user={id:created.data.id,email};users.push(user);
    await sql(`insert into public.members(email,name,sections,finance_enabled) values ('${email}','Synthetic finance check','{recipes}',${i===0})`);
    const signed=await api('/auth/v1/token?grant_type=password',anon,{email,password});check(signed.ok&&!!signed.data?.access_token);user.token=signed.data.access_token;
  }
  phase='anonymous denial';for(const table of ['finance_accounts','finance_transactions','finance_plans','finance_budgets','finance_tax_scenarios']){const response=await api(`/rest/v1/${table}?select=*`);check([401,403].includes(response.status));}
  phase='non-enabled member denial';check((await api('/rest/v1/rpc/can_finance',users[1].token,{})).data===false);
  phase='owner write';const account=await api('/rest/v1/finance_accounts',users[0].token,{source_key:'synthetic-live',name:'Synthetic checking',kind:'cash',balance_cents:10000,as_of:new Date().toISOString()});check(account.ok&&account.data?.length===1);
  const accountId=account.data[0].id;
  phase='cross-owner isolation';await sql(`update public.members set finance_enabled=true where email='${users[1].email}'`);
  const other=await api('/rest/v1/finance_accounts?select=*',users[1].token);check(other.ok&&other.data?.length===0);
  const forged=await api('/rest/v1/finance_accounts',users[0].token,{owner:users[1].id,source_key:'forged',name:'Synthetic',kind:'cash',balance_cents:1,as_of:new Date().toISOString()});check(forged.status===403);
  phase='cross-owner transaction denial';const cross=await api('/rest/v1/finance_transactions',users[1].token,{account_id:accountId,source_key:'cross',posted_on:'2026-01-01',description:'Synthetic',amount_cents:1});check(!cross.ok);
  phase='import and duplicate protection';const payload={schema_version:1,transactions:[{account_source_key:'synthetic-live',source_key:'synthetic-transaction',posted_on:'2026-01-01',description:'Synthetic payment',amount_cents:-100,treatment:'personal'}]};
  for(let i=0;i<2;i++)check((await api('/rest/v1/rpc/finance_import',users[0].token,{payload})).ok);
  const ledger=await api('/rest/v1/finance_transactions?select=id',users[0].token);check(ledger.ok&&ledger.data?.length===1);
  phase='revoked membership';await sql(`update public.members set finance_enabled=false where email='${users[0].email}'`);
  check((await api('/rest/v1/rpc/can_finance',users[0].token,{})).data===false);
  const revoked=await api('/rest/v1/finance_accounts?select=*',users[0].token);check(revoked.ok&&revoked.data?.length===0);
  check((await api('/rest/v1/rpc/finance_import',users[0].token,{payload})).status===403);
  console.log(`Deployed Finance: ${checks} synthetic authorization/import checks passed. No personal records accessed.`);
}catch{
  console.error(`Deployed Finance verification failed during ${phase}. Personal import remains blocked.`);process.exitCode=1;
}finally{
  let clean=true;
  for(const user of users){
    try{const deleted=await api(`/auth/v1/admin/users/${user.id}`,service,undefined,'DELETE');if(!deleted.ok)clean=false;await sql(`delete from public.members where email='${user.email}'`);}catch{clean=false;}
  }
  if(!clean){console.error('Synthetic cleanup incomplete; inspect test users before proceeding.');process.exitCode=1;}
  else console.log('Synthetic finance users and their records removed.');
}
