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
//     things: [{ id, name, note, collection, at: { bearing, distance }, turn, scale, solid, model,
//                parts: [{ shape, size, at, turn, color, finish, spin, text, round, profile,
//                          outline, path, thick, repeat, mirror }], light }],
//                                          what stands on someone else's planet, composed by
//                                          their own AI from simple shapes (SHAPES, FINISHES),
//                                          in metres, placed from where you land; model: the
//                                          thing in words, for a real 3D model (Meshy) that
//                                          takes the parts' place once it's made
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
// what a thing on someone else's planet is made of: shapes, each a size in metres, a colour and a
// finish. `text` is a flat panel with their own words on it; `lathe` turns a side profile round its
// up (a vase, a bottle, a bun), `extrude` gives a flat outline depth (a guitar, a heart, a cactus),
// and `tube` runs along a path (a handle, a cable, a rail). A part can be repeated in steps (the
// keys of a piano, petals round a stem) and mirrored left to right (a pair of wings).
export const SHAPES = ['box', 'sphere', 'cylinder', 'cone', 'torus', 'capsule', 'text', 'lathe', 'extrude', 'tube'];
export const FINISHES = ['matte', 'gloss', 'metal', 'glass', 'glow'];
// where a thing can stand beside another (near): in front of it (the side it faces), behind it,
// or to its left or right as it faces
export const SIDES = ['front', 'back', 'left', 'right'];

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
  points: 32, // in a lathe's profile or an extrude's outline
  path: 16, // in a tube's path
  repeat: 24, // copies of a part made by repeat
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
  // a list of [x, y] or [x, y, z] points, each number from lo to hi
  const points = (at, v, n, lo, hi, least, most) => {
    if (v === undefined) return fail(at, 'missing');
    if (!Array.isArray(v) || v.length < least || v.length > most || !v.every((q) => Array.isArray(q) && q.length === n && q.every((x) => typeof x === 'number' && x >= lo && x <= hi))) {
      fail(at, `should be ${least} to ${most} points, each [${n === 2 ? 'x, y' : 'x, y, z'}] from ${lo} to ${hi}`);
    }
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
    only(at, t, ['id', 'name', 'note', 'collection', 'at', 'near', 'turn', 'scale', 'solid', 'model', 'parts', 'light']);
    if (id(`${at}.id`, t.id) && thingIds.has(t.id)) fail(`${at}.id`, `"${t.id}" is used twice`);
    thingIds.add(t.id);
    text(`${at}.name`, t.name, LIMITS.name, true);
    text(`${at}.note`, t.note, LIMITS.text);
    text(`${at}.model`, t.model, LIMITS.text);
    known(`${at}.collection`, t.collection);
    // placed from where you land (at), or beside another thing placed before it (near)
    if ((t.at === undefined) === (t.near === undefined)) fail(`${at}.at`, 'should have at: { bearing, distance }, or near: { of, side, gap }, not both');
    else if (t.at !== undefined) {
      if (!isObj(t.at)) fail(`${at}.at`, 'should be { bearing, distance }');
      else {
        only(`${at}.at`, t.at, ['bearing', 'distance']);
        if (t.at.bearing === undefined) fail(`${at}.at.bearing`, 'missing');
        between(`${at}.at.bearing`, t.at.bearing, -180, 180);
        if (t.at.distance === undefined) fail(`${at}.at.distance`, 'missing');
        between(`${at}.at.distance`, t.at.distance, 2, 60);
      }
    } else if (!isObj(t.near)) fail(`${at}.near`, 'should be { of, side, gap }');
    else {
      only(`${at}.near`, t.near, ['of', 'side', 'gap']);
      if (!thingIds.has(t.near.of) || t.near.of === t.id) fail(`${at}.near.of`, 'should be the id of a thing listed before this one');
      if (!SIDES.includes(t.near.side)) fail(`${at}.near.side`, `should be one of ${SIDES.join(', ')}`);
      between(`${at}.near.gap`, t.near.gap, 0, 10);
    }
    between(`${at}.turn`, t.turn, -180, 180);
    between(`${at}.scale`, t.scale, 0.25, 4);
    if (t.solid !== undefined && typeof t.solid !== 'boolean') fail(`${at}.solid`, 'should be true or false');
    const ps = list(`${at}.parts`, t.parts, LIMITS.parts);
    if (!ps.length) fail(`${at}.parts`, 'should have at least one part');
    ps.forEach((p, j) => {
      const pat = `${at}.parts[${j}]`;
      if (!isObj(p)) return fail(pat, 'should be an object');
      only(pat, p, ['shape', 'size', 'at', 'turn', 'color', 'finish', 'spin', 'text', 'round', 'profile', 'outline', 'path', 'thick', 'repeat', 'mirror']);
      // a repeated or mirrored part counts once for each copy it makes
      const copies = (isObj(p.repeat) && Number.isInteger(p.repeat.count) ? p.repeat.count : 1) * (p.mirror === true ? 2 : 1);
      parts += copies;
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
      // each shape's own keys, and only on that shape
      const own = { round: 'box', profile: 'lathe', outline: 'extrude', path: 'tube', thick: 'tube' };
      for (const [k, shape] of Object.entries(own)) if (p[k] !== undefined && p.shape !== shape) fail(`${pat}.${k}`, `only a ${shape} part has ${k}`);
      between(`${pat}.round`, p.round, 0, 0.5);
      if (p.shape === 'lathe') points(`${pat}.profile`, p.profile, 2, 0, 1, 2, LIMITS.points);
      if (p.shape === 'extrude') points(`${pat}.outline`, p.outline, 2, 0, 1, 3, LIMITS.points);
      if (p.shape === 'tube') { points(`${pat}.path`, p.path, 3, -0.5, 0.5, 2, LIMITS.path); between(`${pat}.thick`, p.thick, 0.005, 2); }
      if (p.repeat !== undefined) {
        if (!isObj(p.repeat)) fail(`${pat}.repeat`, 'should be { count, at, turn }');
        else {
          only(`${pat}.repeat`, p.repeat, ['count', 'at', 'turn']);
          if (!Number.isInteger(p.repeat.count) || p.repeat.count < 2 || p.repeat.count > LIMITS.repeat) fail(`${pat}.repeat.count`, `should be a whole number from 2 to ${LIMITS.repeat}`);
          triple(`${pat}.repeat.at`, p.repeat.at, -LIMITS.size, LIMITS.size);
          triple(`${pat}.repeat.turn`, p.repeat.turn, -360, 360);
        }
      }
      if (p.mirror !== undefined && typeof p.mirror !== 'boolean') fail(`${pat}.mirror`, 'should be true or false');
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

// ---------- Looking it over ----------
// What a careful eye would say about a planet's things before anyone walks round it: a part
// hanging in the air, two things in each other, something too small to see or too long for a
// planet this round, a planet with nothing lit. Boxes are measured as if nothing were turned, so
// these are things to look at, not errors; the preview tells the AI who made it (preview_planet).
const GROUND_RADIUS = 20; // world/planet.js RADIUS: the ground's distance from the middle, in metres

/** Notes on a spec that passed checkPlanet, each "where: what", for its maker to look at. */
// each part's box in metres from its thing's foot: [x0, x1, y0, y1, z0, z1], copies included
function partBoxes(t) {
  return (t.parts || []).map((p) => {
    // a turned part is measured as if it could face any way: turned about its up, its longest side
    // either way along the ground; tipped over, its longest side every way
    const [x, y, z] = p.size, [tx, ty, tz] = (p.turn || [0, 0, 0]).map((a) => a % 180 !== 0), s = t.scale || 1;
    const [w, h, d] = tx || tz ? Array(3).fill(Math.max(x, y, z)) : ty ? [Math.max(x, z), y, Math.max(x, z)] : p.size;
    const at = p.at || [0, h / 2, 0];
    const n = p.repeat ? p.repeat.count : 1, step = (p.repeat && p.repeat.at) || [0, 0, 0];
    const xs = [], ys = [], zs = [];
    for (let i = 0; i < n; i += Math.max(1, n - 1)) {
      for (const m of p.mirror ? [1, -1] : [1]) {
        const x = (at[0] + step[0] * i) * m, y = at[1] + step[1] * i, z = at[2] + step[2] * i;
        xs.push(x - w / 2, x + w / 2); ys.push(y - h / 2, y + h / 2); zs.push(z - d / 2, z + d / 2);
      }
    }
    return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys), Math.min(...zs), Math.max(...zs)].map((v) => v * s);
  });
}
const boxOf = (bs) => [Math.min(...bs.map((b) => b[0])), Math.max(...bs.map((b) => b[1])), Math.min(...bs.map((b) => b[2])), Math.max(...bs.map((b) => b[3])), Math.min(...bs.map((b) => b[4])), Math.max(...bs.map((b) => b[5]))];

/** How far a thing reaches from its foot along the ground, in metres. */
export function thingReach(t) {
  const bs = partBoxes(t);
  if (!bs.length) return 0;
  const all = boxOf(bs);
  return Math.max(Math.abs(all[0]), Math.abs(all[1]), Math.abs(all[4]), Math.abs(all[5]));
}

/**
 * Where each thing stands: { bearing, distance, turn } by id, from where you land. A thing placed
 * with at stands there; one placed near another stands on that side of it, clear of it by gap
 * (half a metre unless said), facing it, then turned by its own turn. Worked out on a flat map of
 * the ground round where you land (x to the right, n ahead), close enough on a planet this size.
 * turn is from facing where you land, as things.js turns them.
 */
export function placeThings(things = []) {
  const placed = new Map(), DEG = Math.PI / 180;
  const rot = ([x, n], a) => [x * Math.cos(a) - n * Math.sin(a), x * Math.sin(a) + n * Math.cos(a)];
  const unit = ([x, n]) => { const l = Math.hypot(x, n) || 1; return [x / l, n / l]; };
  for (const t of things) {
    if (t.at) { placed.set(t.id, { bearing: t.at.bearing, distance: t.at.distance, turn: t.turn || 0 }); continue; }
    const of = placed.get(t.near && t.near.of), anchor = things.find((x) => x.id === (t.near && t.near.of));
    if (!of) continue;
    const p = [of.distance * Math.sin(of.bearing * DEG), of.distance * Math.cos(of.bearing * DEG)];
    // the side it faces: back toward where you land, then its own turn
    const front = rot(unit([-p[0], -p[1]]), of.turn * DEG);
    // left and right are beside it and a little forward, so the anchor never hides them from the path
    const side = { front, back: [-front[0], -front[1]], left: rot(front, Math.PI / 3), right: rot(front, -Math.PI / 3) }[t.near.side];
    const apart = thingReach(anchor) + (t.near.gap ?? 0.5) + thingReach(t);
    const c = [p[0] + side[0] * apart, p[1] + side[1] * apart];
    // facing the thing it's near: the turn from facing where you land to facing it
    const from = unit([-c[0], -c[1]]), to = unit([p[0] - c[0], p[1] - c[1]]);
    const face = Math.atan2(from[0] * to[1] - from[1] * to[0], from[0] * to[0] + from[1] * to[1]) / DEG;
    const turn = ((face + (t.turn || 0) + 540) % 360) - 180;
    placed.set(t.id, { bearing: Math.atan2(c[0], c[1]) / DEG, distance: Math.max(0.5, Math.hypot(c[0], c[1])), turn });
  }
  return placed;
}

export function lookOver(spec) {
  const notes = [];
  const things = spec.things || [];
  const reach = new Map(), placed = placeThings(things);
  const lit = things.some((t) => t.light || (t.parts || []).some((p) => p.finish === 'glow'));
  things.forEach((t, i) => {
    const bs = partBoxes(t);
    if (!bs.length) return;
    const all = boxOf(bs);
    const wide = Math.max(all[1] - all[0], all[5] - all[4]), tall = all[3] - all[2];
    if (wide < 0.4 && tall < 0.4) notes.push(`things[${i}] (${t.name}): under 40 cm all round, hard to see from a few steps away; make it bigger (scale)`);
    // the ground falls away by length² / 8R under something straight: 15 cm at 5 m
    if (wide > 5) notes.push(`things[${i}] (${t.name}): ${wide.toFixed(1)} m long, so on a planet this round its ends lift off the ground; shorten it or stand it on legs`);
    // a part off the ground that touches no other part: it hangs in the air
    const near = (a, b) => a[0] <= b[1] + 0.02 && a[1] >= b[0] - 0.02 && a[2] <= b[3] + 0.02 && a[3] >= b[2] - 0.02 && a[4] <= b[5] + 0.02 && a[5] >= b[4] - 0.02;
    bs.forEach((b, j) => {
      const p = t.parts[j];
      if (p.shape === 'text' || p.finish === 'glow' || b[2] < 0.05) return;
      const held = bs.some((o, k) => k !== j && near(o, b));
      if (!held) notes.push(`things[${i}].parts[${j}] (${p.shape}): touches nothing and hangs ${b[2].toFixed(2)} m above the ground; move it onto another part or the ground (at is its middle)`);
    });
    reach.set(t, thingReach(t));
  });
  // two things in each other: their feet closer than they reach
  const where = (t) => {
    const at = placed.get(t.id);
    if (!at) return null;
    const b = at.bearing * Math.PI / 180, a = at.distance / GROUND_RADIUS;
    return [Math.sin(a) * Math.sin(b), Math.cos(a), -Math.sin(a) * Math.cos(b)];
  };
  for (let i = 0; i < things.length; i++) {
    for (let j = i + 1; j < things.length; j++) {
      const [a, b] = [where(things[i]), where(things[j])];
      if (!a || !b) continue;
      const apart = Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) * GROUND_RADIUS;
      if (apart < (reach.get(things[i]) || 0) + (reach.get(things[j]) || 0) - 0.3) notes.push(`things[${i}] (${things[i].name}) and things[${j}] (${things[j].name}): ${apart.toFixed(1)} m apart, so they stand in each other; move one (its at, or its near's gap)`);
    }
  }
  if (things.length && !lit) notes.push('things: nothing glows and nothing casts light, so the planet is dim at night; give something a light or a glowing part');
  return notes;
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
