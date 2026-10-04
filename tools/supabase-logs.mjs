// What the edge functions did lately, from the Supabase project's logs (Management API), for
// finding out why a function failed: each request's time, function, method, path and status, and
// what the functions wrote to the console. Only paths, never query strings, headers or bodies: the
// Actions log this prints to is public.
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

console.log(`Edge function requests, the last ${hours} h (newest first):`);
for (const r of await logs(`select timestamp, request.method, request.pathname, response.status_code
  from function_edge_logs
  cross join unnest(metadata) as m cross join unnest(m.request) as request cross join unnest(m.response) as response
  order by timestamp desc limit 80`)) {
  console.log(`  ${new Date(r.timestamp / 1000).toISOString()}  ${r.status_code}  ${r.method.padEnd(7)} ${r.pathname}`);
}

console.log(`\nErrors and warnings the functions logged, the last ${hours} h (newest first):`);
for (const r of await logs(`select timestamp, m.function_id, m.level, event_message
  from function_logs cross join unnest(metadata) as m
  where m.level in ('error', 'warning')
  order by timestamp desc limit 60`)) {
  console.log(`  ${new Date(r.timestamp / 1000).toISOString()}  ${r.level}  ${String(r.event_message).replace(/\s+/g, ' ').slice(0, 300)}`);
}
