import { $, el, db } from './kit.js';
import { estimate2026, TAX_INPUTS } from '../../../../supabase/functions/_shared/finance-tax.js';
import { csvInfo, parseFinanceCsv } from '../../../../supabase/functions/_shared/finance-csv.js';
import { funding, spending, businessActuals } from '../../../../supabase/functions/_shared/finance.js';
let generation = 0, userId = null, data = null, active = false, selected = null;
let month = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York', year:'numeric', month:'2-digit' });
// Locale formatting can vary; use explicit parts for the input's YYYY-MM value.
const parts = new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit'}).formatToParts(new Date());
month = `${parts.find(p=>p.type==='year').value}-${parts.find(p=>p.type==='month').value}`;
const money = n => n == null ? 'Review needed' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n/100);
const root = () => $('#finance-content');
const button = (label, fn, cls='link-btn') => { const b=el('button',cls,label); b.type='button'; b.onclick=fn; return b; };
const note = (text,retry=false) => {
  const notice=el('div','finance-notice');notice.append(el('p','',text));
  if(retry)notice.append(button('Try again',load,'btn btn--small'));
  root()?.replaceChildren(notice);
};
export function clear(message='Unlock Finance to load current records.') {
  generation++; data=null; selected=null;
  note(message);
}
export function leave() { active=false; clear(); }
export async function enter() { active=true; await load(); }
export async function permission(user) {
  clear(); userId=user?.id || null;
  if (!userId || user.offline || !navigator.onLine) return false;
  const ticket=generation, {data:allowed,error}=await db.rpc('can_finance');
  return ticket===generation && !error && allowed===true;
}
async function all(table, ticket) {
  const records=[];
  for(let offset=0;;offset+=500) {
    let query=db.from(table).select('*').order(table==='finance_plans'?'year':table==='finance_budgets'?'month':'id');
    if(table==='finance_budgets') query=query.order('category');
    const {data:batch,error}=await query.range(offset,offset+499);
    if(error) throw new Error('Unable to load financial records.');
    if(ticket!==generation) throw new Error('Session changed.');
    records.push(...batch);
    if(batch.length<500) return records;
    if(records.length>=100000) throw new Error('Too many records to load safely. Narrow the import.');
  }
}
export async function load() {
  const previousCategory=selected;
  clear('Loading current financial records…');
  if(!active) return;
  const ticket=generation;
  if(!navigator.onLine) return note('Finance needs a connection. No offline financial copy is stored.');
  try {
    const {data:auth,error:authError}=await db.auth.getUser();
    if(authError || !auth.user || auth.user.id!==userId) throw new Error('Sign in again to view Finance.');
    const {data:allowed,error}=await db.rpc('can_finance');
    if(error || allowed!==true) throw new Error('Finance access is not enabled for this session.');
    const [accounts,transactions,plans,budgets,scenarios]=await Promise.all(['finance_accounts','finance_transactions','finance_plans','finance_budgets','finance_tax_scenarios'].map(t=>all(t,ticket)));
    if(ticket!==generation || !active || document.hidden) return;
    data={accounts,transactions,plans,budgets,scenarios}; selected=previousCategory; draw();
  } catch(e) { if(ticket===generation) { data=null; note(e.message,true); } }
}
const row = (label,value) => { const r=el('div','finance-row'); r.append(el('span','',label),el('strong','',money(value))); return r; };
const card = title => { const c=el('section','finance-card'); c.append(el('h2','',title)); return c; };
// Long editors keep their exit and commit actions in view, just like the app's sheets.
function editorActions(pane,form,save,status) {
  const opener=document.activeElement, bar=el('div','finance-editor__actions');
  const snapshot=()=>Array.from(form.querySelectorAll('input,select,textarea'),c=>c.type==='checkbox'?c.checked:c.value);
  const initial=JSON.stringify(snapshot());
  const cancel=button('Cancel',()=>{
    if(JSON.stringify(snapshot())!==initial && !confirm("Discard what you've entered?"))return;
    pane.remove();if(opener?.isConnected)opener.focus();
  },'btn btn--ghost btn--small');
  save.className='btn btn--small';status.setAttribute('role','status');
  bar.append(cancel,save);form.prepend(bar);pane.classList.add('finance-editor');
}
function draw() {
  if(!data) return;
  const host=root(); host.replaceChildren();
  const toolbar=el('div','finance-toolbar');
  const label=el('label','','Month '), input=el('input'); input.type='month'; input.value=month;
  input.onchange=()=>{ if(input.value) {month=input.value;selected=null;draw();} }; label.append(input);
  const actions=el('div','finance-toolbar__actions'); actions.setAttribute('role','group'); actions.setAttribute('aria-label','Financial records');
  actions.append(button('Import',()=>importFile(host),'btn btn--small'),button('Refresh',load,'btn btn--ghost btn--small'),button('Export backup',exportBackup,'btn btn--ghost btn--small'));
  const settings=el('div','finance-toolbar__actions'); settings.setAttribute('role','group'); settings.setAttribute('aria-label','Financial plan');
  settings.append(button('Edit plan',()=>editPlan(host),'btn btn--ghost btn--small'),button('Add account',()=>editAccount(host),'btn btn--ghost btn--small'));
  toolbar.append(label,actions,settings); host.append(toolbar);
  const plan=data.plans.find(p=>p.year===Number(month.slice(0,4)));
  if(!plan) { host.append(el('p','finance-notice','No funding plan for this year. Import a reviewed plan to begin.')); return; }
  const f=funding(data.accounts,plan);
  const grid=el('div','finance-overview');
  const available=card('Available after reserves');
  available.append(el('p','finance-amount',money(f.available)),el('p','finance-muted',f.reviewRequired?'Refresh stale balances or review the funding plan before allocating money.':'Based on recorded cash, after the obligations shown here.'));
  available.append(row('Cash on hand',f.cash),row('Unfunded obligations',Math.max(0,-f.surplus)),row('Available for retirement goal',f.availableToFund));
  const reserves=card('Protected money');
  [['Credit cards',f.cards],['Taxes',plan.tax_reserve_cents],['Contractors',plan.contractor_reserve_cents],['Business operations',plan.operations_reserve_cents],['Household reserve',plan.household_reserve_cents]].forEach(([l,v])=>reserves.append(row(l,v)));
  reserves.append(row('Total protected',f.protected)); grid.append(available,reserves); host.append(grid);
  const actuals=businessActuals(data.transactions,plan.year), business=card(`Recorded business actuals · ${plan.year}`);
  business.append(row('Collected income',actuals.income),row('Contractors paid',actuals.contractors),row('Other business expenses',actuals.expenses),row('Recorded profit before tax adjustments',actuals.profit),el('p','finance-muted',`${actuals.unreviewed} transactions still need review. Totals include only imported, posted and classified records; they are not a complete tax calculation.`));host.append(business);
  const goal=card('Retirement goal');
  goal.append(row('Funded',plan.retirement_funded_cents),row('Goal',plan.retirement_goal_cents));
  const progress=el('progress'); progress.max=Math.max(1,plan.retirement_goal_cents);progress.value=Math.min(plan.retirement_goal_cents,plan.retirement_funded_cents);progress.setAttribute('aria-label','Retirement goal funded');goal.append(progress);
  host.append(goal);
  drawSpending(host,plan);
  const future=card('Expected, not yet available'); future.append(row('Expected collections',plan.expected_receipts_cents),row('Projected cushion after remaining goal',f.reviewRequired?null:f.projectedAfterGoal),el('p','finance-muted',`Plan reviewed ${plan.reviewed_on}. ${plan.assumptions}`));host.append(future);
  const taxes=card('Tax scenarios');
  if(plan.year===2026) taxes.append(button('Model a tax scenario',()=>editTax(host)));
  const scenarios=data.scenarios.filter(s=>s.year===plan.year);
  if(!scenarios.length) taxes.append(el('p','','No reviewed scenarios imported.'));
  for(const s of scenarios) { const c=el('details');c.append(el('summary','',`${s.name} · ${money(remainingTax(s))} remaining`),row('Business profit',s.profit_cents),row('Federal estimate',s.federal_cents),row('State estimate',s.state_cents),row('Payments credited',s.paid_cents),row('Retirement contribution assumed',s.retirement_cents),el('p','',`${s.reviewed_on}: ${s.assumptions}`));if(s.inputs?.model==='2026-v1')c.append(button('Edit scenario',()=>editTax(host,s)));c.append(button('Use as tax reserve',()=>useTax(s,plan)));taxes.append(c); } host.append(taxes);
  const sources=card('Accounts and freshness'); for(const a of data.accounts) { const accountRow=row(`${a.name} · ${a.as_of.slice(0,10)}${f.unresolved.includes(a.id)?' · Stale':''}`,a.balance_cents);accountRow.append(button('Update balance',()=>editAccount(host,a)));sources.append(accountRow); }host.append(sources);
}
function drawSpending(host,plan) {
  const s=spending(data.transactions,month,data.budgets), cardEl=card('Monthly spending');
  cardEl.append(row('Spent',s.spent),row('Target',plan.monthly_target_cents),row('Remaining',plan.monthly_target_cents-s.spent));
  const grid=el('div','finance-spending'), categories=el('div','finance-categories'), detail=el('div','finance-detail');
  const groups=[...s.groups,{category:'Needs review',transactions:s.review,spent:null,target:null},{category:'All transactions',transactions:data.transactions.filter(t=>t.posted_on.startsWith(month+'-')),spent:null,target:null}];
  if(!selected || !groups.some(g=>g.category===selected)) selected=groups[0]?.category;
  for(const g of groups) {
    const b=button('',()=>{selected=g.category;draw();root()?.querySelector('.finance-category[aria-pressed=true]')?.focus({preventScroll:true});},'finance-category');
    b.setAttribute('aria-pressed',String(selected===g.category));
    b.append(el('span','',g.category),el('strong','',g.spent===null?`${g.transactions.length} transaction${g.transactions.length===1?'':'s'}`:money(g.spent)),el('small','',g.target===null?'No category target':`${money(g.target)} target`));categories.append(b);
  }
  const group=groups.find(g=>g.category===selected);
  const detailTitle=el('h3','',group?.category || 'Transactions');detailTitle.tabIndex=-1;detail.append(detailTitle);
  const search=el('input'), count=el('p','finance-muted'), list=el('div','finance-transactions');
  search.type='search';search.placeholder='Search transactions';search.setAttribute('aria-label','Search transactions in this category');
  count.setAttribute('role','status');
  const transactions=[...(group?.transactions||[])].sort((a,b)=>b.posted_on.localeCompare(a.posted_on));
  let shown=50;const rows=new Map();
  const more=button('Show more transactions',()=>{const previous=shown;shown+=50;renderTransactions();list.children[previous]?.querySelector('summary')?.focus({preventScroll:true});},'btn btn--ghost btn--small');
  function transaction(t) {
    if(rows.has(t.id))return rows.get(t.id);
    const r=el('details','finance-transaction'),summary=el('summary','finance-transaction__summary');
    const description=el('span','finance-transaction__description');
    description.append(el('strong','',t.description),el('small','finance-muted',`${t.posted_on} · ${t.category} · ${t.treatment.replaceAll('_',' ')}${t.pending?' · Pending':''}`));
    summary.append(description,el('strong','',new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(t.amount_cents/100)));
    r.dataset.transactionId=t.id;summary.tabIndex=0;r.append(summary);
    // Build editing fields only when this row is opened; long imports stay small in the DOM.
    r.addEventListener('toggle',()=>{
      if(!r.open || r.querySelector('form'))return;
      const form=el('form','finance-transaction__form'),label=el('label','','Treatment '),select=el('select');
      for(const value of ['review','personal','business_income','business_expense','contractor','transfer','financing','tax_payment','retirement']) {const o=el('option','',value.replaceAll('_',' '));o.value=value;select.append(o);}select.value=t.treatment;label.append(select);
      const categoryLabel=el('label','','Category '),category=el('input');category.value=t.category;category.maxLength=100;categoryLabel.append(category);
      const noteLabel=el('label','','Note '),memo=el('input');memo.value=t.note||'';memo.maxLength=2000;noteLabel.append(memo);
      const status=el('p','finance-muted'),save=el('button','btn btn--small','Save');save.type='submit';status.setAttribute('role','status');
      form.append(label,categoryLabel,noteLabel,status,save);r.append(form);
      form.onsubmit=async e=>{
        e.preventDefault();const ticket=generation;save.disabled=true;status.textContent='Saving…';
        try {
          const {data:changed,error}=await db.from('finance_transactions').update({treatment:select.value,category:category.value.trim()||'Uncategorized',note:memo.value}).eq('id',t.id).eq('updated_at',t.updated_at).select('id');
          if(ticket!==generation)return;
          if(error || !changed?.length){status.textContent='Could not save, or this transaction changed elsewhere. Your edits are still here. Refresh records before retrying.';save.disabled=false;return;}
          await load();
          if(generation!==ticket+1)return;
          const currentDetail=root()?.querySelector('.finance-detail');
          const target=currentDetail?.querySelector(`[data-transaction-id="${CSS.escape(t.id)}"] summary`) || currentDetail?.querySelector('h3');
          target?.focus({preventScroll:true});
          const feedback=currentDetail?.querySelector('[role=status]');if(feedback)feedback.textContent='Transaction saved. '+feedback.textContent;
        }catch{if(ticket===generation){status.textContent='Connection failed. Your edits are still here; try Save again.';save.disabled=false;}}
      };
    });
    rows.set(t.id,r);return r;
  }
  function renderTransactions() {
    const query=search.value.trim().toLocaleLowerCase();
    const matches=transactions.filter(t=>!query || [t.description,t.category,t.note,t.posted_on].some(v=>String(v||'').toLocaleLowerCase().includes(query)));
    const visible=matches.slice(0,shown);
    list.replaceChildren(...visible.map(transaction));
    count.textContent=`${matches.length} transaction${matches.length===1?'':'s'}${visible.length<matches.length?` · showing ${visible.length}`:''}`;
    more.hidden=visible.length>=matches.length;
    if(!matches.length)list.append(el('p','',query?'No matching transactions. Try another search.':'No transactions in this category.'));
  }
  search.oninput=()=>{shown=50;renderTransactions();};
  detail.append(search,count,list,more);renderTransactions();
  grid.append(categories,detail);cardEl.append(grid);host.append(cardEl);
}
addEventListener('offline',()=>clear('Finance needs a connection.'));
addEventListener('pagehide',()=>clear());
document.addEventListener('visibilitychange',()=>{if(document.hidden) clear();else if(active) load();});
db.auth.onAuthStateChange((event,session)=>{
  if(event==='SIGNED_OUT' || (userId && session?.user?.id!==userId)) {userId=null;clear('Sign in to view Finance.');}
});

