import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {estimate2026} from '../supabase/functions/_shared/finance-tax.js';
const cases=JSON.parse(readFileSync(new URL('./fixtures/finance/tax-parity.json',import.meta.url)));
for(const c of cases){const r=estimate2026(c.input);assert.ok(Math.abs(r.federal_cents-c.federal_cents)<=1,JSON.stringify(c));assert.ok(Math.abs(r.state_cents-c.state_cents)<=1,JSON.stringify(c));}
const base={profit_cents:50000000,claim_qbi:true,research_percent:35,contractor_qre_cents:2000000};
const a=estimate2026(base),b=estimate2026({...base,research_percent:40});
assert.ok(b.potential_credit_cents>a.potential_credit_cents);assert.equal(a.applied_credit_cents,0);assert.equal(a.remaining_cents,b.remaining_cents);
const c=estimate2026({...base,usable_credit_cents:99999999});assert.ok(c.applied_credit_cents<=c.potential_credit_cents);assert.ok(c.federal_cents>=c.se_tax_cents+c.additional_medicare_cents-1);
assert.ok(estimate2026({...base,retirement_cents:2500000}).remaining_cents<a.remaining_cents);
assert.throws(()=>estimate2026({...base,retirement_cents:8000000}),/limit/);
assert.throws(()=>estimate2026({...base,home_office_cents:60000000}),/exceeds/);
assert.ok(estimate2026({...base,spouse_wages_cents:1000000}).federal_cents>a.federal_cents);
console.log('Finance tax: 18 legacy parity cases and credit, retirement, QBI and spouse-wage sensitivities passed.');
