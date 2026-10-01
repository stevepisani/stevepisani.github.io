// Checks the built site (`_site`, or the folder given as the first argument) for the mistake that
// doesn't show up until someone visits: an internal link or asset that isn't there (the bundles
// in assets/js/dist/ included, so a build that skipped `npm run build` fails here). The scripts
// themselves are checked by esbuild as it bundles them. No dependencies; run after
// `npm run build && bundle exec jekyll build`:
//
//   node tools/check-site.mjs [_site]
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, extname } from 'node:path';

const root = resolve(process.argv[2] || '_site');
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
    .replace(/(<script\b(?![^>]*type="application\/json")[^>]*>)[\s\S]*?<\/script>/g, '$1</script>'); // keep the tag (its src), drop the code
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

if (problems.length) {
  console.error(problems.map((p) => `✗ ${p}`).join('\n'));
  console.error(`\n${problems.length} problem${problems.length > 1 ? 's' : ''}.`);
  process.exit(1);
}
console.log(`✓ ${pages.length} pages, ${links} internal links: all fine.`);
