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
    version: 1, slug: 'test-ines', who: { name: 'Inês' }, look: { home: 'Lisbon' },
    links: [{ id: 'bakery', label: 'The bakery', note: 'Open from 7', href: 'https://example.com/bakery' }],
    collections: {
      breads: { title: 'What I bake', items: [{ name: 'Pão de Deus', why: 'My grandmother’s, every Sunday' }, 'Broa de milho', 'Sourdough that took me three years'] },
      mornings: { title: 'Mornings', items: ['The tram up the hill at 6', 'Flour on everything'] },
    },
  },
  {
    version: 1, slug: 'test-dev', who: { name: 'Dev' }, look: { home: 'Denver' },
    collections: {
      climbs: { title: 'Climbs', items: [{ name: 'The Naked Edge', where: 'Eldorado Canyon', year: 2019 }, { name: 'Longs Peak', why: 'First fourteener' }] },
      gear: { title: 'Always in the van', items: ['A stove older than me', 'Two ropes', 'Too many cams'] },
    },
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
