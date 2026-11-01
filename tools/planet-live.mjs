// The live Planets connector, end to end, with made-up people (docs/planets.md, "Testing the live
// connector"): what ChatGPT or Claude would do, over the network to the deployed function. It says
// hello, lists the tools, opens the kit and the card's page, previews each made-up planet and walks
// it in headless Chromium (the page a card shows), checks a spec with mistakes comes back to fix,
// and sends each one. Every made-up planet's slug starts with test-, so the send is saved as a
// test: Steve isn't told, and it's deleted a day later. Needs the network to reach
// mcp.stevenpisani.com and stevenpisani.com.
//
//   node tools/planet-live.mjs [--url <connector>] [--shots <dir>] [--no-send] [--site _site] [--local]
// --interviews --phase <name> --local --site _site --shots <dir> captures the frozen synthetic
// interview stress set (first reveals, actions and additive edits), offline and without sends.
// --site serves stevenpisani.com from a local build instead, to try this script itself offline;
// --local asks this checkout's connector (supabase/functions/planets/server.js, in this process,
// nothing sent) instead of the deployed one, to try a change to both before it's merged.
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { chromium } from './chromium.mjs';

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const URL_ = arg('url', 'https://mcp.stevenpisani.com/planets');
const shots = arg('shots', null);
const local = process.argv.includes('--local');
const send = !local && !process.argv.includes('--no-send');
const site = arg('site', null);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
if (shots) mkdirSync(shots, { recursive: true });

let failed = 0, id = 0;
const tapProbes=[];
const ok = (cond, what, detail) => {
  console.log(`  ${cond ? '✓' : '✗'} ${what}${cond || detail === undefined ? '' : `\n    got ${JSON.stringify(detail).slice(0, 600)}`}`);
  if (!cond) failed++;
};
const server = local && await import('../supabase/functions/planets/server.js');
const rpc = async (method, params) => {
  if (server) return server.rpc({ jsonrpc: '2.0', id: ++id, method, params }, { cardScript: async () => readFileSync(new URL('../assets/js/dist/planet-card.js', import.meta.url), 'utf8') });
  const res = await fetch(URL_, { method: 'POST', headers: { 'content-type': 'application/json', 'mcp-protocol-version': '2025-06-18' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) });
  if (!res.ok) throw new Error(`${method}: HTTP ${res.status}`);
  return res.json();
};
const tool = async (name, args) => (await rpc('tools/call', { name, arguments: args })).result;

// made-up people, each with what they love in their own words, and what their AI might make
// them (each thing modelled from simple shapes, and described for its real model): the specs the
// Planet models workflow makes Meshy models for
const PEOPLE = [
  ...['test-ines', 'test-dev'].map((slug) => JSON.parse(readFileSync(new URL(`models/planets/${slug}.json`, import.meta.url), 'utf8'))),
];

console.log(`The Planets connector ${local ? 'in this checkout' : `at ${URL_}`}`);
const init = (await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'planet-live', version: '1' } })).result;
ok(init?.serverInfo?.name === 'planets', `it says who it is (${init?.serverInfo?.title} ${init?.serverInfo?.version})`, init);
const tools = (await rpc('tools/list')).result.tools.map((t) => t.name);
ok(['get_kit', 'prepare_planet', 'preview_planet', 'send_planet'].every((t) => tools.includes(t)), `its tools: ${tools.join(', ')}`, tools);
const kit = (await tool('get_kit', {})).structuredContent;
ok(kit?.example && kit.limits, 'get_kit: the kit, with an example', kit);
const card = (await rpc('resources/read', { uri: 'ui://planets/preview.html' })).result?.contents?.[0];
ok(card?.mimeType === 'text/html;profile=mcp-app' && !/<script src=/.test(card.text) && card.text.length > 4000, `the card's page, its script inside (${card?.text.length} bytes)`, card?.mimeType);

const wrong = await tool('preview_planet', { spec: { ...PEOPLE[0], slug: 'Not A Slug' } });
ok(wrong.isError && /slug/.test(wrong.content[0].text), 'a spec with a mistake comes back to fix', wrong.content?.[0]?.text);
// a planet that passes the check but would land them on bare rock comes back to fix, never as done
const BARE = {
  'only a name': { version: 1, slug: 'test-min', who: { name: 'Min' } },
  "what they love in Steve's planet's places": { version: 1, slug: 'test-probe', who: { name: 'Fictional Guest' }, look: { home: 'Test City' }, collections: { books: { title: 'Favorite books', items: ['A fictional adventure'] } }, places: [{ id: 'reading', kind: 'hammock' }] },
  'everything over the horizon': { ...PEOPLE[0], things: PEOPLE[0].things.map((t) => (t.at ? { ...t, at: { ...t.at, distance: 40 } } : t)) },
  'everything behind where they land': { ...PEOPLE[0], things: PEOPLE[0].things.map((t) => (t.at ? { ...t, at: { bearing: 180, distance: 8 } } : t)) },
};
for (const [what, spec] of Object.entries(BARE)) {
  const r = await tool('preview_planet', { spec });
  ok(r.isError && /bare rock/.test(r.content[0].text) && !r.structuredContent, `bare rock refused: ${what}`, r.content?.[0]?.text);
}

