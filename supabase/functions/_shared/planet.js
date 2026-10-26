// A planet spec: everything that makes a little planet someone's own, in one small JSON. Steve's is
// built from _data/ by tools/planet.mjs; other people's will be written by their own AI through the
// Planets connector (My Tiny Planet, Linear P-PRO-40). The same rules for the server and the
// browser, so a spec the world draws is always one this file passed. Plain JavaScript, no imports.
//
//   {
//     version: 1,
//     slug: 'steve',                       the planet's name in its address: a-z, 0-9 and -
//     who: { name, sign },                 sign: the neon over the hub, 12 characters at most
//     links: [{ id, label, note, href }],  the hub's menu; href https://, mailto: or a site path
//     look: { theme, home, ground, sky },  theme from THEMES; home: a city, never an address;
//                                          ground: { color, hills 0..1 }; sky: { color, light }
//     things: [{ id, name, note, collection, at: { bearing, distance }, turn, scale, solid,
//                parts: [{ shape, size, at, turn, color, finish, spin, text }], light }],
//                                          what stands on someone else's planet, composed by
//                                          their own AI from simple shapes (SHAPES, FINISHES),
//                                          in metres, placed from where you land
//     collections: { <id>: { title, items: [...] } | { title, src } },
//                                          what matters to them: plain lists (items: text, or
//                                          small objects), or a site path that serves the list
//     places: [{ id, kind, displays: [{ kind, collection }], collection }],
//                                          what's built on the planet (PLACES), and how each
//                                          shows its collections (DISPLAYS)
//     robot: { lines, ask },               what the hub's robot says, and what to ask it
//     telescope: { engraving, pins: [{ city, lat, lon, zone, note, home }], sights: [...] },
//                                          pins: cities on the Earth in the eyepiece, each
//                                          with its time now (zone: an IANA time zone)
//     launchPad: { countdowns: [{ name, on }], launches, rocket: { name, colors } },
//   }
//
// Everything but version, slug and who is optional; the world fills in a default. Every list and
// every piece of text has a cap (LIMITS), so a spec is small and nothing on a planet runs long.

export const THEMES = ['tiki-night'];
export const PLACES = ['tiki-bar', 'campfire', 'hammock'];
export const DISPLAYS = ['chalkboard', 'star-sky'];
export const SIGHTS = ['moon', 'sun', 'earth'];
// what a thing on someone else's planet is made of: simple shapes, each a size in metres, a colour
// and a finish; `text` is a flat panel with their own words on it
export const SHAPES = ['box', 'sphere', 'cylinder', 'cone', 'torus', 'capsule', 'text'];
export const FINISHES = ['matte', 'gloss', 'metal', 'glass', 'glow'];

export const LIMITS = {
  bytes: 64 * 1024, // the whole spec, as JSON
  text: 600, // any one piece of text
  name: 40, // names, labels, titles, cities
  sign: 12,
  links: 8,
  collections: 12,
  items: 200, // in one collection
  depth: 4, // how deep an item's own objects go
  places: 8,
  lines: 30, // the robot's lines, and what to ask it
  pins: 8,
  countdowns: 3,
  things: 24,
  parts: 40, // in one thing
  allParts: 400, // in all of them
  lights: 8, // things that cast light
  size: 12, // metres: the most any part, or a thing's reach from its foot, measures
};

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])$/;
const ID = /^[a-z][a-z0-9-]{0,31}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const COLOR = /^#[0-9a-f]{6}$/i;
const isZone = (z) => {
  if (typeof z !== 'string' || !z) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: z }); return true; } catch { return false; }
};

// The telescope's Earth when a planet pins no cities of its own: a few round the world
export const WORLD_PINS = [
  { city: 'Honolulu', lat: 21.31, lon: -157.86, zone: 'Pacific/Honolulu' },
  { city: 'London', lat: 51.51, lon: -0.13, zone: 'Europe/London' },
  { city: 'Tokyo', lat: 35.68, lon: 139.69, zone: 'Asia/Tokyo' },
  { city: 'Sydney', lat: -33.87, lon: 151.21, zone: 'Australia/Sydney' },
  { city: 'Cape Town', lat: -33.92, lon: 18.42, zone: 'Africa/Johannesburg' },
  { city: 'Rio', lat: -22.91, lon: -43.17, zone: 'America/Sao_Paulo' },
];

