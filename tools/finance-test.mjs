// Synthetic data only. Exercise the actual migrations and grants, not the test helper's
// broad grants: otherwise an accidental anonymous grant or privilege escalation is hidden.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { wardrobeDb, STEVE, OTHER } from './wardrobe-db.mjs';
const { db, q } = await wardrobeDb();
const migration = readFileSync(new URL('../supabase/migrations/20261107000100_finance.sql', import.meta.url), 'utf8');
await db.exec(migration); // reapplication must also be safe
await db.exec('grant usage on schema public, auth to authenticated, anon');
let checks = 0;
const check = (v) => { assert.ok(v); checks++; };
const denied = async (fn) => { await assert.rejects(fn, /permission denied|row-level security|foreign key|check constraint/); checks++; };
const as = async (id, email, extra = {}) => {
  await db.exec('reset role');
  await q("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: id, email, role: 'authenticated', ...extra })]);
  await db.exec('set role authenticated');
};
const account = (id, key) => q('insert into public.finance_accounts(id, source_key, name, kind, balance_cents, as_of) values ($1,$2,\'Synthetic checking\',\'cash\',100000,now()) returning id', [id, key]);
const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const tables = ['finance_accounts','finance_transactions','finance_plans','finance_budgets','finance_tax_scenarios'];
await db.exec('set role anon');
for (const t of tables) await denied(() => q(`select * from public.${t}`));
await denied(() => q('select public.can_finance()'));
await as(STEVE, 'steve@example.com');
check(!(await q('select public.can_finance() as ok'))[0].ok);
await denied(() => account(a, 'a'));
await denied(() => q('update public.members set finance_enabled = true'));
await db.exec('reset role');
await q('update public.members set finance_enabled = true');
await as(STEVE, 'steve@example.com');
check((await q('select public.can_finance() as ok'))[0].ok);
await account(a, 'a');
await q("insert into public.finance_transactions(account_id,source_key,posted_on,description,amount_cents) values ($1,'t1','2026-01-01','Synthetic transaction',-2500)", [a]);
await q("insert into public.finance_plans(year,monthly_target_cents,retirement_goal_cents,tax_reserve_cents,contractor_reserve_cents,operations_reserve_cents,household_reserve_cents,expected_receipts_cents,reviewed_on,assumptions) values (2026,100000,200000,300000,100000,50000,100000,500000,'2026-01-01','Synthetic assumptions')");
await q("insert into public.finance_budgets(month,category,target_cents) values ('2026-01-01','Food',25000)");
await q("insert into public.finance_tax_scenarios(year,source_key,name,profit_cents,federal_cents,state_cents,paid_cents,retirement_cents,assumptions,reviewed_on) values (2026,'s1','Synthetic estimate',900000,200000,50000,10000,200000,'Synthetic assumptions','2026-01-01')");
for (const t of tables) {
  check((await q(`select * from public.${t}`)).length === 1);
  await denied(() => q(`update public.${t} set owner=$1`, [OTHER]));
}
await as(OTHER, 'other@example.com');
for (const t of tables) {
  check((await q(`select * from public.${t}`)).length === 0);
  check((await q(`delete from public.${t} returning *`)).length === 0);
}
await account(b, 'b');
await denied(() => q("insert into public.finance_transactions(account_id,source_key,posted_on,description,amount_cents) values ($1,'cross','2026-01-01','Cross owner',1)", [a]));
await as(STEVE, 'steve@example.com', { client_id: 'existing-wardrobe-connector' });
for (const t of tables) check((await q(`select * from public.${t}`)).length === 0);
await denied(() => account('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'oauth'));
await as(STEVE, 'steve@example.com');
await denied(() => q("update public.finance_accounts set balance_cents=1000000000001"));
await denied(() => q("update public.finance_accounts set currency='EUR'"));
await denied(() => q("update public.finance_transactions set treatment='invented'"));
await db.exec('reset role');
await q("update public.members set finance_enabled=false where email='steve@example.com'");
await as(STEVE, 'steve@example.com');
for (const t of tables) check((await q(`select * from public.${t}`)).length === 0);
await denied(() => account('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'revoked'));
await db.exec('reset role');
await q("delete from public.members where email='other@example.com'");
await as(OTHER, 'other@example.com');
check(!(await q('select public.can_finance() as ok'))[0].ok);
check((await q('select * from public.finance_accounts')).length === 0);
await db.close();
console.log(`Finance: ${checks} authorization and validation checks passed (synthetic records).`);
