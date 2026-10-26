// Bundles and minifies the site's JavaScript into assets/js/dist/ (not committed; Jekyll copies
// it into the site, and the sources it's built from stay out of the build):
//
//   dist/site.js    every page: theme, launches, the sky, the page count (assets/js/site.js)
//   dist/world.js   the homepage's planet (assets/js/world/main.js and everything it imports,
//                   three.js and the post-processing included), one file, one request
//   dist/rapier-*.js the physics engine, loaded once the planet is up (import() in physics.js)
//   dist/ao.js      ambient occlusion (N8AO), for computers only, loaded by URL (render.js)
//   dist/holidays/  a holiday's decorations for the planet, one file each, loaded by URL only on
//                   the day (main.js, assets/js/holidays.js)
//   dist/portal.js  the real place through the door: Spark, the splat renderer, with its own
//                   three.js, loaded by URL when someone steps through (portal.js)
//   dist/gauge.js   "Rockets and Horses" as a walk along one track (assets/js/walk/gauge.js), the
//                   one post with a 3D scene, with its own three.js
//   dist/mcp-app.js the wardrobe's in-chat card (assets/js/mcp-app/widget.js), which the MCP
//                   server's page loads in ChatGPT and Claude
//   dist/planets.js a friend's planet (/p/…, assets/js/planets/main.js): its own small world,
//                   three.js and none of Steve's
//   dist/planet-card.js the Planets connector's card (assets/js/mcp-app/planets.js): a planet
//                   previewed in a chat, by the same shell
//   dist/apps/*.js  one per app page (every file in assets/js/apps/: SJPJr, the consent page),
//                   with what they share (lib/: the kit, the Supabase client, the sections SJPJr
//                   mounts) split into chunks of their own
//
// First it writes _data/library.json, Steve's books in one list (tools/library.mjs), which Jekyll
// then reads; in watch mode again whenever _data/audible.json or _data/books.yml changes. Then
// _data/planet.json, Steve's planet as a planet spec (tools/planet.mjs), which the homepage writes
// into the page for the world; again whenever _data/bar.yml or _data/drinks.yml changes. And
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
import { writePlanet } from './planet.mjs';
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

// Two bundles loaded by URL must use the planet's own three.js (and postprocessing), not copies:
// N8AO (ambient occlusion, computers only, dist/ao.js) and a holiday's decorations
// (dist/holidays/<id>.js). So: read what each imports from those libraries, have world.js hand
// exactly that over (`import libs from '<name>'`, set on globalThis), and build the bundle with
// those imports read back from there.
function importsOf(files) {
  const mods = {};
  for (const f of files) {
    for (const [, names, mod] of readFileSync(root + f, 'utf8').matchAll(/import\s*\{([^}]*)\}\s*from\s*["']([^"'.][^"']*)["']/g)) {
      mods[mod] = [...new Set([...(mods[mod] || []), ...names.split(',').map((n) => n.trim().split(/\s+as\s+/)[0]).filter(Boolean)])];
    }
  }
  return mods;
}
function handOver(name, global, imports, inBundle) {
  return {
    // in world.js: the object to hand over
    give: {
      name,
      setup(b) {
        b.onResolve({ filter: new RegExp(`^${name}$`) }, () => ({ path: name, namespace: name }));
        b.onLoad({ filter: /.*/, namespace: name }, () => {
          const mods = Object.entries(imports);
          return {
            resolveDir: root,
            contents: mods.map(([mod, names], i) => `import { ${names.map((n) => `${n} as m${i}_${n}`).join(', ')} } from ${JSON.stringify(mod)};`).join('\n')
              + `\nexport default { ${mods.map(([mod, names], i) => `${JSON.stringify(mod)}: { ${names.map((n) => `${n}: m${i}_${n}`).join(', ')} }`).join(', ')} };`,
          };
        });
      },
    },
    // in the bundle: each of those imports read from what world.js handed over
    take: {
      name: name + '-from-world',
      setup(b) {
        b.onResolve({ filter: /.*/ }, ({ path, importer }) => (inBundle(importer) && imports[path] ? { path, namespace: name + '-from-world' } : undefined));
        b.onLoad({ filter: /.*/, namespace: name + '-from-world' }, ({ path }) => ({ contents: `export const { ${imports[path].join(', ')} } = globalThis.${global}[${JSON.stringify(path)}];` }));
      },
    },
  };
}
const n8aoImports = importsOf(['node_modules/n8ao/dist/N8AO.js']);
if (!n8aoImports.three) throw new Error('n8ao no longer imports three the way tools/build-js.mjs expects: update importsOf');
const ao = handOver('ao-libs', '__aoLibs', n8aoImports, (importer) => importer.includes('n8ao'));
// one bundle per holiday, each file in assets/js/world/holidays/ (holidays.js says which day)
const holidayFiles = readdirSync(root + 'assets/js/world/holidays').filter((f) => f.endsWith('.js')).map((f) => `assets/js/world/holidays/${f}`);
const holidayLib = readdirSync(root + 'assets/js/world/holidays/lib').map((f) => `assets/js/world/holidays/lib/${f}`); // what they share
const holidays = handOver('holiday-libs', '__holidayLibs', importsOf([...holidayFiles, ...holidayLib]), (importer) => /world[\\/]holidays[\\/]/.test(importer));

