// Integer cents throughout. Mirrors the reviewed local funding calculation; forecasts are
// deliberately separate. No credentials, provider calls or persistence in this module.
const LIMIT = 1_000_000_000_000;
export function cents(value, { signed = false } = {}) {
  if (!Number.isSafeInteger(value) || Math.abs(value) > LIMIT || (!signed && value < 0)) throw new Error('Invalid money amount');
  return value;
}
export function funding(accounts, plan, now = new Date()) {
  const timestamp = +now;
  if (!Number.isFinite(timestamp)) throw new Error('Invalid review time');
  const included = accounts.filter(a => a.included && ['cash', 'credit'].includes(a.kind));
  const unresolved = included.filter(a => {
    const at = Date.parse(a.as_of);
    return !Number.isFinite(at) || at > timestamp + 300000 || timestamp - at > 7 * 86400000;
  });
  // Stale accounts remain unresolved, not zero; only fresh balances enter the cash subtotal.
  const fresh = included.filter(a => !unresolved.includes(a));
  const cash = fresh.filter(a => a.kind === 'cash').reduce((n, a) => n + cents(a.balance_cents, { signed: true }), 0);
  const cards = fresh.filter(a => a.kind === 'credit').reduce((n, a) => n + Math.max(0, cents(a.balance_cents, { signed: true })), 0);
  const protectedCents = cards + ['tax_reserve_cents', 'contractor_reserve_cents', 'operations_reserve_cents', 'household_reserve_cents'].reduce((n, k) => n + cents(plan[k]), 0);
  const remainingGoal = Math.max(0, cents(plan.retirement_goal_cents) - cents(plan.retirement_funded_cents));
  const surplus = cash - protectedCents;
  const reviewed = Date.parse(plan.reviewed_on + 'T00:00:00Z');
  const reviewRequired = !included.some(a => a.kind === 'cash') || unresolved.length > 0 || !Number.isFinite(reviewed) || reviewed > timestamp + 86400000 || timestamp - reviewed > 31 * 86400000;
  return {
    cash, cards, protected: protectedCents, surplus, remainingGoal,
    reviewRequired, unresolved: unresolved.map(a => a.id),
    available: reviewRequired ? null : Math.max(0, surplus),
    availableToFund: reviewRequired ? null : Math.min(remainingGoal, Math.max(0, surplus)),
    projectedAfterGoal: surplus + cents(plan.expected_receipts_cents) - remainingGoal,
  };
}
export function spending(transactions, month, budgets = []) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Invalid month');
  const groups = new Map(budgets.filter(b => b.month.slice(0,7) === month).map(b => [b.category, { category: b.category, target: cents(b.target_cents), spent: 0, transactions: [] }]));
  const review = [];
  for (const t of transactions) {
    if (!t.posted_on.startsWith(month + '-') || t.pending) continue;
    if (t.treatment === 'review') { review.push(t); continue; }
    if (t.treatment !== 'personal') continue;
    const amount = cents(t.amount_cents, { signed: true }); // negative outflow, positive refund
    const group = groups.get(t.category) || { category: t.category, target: null, spent: 0, transactions: [] };
    group.spent -= amount;
    group.transactions.push(t);
    groups.set(t.category, group);
  }
  return { groups: [...groups.values()], spent: [...groups.values()].reduce((n,g) => n + g.spent, 0), review };
}

export function businessActuals(transactions, year) {
  const rows=transactions.filter(t=>!t.pending && t.posted_on.startsWith(`${year}-`));
  const total=treatment=>rows.filter(t=>t.treatment===treatment).reduce((n,t)=>n+cents(t.amount_cents,{signed:true}),0);
  const income=total('business_income'), contractors=-total('contractor'), expenses=-total('business_expense');
  return {income,contractors,expenses,profit:income-contractors-expenses,unreviewed:rows.filter(t=>t.treatment==='review').length};
}
