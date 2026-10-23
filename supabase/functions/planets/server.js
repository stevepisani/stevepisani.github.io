// The Planets connector (My Tiny Planet, docs/planets.md), without the transport: anyone's ChatGPT
// or Claude designs a little planet for the person it's talking with, from what they love, and
// shows it in the chat. Two tools: get_kit (what a planet can hold, and how to write one) and
// preview_planet (checks a spec and shows it, drawn by the homepage's own world, in the card).
// Nothing is stored and nobody signs in: a preview's address is the planet (packPlanet). index.ts
// serves it; it's plain JavaScript so tools/planet-test.mjs can run it in Node.
import { checkPlanet, packPlanet, planetParts, PREVIEW_PAGE, THEMES, PLACES, DISPLAYS, SIGHTS, LIMITS } from '../_shared/planet.js';

export const SITE = 'https://stevenpisani.com';
export const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
export const SERVER = { name: 'planets', title: 'My Tiny Planet', version: '0.1.0', description: 'Design a little planet of your own, from what you love, and walk around it right in the chat.', websiteUrl: SITE };

const INSTRUCTIONS = [
  'My Tiny Planet: design a little walkable planet for the person you are talking with, from what they love, and show it here.',
  'Call get_kit first: it says what a planet can hold and what is drawn today.',
  'Ask a few short questions (their name, what to call the place on the sign, what they love, a few links), write the spec, then preview_planet.',
  'Change it and preview again whenever they ask. Nothing is stored: the preview link is the planet, so give them the link to keep.',
  'A planet is public: never put a home address, phone number or anything private in it.',
].join(' ');

// The in-chat card (MCP Apps, SEP-1865, which ChatGPT and Claude both render): one small page whose
// script is the site's (assets/js/mcp-app/planets.js, built to /assets/js/dist/planet-card.js),
// fetched by index.ts and put in the page. The card shows the preview page in a frame, so the
// frame's address (the site) is allowed as well as its script; where 3D can't run (a phone's app),
// it shows the planet's parts as a plain card and a link to walk around it in the browser.
export const APP_URI = 'ui://planets/preview.html';
export const APP_MIME = 'text/html;profile=mcp-app';
const showsCard = { ui: { resourceUri: APP_URI }, 'openai/outputTemplate': APP_URI };
export function appResource(script) {
  const js = script ? `<script>${script.replace(/<\/(script)/gi, '<\\/$1')}</script>` : `<script src="${SITE}/assets/js/dist/planet-card.js"></script>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>My Tiny Planet</title></head><body><div id="app"></div>${js}</body></html>`;
  const _meta = {
    ui: { csp: { resourceDomains: [SITE], frameDomains: [SITE] }, prefersBorder: true },
    'openai/widgetCSP': { resource_domains: [SITE], frame_domains: [SITE], connect_domains: [] },
    'openai/widgetDescription': 'Shows the planet just previewed, in 3D where the app can (walk around it, sit at the bar, read the chalkboard), or as a plain card with a link where it can’t. Don’t describe what it shows; say what you changed and what they could add.',
  };
  return { uri: APP_URI, name: 'planet-preview', title: 'My Tiny Planet', mimeType: APP_MIME, html, _meta };
}

// A mistake in the call, said so the model can fix it
export class Invalid extends Error {}
const read = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

// a small planet, as an example of the shape (tools/planet-test.mjs checks it passes)
export const EXAMPLE = {
  version: 1,
  slug: 'sam',
  who: { name: 'Sam', sign: "Sam's" },
  links: [{ id: 'band', label: 'My band', note: 'Live dates and recordings', href: 'https://example.com' }, { id: 'mail', label: 'Write to me', href: 'mailto:sam@example.com' }],
  look: { theme: 'tiki-night', home: 'Austin' },
  collections: {
    records: { title: 'Records I love', items: [{ name: 'Kind of Blue', by: 'Miles Davis', year: 1959 }, { name: 'Blue Train', by: 'John Coltrane', year: 1957 }] },
    campfire: { title: 'By the fire', items: ['The best songs are written on the porch.', 'Every amp sounds better at 7.'] },
  },
  places: [
    { id: 'bar', kind: 'tiki-bar', displays: [{ kind: 'chalkboard', collection: 'records' }] },
    { id: 'fire', kind: 'campfire', collection: 'campfire' },
  ],
  robot: { lines: ['Welcome in. Pull up a stool.', 'Ask me about the records on the board.'], ask: ['What are you playing?'] },
  telescope: { engraving: 'Sam' },
};

