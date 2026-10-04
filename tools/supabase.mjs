// Applies supabase/ to the project named in _config.yml, through the Management API (so it
// needs only an access token, no database password or CLI):
//   - each migration in supabase/migrations/ not yet recorded in
//     supabase_migrations.schema_migrations (the table the Supabase CLI uses, so the two agree),
//     in name order, each in its own transaction;
//   - JWT signing keys: an asymmetric one in use (below);
//   - the auth settings in supabase/auth.json.
//
//   SUPABASE_ACCESS_TOKEN=... node tools/supabase.mjs [--dry-run]
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const repo = resolve(dirname(new URL(import.meta.url).pathname), '..');
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) { console.error('Set SUPABASE_ACCESS_TOKEN.'); process.exit(2); }
const dry = process.argv.includes('--dry-run');
const ref = readFileSync(`${repo}/_config.yml`, 'utf8').match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1];

async function api(method, path, body) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
const sql = (query) => api('POST', '/database/query', { query });
const quote = (s) => `'${s.replace(/'/g, "''")}'`;

await sql(`create schema if not exists supabase_migrations;
  create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text)`);
const done = new Set((await sql('select version from supabase_migrations.schema_migrations')).map((r) => r.version));

const dir = `${repo}/supabase/migrations`;
for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  const [, version, name] = file.match(/^(\d+)_(.+)\.sql$/);
  if (done.has(version)) continue;
  console.log(`${dry ? 'would apply' : 'applying'} ${file}`);
  if (dry) continue;
  const body = readFileSync(`${dir}/${file}`, 'utf8');
  await sql(`begin;\n${body}\n;insert into supabase_migrations.schema_migrations (version, name, statements)
    values (${quote(version)}, ${quote(name)}, array[${quote(body)}]);\ncommit;`);
}

// Asymmetric JWT signing keys, which the OAuth server needs (its ID tokens can't be HS256). Once:
// the old shared secret is imported as a key, an ES256 key is added and put in use, and the old
// one becomes "previously used", still trusted, so everything already signed with it (the anon
// and service keys, sessions in browsers) keeps working. Nothing is revoked here.
const { keys = [] } = await api('GET', '/config/auth/signing-keys');
if (!keys.some((k) => k.algorithm !== 'HS256' && k.status === 'in_use')) {
  console.log(`${dry ? 'would switch' : 'switching'} JWT signing to an ES256 key (the old secret stays trusted)`);
  if (!dry) {
    if (!keys.some((k) => k.algorithm === 'HS256')) {
      try { await api('POST', '/config/auth/signing-keys/legacy'); } catch (e) { console.log(`  (importing the old secret: ${e.message})`); }
    }
    const next = keys.find((k) => k.algorithm === 'ES256' && k.status === 'standby') || (await api('POST', '/config/auth/signing-keys', { algorithm: 'ES256', status: 'standby' }));
    await api('PATCH', `/config/auth/signing-keys/${next.id}`, { status: 'in_use' });
  }
}

const auth = JSON.parse(readFileSync(`${repo}/supabase/auth.json`, 'utf8'));
const current = await api('GET', '/config/auth');
const changed = Object.fromEntries(Object.entries(auth).filter(([k, v]) => current[k] !== v));
if (Object.keys(changed).length) {
  console.log(`${dry ? 'would set' : 'setting'} auth: ${Object.keys(changed).join(', ')}`);
  if (!dry) await api('PATCH', '/config/auth', changed);
}
console.log(dry ? 'dry run done' : 'up to date');
