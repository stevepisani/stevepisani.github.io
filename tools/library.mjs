// Steve's library: every book he's read, one list, however he read it. Merges his Audible library
// (_data/audible.json, synced daily by tools/audible-sync.py) with his shelves (_data/books.yml,
// kept by hand) into _data/library.json, which feeds /bookshelf, the stars over the hammock
// (/library.json) and the bartender (bartender.json). Not committed: `npm run build` writes it
// before Jekyll runs (tools/build-js.mjs calls this), and so does `npm run watch` when either changes.
//
//   { updated, shelves: [{ name, slug, hue, count, now }],
//     now:  [book + percent],   what he's reading at the moment, most recently played first
//     read: [book] }            by shelf (books.yml order), newest first, undated last
//   book: { id, title, by, series, seq, shelf (slug), cover, sample, on (YYYY-MM-DD or null), minutes }
//
// A book's shelf: the one books.yml lists it on; else the shelf whose `genres` has its Audible
// genre; else the shelf with "*". A books.yml book that's also on Audible (the same title before
// any subtitle and, if books.yml names an author, that surname among the Audible authors) is one
// book, with Audible's cover, sample and date.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
/** A title as a key: before any subtitle, letters and digits only ("We Are Legion (We Are Bob)" -> "wearelegion"). */
export const titleKey = (t) => slugify(t.split(':')[0].split(' (')[0]).replace(/-/g, '');
const surname = (a) => (a ? a.split(' (')[0].split(' et al')[0].split(/ and |, /)[0].trim().split(' ').pop().toLowerCase() : '');

export function buildLibrary(audible, shelvesYaml) {
  const shelves = parse(shelvesYaml).map((s) => ({ name: s.shelf, slug: slugify(s.shelf), hue: s.hue ?? 40, genres: s.genres || [], books: s.books || [] }));
  const catchAll = shelves.find((s) => s.genres.includes('*')) || shelves[shelves.length - 1];
  const byGenre = (g) => shelves.find((s) => s.genres.includes(g)) || catchAll;
  const unknown = new Set();

  const heard = [...(audible.listening || []).map((b) => ({ b, now: true })), ...(audible.finished || []).map((b) => ({ b, now: false }))];
  const book = (b, shelf) => ({
    id: b.asin, title: b.title, by: (b.authors || []).join(', '), series: b.series || null, seq: b.seq || null,
    shelf, cover: b.cover || null, sample: b.sample || null, on: b.finished_on || null, minutes: b.minutes || null,
  });
  // which Audible book each listed one is, if any
  const claimed = new Map(); // audible entry -> shelf slug
  const listed = [];
  shelves.forEach((s, si) => s.books.forEach((p, pi) => {
    const k = titleKey(String(p.title)), sn = surname(p.author);
    const hit = heard.find((h) => !claimed.has(h) && titleKey(h.b.title) === k && (!sn || h.b.authors.join(',').toLowerCase().includes(sn)));
    if (hit) claimed.set(hit, s.slug);
    else listed.push({ id: `p:${s.slug}:${k}`, title: String(p.title), by: p.author || '', series: null, seq: null, shelf: s.slug, cover: null, sample: null, on: null, minutes: null, order: si * 1000 + pi });
  }));
  const shelfOf = (h) => {
    if (claimed.has(h)) return claimed.get(h);
    const s = byGenre(h.b.genre);
    if (s === catchAll && !catchAll.genres.includes(h.b.genre)) unknown.add(h.b.genre || '(none)');
    return s.slug;
  };
  const now = heard.filter((h) => h.now).sort((a, b) => (b.b.last_heard || '').localeCompare(a.b.last_heard || ''))
    .map((h) => ({ ...book(h.b, shelfOf(h)), percent: h.b.percent ?? 0 }));
  const order = new Map(shelves.map((s, i) => [s.slug, i]));
  const read = [...heard.filter((h) => !h.now).map((h, i) => ({ ...book(h.b, shelfOf(h)), order: 1e6 + i })), ...listed]
    .sort((a, b) => order.get(a.shelf) - order.get(b.shelf) || (b.on || '').localeCompare(a.on || '') || a.order - b.order)
    .map(({ order: _, ...b }) => b);
  if (unknown.size) console.warn(`library: no shelf lists the Audible genre(s) ${[...unknown].join(', ')}; they went to ${catchAll.name}`);
  return {
    updated: audible.updated || null,
    shelves: shelves.map((s) => ({ name: s.name, slug: s.slug, hue: s.hue, count: read.filter((b) => b.shelf === s.slug).length, now: now.filter((b) => b.shelf === s.slug).length })),
    now, read,
  };
}

export function writeLibrary(root = fileURLToPath(new URL('..', import.meta.url))) {
  let audible = {};
  try { audible = JSON.parse(readFileSync(root + '_data/audible.json', 'utf8')); } catch { /* no Audible data yet: the shelves alone */ }
  const lib = buildLibrary(audible, readFileSync(root + '_data/books.yml', 'utf8'));
  writeFileSync(root + '_data/library.json', JSON.stringify(lib, null, 1) + '\n');
  return lib;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const lib = writeLibrary();
  console.log(`_data/library.json: ${lib.read.length} read, ${lib.now.length} reading now`);
  for (const s of lib.shelves) console.log(`  ${s.name}: ${s.count} (+${s.now} now)`);
}
