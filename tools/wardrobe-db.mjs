// The wardrobe's database for tests, the real one: every migration in supabase/migrations/ run
// in PGlite (Postgres in WebAssembly, in this process), with a few stand-ins for what Supabase
// provides (auth.uid(), auth.users, storage, the roles), the first ChatGPT test's three Uniqlo
// garments seeded as they were before the migration that regroups them, and a ctx (what
// supabase/functions/mcp/index.ts gives the MCP server on supabase-js) on SQL. Used by
// tools/wardrobe-test.mjs and tools/smoke.mjs.
//
//   const w = await wardrobeDb();   every migration run, the old rows seeded on the way; w.q, w.db
//   const as = await w.signIn();    Supabase's default grants, then everything as Steve
//   w.ctx                           the MCP server's data access (photos and weather made up)
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('../supabase/migrations/', import.meta.url);
export const STEVE = '11111111-1111-4111-8111-111111111111', OTHER = '22222222-2222-4222-8222-222222222222';
export const IDS = { darkBrown: 'a2f51ba0-6d53-4ab9-8e14-0975d338b22d', darkGray: '7e457d30-877c-4c2a-97ac-36b02abfeffd', brown: '240e0d92-7fe5-4433-8bbf-3af32519224b' };

export async function wardrobeDb() {
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

  const steveVariant = (await q(`select id from public.wardrobe_variants limit 1`))[0]?.id;
  const signIn = async () => {

    // what Supabase grants by default, then everything below as a signed-in member
    await db.exec(`
      grant usage on schema public, auth, storage to authenticated;
      grant all on all tables in schema public to authenticated;
      grant execute on all functions in schema public, auth to authenticated;
      set role authenticated;
    `);
    const as = (uid, email) => db.exec(`set request.jwt.claims = '${JSON.stringify({ sub: uid, email, role: 'authenticated' })}'`);
    await as(STEVE, 'steve@example.com');

    return as;
  };
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
  return { db, q, run, migrations, signIn, ctx, insert, uploads, steveVariant };
}
