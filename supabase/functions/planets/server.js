// The Planets connector (My Tiny Planet, docs/planets.md), without the transport: anyone's ChatGPT
// or Claude designs a little planet for the person it's talking with, from what they love, and
// shows it in the chat. Three tools: get_kit (what a planet can hold, and how to write one),
// preview_planet (checks a spec and shows it in the card: their own planet, assets/js/planets/,
// with the things their AI made for them from simple shapes; none of Steve's places) and send_planet (when they're
// happy with it, saves it for Steve to build: ctx.send, public.planet_requests, capped there).
// Nobody signs in, and a preview stores nothing: its address is the planet (packPlanet). index.ts
// serves it; it's plain JavaScript so tools/planet-test.mjs can run it in Node.
import { checkPlanet, packPlanet, line, PREVIEW_PAGE, LIMITS, SHAPES, FINISHES } from '../_shared/planet.js';

export const SITE = 'https://stevenpisani.com';
export const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
export const SERVER = { name: 'planets', title: 'My Tiny Planet', version: '0.1.0', description: 'Design a little planet of your own, from what you love, and walk around it right in the chat.', websiteUrl: `${SITE}/planets/` };

const INSTRUCTIONS = [
  'My Tiny Planet: design a little walkable planet for the person you are talking with, from what they love, and show it here.',
  'Call get_kit first: it says what a planet can hold and what is drawn today.',
  'Ask a few open questions about them and what they love, and put their answers in the spec in their own words. Nothing on a planet is copied from anyone else\'s, so never suggest a bar, a sign or anything else as a default.',
  'Then build it for them: compose a few things (things) from simple shapes that are unmistakably theirs, from what they told you, in the colours and mood of their world (look.ground, look.sky). Make each one specific and a little delightful, with care for proportion: a thing they love, made big enough to walk up to. Tie each thing to a collection, so tapping it shows what they love in their own words.',
  'Write the spec, then preview_planet. Look at what the preview says, and tell them what you made and that they can walk up to each thing and tap it.',
  'Change it and preview again whenever they ask. A preview stores nothing: its link is the planet, so give them the link to keep.',
  'When they are happy with it and say to send it, send_planet: that is what reaches Steve, who gives it its own address and may add to it by hand. Ask first whether there is anything they would like him to know, and how he can reach them when it is built (only if they want to say). Never send it without their go-ahead.',
  'A planet is public: never put a home address, phone number or anything private in it.',
].join(' ');

// The in-chat card (MCP Apps, SEP-1865, which ChatGPT and Claude both render): one small page whose
// script is the site's (assets/js/mcp-app/planets.js, built to /assets/js/dist/planet-card.js),
// fetched by index.ts and put in the page. The card shows the preview page in a frame, so the
// frame's address (the site) is allowed as well as its script; where 3D can't run, it shows who
// the planet is for and what they love as a plain card, and a link to walk around it in the browser.
export const APP_URI = 'ui://planets/preview.html';
export const APP_MIME = 'text/html;profile=mcp-app';
const showsCard = { ui: { resourceUri: APP_URI }, 'openai/outputTemplate': APP_URI };
export function appResource(script) {
  const js = script ? `<script>${script.replace(/<\/(script)/gi, '<\\/$1')}</script>` : `<script src="${SITE}/assets/js/dist/planet-card.js"></script>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>My Tiny Planet</title></head><body><div id="app"></div>${js}</body></html>`;
  const _meta = {
    ui: { csp: { resourceDomains: [SITE], frameDomains: [SITE] }, prefersBorder: true },
    'openai/widgetCSP': { resource_domains: [SITE], frame_domains: [SITE], connect_domains: [] },
    'openai/widgetDescription': 'Shows the planet just previewed, in 3D where the app can (walk around it), or as a plain card with a link where it can’t. Don’t describe what it shows; say what you changed and what they could tell you next.',
  };
  return { uri: APP_URI, name: 'planet-preview', title: 'My Tiny Planet', mimeType: APP_MIME, html, _meta };
}