writeLibrary(root);
writePlanet(root);
const heroes = JSON.parse(readFileSync(root + 'assets/models/hero/manifest.json', 'utf8'));
writeFileSync(root + '_data/hero_preload.json', JSON.stringify(Object.values(heroes).filter((h) => !h.lazy).map((h) => h.file)) + '\n');
rmSync(out, { recursive: true, force: true });
const builds = [
  { ...common, entryPoints: { site: 'assets/js/site.js' }, outdir: out, format: 'iife' },
  // ESM with splitting so physics.js's import() becomes its own file; nothing else is split off
  { ...common, entryPoints: { world: 'assets/js/world/main.js' }, outdir: out, format: 'esm', splitting: true, chunkNames: '[name]-[hash]', assetNames: '[name]-[hash]', loader: { '.wasm': 'file' }, plugins: [rapierWasm, ao.give, holidays.give], metafile: true },
  // a friend's planet (/p/…): its own small world on three.js, none of Steve's (assets/js/planets/);
  // it draws through the same pipeline (render.js), so it hands ao.js its three.js the same way
  { ...common, entryPoints: { planets: 'assets/js/planets/main.js' }, outdir: out, format: 'esm', plugins: [ao.give], metafile: true },
  // ambient occlusion, for computers only (render.js loads it by URL), on world.js's three.js
  { ...common, entryPoints: { ao: 'assets/js/world/ao.js' }, outdir: out, format: 'esm', plugins: [ao.take], metafile: true },
  // a holiday's decorations (main.js loads the day's by URL), on world.js's three.js
  { ...common, entryPoints: holidayFiles, outdir: out + '/holidays', format: 'esm', plugins: [holidays.take], metafile: true },
  // through the door (portal.js): Spark and a three.js of its own, loaded by URL only when someone
  // steps in, so it never touches the world's one request
  { ...common, entryPoints: { portal: 'assets/js/world/portal.js' }, outdir: out, format: 'esm', metafile: true },
  // the walk in "Rockets and Horses" (_includes/gauge-walk.html loads it)
  { ...common, entryPoints: { gauge: 'assets/js/walk/gauge.js' }, outdir: out, format: 'esm', metafile: true },
  // a new app needs nothing but its file (watch: restart to pick it up)
  { ...common, entryPoints: readdirSync(root + 'assets/js/apps').filter((f) => f.endsWith('.js')).map((f) => `assets/js/apps/${f}`), outdir: out + '/apps', format: 'esm', splitting: true, chunkNames: '[name]-[hash]', metafile: true },
  // the wardrobe's in-chat card for ChatGPT and Claude: one plain script, loaded by the MCP server's page
  { ...common, entryPoints: { 'mcp-app': 'assets/js/mcp-app/widget.js' }, outdir: out, format: 'iife', metafile: true },
  // the Planets connector's card: the same shell, with only the planet's view (docs/planets.md)
  { ...common, entryPoints: { 'planet-card': 'assets/js/mcp-app/planets.js' }, outdir: out, format: 'iife', metafile: true },
];

if (watch) {
  for (const b of builds) await (await esbuild.context(b)).watch();
  for (const f of ['_data/audible.json', '_data/books.yml']) watchFile(root + f, () => { try { writeLibrary(root); } catch (e) { console.error(e.message); } });
  for (const f of ['_data/bar.yml', '_data/drinks.yml']) watchFile(root + f, () => { try { writePlanet(root); } catch (e) { console.error(e.message); } });
  console.log('Watching assets/js for changes…');
} else {
  const results = await Promise.all(builds.map((b) => esbuild.build(b)));
  const { outputs } = results[1].metafile;
  // The world must stay one request: a chunk it imports statically would be a waterfall
  // (it happens when something imported both directly and by import() is shared).
  const shared = outputs['assets/js/dist/world.js'].imports.filter((i) => i.kind === 'import-statement');
  if (shared.length) throw new Error(`world.js imports ${shared.map((i) => i.path).join(', ')} statically; keep import() targets self-contained`);
  for (const [file, o] of Object.entries(Object.assign({}, outputs, ...results.slice(2).map((r) => r.metafile.outputs)))) if (!file.endsWith('.map')) console.log(`${file.replace('assets/js/', '')}  ${(o.bytes / 1024).toFixed(0)} KB`);
}