/** What's wrong with a spec, as a list of "where: what" lines; empty when it's fine. */
export function checkPlanet(spec) {
  const errors = [];
  const fail = (at, what) => errors.push(`${at}: ${what}`);
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const only = (at, o, keys) => Object.keys(o).forEach((k) => keys.includes(k) || fail(`${at}.${k}`, 'not part of a planet spec'));
  const text = (at, v, max = LIMITS.text, required = false) => {
    if (v === undefined || v === null) return required ? fail(at, 'missing') : undefined;
    if (typeof v !== 'string') return fail(at, 'should be text');
    if (required && !v.trim()) return fail(at, 'empty');
    if (v.length > max) fail(at, `longer than ${max} characters`);
  };
  const list = (at, v, max) => {
    if (v === undefined) return [];
    if (!Array.isArray(v)) return fail(at, 'should be a list'), [];
    if (v.length > max) fail(at, `more than ${max}`);
    return v;
  };
  const color = (at, v) => v === undefined || (typeof v === 'string' && COLOR.test(v)) || fail(at, 'should be a colour like #1a2b3c');
  const between = (at, v, lo, hi) => v === undefined || (typeof v === 'number' && v >= lo && v <= hi) || fail(at, `should be a number from ${lo} to ${hi}`);
  const triple = (at, v, lo, hi) => {
    if (v === undefined) return;
    if (!Array.isArray(v) || v.length !== 3 || !v.every((n) => typeof n === 'number' && n >= lo && n <= hi)) fail(at, `should be [x, y, z], each from ${lo} to ${hi}`);
  };
  const id = (at, v) => (typeof v === 'string' && ID.test(v) ? true : (fail(at, 'should be a short id: a-z, 0-9 and -'), false));
  const href = (at, v) => {
    text(at, v, LIMITS.text, true);
    if (typeof v === 'string' && !/^(https:\/\/|mailto:|\/(?!\/))/.test(v)) fail(at, 'should start with https://, mailto: or /');
  };
  // an item in a collection: text, a number, true or false, or a small object or list of them
  const item = (at, v, depth = 0) => {
    if (typeof v === 'string') return text(at, v);
    if (typeof v === 'number' || typeof v === 'boolean') return;
    if (depth >= LIMITS.depth) return fail(at, `nested more than ${LIMITS.depth} deep`);
    if (Array.isArray(v)) return list(at, v, LIMITS.items).forEach((x, i) => item(`${at}[${i}]`, x, depth + 1));
    if (!isObj(v)) return fail(at, 'should be text, a number, true or false, a list or an object');
    for (const [k, x] of Object.entries(v)) {
      if (k.length > LIMITS.name) fail(`${at}`, `has a key longer than ${LIMITS.name} characters`);
      item(`${at}.${k}`, x, depth + 1);
    }
  };

  if (!isObj(spec)) return ['spec: should be an object'];
  only('spec', spec, ['version', 'slug', 'who', 'links', 'look', 'collections', 'things', 'places', 'robot', 'telescope', 'launchPad']);
  if (JSON.stringify(spec).length > LIMITS.bytes) fail('spec', `larger than ${LIMITS.bytes / 1024} KB`);
  if (spec.version !== 1) fail('version', 'should be 1');
  if (typeof spec.slug !== 'string' || !SLUG.test(spec.slug)) fail('slug', 'should be 2 to 32 of a-z, 0-9 and -, not starting or ending with -');

  if (!isObj(spec.who)) fail('who', 'missing');
  else {
    only('who', spec.who, ['name', 'sign']);
    text('who.name', spec.who.name, LIMITS.name, true);
    text('who.sign', spec.who.sign, LIMITS.sign);
  }

  const linkIds = new Set();
  list('links', spec.links, LIMITS.links).forEach((l, i) => {
    const at = `links[${i}]`;
    if (!isObj(l)) return fail(at, 'should be an object');
    only(at, l, ['id', 'label', 'note', 'href']);
    if (id(`${at}.id`, l.id) && linkIds.has(l.id)) fail(`${at}.id`, `"${l.id}" is used twice`);
    linkIds.add(l.id);
    text(`${at}.label`, l.label, LIMITS.name, true);
    text(`${at}.note`, l.note, LIMITS.text);
    href(`${at}.href`, l.href);
  });

  if (spec.look !== undefined) {
    if (!isObj(spec.look)) fail('look', 'should be an object');
    else {
      only('look', spec.look, ['theme', 'home', 'ground', 'sky']);
      if (spec.look.theme !== undefined && !THEMES.includes(spec.look.theme)) fail('look.theme', `should be one of ${THEMES.join(', ')}`);
      text('look.home', spec.look.home, LIMITS.name);
      const g = spec.look.ground, sky = spec.look.sky;
      if (g !== undefined) {
        if (!isObj(g)) fail('look.ground', 'should be an object');
        else { only('look.ground', g, ['color', 'hills']); color('look.ground.color', g.color); between('look.ground.hills', g.hills, 0, 1); }
      }
      if (sky !== undefined) {
        if (!isObj(sky)) fail('look.sky', 'should be an object');
        else { only('look.sky', sky, ['color', 'light']); color('look.sky.color', sky.color); color('look.sky.light', sky.light); }
      }
    }
  }

  const collections = spec.collections === undefined ? {} : spec.collections;
  if (!isObj(collections)) fail('collections', 'should be an object');
  else {
    if (Object.keys(collections).length > LIMITS.collections) fail('collections', `more than ${LIMITS.collections}`);
    for (const [k, c] of Object.entries(collections)) {
      const at = `collections.${k}`;
      id(at, k);
      if (!isObj(c)) { fail(at, 'should be an object'); continue; }
      only(at, c, ['title', 'items', 'src']);
      text(`${at}.title`, c.title, LIMITS.name, true);
      if ((c.items === undefined) === (c.src === undefined)) fail(at, 'should have items or src, not both');
      if (c.src !== undefined && !(typeof c.src === 'string' && /^\/(?!\/)\S*$/.test(c.src))) fail(`${at}.src`, 'should be a site path');
      list(`${at}.items`, c.items, LIMITS.items).forEach((x, i) => item(`${at}.items[${i}]`, x));
    }
  }
  const known = (at, c) => c === undefined || (isObj(collections) && collections[c]) || fail(at, `no collection "${c}"`);

  const thingIds = new Set();
  let parts = 0, lights = 0;
  list('things', spec.things, LIMITS.things).forEach((t, i) => {
    const at = `things[${i}]`;
    if (!isObj(t)) return fail(at, 'should be an object');
    only(at, t, ['id', 'name', 'note', 'collection', 'at', 'turn', 'scale', 'solid', 'parts', 'light']);
    if (id(`${at}.id`, t.id) && thingIds.has(t.id)) fail(`${at}.id`, `"${t.id}" is used twice`);
    thingIds.add(t.id);
    text(`${at}.name`, t.name, LIMITS.name, true);
    text(`${at}.note`, t.note, LIMITS.text);
    known(`${at}.collection`, t.collection);
    if (!isObj(t.at)) fail(`${at}.at`, 'missing: { bearing, distance }');
    else {
      only(`${at}.at`, t.at, ['bearing', 'distance']);
      if (t.at.bearing === undefined) fail(`${at}.at.bearing`, 'missing');
      between(`${at}.at.bearing`, t.at.bearing, -180, 180);
      if (t.at.distance === undefined) fail(`${at}.at.distance`, 'missing');
      between(`${at}.at.distance`, t.at.distance, 2, 60);
    }
    between(`${at}.turn`, t.turn, -180, 180);
    between(`${at}.scale`, t.scale, 0.25, 4);
    if (t.solid !== undefined && typeof t.solid !== 'boolean') fail(`${at}.solid`, 'should be true or false');
    const ps = list(`${at}.parts`, t.parts, LIMITS.parts);
    if (!ps.length) fail(`${at}.parts`, 'should have at least one part');
    parts += ps.length;
    ps.forEach((p, j) => {
      const pat = `${at}.parts[${j}]`;
      if (!isObj(p)) return fail(pat, 'should be an object');
      only(pat, p, ['shape', 'size', 'at', 'turn', 'color', 'finish', 'spin', 'text']);
      if (!SHAPES.includes(p.shape)) fail(`${pat}.shape`, `should be one of ${SHAPES.join(', ')}`);
      if (p.size === undefined) fail(`${pat}.size`, 'missing: [width, height, depth] in metres');
      triple(`${pat}.size`, p.size, 0.01, LIMITS.size);
      triple(`${pat}.at`, p.at, -LIMITS.size, LIMITS.size);
      triple(`${pat}.turn`, p.turn, -360, 360);
      color(`${pat}.color`, p.color);
      if (p.finish !== undefined && !FINISHES.includes(p.finish)) fail(`${pat}.finish`, `should be one of ${FINISHES.join(', ')}`);
      between(`${pat}.spin`, p.spin, -360, 360);
      if (p.shape === 'text') text(`${pat}.text`, p.text, LIMITS.name * 2, true);
      else if (p.text !== undefined) fail(`${pat}.text`, 'only a text part has text');
    });
    if (t.light !== undefined) {
      lights++;
      if (!isObj(t.light)) fail(`${at}.light`, 'should be an object');
      else {
        only(`${at}.light`, t.light, ['color', 'strength', 'at']);
        color(`${at}.light.color`, t.light.color);
        between(`${at}.light.strength`, t.light.strength, 0, 1);
        triple(`${at}.light.at`, t.light.at, -LIMITS.size, LIMITS.size);
      }
    }
  });
  if (parts > LIMITS.allParts) fail('things', `more than ${LIMITS.allParts} parts in all`);
  if (lights > LIMITS.lights) fail('things', `more than ${LIMITS.lights} with a light`);

  const placeIds = new Set();
  list('places', spec.places, LIMITS.places).forEach((p, i) => {
    const at = `places[${i}]`;
    if (!isObj(p)) return fail(at, 'should be an object');
    only(at, p, ['id', 'kind', 'displays', 'collection']);
    if (id(`${at}.id`, p.id) && placeIds.has(p.id)) fail(`${at}.id`, `"${p.id}" is used twice`);
    placeIds.add(p.id);
    if (!PLACES.includes(p.kind)) fail(`${at}.kind`, `should be one of ${PLACES.join(', ')}`);
    known(`${at}.collection`, p.collection);
    list(`${at}.displays`, p.displays, LIMITS.places).forEach((d, j) => {
      const dat = `${at}.displays[${j}]`;
      if (!isObj(d)) return fail(dat, 'should be an object');
      only(dat, d, ['kind', 'collection']);
      if (!DISPLAYS.includes(d.kind)) fail(`${dat}.kind`, `should be one of ${DISPLAYS.join(', ')}`);
      if (d.collection === undefined) fail(`${dat}.collection`, 'missing');
      else known(`${dat}.collection`, d.collection);
    });
  });

  if (spec.robot !== undefined) {
    if (!isObj(spec.robot)) fail('robot', 'should be an object');
    else {
      only('robot', spec.robot, ['lines', 'ask']);
      list('robot.lines', spec.robot.lines, LIMITS.lines).forEach((l, i) => text(`robot.lines[${i}]`, l, LIMITS.text, true));
      list('robot.ask', spec.robot.ask, LIMITS.lines).forEach((l, i) => text(`robot.ask[${i}]`, l, LIMITS.name * 2, true));
    }
  }

  if (spec.telescope !== undefined) {
    const t = spec.telescope;
    if (!isObj(t)) fail('telescope', 'should be an object');
    else {
      only('telescope', t, ['engraving', 'pins', 'sights']);
      text('telescope.engraving', t.engraving, LIMITS.sign);
      list('telescope.pins', t.pins, LIMITS.pins).forEach((p, i) => {
        const at = `telescope.pins[${i}]`;
        if (!isObj(p)) return fail(at, 'should be an object');
        only(at, p, ['city', 'lat', 'lon', 'zone', 'note', 'home']);
        text(`${at}.city`, p.city, LIMITS.name, true);
        if (typeof p.lat !== 'number' || !(Math.abs(p.lat) <= 90)) fail(`${at}.lat`, 'should be a latitude, -90 to 90');
        if (typeof p.lon !== 'number' || !(Math.abs(p.lon) <= 180)) fail(`${at}.lon`, 'should be a longitude, -180 to 180');
        if (!isZone(p.zone)) fail(`${at}.zone`, 'should be a time zone, like America/Chicago');
        text(`${at}.note`, p.note, LIMITS.name * 2);
        if (p.home !== undefined && typeof p.home !== 'boolean') fail(`${at}.home`, 'should be true or false');
      });
      list('telescope.sights', t.sights, SIGHTS.length).forEach((s, i) => SIGHTS.includes(s) || fail(`telescope.sights[${i}]`, `should be one of ${SIGHTS.join(', ')}`));
    }
  }

  if (spec.launchPad !== undefined) {
    const l = spec.launchPad;
    if (!isObj(l)) fail('launchPad', 'should be an object');
    else {
      only('launchPad', l, ['countdowns', 'launches', 'rocket']);
      list('launchPad.countdowns', l.countdowns, LIMITS.countdowns).forEach((c, i) => {
        const at = `launchPad.countdowns[${i}]`;
        if (!isObj(c)) return fail(at, 'should be an object');
        only(at, c, ['name', 'on']);
        text(`${at}.name`, c.name, LIMITS.name, true);
        if (typeof c.on !== 'string' || !DATE.test(c.on) || new Date(`${c.on}T12:00:00Z`).toISOString().slice(0, 10) !== c.on) fail(`${at}.on`, 'should be a date, YYYY-MM-DD');
      });
      // whose real launches the console shows: everyone's, nobody's, or one company or agency's
      if (l.launches !== undefined && l.launches !== 'all' && l.launches !== 'none') {
        if (!isObj(l.launches)) fail('launchPad.launches', 'should be "all", "none" or { provider }');
        else { only('launchPad.launches', l.launches, ['provider']); text('launchPad.launches.provider', l.launches.provider, LIMITS.name, true); }
      }
      if (l.rocket !== undefined) {
        if (!isObj(l.rocket)) fail('launchPad.rocket', 'should be an object');
        else {
          only('launchPad.rocket', l.rocket, ['name', 'colors']);
          text('launchPad.rocket.name', l.rocket.name, LIMITS.sign);
          list('launchPad.rocket.colors', l.rocket.colors, 2).forEach((c, i) => (typeof c === 'string' && COLOR.test(c)) || fail(`launchPad.rocket.colors[${i}]`, 'should be a colour like #1a2b3c'));
        }
      }
    }
  }

  return errors;
}

