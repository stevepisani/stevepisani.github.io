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
//     look: { theme, home },               theme from THEMES; home: a city, never an address
//     collections: { <id>: { title, items: [...] } | { title, src } },
//                                          what matters to them: plain lists (items: text, or
//                                          small objects), or a site path that serves the list
//     places: [{ id, kind, displays: [{ kind, collection }], collection }],
//                                          what's built on the planet (PLACES), and how each
//                                          shows its collections (DISPLAYS)
//     robot: { lines, ask },               what the hub's robot says, and what to ask it
//     telescope: { engraving, pins: [{ city, note, home }], sights: [...] },
//     launchPad: { countdowns: [{ name, on }], launches, rocket: { name, colors } },
//   }
//
// Everything but version, slug and who is optional; the world fills in a default. Every list and
// every piece of text has a cap (LIMITS), so a spec is small and nothing on a planet runs long.

export const THEMES = ['tiki-night'];
export const PLACES = ['tiki-bar', 'campfire', 'hammock'];
export const DISPLAYS = ['chalkboard', 'star-sky'];
export const SIGHTS = ['moon', 'sun', 'earth'];

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
};

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])$/;
const ID = /^[a-z][a-z0-9-]{0,31}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const COLOR = /^#[0-9a-f]{6}$/i;

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
  only('spec', spec, ['version', 'slug', 'who', 'links', 'look', 'collections', 'places', 'robot', 'telescope', 'launchPad']);
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
      only('look', spec.look, ['theme', 'home']);
      if (spec.look.theme !== undefined && !THEMES.includes(spec.look.theme)) fail('look.theme', `should be one of ${THEMES.join(', ')}`);
      text('look.home', spec.look.home, LIMITS.name);
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
        only(at, p, ['city', 'note', 'home']);
        text(`${at}.city`, p.city, LIMITS.name, true);
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
// an item in a collection as one line: text as it is; an object by its name or title, or its first text
const line = (x) => {
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