const fields={
  accounts:['source_key','name','kind','balance_cents','currency','as_of','included'],
  transactions:['source_key','posted_on','description','amount_cents','currency','category','treatment','pending','note'],
  plans:['year','monthly_target_cents','retirement_goal_cents','retirement_funded_cents','tax_reserve_cents','contractor_reserve_cents','operations_reserve_cents','household_reserve_cents','expected_receipts_cents','reviewed_on','assumptions'],
  budgets:['month','category','target_cents'],
  scenarios:['year','source_key','name','profit_cents','federal_cents','state_cents','paid_cents','retirement_cents','assumptions','reviewed_on','inputs'],
};
function exportBackup() {
  if(!data) return;
  const backup={schema_version:1};
  for(const [kind,keys] of Object.entries(fields)) backup[kind]=data[kind].map(record=>{
    const out=Object.fromEntries(keys.map(k=>[k,record[k]]));
    if(kind==='transactions') out.account_source_key=data.accounts.find(a=>a.id===record.account_id)?.source_key;
    return out;
  });
  const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}));
  const a=el('a');a.href=url;a.download='finance-private-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function importFile(host) {
  const ticket=generation, pane=card('Import reviewed records'), input=el('input');input.type='file';input.accept='.json,.csv,application/json,text/csv';input.setAttribute('aria-label','Finance import file');
  const status=el('p','','Choose a Finance JSON backup or a Monarch, TD or Lili CSV. Review the counts before uploading. This file contains private financial information.');
  const submit=button('Import records',async()=>{
    if(ticket!==generation || !payload) return;
    submit.disabled=true;
    try {
      const {error}=await db.rpc('finance_import',{payload});
      if(ticket!==generation) return;
      if(error) {status.textContent='Import failed. No records were changed. Check the format and existing source records.';submit.disabled=false;return;}
      await load();
    } catch { if(ticket===generation) {status.textContent='Connection failed. Refresh and retry the same file; duplicate records are safe to retry.';submit.disabled=false;} }
  });submit.disabled=true;
  let payload=null,csvText=null;
  const destination=el('select'),source=el('select'),csvOptions=el('div');csvOptions.hidden=true;
  destination.setAttribute('aria-label','Destination account');source.setAttribute('aria-label','Account in Monarch export');
  const placeholder=el('option','','Choose destination account');placeholder.value='';destination.append(placeholder);
  for(const account of data.accounts){const o=el('option','',account.name);o.value=account.source_key;destination.append(o);}
  csvOptions.append(el('p','','Use one provider per account. Include complete dates in overlapping exports so repeat purchases can be matched. CSV imports do not update balances.'),destination,source);
  const prepareCsv=async()=>{
    payload=null;submit.disabled=true;
    try{const parsed=await parseFinanceCsv(csvText,{accountKey:destination.value,sourceAccount:source.value});if(ticket!==generation)return;payload=parsed.payload;status.textContent=`${payload.transactions.length} ${parsed.format} transactions to review; ${parsed.skippedPending} pending rows omitted. No classifications will be guessed.`;submit.disabled=false;}catch(e){if(ticket===generation)status.textContent=e.message;}
  };
  destination.onchange=prepareCsv;source.onchange=prepareCsv;
  input.onchange=async()=>{
    payload=null;submit.disabled=true;const file=input.files[0];
    if(!file)return;
    if(file.size>9000000){status.textContent='Use a file smaller than 9 MB.';return;}
    try {
      const text=await file.text();if(ticket!==generation)return;
      if(file.name.toLowerCase().endsWith('.csv')){
        const info=csvInfo(text);csvText=text;csvOptions.hidden=false;source.replaceChildren();source.hidden=info.format!=='monarch';
        for(const name of info.accounts){const o=el('option','',name);o.value=name;source.append(o);}
        await prepareCsv();return;
      }
      csvText=null;csvOptions.hidden=true;
      const parsed=JSON.parse(text);
      if(ticket!==generation)return;
      if(parsed.schema_version!==1 || Object.keys(parsed).some(k=>k!=='schema_version' && !(k in fields)))throw new Error();
      for(const k of Object.keys(fields))if(parsed[k]!==undefined && (!Array.isArray(parsed[k]) || parsed[k].length>10000))throw new Error();
      payload=parsed;status.textContent=Object.keys(fields).map(k=>`${parsed[k]?.length||0} ${k}`).join(' · ')+'. Existing classifications and plans are preserved. New balances replace older balances.';submit.disabled=false;
    }catch{status.textContent='This is not a supported Finance export. Nothing was uploaded.';}
  };
  pane.append(input,csvOptions,status,submit,button('Cancel',()=>pane.remove()));host.prepend(pane);input.focus();
}
function editPlan(host) {
  const ticket=generation, year=Number(month.slice(0,4)), existing=data.plans.find(p=>p.year===year), pane=card(`Funding plan · ${year}`), form=el('form','finance-plan');
  const labels={monthly_target_cents:'Monthly household target',retirement_goal_cents:'Retirement goal',retirement_funded_cents:'Retirement already funded',tax_reserve_cents:'Remaining tax reserve',contractor_reserve_cents:'Unpaid contractor obligations',operations_reserve_cents:'Business operations reserve',household_reserve_cents:'Household reserve',expected_receipts_cents:'Expected receipts (uncollected)'};
  const controls={};
  for(const [key,label] of Object.entries(labels)) {
    const wrap=el('label','',label), input=el('input');input.type='number';input.min='0';input.max='10000000000';input.step='.01';input.required=true;input.value=existing?String(existing[key]/100):'';controls[key]=input;wrap.append(input);form.append(wrap);
  }
  const explanation=el('label','','Assumptions and unresolved items'), assumptions=el('textarea');assumptions.maxLength=8000;assumptions.value=existing?.assumptions||'';explanation.append(assumptions);form.append(explanation);
  const status=el('p'), save=el('button','link-btn','Save reviewed plan');save.type='submit';form.append(status);editorActions(pane,form,save,status);
  form.onsubmit=async e=>{
    e.preventDefault();if(ticket!==generation)return;
    const patch={year,assumptions:assumptions.value,reviewed_on:new Date().toLocaleDateString('en-CA')};
    // Input parsing requires decimal dollars, never floating-point rounding of fractional cents.
    for(const [key,input] of Object.entries(controls)) {
      if(!/^\d+(\.\d{1,2})?$/.test(input.value)){status.textContent='Enter dollar amounts with at most two decimal places.';return;}
      const [whole,fraction='']=input.value.split('.');patch[key]=Number(whole)*100+Number(fraction.padEnd(2,'0'));
      if(!Number.isSafeInteger(patch[key])||patch[key]>1000000000000){status.textContent='Amount is too large.';return;}
    }
    save.disabled=true;
    const query=existing?db.from('finance_plans').update(patch).eq('year',year).eq('updated_at',existing.updated_at).select('year'):db.from('finance_plans').insert(patch).select('year');
    const {data:changed,error}=await query;
    if(ticket!==generation)return;
    if(error||!changed?.length){status.textContent='Could not save, or this plan changed elsewhere. Refresh before editing.';save.disabled=false;return;}
    await load();
  };
  pane.append(el('p','finance-muted','Reserves are remaining obligations. Do not count payments already reflected in cash twice. Saving marks these assumptions reviewed today.'),form);host.prepend(pane);form.querySelector('input').focus();
}

