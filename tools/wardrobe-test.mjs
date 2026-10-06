// The wardrobe's data and its MCP server, tested against the real schema (tools/wardrobe-db.mjs):
// every migration in supabase/migrations/ runs in PGlite (Postgres in WebAssembly, in this
// process), with a few stand-ins for what Supabase provides (auth.uid(), auth.users, storage,
// the roles). The three
// garments from the first ChatGPT test are seeded as they were, before the migration that
// regroups them, so that migration is tested on what it'll really meet. Then the MCP tools run
// as Steve, signed in, through row-level security, with the photos and the weather made up.
// Offline, a few seconds.
//
//   node tools/wardrobe-test.mjs
import { existsSync, readFileSync } from 'node:fs';
import { rpc, TOOLS, APP_URI, APP_MIME, ICONS, AREAS, RULES, TRASH, REMOVES } from '../supabase/functions/mcp/server.js';
import { wardrobeDb, STEVE, OTHER, IDS, LINK_SECRET } from './wardrobe-db.mjs';
import { Image, decode } from 'imagescript';
import { BUDGET, LINK_MINUTES, b64Length, readPhotoToken, servePhoto } from '../supabase/functions/mcp/images.js';

let passed = 0;
const ok = (cond, what, detail) => { if (!cond) throw new Error(`wardrobe: ${what}${detail !== undefined ? `\n  got ${JSON.stringify(detail).slice(0, 600)}` : ''}`); passed++; };
const { db, q, run, migrations, signIn, ctx, insert, uploads, steveVariant } = await wardrobeDb();

// ---------- J. The migration of the three Uniqlo shirts ----------
{
  const products = await q(`select * from public.wardrobe_products`);
  ok(products.length === 1 && products[0].brand === 'Uniqlo' && products[0].style_number === 'HT00189AD-US' && products[0].name === 'Soft Brushed Crew Neck Long Sleeve T', 'migration: one Uniqlo product, by style number', products);
  const p = products[0];
  ok(p.material === '100% cotton' && p.country_of_origin === 'Vietnam' && p.default_fit === 'regular' && p.identifiers.tag_codes?.[0] === 'RN139864' && p.sources.material.source === 'hang_tag', 'migration: the tag\'s facts are on the product, with their source', p);
  const variants = await q(`select * from public.wardrobe_variants order by manufacturer_colour`);
  ok(variants.length === 3 && variants.map((v) => v.manufacturer_colour).join() === '08 Dark Gray,34 Brown,38 Dark Brown' && variants.every((v) => v.manufacturer_size === 'M' && v.price === 29.9 && v.measurements.chest === '38–41 in'), 'migration: three variants, the colours as printed, size, price and chest measurement', variants);
  ok(variants.find((v) => v.manufacturer_colour === '38 Dark Brown').colour === 'dark brown', 'migration: plain colours for search');
  const items = await q(`select * from public.wardrobe_items where id = any($1) order by id`, [Object.values(IDS)]);
  ok(items.length === 3 && items.every((i) => i.variant_id && i.subcategory === 'long_sleeve_t_shirt' && i.fit === null && i.name === null), 'migration: the same three item ids, each on its variant, the garment type out of fit', items);
  const dark = items.find((i) => i.id === IDS.darkBrown);
  ok(dark.notes === 'Bought at the SoHo store.' && dark.sources.migrated_from.notes.includes('RN139864') && dark.sources.migrated_from.fit === 'regular crew-neck long-sleeve tee', 'migration: notes keep only what has no field; the old values are kept word for word', dark);
  ok(items.find((i) => i.id === IDS.brown).notes === null, 'migration: notes that were all facts are emptied');
  const closet = await q(`select * from public.wardrobe_closet where id = $1`, [IDS.darkBrown]);
  ok(closet[0].name === 'Soft Brushed Crew Neck Long Sleeve T' && closet[0].fit === 'regular' && closet[0].colour === 'dark brown' && closet[0].manufacturer_colour === '38 Dark Brown' && closet[0].size === 'M' && closet[0].price === 29.9, 'migration: the closet view resolves the product and variant facts', closet[0]);
  const photos = await q(`select * from public.wardrobe_photos order by path`);
  ok(photos.length === 2 && photos.every((f) => f.role === 'garment') && photos.find((f) => f.item_id === IDS.darkBrown)?.file_id === 'file-tag-38', 'migration: every photo in use is kept, in the photos table', photos);
  ok((await q(`select count(*)::int as n from public.wardrobe_items where variant_id is null and name = 'Brown suede loafers'`))[0].n === 1, 'migration: other items are left alone');
  for (const f of migrations.filter((f) => f >= '20261005')) await run(f); // again: nothing changes
  ok((await q(`select count(*)::int as n from public.wardrobe_products`))[0].n === 1 && (await q(`select count(*)::int as n from public.wardrobe_variants`))[0].n === 3 && (await q(`select count(*)::int as n from public.wardrobe_photos`))[0].n === 2, 'migration: running it twice changes nothing');
}


const as = await signIn();

const ask = async (method, params) => (await rpc({ jsonrpc: '2.0', id: 1, method, params }, ctx)).result;
// a tool's data as the card sees it: the photo links, which travel in _meta, put back in place
const hydrate = (r) => { const photos = r._meta?.photos || {}; const walk = (v) => { if (Array.isArray(v)) return v.map(walk); if (!v || typeof v !== 'object') return v; const o = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])); if (o.hero_photo_id && photos[o.hero_photo_id]) o.hero_photo = photos[o.hero_photo_id]; if (o.role && o.id && photos[o.id]) o.url = photos[o.id]; return o; }; return walk(r.structuredContent); };
const tool = async (name, args) => { const m = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, ctx); if (m.error) return { error: true, code: m.error.code }; const r = m.result; return { ...hydrate(r), text: r.content[0].text, images: r.content.slice(1), error: r.isError }; };
const file = (id) => ({ download_url: `https://files.example/${id}`, file_id: id, mime_type: 'image/jpeg' });
const count = async (table) => (await q(`select count(*)::int as n from public.${table}`))[0].n;

