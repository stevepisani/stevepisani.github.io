// The site's web fonts, served from the site itself rather than Google Fonts: no render-blocking
// stylesheet from another server and no second and third connection before the first paint.
// Run it again only to change the fonts (node tools/fonts.mjs): it asks Google Fonts for each set,
// saves the files to assets/fonts/ and writes the @font-face rules _includes/head.html and
// _layouts/world.html inline. All the fonts are under the SIL Open Font License.
import { mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';

const SETS = {
  // every page: Fraunces (display), Inter (body), JetBrains Mono (labels and code)
  site: 'family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;600',
  // the homepage adds Pacifico (the neon and the menu's script) and Caveat (the message in a bottle)
  world: 'family=Pacifico&family=Caveat:wght@500',
};
// a current browser's user agent, or Google sends older formats than woff2
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const dir = 'assets/fonts/';
mkdirSync(dir, { recursive: true });
for (const f of readdirSync(dir)) rmSync(dir + f);
for (const [name, query] of Object.entries(SETS)) {
  const css = await (await fetch(`https://fonts.googleapis.com/css2?${query}&display=swap`, { headers: { 'user-agent': UA } })).text();
  const files = new Map(); // one file can serve several weights (a variable font)
  // each rule comes after a comment naming its subset (latin, latin-ext, cyrillic…)
  const out = css.replace(/\/\* ([\w-]+) \*\/\s*@font-face \{([^}]*)\}/g, (_, subset, body) => {
    const family = body.match(/font-family: '([^']+)'/)[1].toLowerCase().replace(/ /g, '-');
    const url = body.match(/url\((https:[^)]+)\)/)[1];
    if (!files.has(url)) files.set(url, `${family}-${subset}.woff2`);
    return `@font-face {${body.replace(url, '/' + dir + files.get(url))}}`;
  });
  if (!files.size) throw new Error(`Google Fonts sent no fonts for ${name}`);
  for (const [url, file] of files) writeFileSync(dir + file, Buffer.from(await (await fetch(url)).arrayBuffer()));
  writeFileSync(`_includes/fonts-${name}.css`, `/* written by tools/fonts.mjs; don't edit */\n${out.replace(/\n\s*\n/g, '\n').trim()}\n`);
  console.log(`${name}: ${files.size} files`);
}
