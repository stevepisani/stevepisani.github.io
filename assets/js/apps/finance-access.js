// Explicit per-client consent, outside the connector. Uses the existing signed-in web session.
import { $, el, db, start } from './lib/kit.js';
let generation=0, userId=null;
const requested=new URLSearchParams(location.search).get('client');
const note=text=>{ $('#finance-access-note').textContent=text; };
const clear=()=>{ generation++; userId=null; $('#finance-connections').replaceChildren(); };
async function load(user) {
  clear();
  const ticket=generation; userId=user.id;
  if(window.top!==window.self) return note('Open this page on its own to manage Finance connections.');
  note('Loading connections…');
  try {
    const current=await db.auth.getUser();
    if(ticket!==generation) return;
    if(current.error || current.data?.user?.id!==user.id) throw new Error('Sign in again before changing access.');
    const allowed=await db.rpc('can_finance');
    if(allowed.error || allowed.data!==true) throw new Error('Finance access is not enabled for this web session.');
    const [oauth,grants]=await Promise.all([db.auth.oauth.listGrants(),db.from('finance_connector_grants').select('client_id,granted_at').eq('owner',user.id)]);
    if(oauth.error || grants.error) throw new Error('Connections could not be loaded. Try again.');
    if(ticket!==generation) return;
    const clients=new Map((oauth.data||[]).map(g=>[g.client.id,g.client]));
    const granted=new Map((grants.data||[]).map(g=>[g.client_id,g.granted_at]));
    for(const id of granted.keys()) if(!clients.has(id)) clients.set(id,{id,name:'Previously connected app'});
    const host=$('#finance-connections');
    for(const client of [...clients.values()].sort((a,b)=>Number(b.id===requested)-Number(a.id===requested))) {
      const row=el('section','card'), title=el('h2','',client.name||'Connected app');
      if(client.id===requested) row.append(el('p','','Requested by this chat'));
      row.append(title,el('p','',`Client ID: ${client.id}`));
      const enabled=granted.has(client.id), b=el('button',enabled?'btn btn--ghost btn--small':'btn btn--small',enabled?'Remove Finance access':'Allow Finance read access'); b.type='button';
      row.append(el('p','',enabled?`Read access granted ${new Date(granted.get(client.id)).toLocaleDateString()}.`:'No Finance access.'),b);
      b.onclick=async()=>{
        if(ticket!==generation) return;
        b.disabled=true; note(enabled?'Removing access…':'Allowing read access…');
        try {
          const current=await db.auth.getUser();
          if(ticket!==generation || current.error || current.data?.user?.id!==user.id) throw new Error('Sign in again before changing access.');
          const result=enabled
            ? await db.from('finance_connector_grants').delete().eq('owner',userId).eq('client_id',client.id).select('client_id')
            : await db.from('finance_connector_grants').insert({client_id:client.id}).select('client_id');
          if(result.error || result.data?.length!==1) throw new Error('Access was not changed. Reload and try again.');
          const loaded=await load(user);
          if(!loaded || userId!==user.id) return;
          note(enabled?'Finance access removed. Future reads are blocked.':'Finance read access allowed. Return to your chat and ask SJPJr for a financial summary.');
          [...host.querySelectorAll('button')].find(x=>x.closest('section')?.textContent.includes(client.id))?.focus();
        } catch(e) { if(ticket===generation) { note(e.message); b.disabled=false; } }
      };
      host.append(row);
    }
    note(clients.size?'Choose the connected app you want to authorize.':'No connected apps yet. Connect SJPJr from your chat, then return here.');
    return true;
  } catch(e) { if(ticket===generation) note(e.message); }
}
start(user=>{
  $('#finance-access-refresh').onclick=()=>load(user);
  return load(user);
},()=>{
  $('#finance-access-refresh').onclick=null;
  clear();
});
