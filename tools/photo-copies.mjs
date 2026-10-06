// Makes the smaller copies of every wardrobe photo that hasn't got them yet: the MCP server's
// (vision and thumbnail JPEGs, supabase/functions/mcp/images.js), so it sends them without making
// them on the spot (a function gets about 2 s of CPU; six new copies in one answer could run out),
// and the app's (small and large WebP, assets/js/apps/lib/photo-sizes.js), so the closet loads in
// kilobytes, not megabytes. The stored files are only read. Run by the Supabase workflow hourly
// and after each deploy; prints counts only (the Actions log is public).
//
//   SUPABASE_ACCESS_TOKEN=... IMAGESCRIPT=<path to the imagescript package> node tools/photo-copies.mjs
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { PURPOSES, renditionPath, shrink } from '../supabase/functions/mcp/images.js';
import { SIZES, QUALITY, copyPath } from '../assets/js/apps/lib/photo-sizes.js';

const repo = resolve(dirname(new URL(import.meta.url).pathname), '..');
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) { console.error('Set SUPABASE_ACCESS_TOKEN.'); process.exit(2); }
const imaging = createRequire(import.meta.url)(process.env.IMAGESCRIPT || 'imagescript');
const url = readFileSync(`${repo}/_config.yml`, 'utf8').match(/https:\/\/([a-z0-9]+)\.supabase\.co/);
const api = async (method, path, body) => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${url[1]}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  if (!res.ok) throw new Error(`${method} ${path.replace(/\?.*/, '')}: HTTP ${res.status}`);
  return res.json();
};
// Storage takes the service key, fetched here and never printed
const key = (await api('GET', '/api-keys?reveal=true')).find((k) => k.name === 'service_role')?.api_key;
if (!key) throw new Error('No service_role key from the Management API.');
const storage = (path, init = {}) => fetch(`${url[0]}/storage/v1/object/photos/${path.split('/').map(encodeURIComponent).join('/')}`, { ...init, headers: { Authorization: `Bearer ${key}`, apikey: key, ...init.headers } });

const paths = (await api('POST', '/database/query', { query: 'select distinct path from public.wardrobe_photos where deleted_at is null' })).map((r) => r.path);
// the app's copy `px` on its long side (never larger than the file), WebP with its transparency
const appCopy = async (bytes, px) => {
  let img;
  try { img = await imaging.decode(bytes); } catch { return null; }
  const k = Math.min(1, px / Math.max(img.width, img.height));
  if (k < 1) img.resize(Math.round(img.width * k), Math.round(img.height * k));
  return { bytes: await img.encodeWEBP(Math.round(QUALITY * 100)), type: 'image/webp' };
};
const n = { made: 0, had: 0, small: 0, unreadable: 0 };
for (const path of paths) {
  const wanted = []; // [copy's path, how to make it]
  for (const purpose of Object.keys(PURPOSES).filter((p) => PURPOSES[p])) wanted.push([renditionPath(path, purpose), async (b) => { const m = await shrink(imaging, b, purpose); return m && { bytes: m.bytes, type: 'image/jpeg' }; }]);
  for (const px of Object.values(SIZES)) wanted.push([copyPath(path, px), (b) => appCopy(b, px)]);
  const missing = [];
  for (const w of wanted) { if ((await storage(w[0], { method: 'HEAD' })).ok) n.had++; else missing.push(w); }
  if (!missing.length) continue;
  const res = await storage(path);
  if (!res.ok) { n.unreadable++; continue; }
  const bytes = new Uint8Array(await res.arrayBuffer());
  for (const [to, make] of missing) {
    const made = await make(bytes);
    if (!made) { n.small++; continue; } // already small, or not a format it reads: the file itself goes
    const up = await storage(to, { method: 'POST', headers: { 'Content-Type': made.type, 'x-upsert': 'true' }, body: made.bytes });
    if (!up.ok) throw new Error(`Saving a copy: HTTP ${up.status}`);
    n.made++;
  }
}
console.log(`Photo copies: ${paths.length} photos; ${n.made} copies made, ${n.had} already there, ${n.small} not needed or not readable, ${n.unreadable} photos unreadable.`);