if (process.argv.includes('--interviews')) {
  if (!local || !site || !shots) throw new Error('--interviews requires --local --site and --shots; it never sends');
  const { reviewInterviews } = await import('./planet-interview-review.mjs');
  await reviewInterviews({ tool, site, shots, phase: arg('phase', 'baseline'), arrivalsOnly:process.argv.includes('--arrivals-only'), onlyCases:arg('cases',null)?.split(',') });
  process.exit(failed ? 1 : 0);
}

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
  const prepared = await tool('prepare_planet', { spec });
  const preparedSpec = prepared.structuredContent?.spec;
  ok(!prepared.isError && prepared.structuredContent?.prepared && !prepared.structuredContent?.view && !prepared.structuredContent?.url && prepared.structuredContent?.diagnostics?.rendered === false && JSON.stringify(preparedSpec) === JSON.stringify(spec), 'prepared without a card, a URL or claimed rendering; the old flat spec is unchanged', prepared.content?.[0]?.text);
  const shown = await tool('preview_planet', { spec: preparedSpec || spec });
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
        await page.keyboard.press('Escape'); // closes the card, and gets up if they're sitting
        await page.waitForFunction(() => !window.__planet.busy(), null, { timeout: 60000 });
        // from where they arrive, which every thing is placed to be seen from (walking round, one can hide another)
        await page.evaluate((id) => { const p = window.__planet; p.player.stop(); p.player.spawn(p.player.up.clone().set(0, 1, 0), p.spec.things.find((x) => x.id === id).center, 0); }, t.id);
        // the camera turns on the next frame drawn, which a slow machine takes a while over
        const drawn = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        await drawn();
        // something small and close can be under the view: look down at it
        let at = await page.evaluate((id) => window.__planet.screenOf(id), t.id);
        if (!at) { await page.evaluate(() => window.__planet.player.look(0, 0.5)); await drawn(); at = await page.evaluate((id) => window.__planet.screenOf(id), t.id); }
        // A campsite's centre can be air between chairs, behind the van. Retain that failed
        // centre probe, then tap a real visible face; never count another thing's card as success.
        const probe=await page.evaluate(({id,centre})=>{
          const w=window.__planet,t=w.spec.things.find(t=>t.id===id),V=w.camera.position.constructor;
          const centreHit=centre?w.pickAt(centre.x,centre.y):null;
          if(centreHit===id)return {centre,centreHit,target:centre,kind:'centre'};
          let target=null;
          t.root.traverse(o=>{
            if(!o.isMesh||target)return;
            const p=o.geometry.attributes.position,index=o.geometry.index,count=index?index.count:p.count;
            for(let k=0;k<8&&!target;k++) {
              const start=3*Math.floor((count/3-1)*k/7),v=new V();
              for(let j=0;j<3;j++)v.add(new V().fromBufferAttribute(p,index?index.getX(start+j):start+j));
              const q=v.multiplyScalar(1/3).applyMatrix4(o.matrixWorld).project(w.camera),x=(q.x+1)*innerWidth/2,y=(1-q.y)*innerHeight/2;
              if(q.z>0&&q.z<1&&Math.abs(q.x)<.95&&Math.abs(q.y)<.95&&w.pickAt(x,y)===id)target={x,y};
            }
          });
          return {centre,centreHit,target,kind:'visible-mesh-face'};
        },{id:t.id,centre:at});
        tapProbes.push({slug:spec.slug,id:t.id,...probe});
        if(shots)writeFileSync(join(shots,'tap-probes.json'),JSON.stringify(tapProbes,null,2)+'\n');
        if(probe.kind!=='centre')console.log(`  · ${t.name}: centre hit ${probe.centreHit||'ground'}; checking a visible mesh face separately`);
        at=probe.target;
        if (at) await page.mouse.click(at.x, at.y);
        if(t.use) {await page.locator('#details').waitFor({state:'visible',timeout:60000});await page.locator('#details').click();} // usable things respond in the world before optional details
        const card = await page.waitForFunction(() => !document.getElementById('thing').hidden && document.getElementById('thing-name').textContent, null, { timeout: 5000 }).then((h) => h.jsonValue(), () => null);
        ok(card === t.name, `tap ${t.name}: its card`, { at, card });
        // walking up and sitting take a few seconds, and far longer where frames come slowly (software WebGL)
        if (t.use === 'sit') {
          const sat = await page.waitForFunction((id) => window.__planet.seated() === id, t.id, { timeout: 60000 }).then(() => true, () => false);
          ok(sat, `sat on ${t.name}`);
        }
        if (t.use === 'switch') {
          const off = await page.waitForFunction((id) => window.__planet.spec.things.find((x) => x.id === id).lamp.intensity === 0, t.id, { timeout: 60000 }).then(() => true, () => false);
          ok(off, `switched ${t.name}'s light off`);
        }
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
