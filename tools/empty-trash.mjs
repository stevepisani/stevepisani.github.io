// Empties the wardrobe's trash: what was deleted more than 30 days ago (garments, photos, trips) is
// deleted for good by public.empty_trash() (supabase/migrations/20261005000400_trash.sql), and the
// photo files nothing uses any more are removed from Storage. Run weekly by the Supabase workflow.
// Prints counts only: the Actions log is public.
//
//   SUPABASE_ACCESS_TOKEN=... node tools/empty-trash.mjs
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const repo = resolve(dirname(new URL(import.meta.url).pathname), '..');
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) { console.error('Set SUPABASE_ACCESS_TOKEN.'); process.exit(2); }
const url = readFileSync(`${repo}/_config.yml`, 'utf8').match(/https:\/\/([a-z0-9]+)\.supabase\.co/);
const ref = url[1];

async function api(method, path, body) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path.replace(/\?.*/, '')}: HTTP ${res.status}`);
  return res.json();
}

const files = (await api('POST', '/database/query', { query: 'select * from public.empty_trash()' })).map((r) => Object.values(r)[0]);
console.log(`Emptied the trash: ${files.length} photo file(s) no longer used.`);
if (!files.length) process.exit(0);

// Storage takes the service key, fetched here and never printed
const key = (await api('GET', '/api-keys?reveal=true')).find((k) => k.name === 'service_role')?.api_key;
if (!key) throw new Error('No service_role key from the Management API.');
// each file with its smaller copies (images.js), if it has them
const all = files.flatMap((f) => [f, `${f}.vision.jpg`, `${f}.thumbnail.jpg`]);
for (let i = 0; i < all.length; i += 100) {
  const res = await fetch(`${url[0]}/storage/v1/object/photos`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: all.slice(i, i + 100) }),
  });
  if (!res.ok) throw new Error(`Removing photo files: HTTP ${res.status}`);
}
console.log(`Removed ${files.length} photo file(s).`);