// ---------- What the world draws ----------
/**
 * What's on a planet besides the planet itself, from a spec that passed checkPlanet: the kinds of
 * the places it lists, and 'telescope' and 'launch-pad' when it has them. Nothing else is drawn
 * on someone else's planet (assets/js/world/places.js layout); Steve's has everything, his own
 * things too.
 */
export function planetHas(spec) {
  const kinds = new Set((spec.places || []).map((p) => p.kind));
  if (spec.telescope) kinds.add('telescope');
  if (spec.launchPad) kinds.add('launch-pad');
  return kinds;
}

// an item in a collection as one line: text as it is; an object by its name or title, or its first text
export const line = (x) => {
  if (x === null || x === undefined) return '';
  if (typeof x !== 'object') return String(x);
  if (Array.isArray(x)) return x.map(line).filter(Boolean).join(', ');
  return x.name || x.title || x.label || Object.values(x).find((v) => typeof v === 'string') || '';
};

/**
 * What the world's places show, from a spec that passed checkPlanet (read by the world, and by the
 * chat's card where 3D can't run): the sign's name, the chalkboard (the collection a tiki bar's
 * chalkboard display points at), the campfire's thoughts (a campfire's collection) and the
 * robot's lines. Anything the spec leaves out gets a plain default.
 */
