// Steve's planet as a planet spec (supabase/functions/_shared/planet.js), built from what's already
// in _data/: the menu, the bartender's lines and what to ask him (bar.yml), his drinks (drinks.yml),
// the campfire's thoughts (bar.yml `likes`), and his books (/library.json, served from
// tools/library.mjs's list). Written to _data/planet.json, which the homepage writes into the page
// for the world to read. Not committed: `npm run build` writes it before Jekyll runs
// (tools/build-js.mjs calls this), and so does `npm run watch` when bar.yml or drinks.yml changes.
// The build fails if the spec doesn't pass checkPlanet, the same check other people's planets get.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { checkPlanet } from '../supabase/functions/_shared/planet.js';

export function buildPlanet(barYaml, drinksYaml) {
  const bar = parse(barYaml);
  return {
    version: 1,
    slug: 'steve',
    who: { name: 'Steve', sign: "Steve's" },
    links: bar.menu.map(({ id, label, note, href }) => ({ id, label, note, href })),
    look: { theme: 'tiki-night', home: 'Philadelphia' },
    collections: {
      drinks: { title: 'Favorite drinks', items: parse(drinksYaml) },
      thoughts: { title: 'By the fire', items: bar.likes },
      books: { title: "Books I've read", src: '/library.json' },
    },
    places: [
      { id: 'bar', kind: 'tiki-bar', displays: [{ kind: 'chalkboard', collection: 'drinks' }] },
      { id: 'campfire', kind: 'campfire', collection: 'thoughts' },
      { id: 'hammock', kind: 'hammock', displays: [{ kind: 'star-sky', collection: 'books' }] },
    ],
    robot: { lines: bar.bartender, ask: bar.ask },
    telescope: { engraving: "Steve's" },
  };
}

export function writePlanet(root = fileURLToPath(new URL('..', import.meta.url))) {
  const spec = buildPlanet(readFileSync(root + '_data/bar.yml', 'utf8'), readFileSync(root + '_data/drinks.yml', 'utf8'));
  const errors = checkPlanet(spec);
  if (errors.length) throw new Error(`Steve's planet spec doesn't pass checkPlanet:\n  ${errors.join('\n  ')}`);
  writeFileSync(root + '_data/planet.json', JSON.stringify(spec, null, 1) + '\n');
  return spec;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const spec = writePlanet();
  console.log(`_data/planet.json: ${JSON.stringify(spec).length} bytes, ${spec.places.length} places, ${Object.keys(spec.collections).length} collections`);
}
