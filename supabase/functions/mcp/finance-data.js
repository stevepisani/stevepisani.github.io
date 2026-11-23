// The same authenticated client as every other MCP area. No service role, no shared cache.
// Bounds fail closed rather than silently returning partial totals.
export function financeData(db, uid) {
  return {
    async allowed() {
      const { data, error } = await db.rpc('can_read_finance');
      if (error) throw new Error('Finance permission check failed');
      return data === true;
    },
    async rows(table, year) {
      const orders = {
        finance_accounts: ['id'], finance_transactions: ['posted_on', 'id'],
        finance_plans: ['year'], finance_budgets: ['month', 'category'], finance_tax_scenarios: ['id'],
      };
      if (!Object.hasOwn(orders, table)) throw new Error('Unknown Finance table');
      const result = [];
      for (let offset = 0; offset < 100000; offset += 500) {
        let query = db.from(table).select('*').eq('owner', uid);
        if (table === 'finance_transactions' || table === 'finance_budgets') {
          const date = table === 'finance_transactions' ? 'posted_on' : 'month';
          query = query.gte(date, `${year}-01-01`).lte(date, `${year}-12-31`);
        } else if (table !== 'finance_accounts') query = query.eq('year', year);
        for (const key of orders[table]) query = query.order(key);
        const { data, error } = await query.range(offset, offset + 499);
        if (error || !Array.isArray(data)) throw new Error('Finance records unavailable');
        result.push(...data);
        if (data.length < 500) return result;
      }
      throw new Error('Too many Finance records for a complete result');
    },
  };
}
