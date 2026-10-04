// The wardrobe's data and its MCP server, tested against the real schema: every migration in
// supabase/migrations/ runs in PGlite (Postgres in WebAssembly, in this process), with a few
// stand-ins for what Supabase provides (auth.uid(), auth.users, storage, the roles). The three
// garments from the first ChatGPT test are seeded as they were, before the migration that
// regroups them, so that migration is tested on what it'll really meet. Then the MCP tools run
// as Steve, signed in, through row-level security, with the photos and the weather made up.
// Offline, a few seconds.
//
//   node tools/wardrobe-test.mjs
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { rpc, TOOLS } from '../supabase/functions/mcp/server.js';

const dir = new URL('../supabase/migrations/', import.meta.url);
const STEVE = '11111111-1111-4111-8111-111111111111', OTHER = '22222222-2222-4222-8222-222222222222';
const IDS = { darkBrown: 'a2f51ba0-6d53-4ab9-8e14-0975d338b22d', darkGray: '7e457d30-877c-4c2a-97ac-36b02abfeffd', brown: '240e0d92-7fe5-4433-8bbf-3af32519224b' };
let passed = 0;
const ok = (cond, what, detail) => { if (!cond) throw new Error(`wardrobe: ${what}${detail !== undefined ? `\n  got ${JSON.stringify(detail).slice(0, 600)}` : ''}`); passed++; };

// numbers as numbers, times and dates as text, as PostgREST gives them
const db = new PGlite({ parsers: { 1700: Number, 1184: String, 1114: String, 1082: String } });
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth; create table auth.users (id uuid primary key, email text);
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
  create schema storage; create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
`);
const migrations = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const run = async (f) => db.exec(readFileSync(new URL(f, dir), 'utf8'));
for (const f of migrations.filter((f) => f < '20261005')) await run(f);

// as the first ChatGPT test left them: three unrelated items, the tag's facts in the notes, the
// garment type in fit, and a trip that already points at one of them
await db.exec(`
  insert into auth.users values ('${STEVE}', 'steve@example.com'), ('${OTHER}', 'other@example.com');
  insert into public.members (email) values ('steve@example.com'), ('other@example.com');
  insert into public.wardrobe_items (id, owner, name, category, photo_path, photo_file_id, brand, colour, size, fit, material, seasons, warmth, dressiness, price, currency, notes) values
    ('${IDS.darkBrown}', '${STEVE}', 'Uniqlo Soft Brushed Crew Neck Long Sleeve T (Dark Brown)', 'tops', 'wardrobe/${STEVE}/tag-38.jpg', 'file-tag-38', 'Uniqlo', '38 Dark Brown', 'M', 'regular crew-neck long-sleeve tee', '100% cotton', '{spring,autumn,winter}', 'mid', 'casual', 29.90, 'USD',
      'Soft Brushed Crew Neck Long Sleeve T. Product code RN139864 / HT00189AD-US. Chest 38-41 in. Bought at the SoHo store.'),
    ('${IDS.darkGray}', '${STEVE}', 'Uniqlo Soft Brushed Crew Neck Long Sleeve T (Dark Gray)', 'tops', 'wardrobe/${STEVE}/shirt-08.jpg', null, 'Uniqlo', '08 Dark Gray', 'M', 'regular crew-neck long-sleeve tee', '100% cotton', '{spring,autumn,winter}', 'mid', 'casual', 29.90, 'USD',
      'Soft Brushed Crew Neck Long Sleeve T. Product code RN139864 / HT00189AD-US. Chest 38-41 in.'),
    ('${IDS.brown}', '${STEVE}', 'Uniqlo Soft Brushed Crew Neck Long Sleeve T (Brown)', 'tops', null, null, 'Uniqlo', '34 Brown', 'M', 'regular crew-neck long-sleeve tee', '100% cotton', '{spring,autumn,winter}', 'mid', 'casual', 29.90, 'USD', null),
    ('33333333-3333-4333-8333-333333333333', '${STEVE}', 'Brown suede loafers', 'shoes', null, null, null, 'brown', '10', null, 'suede', '{spring,summer,autumn}', null, 'smart', null, 'USD', null);
  insert into public.trips (owner, name, legs, days, packing) values ('${STEVE}', 'Europe, autumn',
    '[{"place":"London","country":"United Kingdom","lat":51.5,"lon":-0.12,"from":"2026-10-07","to":"2026-10-14"}]',
    '[{"date":"2026-10-08","items":["${IDS.darkGray}","33333333-3333-4333-8333-333333333333"],"occasion":"Museums"}]',
    '[{"item_id":"${IDS.darkBrown}","qty":1,"packed":true}]');
