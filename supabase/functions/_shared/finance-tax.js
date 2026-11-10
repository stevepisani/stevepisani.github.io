// Planning engine, 2026 only: one active Schedule C owner, MFJ, NJ, under age 50.
// Ported from the reviewed local tax_reserve/qbi_home/rd_planning calculations.
// All private amounts are explicit inputs. This is not a return or a safe-harbor calculation.
import { cents } from './finance.js';
export const TAX_SOURCES = [
  'https://www.irs.gov/irb/2025-45_IRB',
  'https://www.ssa.gov/news/en/cola/factsheets/2026.html',
  'https://www.irs.gov/instructions/i1040sse',
  'https://www.irs.gov/instructions/i8959',
  'https://www.nj.gov/treasury/taxation/pdf/current/1040esi.pdf',
];
const FEDERAL=[[24800,.10],[100800,.12],[211400,.22],[403550,.24],[512450,.32],[768700,.35],[Infinity,.37]];
const NJ=[[20000,.014],[50000,.0175],[70000,.0245],[80000,.035],[150000,.05525],[500000,.0637],[1000000,.0897],[Infinity,.1075]];
export function brackets(income, bands){let tax=0,lower=0;for(const [ceiling,rate] of bands){tax+=Math.max(0,Math.min(income,ceiling)-lower)*rate;lower=ceiling;if(income<=ceiling)break;}return tax;}
export function qbiDeduction(qbi,taxable){
  const phase=Math.min(1,Math.max(0,(taxable-403500)/150000));
  const ordinary=Math.min(.2*qbi*(1-phase)**2,.2*Math.max(0,taxable));
  return Math.max(ordinary,qbi*(1-phase)>=1000?400:0);
}
export const TAX_INPUTS={
  profit_cents:'Annual business profit before home office',
  home_office_cents:'Qualified home-office deduction',
  health_cents:'Eligible self-employed health premiums',
  retirement_cents:'Traditional solo 401(k) contribution',
  spouse_wages_cents:'Spouse taxable W-2 wages',
  personal_interest_cents:'Deductible personal mortgage interest',
  paid_salt_cents:'Eligible personal state and local taxes paid',
  federal_paid_cents:'Federal estimated payments and income-tax withholding',
  state_paid_cents:'NJ estimated payments and income-tax withholding',
  contractor_qre_cents:'Qualified contractor research costs after 65% factor',
  historical_base_cents:'Reviewed research-credit historical base',
  usable_credit_cents:'Research credit confirmed usable this year',
};
export function estimate2026(input){
  const v=Object.fromEntries(Object.keys(TAX_INPUTS).map(k=>[k.replace('_cents',''),cents(input[k]??0)/100]));
  const fraction=(input.research_percent??0)/100;
  if(!Number.isFinite(fraction)||fraction<0||fraction>1)throw new Error('Research percentage must be between 0 and 100');
  if(v.home_office>v.profit)throw new Error('Home-office deduction exceeds business profit');
  const profit=v.profit-v.home_office, earnings=profit*.9235;
  const se=earnings>=400?Math.min(184500,earnings)*.124+earnings*.029:0;
  const medicare=Math.max(0,earnings+v.spouse_wages-250000)*.009;
  const earned=Math.max(0,profit-se/2);
  const retirementLimit=Math.min(72000,earned,24500+.2*earned);
  if(v.retirement>retirementLimit)throw new Error('Contribution exceeds this model’s under-50 solo 401(k) limit');
  const health=Math.min(v.health,Math.max(0,earned-v.retirement));
  const agi=earned-health-v.retirement+v.spouse_wages;
  const saltCap=Math.max(10000,40400-.3*Math.max(0,agi-505000));
  const deduction=Math.max(32200,v.personal_interest+Math.min(v.paid_salt,saltCap));
  const taxable=Math.max(0,agi-deduction);
  const qbi=input.claim_qbi===true?qbiDeduction(Math.max(0,earned-health-v.retirement),taxable):0;
  const incomeTax=brackets(Math.max(0,taxable-qbi),FEDERAL);
  const qre=Math.max(0,earned-v.retirement)*fraction+v.contractor_qre;
  const potential=Math.max(0,qre-Math.max(v.historical_base,.5*qre))*.20*.79;
  // Full credit usability was a conditional assumption in the legacy sensitivity. Make it
  // explicit here: potential credit alone cannot lower the reserve. Never offset SE tax.
  const credit=Math.min(v.usable_credit,potential,incomeTax);
  const federal=incomeTax+se+medicare-credit;
  // Preserve conservative reviewed treatment: no NJ home-office or federal QBI deduction.
  const state=brackets(Math.max(0,v.profit-health-v.retirement+v.spouse_wages-2000),NJ);
  const dollars={profit_after_office:profit,se_tax:se,additional_medicare:medicare,health_deduction:health,agi,taxable_before_qbi:taxable,qbi_deduction:qbi,salt_cap:saltCap,federal_deduction:deduction,potential_credit:potential,applied_credit:credit,federal,state,remaining:Math.max(0,federal-v.federal_paid)+Math.max(0,state-v.state_paid),retirement_limit:retirementLimit};
  return Object.fromEntries(Object.entries(dollars).map(([k,v])=>[k+'_cents',Math.round(v*100)]));
}