const KIT = {
  what: 'A planet is one JSON spec. A small walkable planet at night: a tiki bar with a neon sign, a robot behind the bar, a chalkboard, a campfire, a telescope and a rocket. The person lands, walks over, sits at the bar and picks from the menu.',
  drawn_today: [
    'who.sign: the neon sign over the bar, the menu card, the telescope (12 characters at most; their name with an apostrophe-s reads best)',
    'who.name: the top bar, and lines that name them',
    'look.home: the top bar ("A tiny planet in Austin"); a city, never an address',
    'links: the menu and the top bar (label, a one-line note, an https:// or mailto: link)',
    'a tiki-bar place\'s chalkboard display: up to six names chalked behind the bar; tapping one shows its details (an object\'s other fields)',
    'a campfire place\'s collection: one thought each time they eat a toasted marshmallow',
    'robot.lines: what the bartender robot says while they sit',
  ],
  kept_for_later: 'Everything else in a valid spec (star-sky displays, the hammock, telescope pins and sights, the launch pad) is checked and kept, and drawn as the planet grows. The rest of the planet is Steve Pisani\'s for now: it is his planet\'s engine.',
  shape: {
    version: 1,
    slug: 'a-z, 0-9 and -, 2 to 32 characters: the planet\'s name in its address',
    who: { name: `required, ${LIMITS.name} characters at most`, sign: `${LIMITS.sign} characters at most` },
    links: `up to ${LIMITS.links}: [{ id, label, note, href }]; id is a short id (a-z, 0-9, -)`,
    look: { theme: THEMES, home: 'a city' },
    collections: `up to ${LIMITS.collections}: { <id>: { title, items: [text, or small objects with a name] } }`,
    places: `up to ${LIMITS.places}: [{ id, kind: one of ${PLACES.join(', ')}, displays: [{ kind: one of ${DISPLAYS.join(', ')}, collection: <id> }], collection: <id> }]`,
    robot: { lines: `up to ${LIMITS.lines}`, ask: `up to ${LIMITS.lines} questions` },
    telescope: { engraving: `${LIMITS.sign} characters at most`, pins: `up to ${LIMITS.pins}: [{ city, note, home }]`, sights: SIGHTS },
    launchPad: { countdowns: `up to ${LIMITS.countdowns}: [{ name, on: YYYY-MM-DD }]`, launches: '"all", "none" or { provider }', rocket: { name: 'short', colors: ['#rrggbb', '#rrggbb'] } },
  },
  limits: LIMITS,
  example: EXAMPLE,
};

export const TOOLS = [
  {
    name: 'get_kit',
    title: 'What a planet can hold',
    description: 'What a tiny planet spec can hold, what the world draws from it today, the limits, and a small example. Call it before writing a spec.',
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
];

async function call(name, args) {
  if (name === 'get_kit') return { text: JSON.stringify(KIT), data: KIT };
  // preview_planet
  const spec = args.spec;
  const errors = checkPlanet(spec);
  if (errors.length) throw new Invalid(`That spec has ${errors.length === 1 ? 'a mistake' : `${errors.length} mistakes`}; fix ${errors.length === 1 ? 'it' : 'them'} and preview again:\n${errors.slice(0, 30).join('\n')}`);
  const url = `${PREVIEW_PAGE}#${await packPlanet(spec)}`;
  const p = planetParts(spec);
  const planet = { name: p.name, sign: p.sign, home: spec.look?.home || null, links: (spec.links || []).map(({ label, note, href }) => ({ label, note, href })), board: { title: p.board.title, names: p.board.items.slice(0, 6).map((x) => x.name) }, thoughts: p.thoughts.slice(0, 6), robot: p.robot.lines[0] };
  return {
    text: `${p.sign} is ready. It's shown in the card; to keep it or share it, here's its link (the link is the planet, nothing is stored): ${url}`,
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
        const { text, data } = await call(name, args || {});
        return ok({ content: [{ type: 'text', text }], structuredContent: data });
      } catch (e) {
        if (!(e instanceof Invalid)) console.error(e);
        return ok({ content: [{ type: 'text', text: e instanceof Invalid ? e.message : "That didn't work; try again." }], isError: true });
      }
    }
    default: return fail(-32601, `No method ${msg.method}.`);
  }
}
