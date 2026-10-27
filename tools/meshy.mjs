// Meshy's API (https://docs.meshy.ai), shared by the tools that make models with it:
// tools/gauge-assets.mjs (the walk in "Rockets and Horses") and tools/planet-models.mjs (the
// things on friends' planets). Needs MESHY_API_KEY, a repo secret, so they run in GitHub Actions:
// the Claude sandbox can't reach Meshy.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

export const TEXT_TO_3D = 'https://api.meshy.ai/openapi/v2/text-to-3d';
export const IMAGE_TO_3D = 'https://api.meshy.ai/openapi/v1/image-to-3d';
export const TEXT_TO_IMAGE = 'https://api.meshy.ai/openapi/v1/text-to-image';
export const RETEXTURE = 'https://api.meshy.ai/openapi/v1/retexture';
export const auth = { Authorization: `Bearer ${process.env.MESHY_API_KEY}`, 'Content-Type': 'application/json' };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** fetch, tried again on a server error */
export async function get(url, opts = {}) {
  for (let i = 0; ; i++) {
    const r = await fetch(url, opts);
    if (r.ok) return r;
    if (i === 3 || r.status < 500) throw new Error(`${opts.method || 'GET'} ${url}: ${r.status} ${(await r.text()).slice(0, 300)}`);
    await sleep(2000 * 2 ** i);
  }
}

/** starts a task; its id */
export async function task(body, api = TEXT_TO_3D) {
  const r = await get(api, { method: 'POST', headers: auth, body: JSON.stringify(body) });
  return (await r.json()).result;
}

/** waits for a task to finish; the task */
export async function finished(id, label, api = TEXT_TO_3D) {
  for (let t = 0; t < 180; t++) { // up to 30 minutes
    const j = await (await get(`${api}/${id}`, { headers: auth })).json();
    if (j.status === 'SUCCEEDED') return j;
    if (j.status === 'FAILED' || j.status === 'CANCELED') throw new Error(`${label}: Meshy ${j.status}: ${j.task_error?.message || ''}`);
    await sleep(10000);
  }
  throw new Error(`${label}: Meshy took over 30 minutes`);
}

// the account's recent tasks, so a model already made by a run whose manifest was lost isn't paid
// for again (a refine keeps its preview's prompt)
let recent;
export async function madeBefore(prompt) {
  recent ??= get(`${TEXT_TO_3D}?page_size=50&sort_by=-created_at`, { headers: auth }).then((r) => r.json()).catch(() => []);
  const list = await recent;
  // (or still being made: it's waited for, not paid for twice)
  const ok = (Array.isArray(list) ? list : []).filter((t) => ['SUCCEEDED', 'IN_PROGRESS', 'PENDING'].includes(t.status) && t.prompt === prompt);
  return ok.find((t) => t.mode === 'refine') || ok.find((t) => t.mode === 'preview');
}

/** the account's credits left, or null if Meshy won't say */
export async function balance() {
  try { return (await (await get('https://api.meshy.ai/openapi/v1/balance', { headers: auth })).json()).balance ?? null; } catch { return null; }
}

// gltf-transform's command line at the version package.json pins for the library
const root = new URL('..', import.meta.url);
const GLTF_CLI = `@gltf-transform/cli@${JSON.parse(readFileSync(new URL('node_modules/@gltf-transform/core/package.json', root), 'utf8')).version}`;

/** a model made small for the web: meshopt, WebP textures at most `textureSize` across */
export function optimize(from, to, textureSize) {
  execFileSync('npx', ['-y', GLTF_CLI, 'optimize', from, to, '--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', String(textureSize), '--simplify', 'false'], { stdio: 'inherit' });
}
