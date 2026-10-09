// Bundles and minifies the site's JavaScript into assets/js/dist/ (not committed; Jekyll copies
// it into the site, and the sources it's built from stay out of the build):
//
//   dist/site.js    every page: theme, launches, the sky, the page count (assets/js/site.js)
//   dist/world.js   the homepage's planet (assets/js/world/main.js and everything it imports,
//                   three.js and the post-processing included), one file, one request
//   dist/rapier-*.js the physics engine, loaded once the planet is up (import() in physics.js)
//   dist/portal.js  the real place through the door: Spark, the splat renderer, with its own
//                   three.js, loaded by URL when someone steps through (portal.js)
//   dist/mcp-app.js the wardrobe's in-chat card (assets/js/mcp-app/widget.js), which the MCP
//                   server's page loads in ChatGPT and Claude
//   dist/apps/*.js  one per app page (every file in assets/js/apps/: SJPJr, the consent page),
//                   with what they share (lib/: the kit, the Supabase client, the sections SJPJr
//                   mounts) split into chunks of their own
//
// First it writes _data/library.json, Steve's books in one list (tools/library.mjs), which Jekyll
// then reads; in watch mode again whenever _data/audible.json or _data/books.yml changes. And
// _data/hero_preload.json, the hero models the first frame needs (assets/models/hero/manifest.json,
// all but the lazy ones), which the homepage preloads so they download alongside the script.
//
//   npm run build          once (CI does this before Jekyll)
//   npm run watch          rebuild on save, beside `bundle exec jekyll serve`
//
// Library versions live in package.json, nowhere else.
import * as esbuild from 'esbuild';
import { rmSync, readFileSync, readdirSync, writeFileSync, watch as watchFile } from 'node:fs';
import { writeLibrary } from './library.mjs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = root + 'assets/js/dist';
const watch = process.argv.includes('--watch');
const common = { absWorkingDir: root, bundle: true, minify: true, sourcemap: 'linked', target: 'es2022', legalComments: 'none', logLevel: 'warning' };

// Rapier's compat build carries its WebAssembly inline as base64 (1.65 MB gzipped); served as the
// .wasm file it is, it's 1.17 MB and compiles while it downloads. Swap the one for the other.
const rapierWasm = {
  name: 'rapier-wasm',
  setup(b) {
    b.onLoad({ filter: /rapier3d-compat[\\/]dist[\\/]rapier\.mjs$/ }, ({ path }) => {
      const src = readFileSync(path, 'utf8');
      const inline = /[\w$]+\.toByteArray\("AGFzbQ[^"]*"\)(\.buffer)?/;
      if (!inline.test(src)) throw new Error('Rapier no longer inlines its wasm the way tools/build-js.mjs expects: update the plugin');
      const wasm = path.replace(/rapier\.mjs$/, 'rapier_wasm3d_bg.wasm');
      return { contents: `import __rapierWasm from ${JSON.stringify(wasm)};\n` + src.replace(inline, 'new URL(__rapierWasm, import.meta.url)'), loader: 'js' };
    });
  },
};

writeLibrary(root);
const heroes = JSON.parse(readFileSync(root + 'assets/models/hero/manifest.json', 'utf8'));
writeFileSync(root + '_data/hero_preload.json', JSON.stringify(Object.values(heroes).filter((h) => !h.lazy).map((h) => h.file)) + '\n');
rmSync(out, { recursive: true, force: true });
const builds = [
  { ...common, entryPoints: { site: 'assets/js/site.js' }, outdir: out, format: 'iife' },
  // ESM with splitting so physics.js's import() becomes its own file; nothing else is split off
  { ...common, entryPoints: { world: 'assets/js/world/main.js' }, outdir: out, format: 'esm', splitting: true, chunkNames: '[name]-[hash]', assetNames: '[name]-[hash]', loader: { '.wasm': 'file' }, plugins: [rapierWasm], metafile: true },
  // through the door (portal.js): Spark and a three.js of its own, loaded by URL only when someone
  // steps in, so it never touches the world's one request
  { ...common, entryPoints: { portal: 'assets/js/world/portal.js' }, outdir: out, format: 'esm', metafile: true },
  // a new app needs nothing but its file (watch: restart to pick it up)
  { ...common, entryPoints: readdirSync(root + 'assets/js/apps').filter((f) => f.endsWith('.js')).map((f) => `assets/js/apps/${f}`), outdir: out + '/apps', format: 'esm', splitting: true, chunkNames: '[name]-[hash]', metafile: true },
  // the wardrobe's in-chat card for ChatGPT and Claude: one plain script, loaded by the MCP server's page
  { ...common, entryPoints: { 'mcp-app': 'assets/js/mcp-app/widget.js' }, outdir: out, format: 'iife', metafile: true },
];

if (watch) {
  for (const b of builds) await (await esbuild.context(b)).watch();
  for (const f of ['_data/audible.json', '_data/books.yml']) watchFile(root + f, () => { try { writeLibrary(root); } catch (e) { console.error(e.message); } });
  console.log('Watching assets/js for changes…');
} else {
  const results = await Promise.all(builds.map((b) => esbuild.build(b)));
  const { outputs } = results[1].metafile;
  // The world must stay one request: a chunk it imports statically would be a waterfall
  // (it happens when something imported both directly and by import() is shared).
  const shared = outputs['assets/js/dist/world.js'].imports.filter((i) => i.kind === 'import-statement');
  if (shared.length) throw new Error(`world.js imports ${shared.map((i) => i.path).join(', ')} statically; keep import() targets self-contained`);
  for (const [file, o] of Object.entries({ ...outputs, ...results[2].metafile.outputs, ...results[3].metafile.outputs, ...results[4].metafile.outputs })) if (!file.endsWith('.map')) console.log(`${file.replace('assets/js/', '')}  ${(o.bytes / 1024).toFixed(0)} KB`);
}