// A mistake in the call, said so the model can fix it
export class Invalid extends Error {}
const read = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const sends = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };

// a small planet, as an example of the shape (tools/planet-test.mjs checks it passes)
export const EXAMPLE = {
  version: 1,
  slug: 'sam',
  who: { name: 'Sam' },
  links: [{ id: 'band', label: 'My band', note: 'Live dates and recordings', href: 'https://example.com' }, { id: 'mail', label: 'Write to me', href: 'mailto:sam@example.com' }],
  look: { home: 'Austin', ground: { color: '#5b4a3c', hills: 0.4 }, sky: { color: '#3a5bd0', light: '#ffd8a8' } },
  collections: {
    records: { title: 'Records I love', items: [{ name: 'Kind of Blue', by: 'Miles Davis', year: 1959, why: 'The first record I wore out' }, { name: 'Blue Train', by: 'John Coltrane', year: 1957 }] },
    porch: { title: 'Evenings', items: ['Playing on the porch until the street lights come on', 'Every amp sounds better at 7'] },
  },
  things: [
    {
      id: 'turntable', name: 'The turntable', note: 'Always something spinning.', collection: 'records', at: { bearing: -22, distance: 5 }, scale: 1.5,
      parts: [
        { shape: 'box', size: [1.4, 0.5, 1.1], round: 0.12, color: '#7a4a2a', finish: 'gloss' },
        { shape: 'cylinder', size: [1, 0.04, 1], at: [-0.12, 0.52, 0], color: '#111111', finish: 'gloss', spin: 200 },
        { shape: 'cylinder', size: [0.34, 0.045, 0.34], at: [-0.12, 0.53, 0], color: '#2456c8', finish: 'matte', spin: 200 },
        { shape: 'cylinder', size: [0.12, 0.12, 0.12], at: [0.55, 0.56, -0.38], color: '#cfd3da', finish: 'metal' },
        { shape: 'tube', size: [0.4, 0.1, 0.8], at: [0.42, 0.62, 0], path: [[0.32, 0.4, -0.48], [0.2, 0.5, -0.1], [0.05, 0.3, 0.25], [-0.25, 0, 0.42]], thick: 0.07, color: '#cfd3da', finish: 'metal' },
      ],
    },
    {
      id: 'porch', name: 'The porch', note: 'Where the evenings go.', collection: 'porch', at: { bearing: 30, distance: 10 }, turn: -10,
      light: { color: '#ffcf8a', strength: 0.7, at: [0, 2.6, 0.8] },
      parts: [
        { shape: 'box', size: [4, 0.3, 3], color: '#8a6a4a' },
        { shape: 'cylinder', size: [0.15, 2.6, 0.15], at: [1.8, 1.6, 1.3], color: '#e8e2d6', mirror: true },
        { shape: 'cylinder', size: [0.05, 0.7, 0.05], at: [-1.8, 0.65, 1.35], color: '#e8e2d6', repeat: { count: 9, at: [0.2, 0, 0] } },
        { shape: 'box', size: [1.9, 0.07, 0.09], at: [-0.95, 1.02, 1.35], color: '#e8e2d6' },
        { shape: 'box', size: [4.4, 0.2, 3.4], at: [0, 2.95, 0], color: '#3c4a5a' },
        { shape: 'box', size: [0.7, 0.9, 0.5], at: [0.9, 0.75, -0.6], round: 0.08, color: '#2a2a2a', finish: 'gloss' },
        { shape: 'extrude', size: [0.5, 0.62, 0.1], at: [0.25, 0.65, -0.55], turn: [0, 0, 14], color: '#c8402a', finish: 'gloss', outline: [[0.5, 1], [0.66, 0.96], [0.72, 0.84], [0.66, 0.66], [0.86, 0.56], [1, 0.36], [0.92, 0.12], [0.7, 0], [0.3, 0], [0.08, 0.12], [0, 0.36], [0.14, 0.56], [0.34, 0.66], [0.28, 0.84], [0.34, 0.96]] },
        { shape: 'box', size: [0.07, 0.75, 0.04], at: [0.16, 1.28, -0.55], turn: [0, 0, 14], color: '#5a3a22' },
        { shape: 'sphere', size: [0.35, 0.35, 0.35], at: [0, 2.7, 0.8], color: '#ffcf8a', finish: 'glow' },
        { shape: 'text', text: 'Live at 7', size: [2.6, 0.5, 0.1], at: [0, 3.35, 1.71], color: '#ff9a5c', finish: 'glow' },
      ],
    },
  ],
};

