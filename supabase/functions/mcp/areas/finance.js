// Finance is read-only in chat. RLS checks the owner and this client's explicit grant.
import { Invalid, read } from '../kit.js';
import { funding, spending, businessActuals } from '../../_shared/finance.js';
import { estimate2026, TAX_INPUTS, TAX_SOURCES } from '../../_shared/finance-tax.js';
const year = { type: 'integer', minimum: 2020, maximum: 2100 };
const month = { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$' };
const treatments = ['review','personal','business_income','business_expense','contractor','transfer','financing','tax_payment','retirement'];
const access = 'https://stevenpisani.com/apps/finance-access';
const tools = [
  ['get_finance_summary', 'Get financial position', 'Read the web app’s account balances, reviewed funding plan, protected reserves, available cash and business actuals for a year. Stale balances make available cash unknown. Amounts are USD integer cents; expected receipts are forecasts, not cash.', { year }],
  ['get_finance_spending', 'Review personal spending', 'Monthly personal spending and budgets, with unreviewed count. Excludes pending and non-personal transactions, nets refunds, exactly as the web app. Use find_finance_transactions for detail.', { month }],
  ['find_finance_transactions', 'Find financial transactions', 'Read imported transactions for one year, optionally narrowed by month, treatment, category or literal description query. Sorted by date then id, newest first; offset/limit paginate. Does not refresh bank feeds or change classifications.', { year, month, treatment: { type: 'string', enum: treatments }, category: { type: 'string', maxLength: 100 }, query: { type: 'string', maxLength: 100 }, offset: { type: 'integer', minimum: 0, maximum: 100000 }, limit: { type: 'integer', minimum: 1, maximum: 100 } }],
  ['get_finance_tax_scenarios', 'Read saved tax scenarios', 'Read reviewed tax estimates and their assumptions for a year. These saved estimates are not automatically recalculated from transaction changes. Includes review dates and payments already included.', { year }],
  ['estimate_finance_tax', 'Model 2026 taxes', 'Run the web app’s 2026 tax planning engine without saving. Model: MFJ, NJ, one Schedule C owner, under age 50. Supply every input explicitly from reviewed evidence; do not infer eligibility from spending alone. QBI and research credit are conditional, not guaranteed. Does not calculate safe harbor or prepare a return. All money in integer USD cents.', { ...Object.fromEntries(Object.entries(TAX_INPUTS).map(([k,description])=>[k,{type:'integer',minimum:0,maximum:1000000000000,description}])), research_percent: {type:'number',minimum:0,maximum:100}, claim_qbi: {type:'boolean'} }],
].map(([name,title,description,properties])=>({name,title,description,inputSchema:{type:'object',properties,additionalProperties:false,...(name==='estimate_finance_tax'?{required:Object.keys(properties)}:name==='get_finance_spending'?{required:['month']}: {})},annotations:read}));
const publicRow = ({owner, ...row}) => row;
const validate = (tool, args) => {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Invalid('Expected an object.');
  for (const key of Object.keys(args)) {
    const s=tool.inputSchema.properties[key], v=args[key];
    if (!s || (s.type==='integer'?!Number.isSafeInteger(v):typeof v!==s.type) ||
      (s.type==='number'&&!Number.isFinite(v)) || (s.minimum!=null&&v<s.minimum) || (s.maximum!=null&&v>s.maximum) ||
      (s.maxLength!=null&&v.length>s.maxLength) || (s.pattern&&!new RegExp(s.pattern).test(v)) || (s.enum&&!s.enum.includes(v))) throw new Invalid(`Invalid ${key}.`);
  }
  for (const k of tool.inputSchema.required || []) if (!(k in args)) throw new Invalid(`Supply ${k} explicitly.`);
};
export default {
  name:'finance', records:false, tools,
  status:Object.fromEntries(tools.map(t=>[t.name,['Reading Finance','Read Finance']])),
  instructions:'Finance requires separate read consent. Show review dates and assumptions; forecasts are not cash.',
  async call(name,args,ctx) {
    const tool=tools.find(t=>t.name===name); validate(tool,args);
    if (!ctx.finance || !await ctx.finance.allowed()) throw new Invalid(`Finance access is not authorized for this connection.${ctx.client ? ` Connection ID: ${ctx.client}.` : ''} Sign in to ${access}${ctx.client ? `?client=${encodeURIComponent(ctx.client)}` : ''} and explicitly allow this connected app to read Finance. It cannot approve itself.`);
    const now=ctx.now?.() || new Date(), y=args.year ?? (args.month?Number(args.month.slice(0,4)):Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric'}).format(now)));
    if (args.month && (Number(args.month.slice(0,4))<2020 || Number(args.month.slice(0,4))>2100 || Number(args.month.slice(0,4))!==y)) throw new Invalid('Month must belong to the requested year (2020–2100).');
    const rows=async table=>(await ctx.finance.rows(table,y)).map(publicRow);
    let data={currency:'USD',money_unit:'integer cents',read_at:now.toISOString(),year:y,in_app:'https://stevenpisani.com/apps/#finance'};
    if (name==='get_finance_summary') {
      const [accounts,plans,transactions]=await Promise.all(['finance_accounts','finance_plans','finance_transactions'].map(rows));
      const plan=plans.find(p=>p.year===y)||null;
      data={...data,accounts,plan,funding:plan?funding(accounts,plan,now):null,business_actuals:businessActuals(transactions,y),latest_transaction_on:transactions.map(t=>t.posted_on).sort().at(-1)||null,notes:['Only imported, posted and classified records enter actuals; profit is before tax adjustments.','Balances and plan review dates determine whether available cash can be stated.','Expected receipts are forecasts, not collected income.']};
    } else if (name==='get_finance_spending') {
      const [transactions,budgets]=await Promise.all(['finance_transactions','finance_budgets'].map(rows));
      const result=spending(transactions,args.month,budgets);
      data={...data,month:args.month,spent_cents:result.spent,unreviewed:result.review.length,groups:result.groups.map(g=>({category:g.category,target_cents:g.target,spent_cents:g.spent,transaction_count:g.transactions.length}))};
    } else if (name==='find_finance_transactions') {
      const all=(await rows('finance_transactions')).filter(t=>(!args.month||t.posted_on.startsWith(args.month+'-'))&&(!args.treatment||t.treatment===args.treatment)&&(!args.category||t.category===args.category)&&(!args.query||t.description.toLowerCase().includes(args.query.toLowerCase()))).sort((a,b)=>b.posted_on.localeCompare(a.posted_on)||b.id.localeCompare(a.id));
      const offset=args.offset??0, limit=args.limit??50;
      data={...data,transactions:all.slice(offset,offset+limit),total:all.length,offset,next_offset:offset+limit<all.length?offset+limit:null};
    } else if (name==='get_finance_tax_scenarios') data={...data,scenarios:await rows('finance_tax_scenarios'),notes:['Saved estimates retain their reviewed assumptions; they are not current tax returns or automatically refreshed projections.']};
    else {
      try { data={...data,year:2026,inputs:args,estimate:estimate2026(args),sources:TAX_SOURCES,assumptions:'MFJ, NJ, one Schedule C owner, under age 50; eligibility and credit usability require review. Not a safe-harbor calculation.'}; }
      catch(e) { throw new Invalid(e.message); }
    }
    // Recheck after reads: a revoked grant must not produce a partial/empty financial answer.
    if (!await ctx.finance.allowed()) throw new Invalid('Finance access was revoked. No financial result returned.');
    return {text:JSON.stringify(data),data};
  },
};
