// Google Takeout, read for places (docs/apps.md, "Places"): the files in an export that say where
// Steve has been or wants to go, turned into one record a place, each with the lists it's on and
// the file it came from. Plain functions on the files' text, so the app runs it on a dropped zip
// (assets/js/apps/lib/places.js) and tools/places-test.mjs runs it in Node. Nothing here asks
// anyone anything; places a file gives no coordinates for are located later (places-locate).
//
//   Maps (your places)/Saved Places.json     starred places              → list "Starred"
//   Maps (your places)/Reviews.json          reviews, with the stars     → list "Reviewed"
//   Maps/My labeled places/Labeled places.json  home, work, people's houses → list "Labeled" (never public)
//   Saved/<list>.csv                         saved lists (Want to go, Favorites, your own) → that list
//   My Maps/<map>.kmz or .kml                maps of your own            → the map's name

// The files worth reading, by their path in the zip (everything else in an export is left out)
const FILES = [
  [/(^|\/)Saved Places\.json$/i, 'starred'],
  [/\(your places\)\/Reviews\.json$/i, 'reviews'],
  [/(^|\/)Labeled places\.json$/i, 'labeled'],
  [/(^|\/)Saved\/[^/]+\.csv$/i, 'list'],
  [/(^|\/)My Maps\/[^/]+\.km[lz]$/i, 'map'],
];
export const kindOf = (path) => FILES.find(([re]) => re.test(path))?.[1] || null;
export const wanted = (path) => !!kindOf(path);
// one of those files dropped on its own, outside its zip: where it would have been in one
export const pathFor = (name) => (kindOf(name) ? name : /^reviews\.json$/i.test(name) ? `Maps (your places)/${name}` : /\.csv$/i.test(name) ? `Saved/${name}` : /\.km[lz]$/i.test(name) ? `My Maps/${name}` : name);