// What a spec holds for someone else's planet. Steve's own planet's parts (places, the robot,
// the telescope, the launch pad) still pass checkPlanet, for his spec, but aren't offered here:
// nothing on a friend's planet is copied from his (Steve, Oct 2026).
const KIT = {
  what: 'A planet is one JSON spec for a small walkable planet at night, 20 m across the middle (about 126 m round), made for its person from what they love. Only the planet\'s size is shared; nothing on it is copied from anyone else\'s. You build what stands on it (things) from simple shapes, and choose its ground and sky. You land on top, looking ahead; tap or click to walk, drag to look, tap a thing to walk up to it and see what it holds.',
  drawn_today: [
    'who.name: the top bar',
    'look.home: the top bar ("A tiny planet in Austin"); a city, never an address',
    'look.ground: { color, hills 0..1 }: the ground\'s colour (a rock, sand, grass, snow… colour) and how hilly it is; slug shapes the hills, so no two are the same',
    'look.sky: { color, light }: the colour the nebula takes on, and the colour of the starlight on everything',
    'things: what stands on the planet, each made of parts; tapping one shows its name, note and collection',
  ],
  things: {
    how: 'Each thing is one object made of up to 40 parts. Place it with at: { bearing, distance }: bearing in degrees from straight ahead where you land (-180..180, + is to the right), distance in metres along the ground (2..60): the planet is so small that the horizon is about 6 m away, so 3..10 is in full view from where you land, and further things rise over the horizon as you walk toward them (63 is the far side). It stands upright and faces where you land; turn (degrees) turns it. scale (0.25..4) scales the whole thing. solid: false lets you walk through it.',
    parts: `Each part: shape (${SHAPES.join(', ')}), size [width, height, depth] in metres, at [x, y, z] its centre in metres from the thing\'s foot (x to its right, y up, z toward you; default: standing on the ground at the foot), turn [x, y, z] in degrees, color "#rrggbb", finish (${FINISHES.join(', ')}; glow is lit from inside), spin (degrees a second, about its own up). A text part is a flat panel of their words (text), facing you, as wide as size[0] at most and size[1] tall. Beyond the simple shapes, for real silhouettes: box with round 0..0.5 rounds its edges (a share of its smallest side); lathe turns a side profile round its up, profile [[out, up], ...] each 0..1 of its size, bottom to top, out 1 at the widest (a vase, a bottle, a bun, a lamp shade); extrude gives a flat outline depth, outline [[across, up], ...] each 0..1 of its size, going round (a guitar body, a heart, a leaf, a cactus, a state's shape); tube runs along a smooth path, path [[x, y, z], ...] each -0.5..0.5 of its size, thick its thickness in metres (a handle, a cable, a tonearm, a rail). Any part can repeat: { count 2..${LIMITS.repeat}, at [x, y, z] the step, turn [x, y, z] degrees a step about the foot } (piano keys, fence posts, petals round a stem), and mirror: true copies it to the other side, x for -x (a pair of wheels, wings, ears). Each copy counts as a part.`,
    light: 'light: { color, strength 0..1, at [x, y, z] }: the thing casts warm or coloured light round it, at most 8 lit things a planet.',
    craft: 'A person is 1.7 m tall; make what they love big enough to read from 10 m (a record player can be a metre wide). Several things spread round the planet, a few close by, and something worth walking to further off. Model the silhouette first, then the details that make it theirs: a guitar is an extruded body and a box neck, a coffee cup a lathe with a tube handle, a bike two tori and tubes. Round the edges of boxes that aren\'t meant to be sharp. Use glow and lights for warmth against the night.',
  },
  shape: {
    version: 1,
    slug: 'a-z, 0-9 and -, 2 to 32 characters: the planet\'s name in its address',
    who: { name: `required, ${LIMITS.name} characters at most` },
    links: `up to ${LIMITS.links}: [{ id, label, note, href }]; id is a short id (a-z, 0-9, -)`,
    look: { home: 'a city', ground: { color: '#rrggbb', hills: '0..1' }, sky: { color: '#rrggbb', light: '#rrggbb' } },
    collections: `up to ${LIMITS.collections}: { <id>: { title, items: [text, or small objects with a name] } }`,
    things: `up to ${LIMITS.things}: [{ id, name, note, collection, at: { bearing, distance }, turn, scale, solid, parts: [...], light }], ${LIMITS.allParts} parts in all`,
  },
  sending: 'When they have seen the preview and say to send it, send_planet: it reaches Steve, who gives it its own address and may add to it by hand. A preview alone is never sent.',
  limits: LIMITS,
  example: EXAMPLE,
};

