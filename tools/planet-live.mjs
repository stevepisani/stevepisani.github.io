// The live Planets connector, end to end, with made-up people (docs/planets.md, "Testing the live
// connector"): what ChatGPT or Claude would do, over the network to the deployed function. It says
// hello, lists the tools, opens the kit and the card's page, previews each made-up planet and walks
// it in headless Chromium (the page a card shows), checks a spec with mistakes comes back to fix,
// and sends each one. Every made-up planet's slug starts with test-, so the send is saved as a
// test: Steve isn't told, and it's deleted a day later. Needs the network to reach
// mcp.stevenpisani.com and stevenpisani.com.
//
//   node tools/planet-live.mjs [--url <connector>] [--shots <dir>] [--no-send] [--site _site]
// --site serves stevenpisani.com from a local build instead, to try this script itself offline
// (with a local connector: tools/planet-test.mjs covers the connector's logic).
import { mkdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { chromium } from './chromium.mjs';

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const URL_ = arg('url', 'https://mcp.stevenpisani.com/planets');
const shots = arg('shots', null);
const send = !process.argv.includes('--no-send');
const site = arg('site', null);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
if (shots) mkdirSync(shots, { recursive: true });

let failed = 0, id = 0;
const ok = (cond, what, detail) => {
  console.log(`  ${cond ? '✓' : '✗'} ${what}${cond || detail === undefined ? '' : `\n    got ${JSON.stringify(detail).slice(0, 600)}`}`);
  if (!cond) failed++;
};
const rpc = async (method, params) => {
  const res = await fetch(URL_, { method: 'POST', headers: { 'content-type': 'application/json', 'mcp-protocol-version': '2025-06-18' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) });
  if (!res.ok) throw new Error(`${method}: HTTP ${res.status}`);
  return res.json();
};
const tool = async (name, args) => (await rpc('tools/call', { name, arguments: args })).result;

// made-up people, each with what they love in their own words
const PEOPLE = [
  {
    version: 1, slug: 'test-ines', who: { name: 'Inês' }, look: { home: 'Lisbon', ground: { color: '#9a6b52', hills: 0.35 }, sky: { color: '#2a6fd6', light: '#ffe2b8' } },
    links: [{ id: 'bakery', label: 'The bakery', note: 'Open from 7', href: 'https://example.com/bakery' }],
    collections: {
      breads: { title: 'What I bake', items: [{ name: 'Pão de Deus', why: 'My grandmother’s, every Sunday' }, 'Broa de milho', 'Sourdough that took me three years'] },
      mornings: { title: 'Mornings', items: ['The tram up the hill at 6', 'Flour on everything'] },
    },
    // what her AI might make her: the oven, the tram up the hill, and her grandmother's bread,
    // modelled as a good AI should (the kit's craft): silhouettes first, then what makes them hers
    things: [
      {
        id: 'oven', name: 'The wood oven', note: 'Lit before the sun is up.', collection: 'breads', at: { bearing: -28, distance: 6 },
        light: { color: '#ff8a3c', strength: 0.9, at: [0, 1, 2.2] },
        parts: [
          { shape: 'box', size: [3.6, 0.5, 3.6], round: 0.1, color: '#b8a48c' },
          { shape: 'lathe', size: [3.2, 2.2, 3.2], at: [0, 1.6, 0], color: '#e9dccb', profile: [[1, 0], [1, 0.15], [0.98, 0.36], [0.92, 0.56], [0.8, 0.74], [0.62, 0.88], [0.38, 0.97], [0, 1]] },
          { shape: 'extrude', size: [1, 0.85, 0.2], at: [0, 0.95, 1.52], color: '#ff7a2a', finish: 'glow', outline: [[0, 0], [1, 0], [1, 0.55], [0.93, 0.78], [0.78, 0.94], [0.5, 1], [0.22, 0.94], [0.07, 0.78], [0, 0.55]] },
          { shape: 'tube', size: [1.2, 1, 0.1], at: [0, 1.02, 1.6], thick: 0.14, color: '#9a4a32', path: [[-0.5, -0.5, 0], [-0.5, 0.1, 0], [-0.3, 0.42, 0], [0, 0.5, 0], [0.3, 0.42, 0], [0.5, 0.1, 0], [0.5, -0.5, 0]] },
          { shape: 'cylinder', size: [0.45, 1.4, 0.45], at: [0.7, 3.1, -0.6], color: '#c9b9a5' },
          { shape: 'cylinder', size: [0.6, 0.1, 0.6], at: [0.7, 3.85, -0.6], color: '#9a8a76' },
          { shape: 'lathe', size: [0.4, 0.22, 0.4], at: [-1.45, 0.61, 1.3], color: '#c98a3c', finish: 'gloss', profile: [[0.9, 0], [1, 0.25], [0.85, 0.65], [0.5, 0.92], [0, 1]], repeat: { count: 3, at: [0, 0, -0.45] } },
          { shape: 'text', text: 'Pão quente', size: [2.4, 0.5, 0.1], at: [0, 3.3, 1.2], color: '#ffd28a', finish: 'glow' },
        ],
      },
      {
        id: 'tram', name: 'Tram 28', note: 'Up the hill at 6.', collection: 'mornings', at: { bearing: 38, distance: 8 }, turn: 80,
        light: { color: '#fff0c8', strength: 0.5, at: [0, 1.6, 0] },
        parts: [
          { shape: 'box', size: [1.7, 1.1, 4.2], at: [0, 0.95, 0], round: 0.15, color: '#f2c230', finish: 'gloss' },
          { shape: 'box', size: [1.66, 0.8, 4.1], at: [0, 1.9, 0], round: 0.15, color: '#f5f1e6', finish: 'gloss' },
          { shape: 'box', size: [1.5, 0.2, 4], at: [0, 2.38, 0], round: 0.3, color: '#d8d3c6' },
          { shape: 'box', size: [0.04, 0.5, 0.55], at: [0.84, 1.92, -1.5], color: '#fff3c4', finish: 'glow', repeat: { count: 5, at: [0, 0, 0.75] }, mirror: true },
          { shape: 'box', size: [1.2, 0.5, 0.04], at: [0, 1.92, 2.06], color: '#fff3c4', finish: 'glow' },
          { shape: 'sphere', size: [0.22, 0.22, 0.1], at: [0, 1.05, 2.11], color: '#fff7d6', finish: 'glow' },
          { shape: 'box', size: [1.6, 0.18, 0.12], at: [0, 0.45, 2.12], round: 0.3, color: '#3a3a3a', finish: 'metal' },
          { shape: 'cylinder', size: [0.6, 0.14, 0.6], at: [0.78, 0.3, 1.2], turn: [0, 0, 90], color: '#222222', finish: 'metal', mirror: true, repeat: { count: 2, at: [0, 0, -2.4] } },
          { shape: 'tube', size: [0.2, 1.6, 2], at: [0, 3.2, -0.6], thick: 0.05, color: '#3a3a3a', finish: 'metal', path: [[0, -0.5, 0.4], [0, 0, -0.05], [0, 0.5, -0.5]] },
          { shape: 'text', text: '28', size: [0.6, 0.45, 0.1], at: [0.5, 1.2, 2.12], color: '#1a1a1a' },
        ],
      },
      {
        id: 'pao', name: 'Pão de Deus', note: 'My grandmother’s, every Sunday.', collection: 'breads', at: { bearing: 4, distance: 4.5 }, scale: 1.4,
        parts: [
          { shape: 'lathe', size: [1.3, 0.7, 1.3], at: [0, 0.35, 0], color: '#c98a3c', finish: 'gloss', profile: [[0.85, 0], [0.97, 0.15], [1, 0.35], [0.92, 0.6], [0.7, 0.82], [0.4, 0.95], [0, 1]] },
          { shape: 'lathe', size: [1, 0.3, 1], at: [0, 0.66, 0], color: '#f4ead2', profile: [[1, 0], [0.85, 0.45], [0.55, 0.8], [0, 1]] },
          { shape: 'sphere', size: [0.06, 0.03, 0.06], at: [0.3, 0.74, 0], color: '#ffffff', repeat: { count: 12, turn: [0, 30, 0] } },
        ],
      },
    ],
  },
  {
    version: 1, slug: 'test-dev', who: { name: 'Dev' }, look: { home: 'Denver', ground: { color: '#8a5544', hills: 0.9 }, sky: { color: '#6a3ab0', light: '#d8e0ff' } },
    collections: {
      climbs: { title: 'Climbs', items: [{ name: 'The Naked Edge', where: 'Eldorado Canyon', year: 2019 }, { name: 'Longs Peak', why: 'First fourteener' }] },
      gear: { title: 'Always in the van', items: ['A stove older than me', 'Two ropes', 'Too many cams'] },
    },
    things: [
      {
        id: 'wall', name: 'The Naked Edge', note: 'Eldorado Canyon, 2019.', collection: 'climbs', at: { bearing: -12, distance: 8 },
        parts: [
          { shape: 'extrude', size: [3.2, 7, 1.6], at: [0, 3.5, 0], color: '#a4553a', outline: [[0.05, 0], [0.95, 0], [0.9, 0.25], [1, 0.45], [0.82, 0.7], [0.75, 0.88], [0.6, 1], [0.42, 0.93], [0.3, 0.78], [0.12, 0.6], [0.18, 0.35], [0, 0.15]] },
          { shape: 'extrude', size: [2.4, 5, 1.2], at: [1.6, 2.5, -0.6], turn: [0, 20, 0], color: '#8e4a33', outline: [[0, 0], [1, 0], [0.85, 0.5], [0.7, 0.85], [0.45, 1], [0.2, 0.7]] },
          { shape: 'sphere', size: [0.25, 0.2, 0.2], at: [-0.6, 1.4, 0.82], color: '#36d17a', finish: 'gloss' },
          { shape: 'sphere', size: [0.25, 0.2, 0.2], at: [0.4, 2.3, 0.82], color: '#ffcf33', finish: 'gloss' },
          { shape: 'sphere', size: [0.25, 0.2, 0.2], at: [-0.3, 3.3, 0.82], color: '#ff4f6a', finish: 'gloss' },
          { shape: 'sphere', size: [0.25, 0.2, 0.2], at: [0.5, 4.3, 0.82], color: '#3aa0ff', finish: 'gloss' },
          { shape: 'sphere', size: [0.25, 0.2, 0.2], at: [-0.1, 5.3, 0.82], color: '#36d17a', finish: 'gloss' },
          { shape: 'tube', size: [1.2, 6, 0.2], at: [0.1, 3.3, 0.9], thick: 0.04, color: '#ff6a3c', finish: 'glow', path: [[0, -0.5, 0], [0.2, -0.3, 0.1], [-0.1, -0.1, 0.1], [0.15, 0.1, 0.1], [-0.05, 0.3, 0.1], [0.1, 0.5, 0]] },
        ],
      },
      {
        id: 'van', name: 'The van', note: 'Home most weekends.', collection: 'gear', at: { bearing: 42, distance: 6 }, turn: 70,
        light: { color: '#9ec2ff', strength: 0.5, at: [1.4, 1.2, 0] },
        parts: [
          { shape: 'box', size: [1.9, 1.9, 4.6], at: [0, 1.35, 0], round: 0.25, color: '#eeeeea', finish: 'gloss' },
          { shape: 'box', size: [1.92, 0.18, 4.4], at: [0, 1.1, 0], color: '#d4572a' },
          { shape: 'box', size: [1.6, 0.7, 0.06], at: [0, 1.85, 2.29], color: '#9cc6e8', finish: 'glass' },
          { shape: 'box', size: [0.04, 0.5, 0.9], at: [0.95, 1.85, -0.5], color: '#9cc6e8', finish: 'glass', mirror: true },
          { shape: 'box', size: [1.4, 0.08, 2.4], at: [0, 2.36, -0.4], round: 0.4, color: '#3a3a3a', finish: 'metal' },
          { shape: 'box', size: [0.06, 0.12, 2.4], at: [0.7, 2.42, -0.4], color: '#3a3a3a', finish: 'metal', mirror: true },
          { shape: 'cylinder', size: [0.75, 0.28, 0.75], at: [0.92, 0.4, 1.5], turn: [0, 0, 90], color: '#1c1c1c', mirror: true, repeat: { count: 2, at: [0, 0, -3] } },
          { shape: 'cylinder', size: [0.35, 0.3, 0.35], at: [0.93, 0.4, 1.5], turn: [0, 0, 90], color: '#c0c4cc', finish: 'metal', mirror: true, repeat: { count: 2, at: [0, 0, -3] } },
          { shape: 'sphere', size: [0.2, 0.2, 0.08], at: [0.65, 1, 2.31], color: '#fff7d6', finish: 'glow', mirror: true },
          { shape: 'box', size: [0.5, 0.3, 0.35], at: [1.6, 0.15, 0.4], round: 0.2, color: '#4a6a3a', finish: 'metal' },
          { shape: 'cone', size: [0.18, 0.3, 0.18], at: [1.6, 0.45, 0.4], color: '#4aa8ff', finish: 'glow' },
          { shape: 'lathe', size: [0.35, 0.3, 0.35], at: [1.6, 0.75, 0.4], color: '#b0b4bc', finish: 'metal', profile: [[0.8, 0], [0.95, 0.1], [0.95, 0.9], [1, 1]] },
        ],
      },
    ],
  },
  { version: 1, slug: 'test-min', who: { name: 'Min' } },
];

console.log(`The Planets connector at ${URL_}`);
const init = (await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'planet-live', version: '1' } })).result;
ok(init?.serverInfo?.name === 'planets', `it says who it is (${init?.serverInfo?.title} ${init?.serverInfo?.version})`, init);
const tools = (await rpc('tools/list')).result.tools.map((t) => t.name);
ok(['get_kit', 'preview_planet', 'send_planet'].every((t) => tools.includes(t)), `its tools: ${tools.join(', ')}`, tools);
const kit = (await tool('get_kit', {})).structuredContent;
ok(kit?.example && kit.limits, 'get_kit: the kit, with an example', kit);
const card = (await rpc('resources/read', { uri: 'ui://planets/preview.html' })).result?.contents?.[0];
ok(card?.mimeType === 'text/html;profile=mcp-app' && !/<script src=/.test(card.text) && card.text.length > 4000, `the card's page, its script inside (${card?.text.length} bytes)`, card?.mimeType);