`);
for (const f of migrations.filter((f) => f >= '20261005')) await run(f);

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

const steveVariant = (await q(`select id from public.wardrobe_variants limit 1`))[0].id;

// what Supabase grants by default, then everything below as a signed-in member
await db.exec(`
  grant usage on schema public, auth, storage to authenticated;
  grant all on all tables in schema public to authenticated;
  grant execute on all functions in schema public, auth to authenticated;
  set role authenticated;
`);
const as = (uid, email) => db.exec(`set request.jwt.claims = '${JSON.stringify({ sub: uid, email, role: 'authenticated' })}'`);
await as(STEVE, 'steve@example.com');

// ---------- The ctx index.ts builds on supabase-js, here on SQL ----------
const insert = async (table, row) => {
  const cols = Object.keys(row).map((c) => `"${c}"`).join(', ');
  return (await q(`insert into public.${table} (${cols}) select ${cols} from jsonb_populate_record(null::public.${table}, $1::jsonb) returning *`, [JSON.stringify(row)]))[0];
};
const update = async (table, id, patch) => {
  const cols = Object.keys(patch).map((c) => `"${c}"`).join(', ');
  return (await q(`update public.${table} set (${cols}) = (select ${cols} from jsonb_populate_record(null::public.${table}, $1::jsonb)) where id = $2 returning *`, [JSON.stringify(patch), id]))[0] || null;
};
const byId = async (sql, id) => { try { return (await q(sql, [id]))[0] || null; } catch (e) { if (e.code === '22P02') return null; throw e; } };
const closetRow = (id) => byId(`select * from public.wardrobe_closet where id = $1`, id);
const uploads = [];
const ctx = {
  items: {
    list: () => q(`select * from public.wardrobe_closet`),
    get: closetRow,
    own: (id) => byId(`select * from public.wardrobe_items where id = $1`, id),
    add: async (row) => closetRow((await insert('wardrobe_items', row)).id),
    set: async (id, patch) => { const r = await update('wardrobe_items', id, patch).catch((e) => { if (e.code === '22P02') return null; throw e; }); return r && closetRow(id); },
  },
  products: {
    list: () => q(`select * from public.wardrobe_products`),
    get: (id) => byId(`select * from public.wardrobe_products where id = $1`, id),
    add: (row) => insert('wardrobe_products', row),
    set: (id, patch) => update('wardrobe_products', id, patch),
  },
  variants: {
    list: (productId) => q(`select * from public.wardrobe_variants where product_id = $1`, [productId]),
    get: (id) => byId(`select * from public.wardrobe_variants where id = $1`, id),
    add: (row) => insert('wardrobe_variants', row),
    set: (id, patch) => update('wardrobe_variants', id, patch),
  },
  photos: {
    list: (itemId) => q(`select * from public.wardrobe_photos where item_id = $1 order by created_at, id`, [itemId]),
    get: (id) => byId(`select * from public.wardrobe_photos where id = $1`, id),
    byFile: async (fileId) => (await q(`select * from public.wardrobe_photos where file_id = $1 limit 1`, [fileId]))[0] || null,
    add: async (rows) => { for (const r of rows) await insert('wardrobe_photos', r); },
    set: (id, patch) => update('wardrobe_photos', id, patch),
  },
  photoUrls: async (paths) => new Map(paths.map((p) => [p, `https://example.com/signed/${p}`])),
  readProduct: async (url) => ({ url, name: 'Linen shirt', brand: 'Shopco', image: 'https://example.com/shirt.jpg', price: 60, currency: 'EUR' }),
  storeImage: async () => `wardrobe/${STEVE}/linen.jpg`,
  storeUpload: async (file) => { if (/broken/.test(file.download_url)) return null; uploads.push(file.file_id); return `wardrobe/${STEVE}/${file.file_id}.jpg`; },
  trips: {
    list: () => q(`select * from public.trips`),
    get: (id) => byId(`select * from public.trips where id = $1`, id),
    add: (row) => insert('trips', row),
    set: (id, patch) => update('trips', id, patch),
  },
  locate: async (place) => ({ name: place.split(',')[0], country: 'Italy', lat: 43.8, lon: 11.2 }),
  weather: async (leg) => ({ kind: 'typical', days: [{ date: leg.from, hi: 20, lo: 11, rain: 30, kind: 'typical' }], summary: { hi: 20, lo: 11, wet: 9 } }),
};
const ask = async (method, params) => (await rpc({ jsonrpc: '2.0', id: 1, method, params }, ctx)).result;
const tool = async (name, args) => { const r = await ask('tools/call', { name, arguments: args }); return { ...r.structuredContent, text: r.content[0].text, error: r.isError }; };
const file = (id) => ({ download_url: `https://files.example/${id}`, file_id: id, mime_type: 'image/jpeg' });
const count = async (table) => (await q(`select count(*)::int as n from public.${table}`))[0].n;