// ---------- The protocol ----------
ok((await ask('initialize', { protocolVersion: '2025-06-18' })).protocolVersion === '2025-06-18' && (await ask('initialize', { protocolVersion: '2025-11-25' })).protocolVersion === '2025-11-25', 'the handshake picks the asked protocol (ChatGPT\'s and Claude\'s)');
ok(TOOLS.every((t) => t.title && t.annotations && (t.annotations.readOnlyHint || /changes only Steve's own records|moves only that to the trash|removes only that entry of the trip/.test(t.description))), 'every tool has a title and hints, and every write says plainly what it touches');
const { tools } = await ask('tools/list');
ok(tools.length === TOOLS.length && tools.find((t) => t.name === 'find_items').annotations.readOnlyHint && !tools.find((t) => t.name === 'ingest_item').annotations.readOnlyHint, 'tools/list, with read-only hints');
ok(TOOLS.find((t) => t.name === 'ingest_item')._meta['openai/fileParams'].join() === 'garment_photo,tag_photo,care_label_photo,detail_photos,catalog_photo', 'ingest_item takes uploaded photos, and a catalog image');
ok((await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, ctx)) === null, 'a notification gets no answer');
ok((await tool('destroy_item', { id: IDS.brown })).code === -32602, 'an unknown tool is a protocol error');
{
  const hello = await ask('initialize', { protocolVersion: '2025-11-25' });
  ok(hello.serverInfo.title === 'SJPJr' && hello.serverInfo.websiteUrl === 'https://stevenpisani.com' && hello.serverInfo.icons.some((i) => i.mimeType === 'image/png' && i.sizes.includes('512x512')) && ICONS.every((i) => existsSync(new URL(`..${new URL(i.src).pathname}`, import.meta.url))), 'the server says who it is, with its logo (files that exist) and its home', hello.serverInfo);
  ok(hello.instructions.includes(RULES) && AREAS.every((a) => hello.instructions.includes(a.instructions)), 'the model is told the rules, and how to use each area');
  ok(TOOLS.every((t) => TRASH.includes(t.name) || REMOVES.includes(t.name) || (!t.annotations.destructiveHint && !/^(delete|remove|destroy)_/.test(t.name))) && TRASH.every((n) => TOOLS.find((t) => t.name === n)?.annotations.destructiveHint) && /trash/.test(RULES) && AREAS.every((a) => a.records || a.tools.every((t) => t.annotations.readOnlyHint)), 'the rules hold: only the TRASH tools delete, each to the trash, and the REMOVES tools take a trip\'s own entry, and only areas of Steve\'s own records write');
  ok(Buffer.byteLength(hello.instructions) < 2048 && /find_items/.test(hello.instructions.slice(0, 512)), 'its instructions fit what hosts read (under 2 KB, the start first)');
  ok(TOOLS.every((t) => [t._meta['openai/toolInvocation/invoking'], t._meta['openai/toolInvocation/invoked']].every((x) => x && x.length <= 64)), 'every tool says what it\'s doing while it runs, briefly');
}

// ---------- The in-chat card (MCP Apps): its page, which tools show it, what each says to draw ----------
{
  const { resources } = await ask('resources/list');
  ok(resources.length === 1 && resources[0].uri === APP_URI && resources[0].mimeType === APP_MIME, 'the card is listed as an MCP Apps resource', resources);
  const { contents: [page] } = await ask('resources/read', { uri: APP_URI });
  ok(page.mimeType === 'text/html;profile=mcp-app' && /<script src="https:\/\/stevenpisani\.com\/assets\/js\/dist\/mcp-app\.js"><\/script>/.test(page.text) && page._meta.ui.csp.resourceDomains.includes('https://stevenpisani.com'), 'with no copy of the script to hand, its page loads the site\'s, which its CSP allows', page);
  const inlined = (await rpc({ jsonrpc: '2.0', id: 3, method: 'resources/read', params: { uri: APP_URI } }, { ...ctx, cardScript: async () => 'window.x = "</script><b>";' })).result.contents[0].text;
  ok(inlined.includes('<script>window.x = "<\\/script><b>";</script>') && !inlined.includes('src='), 'with the script to hand, the page carries it, safely', inlined);
  const shows = TOOLS.filter((t) => t._meta?.ui?.resourceUri === APP_URI).map((t) => t.name).sort().join();
  ok(shows === 'find_items,get_item,get_trip,ingest_item' && TOOLS.find((t) => t.name === 'find_items')._meta['openai/outputTemplate'] === APP_URI, 'the closet, a garment, filing and a trip show the card (in both hosts\' keys)', shows);
  ok(TOOLS.find((t) => t.name === 'set_packing_status')._meta['openai/widgetAccessible'], 'the card can tick packing off');
  ok((await rpc({ jsonrpc: '2.0', id: 2, method: 'resources/read', params: { uri: 'ui://nope' } }, ctx)).error, 'an unknown resource is an error');
  ok((await ask('initialize', {})).capabilities.resources, 'the server says it has resources');
  ok(page._meta['openai/widgetDescription'] && resources[0].icons?.length, "the card tells ChatGPT's model what it shows, and carries the logo");
}

// ---------- A. New product, new variant, owned item, with photos ----------
const crew = {
  product: { brand: 'Everlane', name: 'The Organic Cotton Crew', style_number: 'EV-1042', material: '100% organic cotton', country_of_origin: 'Peru', sources: { brand: 'garment_label', name: 'hang_tag', style_number: 'hang_tag', material: { source: 'care_label', confidence: 1, raw: '100% ORGANIC COTTON' }, country_of_origin: 'care_label' } },
  variant: { manufacturer_colour: 'White', manufacturer_size: 'M', price: 30, currency: 'USD', sources: { manufacturer_colour: 'hang_tag', manufacturer_size: 'garment_label', price: 'hang_tag', currency: 'hang_tag' } },
  item: { category: 'tops', subcategory: 'T-shirt', warmth: 'light', dressiness: 'casual', dressiness_also: ['smart casual'], bought_on: '2026-05-01', sources: { warmth: { source: 'vision_inference', confidence: 0.85 } } },
};
const a = await tool('ingest_item', { ...crew, garment_photo: file('crew-front'), tag_photo: file('crew-tag'), care_label_photo: file('crew-care'), client_ref: 'crew-white-1' });
ok(!a.error && a.product_created && a.variant_created && a.owned_item_created && a.item_ids.length === 1 && a.view === 'ingest', 'A: a new product, variant and owned item', a);
ok(a.item.name === 'The Organic Cotton Crew' && a.item.brand === 'Everlane' && a.item.colour === 'white' && a.item.size === 'M' && a.item.subcategory === 't_shirt' && a.item.hero_photo.endsWith('crew-front.jpg'), 'A: the flat item resolves, and the garment photo is the one shown', a.item);
ok(a.item.seasons?.join() === 'spring,summer' && a.owned_item.sources.seasons.source === 'derived' && a.owned_item.sources.warmth.source === 'vision_inference' && a.owned_item.sources.dressiness.source === 'derived', 'A: seasons worked out from warmth, and every judgement sourced', a.owned_item);
const crewItem = a.item.id;

// ---------- E. Photos with roles ----------
ok(a.photos.length === 3 && a.photos.map((p) => p.role).sort().join() === 'care_label,garment,tag' && a.photos.filter((p) => p.hero).map((p) => p.role).join() === 'garment', 'E: three photos, each with its role, only the garment shown', a.photos);
const tagOnly = await tool('ingest_item', { product: { brand: 'Everlane', name: 'The Organic Cotton Crew', style_number: 'EV-1042' }, variant: { manufacturer_colour: 'Black', manufacturer_size: 'M' }, item: { category: 'tops' }, tag_photo: file('black-tag'), client_ref: 'crew-black' });
ok(tagOnly.item.hero_photo === undefined && tagOnly.photos.length === 1 && tagOnly.photos[0].role === 'tag' && tagOnly.warnings.some((w) => /No garment photo/.test(w)), 'E: a tag photo alone is kept but never shown as the garment', tagOnly);
const added = await tool('add_photo', { id: tagOnly.item.id, photo: file('black-front') });
ok(added.item.hero_photo?.endsWith('black-front.jpg') && added.photos.length === 2, 'E: a garment photo added later becomes the one shown', added);
const detail = await tool('add_photo', { id: tagOnly.item.id, photo: file('black-cuff'), role: 'detail' });
ok(detail.item.hero_photo.endsWith('black-front.jpg') && detail.photos.find((p) => p.role === 'detail'), 'E: a detail photo doesn\'t replace it');
const front = detail.photos.find((p) => p.hero);
const demoted = await tool('set_photo_role', { photo_id: front.id, role: 'other' });
ok(demoted.item.hero_photo === undefined, 'E: a photo that stops being a garment photo stops being shown (no other garment photo)', demoted.item);
const promoted = await tool('set_photo_role', { photo_id: detail.photos.find((p) => p.role === 'detail').id, make_hero: true });
ok(promoted.item.hero_photo.endsWith('black-cuff.jpg'), 'E: any photo can be made the one shown');

// ---------- B. Existing product, new colour ----------
const b = await tool('ingest_item', { product: { brand: 'EVERLANE', name: 'The Organic Cotton Crew', style_number: 'ev 1042' }, variant: { manufacturer_colour: 'Navy', manufacturer_size: 'M', sources: { manufacturer_colour: 'hang_tag' } }, item: { category: 'tops' }, garment_photo: file('crew-navy') });
ok(!b.product_created && b.variant_created && b.owned_item_created && b.product.id === a.product.id, 'B: the same product (brand and style number, case and spaces aside), a new variant', b);

// ---------- C. Existing variant, a second piece ----------
const c = await tool('ingest_item', { ...crew, garment_photo: file('crew-front-2'), client_ref: 'crew-white-2' });
ok(!c.product_created && !c.variant_created && c.owned_item_created && c.variant.id === a.variant.id && c.item.id !== crewItem, 'C: the same variant, a second owned piece', c);
const twins = await tool('ingest_item', { product: crew.product, variant: { manufacturer_colour: 'Grey', manufacturer_size: 'M' }, item: { category: 'tops' }, quantity: 2, garment_photo: file('crew-grey'), client_ref: 'crew-grey' });
ok(twins.item_ids.length === 2 && (await q(`select count(*)::int as n from public.wardrobe_items where variant_id = $1`, [twins.variant.id]))[0].n === 2, 'C: quantity 2 makes two pieces, each addressable', twins);

// ---------- D. No brand, no product ----------
const d = await tool('ingest_item', { item: { name: 'Navy wool overcoat', category: 'outerwear', colour: 'navy', material: 'wool', warmth: 'warm', sources: { colour: 'vision_inference', material: { source: 'user', confidence: 0.6 } } }, garment_photo: file('coat') });
ok(!d.error && !d.product_created && d.product === null && d.variant === null && d.item.name === 'Navy wool overcoat' && d.item.seasons.join() === 'autumn,winter', 'D: a garment with no brand is just an item', d);
ok((await tool('ingest_item', { item: { category: 'tops' } })).error, 'D: an item with no product needs a name');
ok((await tool('ingest_item', { product: { name: 'Mystery shirt' }, item: { category: 'tops' } })).error, 'D: a product needs a brand');
ok((await tool('ingest_item', { variant: { manufacturer_colour: 'Red' }, item: { name: 'x', category: 'tops' } })).error, 'D: a variant needs a product');

// ---------- F. Duplicates and retries ----------
const before = await count('wardrobe_items');
const retry = await tool('ingest_item', { ...crew, garment_photo: file('crew-front'), client_ref: 'crew-white-1' });
ok(!retry.owned_item_created && retry.item.id === crewItem && (await count('wardrobe_items')) === before, 'F: a retry with the same client_ref adds nothing', retry);
const retryPhoto = await tool('ingest_item', { ...crew, garment_photo: file('crew-front') });
ok(!retryPhoto.owned_item_created && retryPhoto.item.id === crewItem, 'F: so does the same uploaded photo, without a client_ref');
const twinRetry = await tool('ingest_item', { product: crew.product, item: { category: 'tops' }, quantity: 2, client_ref: 'crew-grey' });
ok(twinRetry.item_ids.length === 2 && !twinRetry.owned_item_created, 'F: a retry of a quantity-2 ingestion returns both');
const uni = await tool('ingest_item', { product: { brand: 'uniqlo', name: 'Soft Brushed Crew Neck Long Sleeve T', style_number: 'ht00189ad-us', sources: { style_number: 'hang_tag' } }, variant: { manufacturer_colour: '09 Black', manufacturer_size: 'M', sources: { manufacturer_colour: 'hang_tag', manufacturer_size: 'hang_tag' } }, item: { category: 'tops', subcategory: 'long_sleeve_t_shirt' }, garment_photo: file('uni-black'), client_ref: 'uni-black' });
ok(!uni.product_created && uni.variant_created && uni.variant.colour === 'black', 'F: a fourth Uniqlo colour lands on the migrated product (style number, any case)', uni);
const byName = await tool('ingest_item', { product: { brand: 'Uniqlo', name: 'soft brushed crew-neck long sleeve t' }, variant: { manufacturer_colour: '38 Dark Brown', manufacturer_size: 'M' }, item: { category: 'tops' }, dry_run: true });
ok(byName.view === 'ingest' && byName.preview.product.existing?.style_number === 'HT00189AD-US' && byName.preview.variant.existing && byName.preview.item.fields.category === 'tops', 'F: a dry run carries a preview for the card: each level, what\'s already here', byName.preview);
ok(byName.dry_run && !byName.product_created && !byName.variant_created && byName.product_matched_by === 'brand and name' && byName.warnings.some((w) => /check it's the same garment/.test(w)), 'F: brand and the exact name (punctuation aside) match too, with a warning; dry run', byName);
const fuzzy = await tool('ingest_item', { product: { brand: 'Uniqlo', name: 'Soft Brushed Crew Neck Tee' }, item: { category: 'tops' }, dry_run: true });
ok(fuzzy.product_created, 'F: a merely similar name is a different product (no fuzzy matching)');
const clash = await tool('ingest_item', { product: { brand: 'Uniqlo', name: 'Soft Brushed Crew Neck Long Sleeve T', style_number: 'HT99999' }, item: { category: 'tops' }, dry_run: true });
ok(clash.product_created, 'F: the same name with a different style number is a different product');
const n0 = [await count('wardrobe_products'), await count('wardrobe_variants'), await count('wardrobe_items'), uploads.length];
await tool('ingest_item', { product: { brand: 'Acme', name: 'Dry run tee' }, variant: { manufacturer_colour: 'Red' }, item: { category: 'tops' }, garment_photo: file('dry'), dry_run: true });
ok(JSON.stringify(n0) === JSON.stringify([await count('wardrobe_products'), await count('wardrobe_variants'), await count('wardrobe_items'), uploads.length]), 'F: a dry run writes and uploads nothing');
const conflicting = await tool('ingest_item', { product: { brand: 'Everlane', name: 'The Organic Cotton Crew', style_number: 'EV-1042', material: '100% cotton', description: 'A heavyweight crew.' }, variant: { manufacturer_colour: 'White', manufacturer_size: 'M' }, item: { category: 'tops' }, client_ref: 'crew-white-3' });
ok(conflicting.product.material === '100% organic cotton' && conflicting.product.description === 'A heavyweight crew.' && conflicting.warnings.some((w) => /product\.material/.test(w)), 'F: a product found again gets its blanks filled, and keeps what it said (the difference is reported)', conflicting);

// ---------- G. Where facts came from ----------
const g = await tool('get_item', { id: crewItem });
ok(g.product.sources.material.source === 'care_label' && g.product.sources.material.raw === '100% ORGANIC COTTON' && g.product.sources.material.confidence === 1 && g.variant.sources.price.source === 'hang_tag' && g.variant.sources.colour.source === 'derived', 'G: sources, confidence and the raw text are kept per field', g);
const unsourced = await tool('ingest_item', { product: { brand: 'Acme', name: 'Plain tee', material: 'cotton' }, item: { category: 'tops' }, dry_run: true });
ok(unsourced.warnings.some((w) => /No source given for: product.brand, product.name, product.material/.test(w)), 'G: facts without a source are pointed out', unsourced.warnings);
ok((await tool('ingest_item', { product: { brand: 'Acme', name: 'x', sources: { brand: 'a friend' } }, item: { category: 'tops' } })).error, 'G: a source that isn\'t one is refused');

// ---------- H. find_items, flat ----------
const all = await tool('find_items', {});
const darkBrown = all.items.find((i) => i.id === IDS.darkBrown);
ok(Number.isInteger(all.count) && Array.isArray(all.items) && all.view === 'closet', 'H: find_items answers its outputSchema, and tells the card to draw the closet');
ok(darkBrown && darkBrown.name === 'Soft Brushed Crew Neck Long Sleeve T' && darkBrown.manufacturer_colour === '38 Dark Brown' && darkBrown.colour === 'dark brown' && darkBrown.material === '100% cotton' && darkBrown.product_id === undefined, 'H: find_items gives each piece flat, no joining needed, and only what lists need (the rest is get_item\'s)', darkBrown);
{ const whole = await tool('get_item', { id: darkBrown.id }); ok(whole.item.product_id && whole.item.variant_id && whole.item.style_number === 'HT00189AD-US', 'H: get_item has the ids and style number', whole.item); }
ok(all.items.find((i) => i.id === IDS.darkGray).hero_photo, 'H: with the photo shown');
// photos: the card gets the signed links, the model only short references, and links into the app
{
  const raw = (await ask('tools/call', { name: 'find_items', arguments: {} }));
  const lean = JSON.stringify(raw.structuredContent);
  ok(!/https?:\/\//.test(lean) && Object.values(raw._meta.photos).every((u) => /^https?:/.test(u)) && raw.structuredContent.items.some((i) => raw._meta.photos[i.hero_photo_id]), 'photo links travel in _meta for the card, by photo id, not in what the model reads', raw._meta);
  // the photo shown is the same photo everywhere, by its own id, however often it's asked for
  const listed = raw.structuredContent.items.find((i) => i.id === IDS.darkGray).hero_photo_id;
  const whole1 = (await ask('tools/call', { name: 'get_item', arguments: { id: IDS.darkGray } })).structuredContent;
  const whole2 = (await ask('tools/call', { name: 'get_item', arguments: { id: IDS.darkGray } })).structuredContent;
  ok(/^[0-9a-f-]{36}$/.test(listed) && whole1.item.hero_photo_id === listed && whole1.photos.find((p) => p.hero).id === listed && whole2.item.hero_photo_id === listed && whole1.photos.filter((p) => p.hero).length === 1, 'the photo shown has one id in find_items and get_item, which is the photo with hero: true', { listed, item: whole1.item.hero_photo_id, photos: whole1.photos });
  const one = await ask('tools/call', { name: 'get_item', arguments: { id: IDS.darkGray } });
  ok(one.content[0].text.includes(`In the app: https://stevenpisani.com/apps/wardrobe#item/${IDS.darkGray}`), 'a garment comes with its link in the app', one.content[0].text);
}

const smart = await tool('find_items', { category: 'tops', dressiness: 'smart casual' });
ok(smart.items.some((i) => i.id === crewItem) && !smart.items.some((i) => i.id === IDS.darkBrown), 'H: "smart casual tops" finds a casual tee that also works smart casual', smart.items.map((i) => i.name));
ok((await tool('find_items', { query: 'HT00189AD' })).count === 4, 'H: a style number finds every piece of that product');
ok((await tool('find_items', { query: '38 dark brown' })).items.length === 1, 'H: the colour as printed finds the piece');
ok((await tool('find_items', { warmth: 'warm' })).items.every((i) => i.warmth === 'warm'), 'H: warm things');

// ---------- I. get_item, whole ----------
const i = await tool('get_item', { id: IDS.darkBrown });
ok(i.view === 'garment', 'I: get_item tells the card to draw a garment');
ok(i.product.style_number === 'HT00189AD-US' && i.variant.manufacturer_colour === '38 Dark Brown' && i.variant.measurements.chest === '38–41 in' && i.owned_item.status === 'active' && i.owned_item.sources.migrated_from && i.photos.length === 1 && /Variant: 38 Dark Brown \/ M/.test(i.text), 'I: get_item has the product, variant, the piece itself and its photos', i);
ok((await tool('get_item', { id: 'not-a-uuid' })).error, 'I: an id that isn\'t one is "no item"');

// ---------- K. Changing one piece, one variant, or the product ----------
const k1 = await tool('update_item', { id: IDS.darkBrown, price: 19.9, condition: 'like new', sources: { price: 'user' } });
ok(k1.garments_affected === 1 && k1.item.price === 19.9 && (await tool('get_item', { id: IDS.brown })).item.price === 29.9, 'K: an item change touches that piece alone (what he paid; the others keep the retail price)', k1);
const k2 = await tool('update_item', { id: IDS.darkGray, scope: 'variant', colour: 'charcoal', sources: { colour: 'user' } });
ok(k2.garments_affected === 1 && k2.item.colour === 'charcoal' && (await tool('get_item', { id: IDS.darkBrown })).item.colour === 'dark brown', 'K: a variant change touches that colour and size only', k2);
const k3 = await tool('update_item', { id: IDS.brown, scope: 'product', description: 'Brushed jersey, soft inside.', sources: { description: 'manufacturer_page' } });
ok(k3.garments_affected === 4 && (await tool('get_item', { id: IDS.darkBrown })).product.description === 'Brushed jersey, soft inside.', 'K: a product change touches every colour and size, and says how many', k3);
ok((await tool('update_item', { id: IDS.brown, scope: 'product', name: '' })).error, 'K: a product can\'t lose its name');
ok((await tool('update_item', { id: d.item.id, scope: 'product', material: 'cashmere' })).error, 'K: an item with no product can\'t be changed at product scope');
ok((await tool('update_item', { id: IDS.brown, style_number: 'X' })).error, 'K: a product field at item scope is refused, with the fields that are allowed');
const k4 = await tool('update_item', { id: IDS.brown, brand: 'Uniqlo U' });
ok(k4.item.brand === 'Uniqlo U' && k4.owned_item.overrides.brand === 'Uniqlo U' && (await tool('get_item', { id: IDS.darkBrown })).item.brand === 'Uniqlo', 'K: a product fact set on one piece overrides it for that piece alone, and says so', k4.owned_item);
const k5 = await tool('update_item', { id: IDS.brown, brand: '' });
ok(k5.item.brand === 'Uniqlo' && !k5.owned_item.overrides, 'K: clearing the override goes back to the product\'s');
ok((await tool('update_item', { id: d.item.id, name: '' })).error, 'K: an item with no product can\'t lose its name');

// ---------- L. Retiring ----------
const l = await tool('retire_item', { id: twins.item_ids[1] });
ok(l.retired && (await q(`select retired_at from public.wardrobe_items where id = $1`, [twins.item_ids[1]]))[0].retired_at && !(await tool('find_items', {})).items.some((x) => x.id === twins.item_ids[1]) && (await tool('find_items', {})).items.some((x) => x.id === twins.item_ids[0]), 'L: retiring one of two identical pieces retires that one, with the date');
ok((await tool('retire_item', { id: twins.item_ids[1], retired: false })).retired === false, 'L: and it can come back');

// ---------- M. Trips, outfits and packing keep pointing at the same pieces ----------
const [trip] = await q(`select * from public.trips`);
const tr = await tool('get_trip', { id: trip.id });
ok(/Museums\. Outfit: Soft Brushed Crew Neck Long Sleeve T, Brown suede loafers/.test(tr.text) && /Soft Brushed Crew Neck Long Sleeve T \[packed, clothing; id /.test(tr.text), 'M: a trip planned before the migrations still names the same pieces, its ticked packing now an entry, packed', tr.text);
const planned = await tool('plan_days', { trip_id: trip.id, days: [{ date: '2026-10-09', items: [crewItem, IDS.brown], occasion: 'Walk' }] });
ok(!planned.error && planned.planned === 2, 'M: planning with the new ids works');
const board = await tool('get_trip', { id: trip.id });
ok(board.view === 'trip' && board.days.find((d) => d.date === '2026-10-09').items.includes(crewItem) && board.garments[crewItem]?.hero_photo && board.garments[crewItem].name, 'M: a trip tells the card to draw its board: each garment once, with its photo, and the days by id', board);
ok(board.legs.every((l) => !l.weather || (l.weather.summary && !l.weather.days)), 'M: the legs carry a weather summary, not every day of it', board.legs);
const entry = board.packing.items[0];
const ticked = await tool('set_packing_status', { packing_item_ids: [entry.id], status: 'needed' });
ok(ticked.summary.packed === 0 && (await q(`select status from public.trip_packing where id = $1`, [entry.id]))[0].status === 'needed', 'M: the card ticks one thing off (or back on)', ticked);
await tool('set_packing_status', { packing_item_ids: [entry.id], status: 'packed' });
ok((await tool('set_packing_status', { packing_item_ids: ['nothing-like-it'], status: 'packed' })).error, 'M: ticking something not on the list is refused');
ok((await tool('set_packing', { trip_id: trip.id, items: [{ item_id: IDS.darkBrown }, { item_id: crewItem, qty: 2 }] })).count === 2 && (await q(`select status from public.trip_packing where item_id = $1`, [IDS.darkBrown]))[0].status === 'packed', 'M: packing keeps what was ticked');

// ---------- test_image: a tiny PNG as standard MCP image content, nothing else involved ----------
{
  const r = (await rpc({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'test_image', arguments: {} } }, {})).result;
  const img = r.content?.find((c) => c.type === 'image');
  const bytes = img && Buffer.from(img.data, 'base64');
  ok(Array.isArray(r.content) && img && img.type === 'image' && img.mimeType === 'image/png' && typeof img.data === 'string' && img.data.length > 0, 'test_image: an image content block, image/png, with data', r.content);
  ok(bytes.length === 103 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) && !img.data.startsWith('data:') && Buffer.from(bytes).toString('base64') === img.data, 'test_image: the data is plain base64 (no data: prefix) of a real PNG', img.data.slice(0, 20));
  ok(!r.isError && r.content[0].type === 'text' && r.content.length === 2 && !('image' in (r.structuredContent || {})), 'test_image: a short text, then the image, in content (not in structuredContent)');
  // get_photo answers in exactly the same shape (checked on real photos below)
}

// ---------- Photos as images: the stored file itself, for the model to see ----------
{
  const tee = await tool('add_item', { name: 'Photo test tee', category: 'tops', subcategory: 't_shirt', colour: 'white' });
  const front = await tool('add_photo', { id: tee.item.id, photo: file('see-front') });
  const tag = await tool('add_photo', { id: tee.item.id, photo: file('see-tag'), role: 'tag' });
  const cat = await tool('add_photo', { id: tee.item.id, photo: file('see-catalog'), origin: 'catalog', made_from: [front.photo_id], shows: { subcategory: 't_shirt', colour: 'white' } });
  const hero = (await tool('find_items', { query: 'photo test tee' })).items[0].hero_photo_id;
  ok(hero === cat.photo_id, 'photos: find_items gives the catalog image as the one shown');
  const path = (await q(`select path from public.wardrobe_photos where id = $1`, [hero]))[0].path;
  const stored = await ctx.photoFile(path);
  const one = await tool('get_photo', { photo_id: hero });
  ok(!one.error && one.images.length === 1 && one.images[0].type === 'image' && one.images[0].mimeType === 'image/jpeg' && Buffer.from(one.images[0].data, 'base64').equals(Buffer.from(stored)), 'get_photo: the image itself, as MCP image content, byte for byte the stored file, its type from its bytes', one.images[0]?.mimeType);
  const m = one.photos[0];
  const raw = (await rpc({ jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'get_photo', arguments: { photo_id: hero } } }, ctx)).result;
  ok(raw.content.map((c) => c.type).join() === 'text,image' && Object.keys(raw.content[1]).sort().join() === 'data,mimeType,type' && !raw.content[1].data.startsWith('data:'), 'get_photo: the same shape as test_image (text, then { type, data, mimeType } with plain base64)', Object.keys(raw.content[1] || {}));
  ok(m.photo_id === hero && m.item_id === tee.item.id && m.role === 'garment' && m.origin === 'catalog' && m.hero === true && m.made_from.join() === front.photo_id && /the one shown/.test(one.text), 'get_photo: with what it is (photo_id, item_id, role, origin, hero, made_from)', m);
  const many = await tool('get_photos', { photo_ids: [front.photo_id, hero, tag.photo_id] });
  ok(many.images.length === 3 && many.photos.map((x) => x.photo_id).join() === [front.photo_id, hero, tag.photo_id].join() && many.photos.map((x) => x.image).join() === '1,2,3' && many.photos[2].role === 'tag' && !many.photos[0].hero, 'get_photos: several at once, in the order asked, each numbered to its image', many.photos);
  const mixed = await tool('get_photos', { photo_ids: [hero, '99999999-9999-4999-8999-999999999999'] });
  ok(!mixed.error && mixed.images.length === 1 && mixed.not_sent[0].photo_id.startsWith('9999') && /Not sent/.test(mixed.text), 'get_photos: one that isn\'t there is said, the rest still sent', mixed);
  ok((await tool('get_photo', { photo_id: 'nope' })).error && (await tool('get_photos', { photo_ids: Array.from({ length: 7 }, (_, i) => `p${i}`) })).error, 'get_photo: an id that isn\'t a photo is refused; get_photos takes six at most');
  const withImage = await tool('get_item', { id: tee.item.id, include_images: true });
  ok(withImage.images.length === 1 && Buffer.from(withImage.images[0].data, 'base64').equals(Buffer.from(stored)) && withImage.item.hero_photo_id === hero && withImage.images_meta === undefined && withImage.photos.length === 3, 'get_item include_images: the garment as before, plus the photo shown, the same one hero_photo_id names', withImage.text);
  ok(!(await tool('get_item', { id: tee.item.id })).images.length, 'get_item: no image unless asked');
  await tool('delete_photo', { photo_id: tag.photo_id });
  ok((await tool('get_photo', { photo_id: tag.photo_id })).error, 'get_photo: a photo in the trash isn\'t sent');
  ok(TOOLS.filter((t) => /^get_photos?$/.test(t.name)).every((t) => t.annotations.readOnlyHint), 'get_photo and get_photos only read');
}

// ---------- Several images in one answer: sized to get through, in order, named by slot ----------
{
  const PNG = [0x89, 0x50, 0x4e, 0x47], JPG = [0xff, 0xd8, 0xff];
  const starts = (b, sig) => sig.every((v, i) => b[i] === v);
  // real pictures, of different sizes: noise doesn't compress, so these are big like catalog PNGs
  const noisy = async (w, h, seed) => { const img = new Image(w, h); let x = seed * 2654435761 >>> 0 || 1; for (let i = 0; i < img.bitmap.length; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0; const px = (i >> 2) % w, py = Math.floor((i >> 2) / w); img.bitmap[i] = i % 4 === 3 ? 255 : Math.max(0, Math.min(255, ((i % 4 === 0 ? px : i % 4 === 1 ? py : px + py) * 255) / (w + h) + (x & 15) - 8)); } return img.encode(1); };
  const garment = async (name, category, w, h, seed) => {
    const it = await tool('add_item', { name, category });
    const ph = await tool('add_photo', { id: it.item.id, photo: file(`big-${seed}`) });
    const path = (await q(`select path from public.wardrobe_photos where id = $1`, [ph.photo_id]))[0].path;
    ctx.files.set(path, await noisy(w, h, seed));
    return { item: it.item.id, photo: ph.photo_id, path, bytes: ctx.files.get(path).length };
  };
  const g = [await garment('Big top', 'tops', 1600, 1200, 1), await garment('Big coat', 'outerwear', 1200, 1600, 2), await garment('Big trousers', 'bottoms', 1400, 1400, 3), await garment('Small shoes', 'shoes', 300, 240, 4), await garment('Big shirt', 'tops', 1300, 1700, 5), await garment('Big scarf', 'accessories', 1500, 1000, 6)];
  ok(g[0].bytes > 3e6 && g[1].bytes > 3e6, 'images: the test pictures are big, as the catalog PNGs are', g.map((x) => x.bytes));
  // get_photo, original: one too big for an answer is refused, with the way round; vision fits
  const tooBig = await tool('get_photo', { photo_id: g[0].photo });
  ok(tooBig.error && /purpose vision/.test(tooBig.text), 'get_photo original: a file past what an answer can carry is refused, saying to ask for vision', tooBig.text);
  const v = await tool('get_photo', { photo_id: g[0].photo, purpose: 'vision' });
  const vb = Buffer.from(v.images[0].data, 'base64'), vimg = await decode(vb);
  ok(starts(vb, JPG) && v.images[0].mimeType === 'image/jpeg' && Math.max(vimg.width, vimg.height) === 1024 && Math.abs(vimg.width / vimg.height - 1600 / 1200) < 0.01 && vb.length <= 400_000 && v.photos[0].purpose === 'vision', 'get_photo vision: a JPEG copy, 1024 px on its long side, the same proportions', [vimg.width, vimg.height]);
  ok(ctx.files.has(`${g[0].path}.vision.jpg`) && ctx.files.get(g[0].path).length === g[0].bytes, 'the copy is kept beside the stored file, which is unchanged');
  const again = await tool('get_photo', { photo_id: g[0].photo, purpose: 'vision' });
  ok(again.images[0].data === v.images[0].data, 'asked again, the kept copy is sent');
  // get_photos: 2 to 6 at once, by default vision, in the order asked, all inside one answer's budget
  const ids = [g[1].photo, g[0].photo, g[2].photo, g[3].photo, g[5].photo, g[4].photo];
  for (const n of [2, 3, 4, 5, 6]) {
    const r = await tool('get_photos', { photo_ids: ids.slice(0, n) });
    const total = r.images.reduce((t, i) => t + i.data.length, 0);
    ok(!r.error && r.images.length === n && r.images.every((i) => Buffer.from(i.data, 'base64').length <= 400_000) && r.photos.map((m) => m.photo_id).join() === ids.slice(0, n).join() && r.photos.every((m, i) => m.image === i + 1) && total < BUDGET && r.images.every((i) => starts(Buffer.from(i.data, 'base64'), JPG) || starts(Buffer.from(i.data, 'base64'), PNG)), `get_photos ${n}: every image sent, numbered in the order asked, ${Math.round(total / 1e3)}K base64 in all`, r.photos);
  }
  const small = (await tool('get_photos', { photo_ids: [g[3].photo] })).photos[0];
  ok(small.purpose === 'original', 'get_photos: a photo already small is sent as it is');
  const orig = await tool('get_photos', { photo_ids: [g[3].photo, g[1].photo], purpose: 'original' });
  ok(orig.images.length === 1 && orig.not_sent[0].photo_id === g[1].photo && /Too big/.test(orig.not_sent[0].reason), 'get_photos original: what doesn\'t fit is listed with why, the rest still sent', orig.not_sent);
  const thumb = await decode(Buffer.from((await tool('get_photo', { photo_id: g[1].photo, purpose: 'thumbnail' })).images[0].data, 'base64'));
  ok(Math.max(thumb.width, thumb.height) === 256, 'get_photo thumbnail: 256 px');
  // get_outfit_images: slot by slot, each garment's current hero, looked up now
  const outfit = await tool('get_outfit_images', { items: [{ slot: 'top', item_id: g[0].item }, { slot: 'outerwear', item_id: g[1].item }, { slot: 'bottom', item_id: g[2].item }, { slot: 'shoes', item_id: g[3].item }] });
  ok(!outfit.error && outfit.images.length === 4 && outfit.references.map((r) => r.reference_key).join() === 'top,outerwear,bottom,shoes' && outfit.references.every((r, i) => r.image === i + 1 && r.hero && r.item_id === g[i].item && r.photo_id === g[i].photo), 'get_outfit_images: every garment\'s hero photo, in slot order, each image named by its slot', outfit.references);
  ok(/^Image 1 = top: Big top/.test(outfit.text) && outfit.text.split('\n').length === 4, 'get_outfit_images: one short line an image, slot first', outfit.text);
  const newer = await tool('add_photo', { id: g[0].item, photo: file('big-new-catalog'), origin: 'catalog', shows: {} }).catch(() => null);
  await tool('set_photo_role', { photo_id: (await tool('add_photo', { id: g[0].item, photo: file('big-new-front') })).photo_id, make_hero: true });
  const now = (await tool('find_items', { query: 'Big top' })).items[0].hero_photo_id;
  ok((await tool('get_outfit_images', { items: [{ slot: 'top', item_id: g[0].item }] })).references[0].photo_id === now && now !== g[0].photo, 'get_outfit_images: the hero as it is now, not as it was');
  const gaps = await tool('get_outfit_images', { items: [{ slot: 'top', item_id: g[0].item }, { slot: 'hat', item_id: '99999999-9999-4999-8999-999999999999' }, { slot: 'belt', item_id: (await tool('add_item', { name: 'Photo-less belt', category: 'accessories' })).item.id }] });
  ok(gaps.images.length === 1 && gaps.not_sent.map((x) => x.reference_key).join() === 'hat,belt' && /no garment/.test(gaps.not_sent[0].reason) && /no photo/.test(gaps.not_sent[1].reason), 'get_outfit_images: a garment not found, or with no photo, is listed by slot with why', gaps.not_sent);
  ok((await tool('get_outfit_images', { items: [{ slot: 'top', item_id: g[0].item }, { slot: 'Top', item_id: g[1].item }] })).error, 'get_outfit_images: two garments can\'t share a slot');
  // purpose generation: the same photos as links to the stored files, for an image generator
  {
    const want = [{ slot: 'outerwear', item_id: g[1].item }, { slot: 'bottom', item_id: g[2].item }, { slot: 'shoes', item_id: g[3].item }, { slot: 'top', item_id: g[4].item }];
    const seen = await tool('get_outfit_images', { items: want });
    const gen = await tool('get_outfit_images', { items: want, purpose: 'generation' });
    const refs = gen.references;
    ok(!gen.error && !gen.images.length && refs.map((r) => r.reference_key).join() === 'outerwear,bottom,shoes,top' && refs.map((r) => r.photo_id).join() === seen.references.map((r) => r.photo_id).join() && refs.every((r, i) => r.item_id === want[i].item_id && r.hero), 'generation: no images, the same photos as vision, in the order and slots asked', refs);
    ok(refs.every((r) => r.url.startsWith('https://mcp.stevenpisani.com/photo/') && r.mime_type === 'image/png') && refs[0].width === 1200 && refs[0].height === 1600 && refs[3].width === 1300 && refs[3].height === 1700 && refs[2].bytes === g[3].bytes, 'generation: each a link on SJPJr\'s address, with the stored file\'s type, size and dimensions', refs.map(({ width, height, mime_type, bytes }) => ({ width, height, mime_type, bytes })));
    const left = (new Date(refs[0].expires_at) - Date.now()) / 60000;
    ok(left > LINK_MINUTES - 1 && left <= LINK_MINUTES && /^Reference 1 = outerwear: Big coat .*https:\/\/mcp\.stevenpisani\.com\/photo\//.test(gen.text), `generation: good for ${LINK_MINUTES} minutes; the text names each link by its slot`, gen.text.split('\n')[0]);
    const token = refs[0].url.split('/photo/')[1];
    ok(await readPhotoToken(LINK_SECRET, token) === refs[0].photo_id && !(await readPhotoToken('another-secret', token)) && !/wardrobe|Big|\.png/.test(Buffer.from(token.split('.')[0], 'base64').toString()), 'a link names only the photo\'s id and its expiry, signed: no file, no name', token.slice(0, 30));
    // what the server answers a link with (index.ts wires servePhoto to the database and Storage)
    const serve = (t, now) => servePhoto(t, { secret: LINK_SECRET, now, find: async (id) => (await ctx.photos.get(id))?.path ?? null, file: async (path) => ctx.files.get(path) ?? ctx.photoFile(path) });
    const res = await serve(token);
    const body = Buffer.from(await res.arrayBuffer());
    ok(res.status === 200 && body.equals(Buffer.from(ctx.files.get(g[1].path))) && res.headers.get('content-type') === 'image/png' && /private, max-age=\d+/.test(res.headers.get('cache-control')) && res.headers.get('x-content-type-options') === 'nosniff', 'a link is answered with the stored file, byte for byte, as its type, cached privately only while it lasts', [res.status, res.headers.get('content-type'), res.headers.get('cache-control')]);
    const flipped = token.slice(0, -2) + (token.endsWith('AA') ? 'AB' : 'AA');
    ok((await serve(flipped)).status === 404 && (await serve(token, Date.now() + (LINK_MINUTES + 1) * 60000)).status === 404 && (await serve('nonsense')).status === 404, 'an altered, expired or made-up link gets nothing');
    const extra = await tool('add_photo', { id: g[5].item, photo: file('gen-extra') });
    const xt = (await tool('get_outfit_images', { items: [{ slot: 'scarf', item_id: g[5].item }], purpose: 'generation' })).references[0];
    await tool('delete_photo', { photo_id: xt.photo_id });
    ok((await serve(xt.url.split('/photo/')[1])).status === 404, 'a photo deleted since stops its link working');
    const gaps = await tool('get_outfit_images', { items: [{ slot: 'top', item_id: g[4].item }, { slot: 'hat', item_id: '99999999-9999-4999-8999-999999999999' }], purpose: 'generation' });
    ok(gaps.references.length === 1 && gaps.not_sent[0].reference_key === 'hat' && /no garment/.test(gaps.not_sent[0].reason), 'generation: a garment not found is listed by slot with why');
    ok((await tool('get_photo', { photo_id: g[1].photo, purpose: 'generation' })).error, 'generation is get_outfit_images\' alone');
    // purpose board: the outfit as one picture, laid out from the real photos, made here
    const bo = await tool('get_outfit_images', { items: want, purpose: 'board' });
    const bb = Buffer.from(bo.images[0]?.data || '', 'base64'), bimg = bb.length && await decode(bb);
    ok(!bo.error && bo.images.length === 1 && bo.images[0].mimeType === 'image/jpeg' && starts(bb, JPG) && bimg.width === 1200 && bimg.height === 1200 && bo.board.width === 1200 && b64Length(bb.length) < BUDGET, 'board: one JPEG, 1200 px square for four garments, well inside an answer', [bimg.width, bimg.height, bb.length]);
    ok(bo.references.map((r) => r.reference_key).join() === 'outerwear,bottom,shoes,top' && bo.references.map((r) => r.photo_id).join() === seen.references.map((r) => r.photo_id).join() && bo.references.every((r, i) => r.position === i + 1), 'board: the same photos as vision, in the order and slots asked', bo.references);
    const [c1, c2, c3, c4] = bo.references;
    ok(c1.x < 600 && c1.y < 600 && c2.x >= 600 && c2.y < 600 && c3.x < 600 && c3.y >= 600 && c4.x >= 600 && c4.y >= 600 && bo.references.every((r) => Math.max(r.width, r.height) > 500 && Math.max(r.width, r.height) <= 600), 'board: two a row, left to right, top to bottom, each filling its square but its margin', bo.references.map(({ x, y, width, height }) => [x, y, width, height]));
    ok(Math.abs(c1.width / c1.height - 1200 / 1600) < 0.02 && Math.abs(c4.width / c4.height - 1300 / 1700) < 0.02, 'board: each photo keeps its proportions');
    const white = (x, y) => { const [r, gg, b] = Image.colorToRGBA(bimg.getPixelAt(x + 1, y + 1)); return r > 245 && gg > 245 && b > 245; };
    const inside = (r) => { const [R, G, B] = Image.colorToRGBA(bimg.getPixelAt(r.x + Math.round(r.width * 0.8) + 1, r.y + Math.round(r.height * 0.8) + 1)); return R + G + B < 700; };
    ok(white(0, 0) && white(1199, 1199) && white(c1.x - 5, c1.y + 5) && bo.references.every(inside), 'board: white around the garments, the photos where it says they are');
    ok(/^Image 1 = the outfit board, 1200×1200/.test(bo.text) && /^1\. outerwear: Big coat/m.test(bo.text), 'board: the text says what\'s where, by slot', bo.text);
    const grid = async (n) => (await tool('get_outfit_images', { items: g.slice(1, n + 1).map((x, i) => ({ slot: `s${i}`, item_id: x.item })), purpose: 'board' }));
    const [one, three, five] = [await grid(1), await grid(3), await grid(5)];
    ok(one.board.height === 1200 && one.references[0].x >= 0 && Math.max(one.references[0].width, one.references[0].height) > 1000, 'board: one garment fills it');
    ok(three.board.height === 1200 && three.references[2].x > 300 && three.references[2].x < 600, 'board: three, the last centred under the two', three.references.map((r) => r.x));
    ok(five.board.width === 1200 && five.board.height === 800 && five.references.filter((r) => r.y < 400).length === 3 && five.references[3].x > 150, 'board: five or six, three a row', [five.board.width, five.board.height]);
    const unread = await tool('get_outfit_images', { items: [{ slot: 'top', item_id: g[0].item }, { slot: 'coat', item_id: g[1].item }], purpose: 'board' });
    ok(unread.references.length === 1 && unread.references[0].reference_key === 'coat' && /couldn't be read/.test(unread.not_sent[0].reason) && (await tool('get_outfit_images', { items: [{ slot: 'top', item_id: g[0].item }], purpose: 'board' })).error, 'board: a photo that can\'t be read is left off and said; with nothing else, refused', unread.not_sent);
    const bgaps = await tool('get_outfit_images', { items: [{ slot: 'top', item_id: g[4].item }, { slot: 'hat', item_id: '99999999-9999-4999-8999-999999999999' }, { slot: 'belt', item_id: (await tool('find_items', { query: 'Photo-less belt' })).items[0].id }], purpose: 'board' });
    ok(bgaps.images.length === 1 && bgaps.references.length === 1 && bgaps.board.height === 1200 && bgaps.not_sent.map((x) => x.reference_key).join() === 'hat,belt' && /Left off \(hat\)/.test(bgaps.text), 'board: a garment not found, or with no photo, is left off and said; the rest laid out', bgaps.not_sent);
    ok((await tool('get_outfit_images', { items: [{ slot: 'hat', item_id: '99999999-9999-4999-8999-999999999999' }], purpose: 'board' })).error && (await tool('get_photos', { photo_ids: [g[1].photo], purpose: 'board' })).error, 'board: nothing to lay out is refused; board is get_outfit_images\' alone');
    void extra;
  }
  // test_images: plain, different, numbered pictures to check what arrives
  for (const size of ['small', 'vision']) {
    const t = (await rpc({ jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'test_images', arguments: { count: 6, size } } }, ctx)).result;
    const imgs = t.content.filter((c) => c.type === 'image');
    const px = await Promise.all(imgs.map(async (c) => { const im = await decode(Buffer.from(c.data, 'base64')); return [im.width, im.getPixelAt(Math.round(im.width / 8), Math.round(im.height / 8))]; }));
    ok(imgs.length === 6 && new Set(imgs.map((c) => c.data)).size === 6 && imgs.every((c) => c.mimeType === 'image/png' && !c.data.startsWith('data:') && Buffer.from(c.data, 'base64').subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) && px.every(([w]) => w === (size === 'vision' ? 768 : 64)) && t.structuredContent.answer_key.map((a) => a.shows.split(' ')[0]).join() === 'red,blue,green,yellow,a,a' && !/\b(red|blue|green|yellow)\b/.test(t.content[0].text), `test_images ${size}: six different pictures in a fixed order, the key out of the text`, px.map(([w, c]) => [w, (c >>> 0).toString(16)]));
    const [r1, , , y4] = px.map(([, c]) => c >>> 0);
    ok((r1 >>> 24) > 180 && ((r1 >>> 8) & 255) < 80 && ((y4 >>> 8) & 255) < 80 && (y4 >>> 24) > 180 && ((y4 >>> 16) & 255) > 150, `test_images ${size}: the first is red, the fourth yellow`);
  }
  ok((await tool('test_images', { count: 7 })).code === undefined && (await tool('test_images', { count: 7 })).error, 'test_images: six at most');
}

// ---------- The trash: deleting hides, restore brings back, 30 days later it's gone ----------
{
  const coat = await tool('add_item', { name: 'Trash test coat', category: 'outerwear' });
  await tool('add_photo', { id: coat.item.id, photo: file('coat-front') });
  const del = await tool('delete_item', { id: coat.item.id });
  ok(!del.error && del.in_trash && /restored until \d{4}-\d\d-\d\d/.test(del.text), 'delete_item moves it to the trash and says until when', del.text);
  ok((await tool('get_item', { id: coat.item.id })).error && !(await tool('find_items', { query: 'trash test coat' })).items?.length, 'a garment in the trash is hidden everywhere');
  ok((await tool('list_trash', {})).items.some((i) => i.id === coat.item.id), 'list_trash has the garment');
  ok(!(await tool('restore', { id: coat.item.id })).error && !(await tool('get_item', { id: coat.item.id })).error, 'restore brings it back');
  const trip = await tool('create_trip', { name: 'Trash test trip', legs: [{ place: 'Rome', from: '2026-11-01', to: '2026-11-03' }] });
  ok(!(await tool('delete_trip', { id: trip.id })).error && !(await tool('list_trips', {})).trips.some((t) => t.id === trip.id), 'delete_trip moves a trip to the trash');
  ok(!(await tool('restore', { id: trip.id })).error && (await tool('list_trips', {})).trips.some((t) => t.id === trip.id), 'and restore brings it back');
  ok((await tool('restore', { id: IDS.darkGray })).error, "restore only takes what's in the trash");
  // 30 days on, emptying the trash deletes the rows and names the files to remove
  await tool('delete_item', { id: coat.item.id });
  await tool('delete_trip', { id: trip.id });
  const coatFile = (await q(`select path from public.wardrobe_photos where item_id = $1`, [coat.item.id]))[0].path;
  await db.exec(`reset role; set request.jwt.claims = ''`); // as the weekly job: no member
  ok(!(await q(`select * from public.empty_trash()`)).length, 'emptying the trash leaves what was deleted less than 30 days ago');
  await q(`update public.wardrobe_items set deleted_at = now() - interval '31 days' where id = $1`, [coat.item.id]);
  await q(`update public.trips set deleted_at = now() - interval '31 days' where id = $1`, [trip.id]);
  const files = (await q(`select * from public.empty_trash()`)).map((r) => Object.values(r)[0]);
  ok(files.includes(coatFile) && !(await q(`select 1 from public.wardrobe_items where id = $1`, [coat.item.id])).length && !(await q(`select 1 from public.wardrobe_photos where item_id = $1`, [coat.item.id])).length && !(await q(`select 1 from public.trips where id = $1`, [trip.id])).length, 'after 30 days it deletes the garment, its photos and the trip, and names the files', files);
  await db.exec(`set role authenticated`);
  await as(STEVE, 'steve@example.com');
  ok(await q(`select * from public.empty_trash(0)`).then(() => false, (e) => /weekly job/.test(e.message)), 'a member can\'t empty the trash, even with the function granted');
}

// ---------- Photos: where each came from, and the one shown ----------
{
  const tee = await tool('add_item', { name: 'Plain white tee', category: 'tops' });
  // a shop's page: its main picture kept as a reference, the page noted on the garment, a stand-in while there's nothing better
  const ref = await tool('add_photo', { id: tee.item.id, url: 'https://shop.example/products/white-tee' });
  const refPhoto = ref.photos.find((p) => p.id === ref.photo_id);
  ok(refPhoto.origin === 'reference' && refPhoto.source_url === 'https://shop.example/products/white-tee' && ref.item.buy_link === 'https://shop.example/products/white-tee' && ref.item.hero_photo_id === refPhoto.id, 'a shop page gives a reference picture, notes the page on the garment, and stands in as the one shown', ref);
  const again = await tool('add_photo', { id: tee.item.id, url: 'https://shop.example/products/white-tee' });
  ok(again.photos.length === 1, 'the same link twice is one photo');
  // Steve's own photo outranks the shop's
  const own = await tool('add_photo', { id: tee.item.id, photo: file('tee-front') });
  ok(own.photos.find((p) => p.id === own.photo_id).origin === 'own' && own.item.hero_photo_id === own.photo_id, "his own photo outranks a shop's picture", own.item);
  // the wardrobe's catalog image, made from both, is the one shown; nothing is dropped
  const cat = await tool('add_photo', { id: tee.item.id, photo: file('tee-catalog'), origin: 'catalog', made_from: [refPhoto.id, own.photo_id], shows: { subcategory: 't_shirt', colour: 'white' } });
  const catPhoto = cat.photos.find((p) => p.id === cat.photo_id);
  ok(catPhoto.origin === 'catalog' && catPhoto.made_from.join() === [refPhoto.id, own.photo_id].join() && cat.item.hero_photo_id === catPhoto.id && cat.photos.length === 3, 'a catalog image, made from the reference and his photo, is the one shown; every photo is kept', cat.photos);
  const later = await tool('add_photo', { id: tee.item.id, photo: file('tee-back') });
  ok(later.item.hero_photo_id === catPhoto.id, "another of his photos doesn't replace the catalog image");
  // add_photo → get_item → find_items: the same photo shown
  const found = (await tool('find_items', { query: 'plain white tee' })).items[0];
  const got = await tool('get_item', { id: tee.item.id });
  ok(found.hero_photo_id === catPhoto.id && got.item.hero_photo_id === catPhoto.id && got.photos.find((p) => p.hero).id === catPhoto.id && found.hero_photo === got.item.hero_photo, 'add_photo, get_item and find_items agree on the photo shown', { found: found.hero_photo_id, got: got.item.hero_photo_id });
  ok((await tool('add_photo', { id: tee.item.id, photo: file('tee-tag'), role: 'tag', origin: 'catalog' })).error && (await tool('add_photo', { id: tee.item.id, photo: file('x'), made_from: [IDS.brown] })).error, "a catalog image is of the garment, made from this garment's photos");
  // correcting where a photo came from
  const fixed = await tool('set_photo_role', { photo_id: catPhoto.id, origin: 'own' });
  ok(fixed.photos.find((p) => p.id === catPhoto.id).origin === 'own' && fixed.item.hero_photo_id === catPhoto.id, 'set_photo_role corrects where a photo came from');
  const recat = await tool('set_photo_role', { photo_id: own.photo_id, origin: 'catalog', shows: { subcategory: 't_shirt', colour: 'white' } });
  ok(recat.item.hero_photo_id === own.photo_id, 'a photo newly marked catalog is the one shown');
  // a catalog image has to show the garment: a short-sleeve picture for a long-sleeve shirt is refused
  const shirt = await tool('add_item', { name: 'Brushed long sleeve tee', category: 'tops', subcategory: 'long_sleeve_t_shirt', colour: 'dark brown' });
  const wrongKind = await tool('add_photo', { id: shirt.item.id, photo: file('short-sleeve-render'), origin: 'catalog', shows: { subcategory: 't_shirt', colour: 'dark brown' } });
  const noShows = await tool('add_photo', { id: shirt.item.id, photo: file('render-2'), origin: 'catalog' });
  ok(wrongKind.error && /long sleeve t shirt; that image shows a t shirt/.test(wrongKind.text) && noShows.error && !(await tool('get_item', { id: shirt.item.id })).photos.length, 'a catalog image of another kind, or with nothing said of what it shows, is refused and nothing is kept', wrongKind.text);
  const offColour = await tool('add_photo', { id: shirt.item.id, photo: file('render-3'), origin: 'catalog', shows: { subcategory: 'long_sleeve_t_shirt', colour: 'charcoal' } });
  ok(!offColour.error && /Check the colour/.test(offColour.text), 'a colour that reads differently is said, not refused', offColour.text);
  // any photo goes to the trash; the next best is shown; restore brings it back
  const shopPic = await tool('add_photo', { id: shirt.item.id, url: 'https://shop.example/brushed-tee.jpg' });
  const mine = await tool('add_photo', { id: shirt.item.id, photo: file('brushed-front') });
  const gone = await tool('delete_photo', { photo_id: offColour.photo_id });
  ok(!gone.error && /trash/.test(gone.text) && !gone.photos.some((p) => p.id === offColour.photo_id) && gone.item.hero_photo_id === mine.photo_id, 'a wrong catalog image goes to the trash, and the next best is shown', gone.item);
  ok((await tool('delete_photo', { photo_id: offColour.photo_id })).error, 'a photo in the trash is gone from everywhere, deleting it again included');
  const inTrash = await tool('list_trash', {});
  ok(inTrash.photos.some((p) => p.id === offColour.photo_id && p.gone_on), 'list_trash has it, with the day it goes for good', inTrash);
  const back = await tool('restore', { id: offColour.photo_id });
  ok(!back.error && (await tool('get_item', { id: shirt.item.id })).item.hero_photo_id === offColour.photo_id, 'restore brings it back, shown again');
  const ownGone = await tool('delete_photo', { photo_id: mine.photo_id });
  const shopGone = await tool('delete_photo', { photo_id: shopPic.photo_id });
  ok(!ownGone.error && !shopGone.error && shopGone.photos.length === 1, "his own photos and shop pictures go to the trash too");

  // filing with a catalog image
  const filed = await tool('ingest_item', { product: { brand: 'Arket', name: 'Heavyweight Tee', sources: { brand: 'garment_label', name: 'hang_tag' } }, item: { category: 'tops' }, garment_photo: file('arket-front'), catalog_photo: file('arket-catalog'), client_ref: 'arket-tee' });
  const shown = filed.photos.find((p) => p.hero);
  ok(shown.origin === 'catalog' && filed.photos.find((p) => p.origin === 'own' && p.role === 'garment'), 'ingest_item: the catalog image is shown, the garment photo kept as his own', filed.photos);
}

// ---------- add_item, the quick way ----------
const quick = await tool('add_item', { name: 'Linen shirt', category: 'tops', buy_link: 'shopco.example/linen' });
ok(quick.item.brand === 'Shopco' && quick.item.price === 60 && quick.owned_item.sources.brand.source === 'retailer_page' && quick.photos[0].source === 'retailer_page' && quick.photos[0].origin === 'reference', 'add_item: a quick item from a link, with sources and the shop\'s picture', quick);
const up = await tool('add_item', { name: 'Grey overshirt', category: 'outerwear', photo: file('overshirt') });
ok((await tool('add_item', { name: 'Grey overshirt', category: 'outerwear', photo: file('overshirt') })).item.id === up.item.id, 'add_item: the same upload twice is one item');
ok((await tool('add_item', { name: 'x', category: 'tops', dressiness: 'black tie' })).error, 'add_item: a value that isn\'t one is refused');

// ---------- Each person's own ----------
await as(OTHER, 'other@example.com');
ok((await tool('find_items', { include_retired: true })).count === 0 && (await tool('get_item', { id: IDS.darkBrown })).error, 'someone else sees none of Steve\'s clothes');
ok((await tool('ingest_item', { product: { brand: 'Uniqlo', name: 'Soft Brushed Crew Neck Long Sleeve T', style_number: 'HT00189AD-US' }, variant: { manufacturer_colour: '38 Dark Brown', manufacturer_size: 'M' }, item: { category: 'tops' } })).product_created, 'and their own Uniqlo shirt is their own product');
// mcp.stevenpisani.com (proxy/_worker.js): everything passes through as it came, saying which address was used
{
  const src = readFileSync(new URL('../proxy/_worker.js', import.meta.url), 'utf8').replace('__SUPABASE_URL__', 'https://ref.supabase.co');
  const { default: worker } = await import(`data:text/javascript,${encodeURIComponent(src)}`);
  const real = globalThis.fetch; const seen = [];
  globalThis.fetch = async (url, init) => { seen.push({ url, init }); return new Response('{"ok":1}', { status: 401, headers: { 'www-authenticate': 'Bearer x' } }); };
  try {
    const res = await worker.fetch(new Request('https://mcp.stevenpisani.com/', { method: 'POST', headers: { authorization: 'Bearer t', 'mcp-protocol-version': '2025-11-25', 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0"}' }));
    const meta = await worker.fetch(new Request('https://mcp.stevenpisani.com/.well-known/oauth-protected-resource'));
    const browser = await worker.fetch(new Request('https://mcp.stevenpisani.com/', { headers: { accept: 'text/html' } }));
    const [a, b] = seen;
    ok(a.url === 'https://ref.supabase.co/functions/v1/mcp' && a.init.headers.get('x-mcp-public-host') === 'mcp.stevenpisani.com' && a.init.headers.get('authorization') === 'Bearer t' && a.init.headers.get('mcp-protocol-version') === '2025-11-25' && new TextDecoder().decode(a.init.body) === '{"jsonrpc":"2.0"}' && res.status === 401 && res.headers.get('www-authenticate') === 'Bearer x', 'the proxy passes a call through whole, and the answer back', a);
    ok(b.url === 'https://ref.supabase.co/functions/v1/mcp/.well-known/oauth-protected-resource' && meta.status === 401 && browser.status === 302 && browser.headers.get('location') === 'https://stevenpisani.com/apps/wardrobe' && seen.length === 2, 'and its metadata; a browser is sent to the app');
  } finally { globalThis.fetch = real; }
}

let refused = false;
try { await insert('wardrobe_items', { name: 'x', category: 'tops', variant_id: steveVariant }); } catch (e) { refused = e.code === '42501'; }
ok(refused, 'and can\'t point an item at Steve\'s variant');

console.log(`wardrobe: ${passed} checks against the real schema: the Uniqlo migration, ingesting (new, new colour, second piece, no brand, photos with roles, duplicates and retries, dry run), sources, flat and whole reads, scoped changes, retiring, trips, and each person's own`);
