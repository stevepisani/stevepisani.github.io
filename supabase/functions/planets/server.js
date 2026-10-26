// The Planets connector (My Tiny Planet, docs/planets.md), without the transport: anyone's ChatGPT
// or Claude designs a little planet for the person it's talking with, from what they love, and
// shows it in the chat. Two tools: get_kit (what a planet can hold, and how to write one) and
// preview_planet (checks a spec and shows it in the card: their own planet, assets/js/planets/,
// bare until it's built for them by hand; none of Steve's places).
// Nothing is stored and nobody signs in: a preview's address is the planet (packPlanet). index.ts
// serves it; it's plain JavaScript so tools/planet-test.mjs can run it in Node.
import { checkPlanet, packPlanet, line, PREVIEW_PAGE, LIMITS } from '../_shared/planet.js';

export const SITE = 'https://stevenpisani.com';
export const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
export const SERVER = { name: 'planets', title: 'My Tiny Planet', version: '0.1.0', description: 'Design a little planet of your own, from what you love, and walk around it right in the chat.', websiteUrl: `${SITE}/planets/` };

const INSTRUCTIONS = [
  'My Tiny Planet: design a little walkable planet for the person you are talking with, from what they love, and show it here.',
  'Call get_kit first: it says what a planet can hold and what is drawn today.',
  'Ask a few open questions about them and what they love, and put their answers in the spec in their own words. Every planet is built for its person by hand, from those answers: nothing on it is copied from anyone else\'s, so never suggest a bar, a sign or anything else as a default.',
  'Until it is built, the preview shows their planet bare: their own ground under the stars, with their name. Say so plainly.',
  'Write the spec, then preview_planet.',
  'Change it and preview again whenever they ask. Nothing is stored: the preview link is the planet, so give them the link to keep.',
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

// a small planet, as an example of the shape (tools/planet-test.mjs checks it passes)
export const EXAMPLE = {
  version: 1,
  slug: 'sam',
  who: { name: 'Sam' },
  links: [{ id: 'band', label: 'My band', note: 'Live dates and recordings', href: 'https://example.com' }, { id: 'mail', label: 'Write to me', href: 'mailto:sam@example.com' }],
  look: { home: 'Austin' },
  collections: {
    records: { title: 'Records I love', items: [{ name: 'Kind of Blue', by: 'Miles Davis', year: 1959, why: 'The first record I wore out' }, { name: 'Blue Train', by: 'John Coltrane', year: 1957 }] },
    porch: { title: 'Evenings', items: ['Playing on the porch until the street lights come on', 'Every amp sounds better at 7'] },
  },
};

// What a spec holds for someone else's planet. Steve's own planet's parts (places, the robot,
// the telescope, the launch pad) still pass checkPlanet, for his spec, but aren't offered here:
// nothing on a friend's planet is copied from his (Steve, Oct 2026).
const KIT = {
  what: 'A planet is one JSON spec for a small walkable planet at night, built by hand for its person from what they love (Steve Pisani builds the first ones himself). Only the planet\'s size is shared; nothing on it is copied from anyone else\'s. Until it\'s built, a preview shows it bare: their own ground and stones under the stars, their name and home city, walkable. The spec is where what they love goes, in their own words, so their planet can be built from it.',
  drawn_today: [
    'who.name: the top bar',
    'look.home: the top bar ("A tiny planet in Austin"); a city, never an address',
    'slug: the planet\'s own hills (no two are the same shape)',
  ],
  kept_for_building: 'collections (what they love: lists of things, each text or a small object with a name and any details, like why it matters) and links (their own pages: https:// or mailto:). Kept in the spec and shown on the chat card; their planet is built from them.',
  shape: {
    version: 1,
    slug: 'a-z, 0-9 and -, 2 to 32 characters: the planet\'s name in its address',
    who: { name: `required, ${LIMITS.name} characters at most` },
    links: `up to ${LIMITS.links}: [{ id, label, note, href }]; id is a short id (a-z, 0-9, -)`,
    look: { home: 'a city' },
    collections: `up to ${LIMITS.collections}: { <id>: { title, items: [text, or small objects with a name] } }`,
  },
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
];

async function call(name, args) {
  if (name === 'get_kit') return { text: JSON.stringify(KIT), data: KIT };
  // preview_planet
  const spec = args.spec;
  const errors = checkPlanet(spec);
  if (errors.length) throw new Invalid(`That spec has ${errors.length === 1 ? 'a mistake' : `${errors.length} mistakes`}; fix ${errors.length === 1 ? 'it' : 'them'} and preview again:\n${errors.slice(0, 30).join('\n')}`);
  const url = `${PREVIEW_PAGE}#${await packPlanet(spec)}`;
  // what the plain card shows: who it's for, their links, and a little of what they love
  const loves = Object.values(spec.collections || {}).filter((c) => Array.isArray(c.items)).slice(0, 4).map((c) => ({ title: c.title, items: c.items.slice(0, 6).map(line).filter(Boolean) }));
  const planet = { name: spec.who.name, home: spec.look?.home || null, links: (spec.links || []).map(({ label, note, href }) => ({ label, note, href })), loves };
  return {
    text: `${spec.who.name}'s planet is ready to walk around, bare for now: it gets built by hand from what they love. It's shown in the card; to keep it or share it, here's its link (the link is the planet, nothing is stored): ${url}`,
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
