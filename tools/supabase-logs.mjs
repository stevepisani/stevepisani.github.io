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

// One `logs` table (ClickHouse SQL): `source` says whose line it is, `log_attributes` a map of
// strings. Anything after a "?" in a message is cut off here.
const clean = (t) => String(t).replace(/\?[^\s|"]*/g, '').replace(/\s+/g, ' ').slice(0, 300);
const when = (t) => new Date(typeof t === 'number' ? t / 1000 : `${String(t).replace(' ', 'T')}Z`).toISOString().slice(0, 19);

console.log(`Edge function requests, the last ${hours} h (newest first):`);
for (const r of await logs(`select timestamp, log_attributes['response.status_code'] as status,
    log_attributes['request.method'] as method, log_attributes['request.path'] as path
  from logs where source = 'function_edge_logs' order by timestamp desc limit 80`)) {
  console.log(`  ${when(r.timestamp)}  ${r.status}  ${String(r.method).padEnd(7)} ${clean(r.path)}`);
}

console.log(`\nWhat the functions logged, the last ${hours} h (newest first):`);
for (const r of await logs(`select timestamp, log_attributes['level'] as level, event_message
  from logs where source = 'function_logs' order by timestamp desc limit 60`)) {
  console.log(`  ${when(r.timestamp)}  ${r.level || ''}  ${clean(r.event_message)}`);
}