export const TOOLS = [
  {
    name: 'get_kit',
    title: 'What a planet can hold',
    description: 'What a tiny planet spec can hold, what is drawn from it today, the limits, and a small example. Call it before writing a spec.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: read,
    _meta: { 'openai/toolInvocation/invoking': 'Opening the kit…', 'openai/toolInvocation/invoked': 'Kit open' },
  },
  {
    name: 'preview_planet',
    title: 'Preview a planet',
    description: 'Checks a planet spec and shows it in the chat: the planet in 3D where the app can, else a plain card and a link. Returns the preview link, which is the planet itself (nothing is stored). If the spec has mistakes, says each one (where: what) so you can fix them and try again.',
    inputSchema: { type: 'object', properties: { spec: { type: 'object', description: 'The planet spec (get_kit says what goes in one).' } }, required: ['spec'], additionalProperties: false },
    annotations: read,
    _meta: { ...showsCard, 'openai/toolInvocation/invoking': 'Building the planet…', 'openai/toolInvocation/invoked': 'Planet ready' },
  },
  {
    name: 'send_planet',
    title: 'Send a planet to be built',
    description: 'Sends the planet to Steve Pisani, who builds each one by hand from its spec. Only when the person has seen the preview and says to send it. Saves the spec, their note and how to reach them (both optional, in their words); it will be at its own address when it is built.',
    inputSchema: {
      type: 'object',
      properties: {
        spec: { type: 'object', description: 'The planet spec, as last previewed.' },
        note: { type: 'string', maxLength: 1000, description: 'Anything they would like Steve to know, in their own words (optional).' },
        contact: { type: 'string', maxLength: 200, description: 'How Steve can reach them when it is built, only if they gave it (optional).' },
      },
      required: ['spec'],
      additionalProperties: false,
    },
    annotations: sends,
    _meta: { 'openai/toolInvocation/invoking': 'Sending the planet…', 'openai/toolInvocation/invoked': 'Planet sent' },
  },
];

// where a planet will be once it's built
export const planetPage = (slug) => `${SITE}/p/${slug}/`;