const wrong = await tool('preview_planet', { spec: { ...PEOPLE[0], slug: 'Not A Slug' } });
ok(wrong.isError && /slug/.test(wrong.content[0].text), 'a spec with a mistake comes back to fix', wrong.content?.[0]?.text);

const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch(proxy && !site ? { proxy: { server: proxy } } : {});
const context = await browser.newContext({ viewport: { width: 1000, height: 640 } });
if (site) await context.route('https://stevenpisani.com/**', (route) => {
  let file = join(site, decodeURIComponent(new URL(route.request().url()).pathname));
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  return existsSync(file) ? route.fulfill({ body: readFileSync(file), contentType: TYPES[extname(file)] || 'application/octet-stream' }) : route.fulfill({ status: 404 });
});
for (const spec of PEOPLE) {
  console.log(`${spec.who.name} (${spec.slug})`);
  const shown = await tool('preview_planet', { spec });
  const url = shown.structuredContent?.url;
  ok(!shown.isError && url && shown.structuredContent.planet.name === spec.who.name, 'previewed: the card and its link', shown.content?.[0]?.text);
  if (url) {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const went = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).then(() => true, (e) => (errors.push(e.message.split('\n')[0]), false));
    const ready = went && await page.waitForFunction(() => window.__planet?.ready, null, { timeout: 90_000 }).then(() => true, () => false);
    const name = await page.locator('#topbar-name').textContent().catch(() => null);
    const line = ready ? await page.locator('#topbar-line').textContent() : '';
    ok(ready && name === spec.who.name && !errors.length, `the preview page draws it and says whose it is (${line})`, { ready, name, errors });
    if (ready) {
      await page.mouse.click(500, 560);
      const moved = await page.waitForFunction(() => window.__planet.player.target, null, { timeout: 5000 }).then(() => true, () => false);
      ok(moved, 'a tap on the ground walks there');
      // each of their things: turn to it, tap it, and its card says what it is
      for (const t of spec.things || []) {
        await page.keyboard.press('Escape');
        await page.evaluate((id) => { const p = window.__planet; p.player.stop(); p.player.look(-p.player.yawToward(p.spec.things.find((x) => x.id === id).center), 0); }, t.id);
        // the camera turns on the next frame drawn, which a slow machine takes a while over
        const drawn = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        await drawn();
        // something small and close can be under the view: look down at it
        let at = await page.evaluate((id) => window.__planet.screenOf(id), t.id);
        if (!at) { await page.evaluate(() => window.__planet.player.look(0, 0.5)); await drawn(); at = await page.evaluate((id) => window.__planet.screenOf(id), t.id); }
        if (at) await page.mouse.click(at.x, at.y);
        const card = await page.waitForFunction(() => !document.getElementById('thing').hidden && document.getElementById('thing-name').textContent, null, { timeout: 5000 }).then((h) => h.jsonValue(), () => null);
        ok(card === t.name, `tap ${t.name}: its card`, { at, card });
        if (shots) { await page.waitForTimeout(2500); await page.screenshot({ path: `${shots}/${spec.slug}-${t.id}.png` }); }
      }
    }
    if (shots) await page.screenshot({ path: `${shots}/${spec.slug}.png` });
    await page.close();
  }
  if (send) {
    const sent = await tool('send_planet', { spec, note: 'A made-up planet, sent by tools/planet-live.mjs.' });
    ok(sent.structuredContent?.sent && sent.structuredContent.test, `sent, as a test: ${sent.content?.[0]?.text}`, sent);
  }
}
await browser.close();
console.log(failed ? `✗ ${failed} check(s) failed` : '✓ the live connector works end to end');
process.exit(failed ? 1 : 0);