export function planetParts(spec) {
  const places = spec.places || [], collections = spec.collections || {};
  const shown = (kind, display) => {
    for (const p of places.filter((x) => x.kind === kind)) {
      const id = display ? ((p.displays || []).find((d) => d.kind === display) || {}).collection : p.collection;
      if (collections[id]) return collections[id];
    }
    return null;
  };
  const board = shown('tiki-bar', 'chalkboard'), fire = shown('campfire');
  const items = ((board && board.items) || []).map((x) => (x && typeof x === 'object' && !Array.isArray(x) ? { ...x, name: line(x) } : { name: line(x) })).filter((x) => x.name);
  const robot = spec.robot || {};
  return {
    name: spec.who.name,
    sign: spec.who.sign || spec.who.name,
    engraving: ((spec.telescope && spec.telescope.engraving) || spec.who.sign || spec.who.name).toUpperCase(),
    // a drink has a recipe (build) and the robot can make it (make); anything else is a name and its details
    board: { title: (board && board.title) || 'Tonight', items, recipes: items.some((x) => Array.isArray(x.build)) },
    thoughts: ((fire && fire.items) || []).map(line).filter(Boolean),
    robot: { lines: robot.lines && robot.lines.length ? robot.lines : ['Welcome in. Have a look around.'], ask: robot.ask || [] },
    pins: (spec.telescope && spec.telescope.pins && spec.telescope.pins.length ? spec.telescope.pins : WORLD_PINS),
    has: [...planetHas(spec)],
  };
}

// ---------- A planet in an address ----------
// A preview is kept nowhere: the spec travels in the address of the preview page, after the #
// (never sent to a server), squeezed (deflate) and written in base64url. A 64 KB spec is a few
// KB this way. The Planets connector packs it (preview_planet); the world unpacks it and checks
// it again before drawing anything.
export const PREVIEW_PAGE = 'https://stevenpisani.com/p/preview/';

const squeeze = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

/** The spec as the text after the # of the preview page. */
export async function packPlanet(spec) {
  const bytes = await squeeze(new TextEncoder().encode(JSON.stringify(spec)), new CompressionStream('deflate-raw'));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The spec back from packPlanet's text, or null if it isn't one (checkPlanet says whether it's a good one). */
export async function unpackPlanet(text) {
  try {
    if (!text || text.length > LIMITS.bytes * 2) return null;
    const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = await squeeze(Uint8Array.from(bin, (c) => c.charCodeAt(0)), new DecompressionStream('deflate-raw'));
    if (bytes.length > LIMITS.bytes * 2) return null;
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (e) {
    return null;
  }
}
