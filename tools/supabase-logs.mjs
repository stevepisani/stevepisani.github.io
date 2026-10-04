// What the edge functions did lately, from the Supabase project's logs (Management API), for
// finding out why a function failed: each request's time, method, path and status, and what the
// functions wrote to the console. Never query strings, headers or bodies: the Actions log this
// prints to is public.
//
//   SUPABASE_ACCESS_TOKEN=... node tools/supabase-logs.mjs [hours=2]
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const repo = resolve(dirname(new URL(import.meta.url).pathname), '..');
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) { console.error('Set SUPABASE_ACCESS_TOKEN.'); process.exit(2); }
const ref = readFileSync(`${repo}/_config.yml`, 'utf8').match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1];
const hours = Number(process.argv[2]) || 2;

async function logs(sql) {
  const q = new URLSearchParams({ sql, iso_timestamp_start: new Date(Date.now() - hours * 36e5).toISOString(), iso_timestamp_end: new Date().toISOString() });
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/analytics/endpoints/logs?${q}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new Error(`HTTP ${res.status} ${JSON.stringify(body.error || body).slice(0, 300)}`);
  return body.result || [];
}

// One `logs` table (ClickHouse SQL), each row with its source_name; the edge gateway's lines read
// "POST | 401 | https://…/functions/v1/mcp", and anything after a "?" is cut off here.
const clean = (t) => String(t).replace(/\?[^\s|"]*/g, '').replace(/\s+/g, ' ').slice(0, 300);
const sources = await logs(`select source_name, count() as n from logs group by source_name order by n desc`);
console.log(`Sources, the last ${hours} h: ${sources.map((r) => `${r.source_name} ${r.n}`).join(', ')}`);
for (const { source_name: src } of sources.filter((r) => /function/.test(r.source_name))) {
  console.log(`\n${src} (newest first):`);
  const rows = await logs(`select timestamp, event_message, mapKeys(log_attributes) as keys from logs where source_name = '${src}' order by timestamp desc limit 60`);
  if (rows[0]) console.log(`  fields: ${(rows[0].keys || []).join(', ')}`);
  for (const r of rows) console.log(`  ${new Date(typeof r.timestamp === 'number' ? r.timestamp / 1000 : r.timestamp).toISOString()}  ${clean(r.event_message)}`);
}