const clean = (s, max = 300) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t ? t.slice(0, max) : null; };
const dateOf = (s) => (/^\d{4}-\d\d-\d\d/.test(String(s || '')) ? String(s).slice(0, 10) : null);
const fileName = (path) => path.split('/').pop();
const point = (coords) => {
  const [lon, lat] = Array.isArray(coords) ? coords.map(Number) : [];
  return Number.isFinite(lat) && Number.isFinite(lon) && (lat || lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : { lat: null, lon: null };
};

// Google's own id for a place, from a Maps link: ?cid=<decimal>, or the feature id in a place
// link's data (…!1s0x<hex>:0x<hex>), whose second half is the same number in hex. So a starred
// place and its review are one place.
export function cidOf(url) {
  const s = String(url || '');
  const dec = /[?&]cid=(\d+)/.exec(s);
  if (dec) return dec[1];
  const hex = /!1s0x[0-9a-f]+:0x([0-9a-f]+)/i.exec(s) || /ftid=0x[0-9a-f]+:0x([0-9a-f]+)/i.exec(s);
  return hex && !/^0+$/.test(hex[1]) ? BigInt(`0x${hex[1]}`).toString() : null;
}
const keyOf = (p) => {
  if (p.label && p.lists.includes('Labeled')) return `label:${p.label.toLowerCase()}`;
  const cid = cidOf(p.google_url);
  if (cid) return `cid:${cid}`;
  return `name:${p.name.toLowerCase()}|${p.lat == null ? '' : p.lat.toFixed(4)}|${p.lon == null ? '' : p.lon.toFixed(4)}`;
};

// ---------- Each kind of file ----------
const features = (text) => { try { const j = JSON.parse(text); return Array.isArray(j?.features) ? j.features : []; } catch (e) { return []; } };

function starred(text, file) {
  return features(text).map((f) => {
    const p = f.properties || {}, loc = p.location || {};
    return { name: clean(loc.name) || clean(loc.address), address: clean(loc.address, 500), country_code: clean(loc.country_code, 2)?.toUpperCase() || null, ...point(f.geometry?.coordinates),
      google_url: clean(p.google_maps_url, 500), lists: ['Starred'], saved_on: dateOf(p.date), note: clean(p.Comment && !/^No location information/i.test(p.Comment) ? p.Comment : null, 2000), source: { file, kind: 'starred', at: p.date || null } };
  });
}

function reviews(text, file) {
  return features(text).map((f) => {
    const p = f.properties || {}, loc = p.location || {};
    const stars = Number(p.five_star_rating_published);
    const asked = Array.isArray(p.questions) ? p.questions.map((q) => ({ question: clean(q.question, 120), answer: clean(q.selected_option, 120) ?? q.rating ?? null })).filter((q) => q.question) : [];
    return { name: clean(loc.name) || clean(loc.address), address: clean(loc.address, 500), country_code: clean(loc.country_code, 2)?.toUpperCase() || null, ...point(f.geometry?.coordinates),
      google_url: clean(p.google_maps_url, 500), lists: ['Reviewed'], rating: stars >= 1 && stars <= 5 ? Math.round(stars) : null, review: clean(p.review_text_published, 5000), reviewed_on: dateOf(p.date),
      data: asked.length ? { review_questions: asked } : {}, source: { file, kind: 'review', at: p.date || null } };
  });
}

function labeled(text, file) {
  return features(text).map((f) => {
    const p = f.properties || {};
    const label = clean(p.name, 120);
    return { name: label || clean(p.address), label, address: clean(p.address, 500), ...point(f.geometry?.coordinates), lists: ['Labeled'], source: { file, kind: 'labeled', at: null } };
  });
}

// A saved list: Title, Note, URL (and in newer exports Tags, Comment), one row a place; no coordinates
export function csvRows(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}
function savedList(text, file) {
  const [head = [], ...rows] = csvRows(text);
  const col = (name) => head.findIndex((h) => h.trim().toLowerCase() === name);
  const [title, note, url, tags, comment] = ['title', 'note', 'url', 'tags', 'comment'].map(col);
  const list = clean(fileName(file).replace(/\.csv$/i, ''), 120);
  return rows.map((r) => ({ name: clean(r[title]), note: clean([r[note], r[comment]].filter((x) => x?.trim()).join(' · '), 2000), google_url: clean(r[url], 500), lat: null, lon: null, lists: [list],
    data: tags >= 0 && r[tags]?.trim() ? { tags: r[tags].split(',').map((t) => t.trim()).filter(Boolean) } : {}, source: { file, kind: 'saved_list', at: null } }));
}

// A map of your own (My Maps' KML): each point with its name, description and layer
const unxml = (s) => String(s ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
const tag = (xml, name) => { const m = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(xml); return m ? m[1] : null; };
function myMap(text, file) {
  const doc = tag(text, 'Document') || text;
  const map = clean(unxml(tag(doc.replace(/<(Folder|Placemark)\b[\s\S]*$/i, ''), 'name'))) || clean(fileName(file).replace(/\.km[lz]$/i, ''), 120);
  const out = [];
  // each layer (Folder) by its name; points outside any layer have none
  const parts = doc.split(/<Folder\b[^>]*>/i);
  parts.forEach((part, i) => {
    const layer = i ? clean(unxml(tag(part.replace(/<Placemark\b[\s\S]*$/i, ''), 'name')), 120) : null;
    for (const m of part.matchAll(/<Placemark\b[^>]*>([\s\S]*?)<\/Placemark>/gi)) {
      const pm = m[1], at = /<Point\b[\s\S]*?<coordinates>\s*([-\d.]+)\s*,\s*([-\d.]+)/i.exec(pm);
      if (!at) continue; // a line or a shape isn't a place
      const name = clean(unxml(tag(pm, 'name')));
      if (!name) continue;
      out.push({ name, note: clean(unxml(tag(pm, 'description')), 2000), ...point([at[1], at[2]]), lists: [map], category: layer && !/^untitled layer$/i.test(layer) ? layer : null, source: { file, kind: 'my_map', at: null } });
    }
  });
  return out;
}

const READ = { starred, reviews, labeled, list: savedList, map: myMap };

// Every place in the files, the same place from two files made one: { places, files, skipped }.
// files: [{ path, text }] (a .kmz already opened: its doc.kml's text, under the .kmz's path);
// inboxId goes on each source, so a place says which import it came from.
export function readTakeout(files, { inboxId = null } = {}) {
  const byKey = new Map(), used = [];
  let skipped = 0;
  for (const { path, text } of files) {
    const kind = kindOf(path);
    if (!kind) continue;
    const found = READ[kind](text, path.replace(/^.*?Takeout\//i, ''));
    if (found.length) used.push({ path, kind, places: found.length });
    for (const raw of found) {
      if (!raw.name) { skipped++; continue; } // "No location information is available"
      const { source, ...p } = raw;
      const place = { address: null, country_code: null, google_url: null, category: null, label: null, rating: null, review: null, note: null, saved_on: null, reviewed_on: null, data: {}, ...p, sources: [{ ...(inboxId && { inbox_id: inboxId }), ...source }] };
      const key = keyOf(place), had = byKey.get(key);
      if (!had) { byKey.set(key, { import_key: key, ...place }); continue; }
      // the same place again: its lists and sources added, its blanks filled
      for (const [k, v] of Object.entries(place)) {
        if (k === 'lists') had.lists = [...new Set([...had.lists, ...v])];
        else if (k === 'sources') had.sources.push(...v);
        else if (k === 'data') had.data = { ...had.data, ...v };
        else if (had[k] == null && v != null) had[k] = v;
      }
    }
  }
  return { places: [...byKey.values()].map((p) => ({ ...p, lists: p.lists.sort() })), files: used, skipped };
}
