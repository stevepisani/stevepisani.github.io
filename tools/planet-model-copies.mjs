// Makes the models made while the chat waits (supabase/functions/planets/models.js) small, as the
// Planet models workflow makes its own (meshopt, WebP textures at most 1024 px): Meshy's file is
// what a planet shows first, a few megabytes; this puts a copy of a few hundred kilobytes beside
// it (<key>.small.glb in the planet-models bucket) and points the row at it, so every later
// visit loads that. Run by the Supabase workflow hourly; prints counts only (the log is public).
//
//   SUPABASE_ACCESS_TOKEN=... node tools/planet-model-copies.mjs
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';

const repo = resolve(dirname(new URL(import.meta.url).pathname), '..');
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) { console.error('Set SUPABASE_ACCESS_TOKEN.'); process.exit(2); }
const url = readFileSync(`${repo}/_config.yml`, 'utf8').match(/https:\/\/([a-z0-9]+)\.supabase\.co/);
const api = async (method, path, body) => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${url[1]}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  if (!res.ok) throw new Error(`${method} ${path.replace(/\?.*/, '')}: HTTP ${res.status}`);
  return res.json();
};
const key = (await api('GET', '/api-keys?reveal=true')).find((k) => k.name === 'service_role')?.api_key;
if (!key) throw new Error('No service_role key from the Management API.');
const object = (file) => `${url[0]}/storage/v1/object/planet-models/${file}`;
// gltf-transform's command line at the version the lockfile has for the library
const lock = JSON.parse(readFileSync(`${repo}/package-lock.json`, 'utf8'));
const GLTF_CLI = `@gltf-transform/cli@${lock.packages['node_modules/@gltf-transform/core'].version}`;

const rows = await api('POST', '/database/query', { query: "select key, file from public.planet_models where status = 'done' and not small order by at limit 20" });
const tmp = mkdtempSync(join(tmpdir(), 'planet-models-'));
const n = { made: 0, failed: 0 };
for (const { key: k, file } of rows) {
  if (!/^[0-9a-f]{32}$/.test(k)) continue;
  try {
    const res = await fetch(object(file), { headers: { Authorization: `Bearer ${key}`, apikey: key } });
    if (!res.ok) throw new Error(`download: HTTP ${res.status}`);
    const from = join(tmp, `${k}.glb`), to = join(tmp, `${k}.small.glb`);
    writeFileSync(from, Buffer.from(await res.arrayBuffer()));
    execFileSync('npx', ['-y', GLTF_CLI, 'optimize', from, to, '--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', '1024', '--simplify', 'false'], { stdio: 'ignore' });
    const small = `${k}.small.glb`;
    const up = await fetch(object(small), { method: 'POST', headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'model/gltf-binary', 'x-upsert': 'true', 'cache-control': 'max-age=31536000' }, body: readFileSync(to) });
    if (!up.ok) throw new Error(`upload: HTTP ${up.status}`);
    await api('POST', '/database/query', { query: `update public.planet_models set file = '${small}', small = true where key = '${k}'` });
    n.made++;
  } catch (e) {
    n.failed++;
    console.log(`::warning::a model wasn't made small: ${String(e.message).slice(0, 120)}`);
  }
}
rmSync(tmp, { recursive: true, force: true });
console.log(`Planet models: ${rows.length} to make small; ${n.made} made, ${n.failed} not.`);
