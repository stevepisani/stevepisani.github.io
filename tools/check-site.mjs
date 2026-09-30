// Checks the built site (`_site`, or the folder given as the first argument) for the mistakes that
// don't show up until someone visits: an internal link or asset that isn't there, and, for the
// homepage world, a module that doesn't parse, imports a file that doesn't exist, imports a
// package the import map doesn't know, pulls an unminified addon, or is missing from the
// modulepreload list. No dependencies; run after `bundle exec jekyll build`:
//
//   node tools/check-site.mjs [_site]
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve, extname } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve(process.argv[2] || '_site');
const repo = resolve(dirname(new URL(import.meta.url).pathname), '..');
const problems = [];
const fail = (where, what) => problems.push(`${where}: ${what}`);

const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

if (!existsSync(join(root, 'index.html'))) {
  console.error(`No built site at ${root}. Run bundle exec jekyll build first.`);
  process.exit(2);
}

// 1. Every internal href/src resolves to a file in the build.
const exists = (path) => {
  const p = join(root, decodeURIComponent(path));
  if (existsSync(p) && statSync(p).isFile()) return true;
  if (existsSync(join(p, 'index.html'))) return true;
  return !extname(p) && existsSync(p + '.html');
};
const pages = walk(root).filter((f) => f.endsWith('.html'));
// Standalone apps with their own rules, not built from the site's layouts.
const skip = ['recipe_tracker/'];
let links = 0;
const missing = {}; // url -> pages that link to it
for (const file of pages) {
  const rel = relative(root, file);
  if (skip.some((s) => rel.startsWith(s))) continue;
  const html = readFileSync(file, 'utf8')
    .replace(/<script\b(?![^>]*type="(?:importmap|application\/json)")[^>]*>[\s\S]*?<\/script>/g, '');
  for (const [, attr, url] of html.matchAll(/\s(href|src)="([^"]*)"/g)) {
    if (!url.startsWith('/') || url.startsWith('//')) continue; // outbound, or relative (none on this site)
    const path = url.split(/[?#]/)[0];
    if (!path || path === '/') continue;
    links++;
    if (!exists(path)) (missing[url] ||= new Set()).add(rel);
  }
}

for (const [url, from] of Object.entries(missing)) {
  const list = [...from];
  fail(url, `isn't in the build (linked from ${list.slice(0, 3).join(', ')}${list.length > 3 ? ` and ${list.length - 3} more` : ''})`);
}

// 2. The homepage world.
const index = readFileSync(join(root, 'index.html'), 'utf8');
const mapJson = index.match(/<script type="importmap">([\s\S]*?)<\/script>/)?.[1];
const imports = mapJson ? JSON.parse(mapJson).imports : {};
if (!mapJson) fail('index.html', 'no import map');
const preloaded = new Set([...index.matchAll(/<link rel="modulepreload" href="([^"]+)"/g)].map((m) => m[1]));
const mapped = (spec) => spec in imports || Object.keys(imports).some((k) => k.endsWith('/') && spec.startsWith(k));

const worldDir = join(repo, 'assets/js/world');
const modules = readdirSync(worldDir).filter((f) => f.endsWith('.js'));
for (const m of modules) {
  const where = `assets/js/world/${m}`;
  const src = readFileSync(join(worldDir, m), 'utf8');
  try {
    execFileSync(process.execPath, ['--input-type=module', '--check'], { input: src, stdio: ['pipe', 'ignore', 'pipe'] });
  } catch (e) {
    fail(where, `doesn't parse\n${String(e.stderr).split('\n').slice(1, 4).join('\n')}`);
  }
  if (!preloaded.has(`/assets/js/world/${m}`)) fail(where, 'missing from the modulepreload list in _layouts/world.html');
  const specs = [...src.matchAll(/(?:^|[\s;])(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/gm)]
    .map((x) => x[1] || x[2]);
  for (const spec of specs) {
    if (spec.startsWith('.')) {
      if (!existsSync(join(worldDir, spec))) fail(where, `imports ${spec}, which doesn't exist`);
    } else if (!mapped(spec)) {
      fail(where, `imports '${spec}', which the import map doesn't know`);
    } else if (spec.startsWith('three/addons/') && !(spec in imports)) {
      fail(where, `imports '${spec}' unminified: give it its own .min.js entry in the import map`);
    }
  }
}
for (const [spec, url] of Object.entries(imports)) {
  if (!spec.endsWith('/') && !/\.min\.js$/.test(url)) fail('index.html', `import map sends '${spec}' to an unminified build`);
}

if (problems.length) {
  console.error(problems.map((p) => `✗ ${p}`).join('\n'));
  console.error(`\n${problems.length} problem${problems.length > 1 ? 's' : ''}.`);
  process.exit(1);
}
console.log(`✓ ${pages.length} pages, ${links} internal links, ${modules.length} world modules: all fine.`);
