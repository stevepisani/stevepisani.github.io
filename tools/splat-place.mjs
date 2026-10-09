// A real place's splat (realplaces.js), cut from its scan on SuperSplat: the scan comes in levels
// of detail (12.9 million splats at the finest, for this one), far more than a phone should be
// asked to draw. This keeps the finest close to where you stand and coarser further out, in rings
// round `scan.centre` (in the scan's own x, z), drops what's nearly transparent, and writes one
// compressed .sog (about 14 MB, 1.2 million splats) that portal.js loads, and a light copy (2 MB)
// it shows first while that one comes in.
//
//   node tools/splat-place.mjs sala   →  assets/splats/sala-thai.sog   (then tools/portal-view.mjs)
//
// The scan is CC BY 4.0 (see `credit`): the door's label and the view through it credit it.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REAL_PLACES } from '../assets/js/world/realplaces.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const P = REAL_PLACES[process.argv[2] || 'sala'];
const { id, centre: [cx, cz], rings, minOpacity } = P.scan;
const CDN = `https://d28zzqy0iyovbz.cloudfront.net/${id}/v1`; // where SuperSplat's viewer streams it from
const work = join(tmpdir(), `splat-${id}`);
mkdirSync(work, { recursive: true });
// PlayCanvas's splat-transform, run by npx at this version rather than kept in package.json: it
// brings a 130 MB WebGPU build that every CI install would carry for a tool run once in a while
const SPLAT_TRANSFORM = '@playcanvas/splat-transform@3.10.0';
const tool = (...args) => execFileSync('npx', ['--yes', SPLAT_TRANSFORM, '-q', '-w', ...args], { stdio: 'inherit' });
const get = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return Buffer.from(await r.arrayBuffer()); };

// each level we need, downloaded chunk by chunk and merged into one .ply
const lod = JSON.parse(await get(`${CDN}/lod-meta.json`));
const levels = {};
for (const level of new Set([...rings, ...P.scan.lite.rings].map(([l]) => l))) {
  const metas = [];
  for (const f of lod.filenames.filter((f) => f.startsWith(`${level}_`))) {
    const dir = join(work, f.split('/')[0]);
    mkdirSync(dir, { recursive: true });
    const meta = JSON.parse(await get(`${CDN}/${f}`));
    writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta));
    for (const file of new Set(Object.values(meta).flatMap((v) => (v && v.files) || []))) writeFileSync(join(dir, file), await get(`${CDN}/${f.split('/')[0]}/${file}`));
    metas.push(join(dir, 'meta.json'));
  }
  tool(...metas, join(work, `lod${level}.ply`));
  levels[level] = readPly(join(work, `lod${level}.ply`));
  console.log(`level ${level}: ${levels[level].count} splats`);
}

// the rings: level l from the previous ring's edge out to r metres (across the ground)
const { names } = levels[rings[0][0]];
const ix = names.indexOf('x'), iz = names.indexOf('z'), io = names.indexOf('opacity'), n = names.length;
function cut(rings, minOpacity, path) {
  const keep = [];
  let inner = 0;
  for (const [level, r] of rings) {
    const { rows, count } = levels[level];
    for (let i = 0; i < count; i++) {
      const o = i * n, d = Math.hypot(rows[o + ix] - cx, rows[o + iz] - cz);
      if (d >= inner && d < r && 1 / (1 + Math.exp(-rows[o + io])) >= minOpacity) keep.push(rows.subarray(o, o + n));
    }
    inner = r;
  }
  const out = new Float32Array(keep.length * n);
  keep.forEach((row, i) => out.set(row, i * n));
  const header = `ply\nformat binary_little_endian 1.0\nelement vertex ${keep.length}\n${names.map((k) => `property float ${k}\n`).join('')}end_header\n`;
  writeFileSync(path, Buffer.concat([Buffer.from(header), Buffer.from(out.buffer)]));
  return keep.length;
}
const report = (file, what) => console.log(`${file}: ${what}, ${(readFileSync(join(root, file)).length / 1048576).toFixed(1)} MB`);
// the full place
const file = P.splat.replace(/^\//, '');
const count = cut(rings, minOpacity, join(work, 'place.ply'));
tool(join(work, 'place.ply'), join(root, file));
report(file, `${count} splats`);
// and its light copy, shown first while the full one loads: the coarsest level, nearer in, then
// thinned (`keep` of it; splat-transform's decimate, on the CPU)
const lite = P.lite.replace(/^\//, '');
cut(P.scan.lite.rings, P.scan.lite.minOpacity, join(work, 'lite.ply'));
tool('-g', 'cpu', join(work, 'lite.ply'), '-d', P.scan.lite.keep, join(work, 'lite-thin.ply'));
tool(join(work, 'lite-thin.ply'), join(root, lite));
report(lite, `the light copy (${P.scan.lite.keep} of the coarsest level)`);
rmSync(work, { recursive: true, force: true });

// a binary little-endian .ply of floats, as splat-transform writes them
function readPly(path) {
  const buf = readFileSync(path);
  const end = buf.indexOf('end_header\n') + 'end_header\n'.length;
  const head = buf.subarray(0, end).toString();
  const count = +head.match(/element vertex (\d+)/)[1];
  const names = [...head.matchAll(/property float (\S+)/g)].map((m) => m[1]);
  const rows = new Float32Array(buf.buffer.slice(buf.byteOffset + end, buf.byteOffset + end + count * names.length * 4));
  return { names, rows, count };
}