function editAccount(host,existing=null) {
  const ticket=generation,pane=card(existing?'Update account balance':'Add account'),form=el('form','finance-plan');
  const field=(label,type,value)=>{const wrap=el('label','',label),input=el('input');input.type=type;input.value=value;input.required=true;wrap.append(input);form.append(wrap);return input;};
  const name=field('Account label','text',existing?.name||'');name.maxLength=160;
  const kindLabel=el('label','','Account type'),kind=el('select');for(const k of ['cash','credit','loan','investment']){const o=el('option','',k);o.value=k;kind.append(o);}kind.value=existing?.kind||'cash';kind.disabled=!!existing;kindLabel.append(kind);form.append(kindLabel);
  const balance=field('Balance in dollars (positive for debt owed)','number',existing?String(existing.balance_cents/100):'');balance.step='.01';
  const observed=field('Balance observed at (your local time)','datetime-local','');
  const at=new Date(existing?.as_of||Date.now());observed.value=new Date(+at-at.getTimezoneOffset()*60000).toISOString().slice(0,16);
  const status=el('p'),save=el('button','link-btn','Save balance');save.type='submit';form.append(status);editorActions(pane,form,save,status);
  form.onsubmit=async e=>{
    e.preventDefault();if(ticket!==generation)return;
    if(!/^-?\d+(\.\d{1,2})?$/.test(balance.value)){status.textContent='Use dollars with at most two decimal places.';return;}
    const negative=balance.value.startsWith('-'),[whole,fraction='']=balance.value.replace('-','').split('.');
    const value=(Number(whole)*100+Number(fraction.padEnd(2,'0')))*(negative?-1:1),date=new Date(observed.value);
    if(!Number.isSafeInteger(value)||Math.abs(value)>1e12||!Number.isFinite(+date)||+date>Date.now()+300000){status.textContent='Check the balance and observation time.';return;}
    save.disabled=true;
    const patch={name:name.value.trim(),kind:kind.value,balance_cents:value,as_of:date.toISOString()};
    const query=existing?db.from('finance_accounts').update(patch).eq('id',existing.id).eq('updated_at',existing.updated_at).select('id'):db.from('finance_accounts').insert({...patch,source_key:'manual:'+crypto.randomUUID(),included:true}).select('id');
    const {data:changed,error}=await query;if(ticket!==generation)return;
    if(error||!changed?.length){status.textContent='Could not save, or the account changed elsewhere. Refresh before editing.';save.disabled=false;return;}await load();
  };
  pane.append(form);host.prepend(pane);name.focus();
}

