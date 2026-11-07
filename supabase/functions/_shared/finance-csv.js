// Provider exports are parsed locally. No account numbers, bank routing numbers or full CSV
// files are sent to the database. New rows require classification, never guessed deductions.
export function readCsv(text) {
  const rows=[];let row=[],cell='',quoted=false,closed=false;
  const s=String(text).replace(/^\uFEFF/,'');
  for(let i=0;i<s.length;i++){
    const c=s[i];
    if(quoted){if(c==='"'){if(s[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
    if(c==='"'){if(cell || closed)throw new Error('Invalid CSV quotes');quoted=true;}
    else if(c===',' || c==='\n' || c==='\r'){
      row.push(cell);cell='';closed=false;
      if(c!==','){if(c==='\r' && s[i+1]==='\n')i++;if(row.some(v=>v.trim()))rows.push(row);row=[];}
    }else{if(closed)throw new Error('Unexpected text after CSV quote');cell+=c;}
  }
  if(quoted)throw new Error('Unclosed CSV quote');
  if(cell || row.length || closed){row.push(cell);if(row.some(v=>v.trim()))rows.push(row);}
  if(!rows.length)throw new Error('Empty CSV');
  const head=rows.shift().map(v=>v.trim());
  if(new Set(head).size!==head.length)throw new Error('Duplicate column names');
  return rows.map((r,i)=>{if(head.length===9 && head[1]==='Bank RTN' && head[2]==='Account Number' && head[4]==='Description' && r.length>9)r=[...r.slice(0,4),r.slice(4,-4).join(','),...r.slice(-4)];if(r.length!==head.length)throw new Error(`Wrong column count on row ${i+2}`);return Object.fromEntries(head.map((k,n)=>[k,r[n].trim()]));});
}
function amount(raw){
  const s=String(raw).replace(/[$,]/g,'').trim();
  if(!/^-?\d+(\.\d{1,2})?$/.test(s))throw new Error('Invalid dollar amount');
  const negative=s.startsWith('-'),[whole,frac='']=s.replace('-','').split('.');
  const value=(Number(whole)*100+Number(frac.padEnd(2,'0')))*(negative?-1:1);
  if(!Number.isSafeInteger(value)||Math.abs(value)>1e12)throw new Error('Amount out of range');return value;
}
function date(raw){
  let d=String(raw).slice(0,10);
  if(/^\d{2}\/\d{2}\/\d{4}$/.test(d))d=d.slice(6)+'-'+d.slice(0,2)+'-'+d.slice(3,5);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d)throw new Error('Invalid transaction date');return d;
}
export function csvInfo(text){
  const rows=readCsv(text);if(!rows.length)throw new Error('No transactions in CSV');const r=rows[0];
  const format='Timestamp' in r && 'Settlement Currency' in r?'lili':'Debit' in r && 'Credit' in r?'td':'Merchant' in r && 'Account' in r && 'Amount' in r?'monarch':null;
  if(!format)throw new Error('Use a Monarch, TD or Lili transaction export.');
  if(format==='td' && new Set(rows.map(row=>row['Account Number']).filter(Boolean)).size>1)throw new Error('Export one TD account at a time');
  return {format,accounts:format==='monarch'?[...new Set(rows.map(r=>r.Account))]:[],count:rows.length};
}
export async function parseFinanceCsv(text,{accountKey,sourceAccount}={}){
  if(!accountKey)throw new Error('Choose the destination account');
  const info=csvInfo(text),seen=new Map(),transactions=[];
  if(info.format==='monarch' && !info.accounts.includes(sourceAccount))throw new Error('Choose the account within the Monarch export');
  let skippedPending=0;
  for(const r of readCsv(text)){
    if(info.format==='monarch' && r.Account!==sourceAccount)continue;
    if(info.format==='lili' && r.Status==='PENDING'){skippedPending++;continue;}
    if(info.format==='lili' && r.Status!=='SETTLED')throw new Error('Unsupported Lili transaction status');
    if(info.format==='lili' && r['Settlement Currency']!=='USD')throw new Error('Convert non-USD records with documented exchange rates before import');
    let value;
    if(info.format==='td'){
      const debit=r.Debit?amount(r.Debit):0,credit=r.Credit?amount(r.Credit):0;
      if(debit<0||credit<0||(debit && credit))throw new Error('Ambiguous TD debit/credit');value=credit-debit;
    }else value=amount(r.Amount);
    const posted=date(r.Timestamp||r.Date),description=info.format==='lili'?r['Merchant Name']:info.format==='td'?r.Description:r.Merchant;
    if(!description||description.length>500)throw new Error('Missing or oversized description');
    // Preserve repeated identical purchases using their occurrence number within an export.
    // Overlapping exports must include all occurrences for any included date.
    const identity=JSON.stringify([info.format,accountKey,posted,description,value]);
    const occurrence=(seen.get(identity)||0)+1;seen.set(identity,occurrence);
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity+':'+occurrence));
    const key=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
    transactions.push({account_source_key:accountKey,source_key:`csv:${info.format}:${key}`,posted_on:posted,description,amount_cents:value,currency:'USD',category:r.Category||'Uncategorized',treatment:'review',pending:false,note:r.Note||r.Notes||''});
  }
  if(transactions.length>10000)throw new Error('Import at most 10,000 transactions at a time');
  return {payload:{schema_version:1,transactions},format:info.format,skippedPending};
}
