// Exercise the deployed-browser verifier against the actual built app and synthetic auth/API.
// Network is intercepted; revoked sessions fail, and unrelated private APIs are rejected.
import assert from 'node:assert/strict';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {verifyFinanceBrowser} from './finance-browser-live.mjs';
const root=resolve('_site'),ref='dkaiavlnmtetqigxnkwb';
const now=new Date().toISOString();let generations=0;
const revoked=new Set(),stages=[],forbidden=[];
const rows={
 finance_accounts:[{id:'cash',source_key:'synthetic-live',name:'Synthetic checking',kind:'cash',balance_cents:10000,as_of:now,included:true,currency:'USD'}],
 finance_transactions:[{id:'t1',account_id:'cash',source_key:'synthetic-transaction',posted_on:'2026-01-01',description:'Synthetic payment',amount_cents:-100,treatment:'personal',category:'Food',pending:false}],
 finance_plans:[{year:new Date().getFullYear(),monthly_target_cents:1000,retirement_goal_cents:1000,retirement_funded_cents:0,tax_reserve_cents:1000,contractor_reserve_cents:1000,operations_reserve_cents:1000,household_reserve_cents:1000,expected_receipts_cents:1000,reviewed_on:now.slice(0,10),assumptions:'Synthetic plan'}],
 finance_budgets:[],finance_tax_scenarios:[]
};
const freshSessions=async()=>{
 generations++;
 return ['owner','other'].map(id=>{
  const user={id,email:`${id}@example.invalid`,aud:'authenticated',role:'authenticated'};
  const token=[{alg:'HS256',typ:'JWT'},{sub:id,email:user.email,role:'authenticated',exp:4102444800,jti:generations},'synthetic'].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
  return {access_token:token,refresh_token:`synthetic-${id}-${generations}`,expires_in:3600,expires_at:4102444800,token_type:'bearer',user};
 });
};
await verifyFinanceBrowser({ref,freshSessions,stage:s=>{stages.push(s);console.log(s);},prepareContext:async context=>{
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin==='https://stevenpisani.com'){
   let path=resolve(root,'.'+url.pathname);if(existsSync(path)&&statSync(path).isDirectory())path+='/index.html';
   if(!path.startsWith(root+'/')||!existsSync(path))return route.fulfill({status:404,body:''});
   const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'}[extname(path)]||'application/octet-stream';
   return route.fulfill({contentType:mime,body:readFileSync(path)});
  }
  if(url.origin!==`https://${ref}.supabase.co`)return route.abort();
  const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(body)});
  if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});
  const token=request.headers().authorization?.replace(/^Bearer /,'');let claims={};try{claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());}catch{}
  if(url.pathname==='/auth/v1/logout'){revoked.add(token);return json({});}
  if(!claims.sub||revoked.has(token))return json({message:'Synthetic session is not active'},401);
  if(url.pathname==='/auth/v1/user')return json({id:claims.sub,email:claims.email,aud:'authenticated',role:'authenticated'});
  if(url.pathname==='/rest/v1/rpc/is_member'||url.pathname==='/rest/v1/rpc/can_finance')return json(true);
  if(url.pathname==='/rest/v1/rpc/me')return json({name:'Synthetic user',sections:[]});
  const table=url.pathname.split('/').at(-1);
  if(table in rows)return json(claims.sub==='owner'?rows[table]:[]);
  forbidden.push(url.pathname);return route.abort();
 });
}});
assert.equal(generations,2);assert.equal(revoked.size,2);assert.deepEqual(forbidden,[]);
assert.equal(stages.filter(s=>s.endsWith('second owner isolation')).length,2);
console.log('Deployed verifier regression: real built app, fresh sessions after logout, two viewports and no unrelated private API reads passed.');