function remainingTax(s) {
  if(s.inputs?.model==='2026-v1') {
    try { estimate2026(s.inputs); if(!Number.isSafeInteger(s.inputs.federal_paid_cents)||!Number.isSafeInteger(s.inputs.state_paid_cents))return null; } catch {return null;}
    return Math.max(0,s.federal_cents-s.inputs.federal_paid_cents)+Math.max(0,s.state_cents-s.inputs.state_paid_cents);
  }
  return Math.max(0,s.federal_cents+s.state_cents-s.paid_cents);
}
async function useTax(s,plan) {
  if(remainingTax(s)===null)return clear('Review this scenario’s inputs before using its reserve.');
  if(!confirm(`Use ${money(remainingTax(s))} from “${s.name}” as the remaining tax reserve? Review the scenario assumptions first.`))return;
  const ticket=generation;
  const {data:changed,error}=await db.from('finance_plans').update({tax_reserve_cents:remainingTax(s),assumptions:plan.assumptions+`\nTax reserve: ${s.name}, reviewed ${s.reviewed_on}.`}).eq('year',plan.year).eq('updated_at',plan.updated_at).select('year');
  if(ticket!==generation)return;if(error||!changed?.length)return clear('Could not update the reserve. Refresh and review the plan.');await load();
}
function editTax(host,existing=null) {
  const ticket=generation,pane=card('2026 tax planning'),form=el('form','finance-plan'),controls={};
  const nameLabel=el('label','','Scenario name'),name=el('input');name.required=true;name.maxLength=160;name.value=existing?.name||'';nameLabel.append(name);form.append(nameLabel);
  for(const [key,label] of Object.entries(TAX_INPUTS)) {
    const wrap=el('label','',label),input=el('input');input.type='number';input.min='0';input.step='.01';input.required=true;input.value=existing?.inputs?.[key]!=null?String(existing.inputs[key]/100):key==='profit_cents'?'':'0';wrap.append(input);form.append(wrap);controls[key]=input;
  }
  const rdLabel=el('label','','Qualified owner research time (%)'),rd=el('input');rd.type='number';rd.min='0';rd.max='100';rd.step='.1';rd.value=existing?.inputs?.research_percent??0;rdLabel.append(rd);form.append(rdLabel);
  const qbiLabel=el('label','finance-check','Model eligible QBI (conservative SSTB, no business W-2 wages/property support)'),qbi=el('input');qbi.type='checkbox';qbi.checked=existing?.inputs?.claim_qbi===true;qbiLabel.prepend(qbi);form.append(qbiLabel);
  const assumptionsLabel=el('label','','Source notes and unresolved questions'),assumptions=el('textarea');assumptions.maxLength=4000;assumptions.value=existing?.assumptions||'';assumptionsLabel.append(assumptions);form.append(assumptionsLabel);
  const result=el('div','finance-tax-result'),status=el('p'),save=el('button','link-btn','Save scenario');save.type='submit';save.disabled=true;
  let current=null;const inputs=()=>{
    const input={model:'2026-v1',research_percent:Number(rd.value),claim_qbi:qbi.checked};
    for(const [k,c] of Object.entries(controls)){if(!/^\d+(\.\d{1,2})?$/.test(c.value))throw new Error('Enter nonnegative dollar amounts with at most two decimals.');const [whole,fraction='']=c.value.split('.');input[k]=Number(whole)*100+Number(fraction.padEnd(2,'0'));}return input;
  };
  const calculate=()=>{
    try{const input=inputs(),estimate=estimate2026(input);current={input,estimate};result.replaceChildren(row('Federal estimate',estimate.federal_cents),row('NJ estimate',estimate.state_cents),row('Remaining taxes',estimate.remaining_cents),row('QBI deduction',estimate.qbi_deduction_cents),row('Potential research credit',estimate.potential_credit_cents),row('Credit applied',estimate.applied_credit_cents));status.textContent='';save.disabled=false;}catch(e){current=null;save.disabled=true;result.replaceChildren();status.textContent=e.message;}
  };
  form.oninput=()=>{current=null;save.disabled=true;result.replaceChildren();};
  form.append(button('Calculate',calculate,'btn btn--ghost btn--small'),status);editorActions(pane,form,save,status);
  form.onsubmit=async e=>{
    e.preventDefault();if(ticket!==generation||!current)return;save.disabled=true;
    const {input,estimate}=current,patch={year:2026,name:name.value,profit_cents:input.profit_cents,federal_cents:estimate.federal_cents,state_cents:estimate.state_cents,paid_cents:input.federal_paid_cents+input.state_paid_cents,retirement_cents:input.retirement_cents,assumptions:assumptions.value||'2026 MFJ/NJ planning scenario; model limitations apply.',reviewed_on:new Date().toISOString().slice(0,10),inputs:input};
    const query=existing?db.from('finance_tax_scenarios').update(patch).eq('id',existing.id).eq('updated_at',existing.updated_at).select('id'):db.from('finance_tax_scenarios').insert({...patch,source_key:'scenario:'+crypto.randomUUID()}).select('id');
    const {data:changed,error}=await query;if(ticket!==generation)return;if(error||!changed?.length){status.textContent='Could not save. Refresh before editing.';save.disabled=false;return;}await load();
  };
  pane.append(el('p','finance-muted','Planning only: one active Schedule C owner, married filing jointly in NJ, under 50, no owner W-2 wages or other retirement contributions. No capital gains, loss carryovers, AMT, dependent credits or payment-penalty calculation. Confirm retirement eligibility and credit usability separately. Potential R&D credits do not reduce taxes unless entered as usable.'),form,result);host.prepend(pane);name.focus();
}