// ---------- The protocol ----------
ok((await ask('initialize', { protocolVersion: '2025-06-18' })).protocolVersion === '2025-06-18' && (await ask('initialize', { protocolVersion: '2025-11-25' })).protocolVersion === '2025-11-25', 'the handshake picks the asked protocol (ChatGPT\'s and Claude\'s)');
ok(TOOLS.every((t) => t.title && t.annotations && (t.annotations.readOnlyHint || /changes only Steve's private wardrobe/.test(t.description))), 'every tool has a title and hints, and every write says plainly what it touches');
const { tools } = await ask('tools/list');
ok(tools.length === TOOLS.length && tools.find((t) => t.name === 'find_items').annotations.readOnlyHint && !tools.find((t) => t.name === 'ingest_item').annotations.readOnlyHint, 'tools/list, with read-only hints');
ok(TOOLS.find((t) => t.name === 'ingest_item')._meta['openai/fileParams'].join() === 'garment_photo,tag_photo,care_label_photo,detail_photos', 'ingest_item takes uploaded photos');
ok((await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, ctx)) === null, 'a notification gets no answer');
ok((await tool('delete_item', { id: IDS.brown })).error, 'there is no way to delete');

// ---------- A. New product, new variant, owned item, with photos ----------
const crew = {
  product: { brand: 'Everlane', name: 'The Organic Cotton Crew', style_number: 'EV-1042', material: '100% organic cotton', country_of_origin: 'Peru', sources: { brand: 'garment_label', name: 'hang_tag', style_number: 'hang_tag', material: { source: 'care_label', confidence: 1, raw: '100% ORGANIC COTTON' }, country_of_origin: 'care_label' } },
  variant: { manufacturer_colour: 'White', manufacturer_size: 'M', price: 30, currency: 'USD', sources: { manufacturer_colour: 'hang_tag', manufacturer_size: 'garment_label', price: 'hang_tag', currency: 'hang_tag' } },
  item: { category: 'tops', subcategory: 'T-shirt', warmth: 'light', dressiness: 'casual', dressiness_also: ['smart casual'], bought_on: '2026-05-01', sources: { warmth: { source: 'vision_inference', confidence: 0.85 } } },
};
const a = await tool('ingest_item', { ...crew, garment_photo: file('crew-front'), tag_photo: file('crew-tag'), care_label_photo: file('crew-care'), client_ref: 'crew-white-1' });
ok(!a.error && a.product_created && a.variant_created && a.owned_item_created && a.item_ids.length === 1, 'A: a new product, variant and owned item', a);
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
ok(Number.isInteger(all.count) && Array.isArray(all.items), 'H: find_items answers its outputSchema');
ok(darkBrown && darkBrown.name === 'Soft Brushed Crew Neck Long Sleeve T' && darkBrown.manufacturer_colour === '38 Dark Brown' && darkBrown.colour === 'dark brown' && darkBrown.product_id && darkBrown.variant_id && darkBrown.style_number === 'HT00189AD-US', 'H: find_items gives each piece flat, no joining needed', darkBrown);
ok(all.items.find((i) => i.id === IDS.darkGray).hero_photo, 'H: with the photo shown');
const smart = await tool('find_items', { category: 'tops', dressiness: 'smart casual' });
ok(smart.items.some((i) => i.id === crewItem) && !smart.items.some((i) => i.id === IDS.darkBrown), 'H: "smart casual tops" finds a casual tee that also works smart casual', smart.items.map((i) => i.name));
ok((await tool('find_items', { query: 'HT00189AD' })).count === 4, 'H: a style number finds every piece of that product');
ok((await tool('find_items', { query: '38 dark brown' })).items.length === 1, 'H: the colour as printed finds the piece');
ok((await tool('find_items', { warmth: 'warm' })).items.every((i) => i.warmth === 'warm'), 'H: warm things');

// ---------- I. get_item, whole ----------
const i = await tool('get_item', { id: IDS.darkBrown });
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
ok(/Museums: Soft Brushed Crew Neck Long Sleeve T, Brown suede loafers/.test(tr.text) && /Soft Brushed Crew Neck Long Sleeve T ✓/.test(tr.text), 'M: a trip planned before the migration still names the same pieces', tr.text);
const planned = await tool('plan_days', { trip_id: trip.id, days: [{ date: '2026-10-09', items: [crewItem, IDS.brown], occasion: 'Walk' }] });
ok(!planned.error && planned.planned === 2, 'M: planning with the new ids works');
ok((await tool('set_packing', { trip_id: trip.id, items: [{ item_id: IDS.darkBrown }, { item_id: crewItem, qty: 2 }] })).count === 2 && (await q(`select packing from public.trips`))[0].packing[0].packed === true, 'M: packing keeps what was ticked');

// ---------- add_item, the quick way ----------
const quick = await tool('add_item', { name: 'Linen shirt', category: 'tops', buy_link: 'shopco.example/linen' });
ok(quick.item.brand === 'Shopco' && quick.item.price === 60 && quick.owned_item.sources.brand.source === 'retailer_page' && quick.photos[0].source === 'retailer_page', 'add_item: a quick item from a link, with sources and the shop\'s picture', quick);
const up = await tool('add_item', { name: 'Grey overshirt', category: 'outerwear', photo: file('overshirt') });
ok((await tool('add_item', { name: 'Grey overshirt', category: 'outerwear', photo: file('overshirt') })).item.id === up.item.id, 'add_item: the same upload twice is one item');
ok((await tool('add_item', { name: 'x', category: 'tops', dressiness: 'black tie' })).error, 'add_item: a value that isn\'t one is refused');

// ---------- Each person's own ----------
await as(OTHER, 'other@example.com');
ok((await tool('find_items', { include_retired: true })).count === 0 && (await tool('get_item', { id: IDS.darkBrown })).error, 'someone else sees none of Steve\'s clothes');
ok((await tool('ingest_item', { product: { brand: 'Uniqlo', name: 'Soft Brushed Crew Neck Long Sleeve T', style_number: 'HT00189AD-US' }, variant: { manufacturer_colour: '38 Dark Brown', manufacturer_size: 'M' }, item: { category: 'tops' } })).product_created, 'and their own Uniqlo shirt is their own product');
let refused = false;
try { await insert('wardrobe_items', { name: 'x', category: 'tops', variant_id: steveVariant }); } catch (e) { refused = e.code === '42501'; }
ok(refused, 'and can\'t point an item at Steve\'s variant');

console.log(`wardrobe: ${passed} checks against the real schema: the Uniqlo migration, ingesting (new, new colour, second piece, no brand, photos with roles, duplicates and retries, dry run), sources, flat and whole reads, scoped changes, retiring, trips, and each person's own`);
