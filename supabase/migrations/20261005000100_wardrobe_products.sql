-- The wardrobe's model, a step deeper (docs/apps.md): what a garment is, apart from Steve's copy
-- of it. Three levels, each optional above the first:
--   wardrobe_items     the garment Steve owns, one row per physical piece (ids unchanged; trips
--                      point at these). Always there. Holds what's his alone: when and for how
--                      much he got it, its condition, notes, and how it's classified for
--                      dressing (category, warmth, dressiness, seasons, style tags). Any product
--                      or variant fact set here overrides the product's for this piece only.
--   wardrobe_variants  one colour and size of a product as sold: the maker's colour and size as
--                      printed ("38 Dark Brown", "M"), plain ones for search, SKU, barcode,
--                      retail price, measurements.
--   wardrobe_products  the garment as sold: brand, name, style number, material, origin.
-- A thrifted or unbranded piece is just an item. Each level keeps `sources`: per field, where the
-- value came from (user, garment_label, hang_tag, care_label, retailer_page, manufacturer_page,
-- vision_inference, derived), how sure (confidence 0 to 1) and the text as found (raw).
-- wardrobe_photos holds every photo of an item with its role; the item's photo_path is the one
-- shown. wardrobe_closet is the flat, resolved view everything reads.

create table if not exists public.wardrobe_products (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  brand text not null check (char_length(brand) between 1 and 120),
  name text not null check (char_length(name) between 1 and 200),
  style_number text,          -- the maker's style or product code, as printed
  description text,
  material text,              -- "100% cotton"
  country_of_origin text,
  default_fit text,           -- "regular", "slim"
  product_url text,           -- the maker's or a shop's page for it
  identifiers jsonb not null default '{}' check (jsonb_typeof(identifiers) = 'object'), -- other codes, by what they're called on the label
  sources jsonb not null default '{}' check (jsonb_typeof(sources) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- one product per brand and style number (the strongest identity there is; spaces and dashes aside)
create unique index if not exists wardrobe_products_style on public.wardrobe_products
  (owner, lower(brand), upper(regexp_replace(style_number, '[^A-Za-z0-9]', '', 'g'))) where style_number is not null;
create index if not exists wardrobe_products_brand on public.wardrobe_products (owner, lower(brand));

create table if not exists public.wardrobe_variants (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_id uuid not null references public.wardrobe_products (id) on delete restrict,
  manufacturer_colour text,   -- as printed: "38 Dark Brown"
  colour text,                -- plain: "dark brown"
  manufacturer_size text,     -- as printed: "M", "32x30", "EU 43"
  size text,                  -- plain: "M"
  sku text,
  barcode text,
  price numeric(10, 2) check (price >= 0), -- retail price
  currency text check (currency ~ '^[A-Z]{3}$'),
  measurements jsonb not null default '{}' check (jsonb_typeof(measurements) = 'object'), -- {"chest": "38–41 in"}
  identifiers jsonb not null default '{}' check (jsonb_typeof(identifiers) = 'object'),
  sources jsonb not null default '{}' check (jsonb_typeof(sources) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- one variant per colour and size of a product
create unique index if not exists wardrobe_variants_key on public.wardrobe_variants
  (product_id, lower(coalesce(manufacturer_colour, colour, '')), lower(coalesce(manufacturer_size, size, '')));

alter table public.wardrobe_items
  alter column name drop not null,
  add column if not exists variant_id uuid references public.wardrobe_variants (id) on delete restrict,
  add column if not exists subcategory text,           -- "long_sleeve_t_shirt", "chelsea_boots"
  add column if not exists dressiness_also text[] not null default '{}'
    check (dressiness_also <@ array['casual', 'smart casual', 'smart', 'formal']), -- where else it works
  add column if not exists style_tags text[] not null default '{}',
  add column if not exists condition text,             -- "new", "good", "worn at the cuffs"
  add column if not exists retired_at timestamptz,
  add column if not exists sources jsonb not null default '{}' check (jsonb_typeof(sources) = 'object'),
  add column if not exists ingest_key text;            -- the caller's id for an ingestion, so a retry adds nothing
alter table public.wardrobe_items drop constraint if exists wardrobe_items_named;
alter table public.wardrobe_items add constraint wardrobe_items_named check (name is not null or variant_id is not null);
create unique index if not exists wardrobe_items_ingest_key on public.wardrobe_items (owner, ingest_key) where ingest_key is not null;
create index if not exists wardrobe_items_variant on public.wardrobe_items (variant_id);

create table if not exists public.wardrobe_photos (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id uuid not null references public.wardrobe_items (id) on delete cascade,
  role text not null default 'garment' check (role in ('garment', 'tag', 'care_label', 'detail', 'other')),
  path text not null,         -- in the photos bucket, under wardrobe/<owner>/
  source text,                -- chatgpt_upload, app_upload, retailer_page, generated, ...
  file_id text,               -- the chat upload it came from, so the same one isn't added twice
  created_at timestamptz not null default now()
);
create index if not exists wardrobe_photos_item on public.wardrobe_photos (item_id);
create unique index if not exists wardrobe_photos_file on public.wardrobe_photos (item_id, file_id) where file_id is not null;

-- Each person's own rows; what's linked must be theirs too
alter table public.wardrobe_products enable row level security;
alter table public.wardrobe_variants enable row level security;
alter table public.wardrobe_photos enable row level security;
drop policy if exists "owner" on public.wardrobe_products;
create policy "owner" on public.wardrobe_products for all to authenticated
  using ((select public.is_member()) and owner = (select auth.uid()))
  with check ((select public.is_member()) and owner = (select auth.uid()));
drop policy if exists "owner" on public.wardrobe_variants;
create policy "owner" on public.wardrobe_variants for all to authenticated
  using ((select public.is_member()) and owner = (select auth.uid()))
  with check ((select public.is_member()) and owner = (select auth.uid())
    and exists (select 1 from public.wardrobe_products p where p.id = product_id and p.owner = (select auth.uid())));
drop policy if exists "owner" on public.wardrobe_photos;
create policy "owner" on public.wardrobe_photos for all to authenticated
  using ((select public.is_member()) and owner = (select auth.uid()))
  with check ((select public.is_member()) and owner = (select auth.uid())
    and exists (select 1 from public.wardrobe_items i where i.id = item_id and i.owner = (select auth.uid())));
drop policy if exists "owner" on public.wardrobe_items;
create policy "owner" on public.wardrobe_items for all to authenticated
  using ((select public.is_member()) and owner = (select auth.uid()))
  with check ((select public.is_member()) and owner = (select auth.uid())
    and (variant_id is null or exists (select 1 from public.wardrobe_variants v where v.id = variant_id and v.owner = (select auth.uid()))));
drop trigger if exists trg_wardrobe_products_updated_at on public.wardrobe_products;
create trigger trg_wardrobe_products_updated_at before update on public.wardrobe_products
  for each row execute function public.set_updated_at();
drop trigger if exists trg_wardrobe_variants_updated_at on public.wardrobe_variants;
create trigger trg_wardrobe_variants_updated_at before update on public.wardrobe_variants
  for each row execute function public.set_updated_at();

-- The closet, flat: each owned piece with its variant's and product's facts filled in where the
-- piece doesn't say otherwise. As the person reading it (security_invoker), so their rules apply.
create or replace view public.wardrobe_closet with (security_invoker = true) as
select i.id, i.owner,
  coalesce(i.name, p.name) as name,
  i.category, i.subcategory,
  coalesce(i.brand, p.brand) as brand,
  coalesce(i.colour, v.colour) as colour,
  v.manufacturer_colour,
  coalesce(i.size, v.size, v.manufacturer_size) as size,
  v.manufacturer_size,
  coalesce(i.material, p.material) as material,
  coalesce(i.fit, p.default_fit) as fit,
  i.warmth, i.dressiness, i.dressiness_also, i.seasons, i.style_tags,
  coalesce(i.price, v.price) as price,
  case when i.price is not null then i.currency else coalesce(v.currency, i.currency) end as currency,
  i.bought_on,
  coalesce(i.buy_link, p.product_url) as buy_link,
  i.notes, i.condition, i.retired, i.retired_at,
  i.photo_path, i.photo_original, i.photo_file_id,
  p.id as product_id, i.variant_id,
  p.style_number, p.country_of_origin, v.sku, v.measurements,
  i.ingest_key, i.created_at, i.updated_at
from public.wardrobe_items i
left join public.wardrobe_variants v on v.id = i.variant_id
left join public.wardrobe_products p on p.id = v.product_id;

-- What every photo already in use was (the photo shown, and any original kept beside it), so
-- every item's pictures are in one place
insert into public.wardrobe_photos (owner, item_id, role, path, source, file_id, created_at)
select i.owner, i.id, 'garment', i.photo_path, case when i.photo_file_id is not null then 'chatgpt_upload' end, i.photo_file_id, i.created_at
from public.wardrobe_items i
where i.photo_path is not null and not exists (select 1 from public.wardrobe_photos f where f.item_id = i.id and f.path = i.photo_path);
insert into public.wardrobe_photos (owner, item_id, role, path, source, created_at)
select i.owner, i.id, 'other', i.photo_original, 'original', i.created_at
from public.wardrobe_items i
where i.photo_original is not null and not exists (select 1 from public.wardrobe_photos f where f.item_id = i.id and f.path = i.photo_original);