async function call(name, args, ctx) {
  if (name === 'get_kit') return { text: JSON.stringify(KIT), data: KIT };
  const spec = args.spec;
  const errors = checkPlanet(spec);
  if (errors.length) throw new Invalid(`That spec has ${errors.length === 1 ? 'a mistake' : `${errors.length} mistakes`}; fix ${errors.length === 1 ? 'it' : 'them'} and preview again:\n${errors.slice(0, 30).join('\n')}`);
  if (name === 'send_planet') {
    const text = (v, max, what) => {
      if (v == null || v === '') return null;
      if (typeof v !== 'string' || v.length > max) throw new Invalid(`${what} should be text, ${max} characters at most.`);
      return v.trim() || null;
    };
    const note = text(args.note, 1000, 'note'), contact = text(args.contact, 200, 'contact');
    if (!ctx.send) throw new Error('send_planet: no store');
    const id = await ctx.send({ spec, note, contact });
    if (!id) return { text: "Steve has as many planets waiting to be built as he can take right now, so this one wasn't sent. Keep the preview link; try again in a day or two.", data: { sent: false } };
    const page = planetPage(spec.slug);
    if (spec.slug.startsWith('test-')) return { text: `Saved as a test (its slug starts with test-): Steve isn't told, it's never built, and it's deleted after a day.`, data: { sent: true, test: true, page } };
    return {
      text: `Sent. Steve builds each planet by hand, so it isn't there yet; when it's built it will be at ${page}. Until then the preview link is the planet as it stands.`,
      data: { sent: true, page },
    };
  }
  // preview_planet
  const url = `${PREVIEW_PAGE}#${await packPlanet(spec)}`;
  // what the plain card shows: who it's for, their links, and a little of what they love
  const loves = Object.values(spec.collections || {}).filter((c) => Array.isArray(c.items)).slice(0, 4).map((c) => ({ title: c.title, items: c.items.slice(0, 6).map(line).filter(Boolean) }));
  const planet = { name: spec.who.name, home: spec.look?.home || null, links: (spec.links || []).map(({ label, note, href }) => ({ label, note, href })), loves };
  return {
    text: `${spec.who.name}'s planet is ready to walk around${(spec.things || []).length ? `, with ${spec.things.map((t) => t.name).join(', ')} on it` : ', bare for now: add things to it (get_kit, things) from what they love'}. It's shown in the card; to keep it or share it, here's its link (the link is the planet, nothing is stored): ${url}`,
    data: { view: 'planet', url, planet },
  };
}

/** Answers one JSON-RPC message (or null for a notification). */
export async function rpc(msg, ctx = {}) {
  const ok = (result) => ({ jsonrpc: '2.0', id: msg.id, result });
  const fail = (code, message) => ({ jsonrpc: '2.0', id: msg?.id ?? null, error: { code, message } });
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return fail(-32600, 'Not a JSON-RPC request.');
  if (msg.id === undefined) return null; // notifications: nothing to say
  switch (msg.method) {
    case 'initialize': {
      const asked = msg.params?.protocolVersion;
      return ok({ protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0], capabilities: { tools: { listChanged: false }, resources: { listChanged: false } }, serverInfo: SERVER, instructions: INSTRUCTIONS });
    }
    case 'ping': return ok({});
    case 'tools/list': return ok({ tools: TOOLS });
    case 'resources/list': { const { html, _meta, ...r } = appResource(); return ok({ resources: [r] }); }
    case 'resources/templates/list': return ok({ resourceTemplates: [] });
    case 'resources/read': {
      if (msg.params?.uri !== APP_URI) return fail(-32002, `No resource ${msg.params?.uri}.`);
      const r = appResource(await ctx.cardScript?.().catch(() => null));
      return ok({ contents: [{ uri: r.uri, mimeType: r.mimeType, text: r.html, _meta: r._meta }] });
    }
    case 'tools/call': {
      const { name, arguments: args } = msg.params || {};
      if (!TOOLS.some((t) => t.name === name)) return fail(-32602, `There's no tool called ${name}.`);
      try {
        const { text, data } = await call(name, args || {}, ctx);
        return ok({ content: [{ type: 'text', text }], structuredContent: data });
      } catch (e) {
        if (!(e instanceof Invalid)) console.error(e);
        return ok({ content: [{ type: 'text', text: e instanceof Invalid ? e.message : "That didn't work; try again." }], isError: true });
      }
    }
    default: return fail(-32601, `No method ${msg.method}.`);
  }
}
