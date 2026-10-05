-- The trash (docs/apps.md, "The trash"): a garment, trip or photo deleted, from a chat or the app,
-- isn't gone at once. deleted_at is set, everything that lists them leaves it out, and it can be
-- restored for 30 days; then empty_trash() deletes it for good and hands back the photo files no
-- longer used, which the weekly Supabase job removes from Storage (tools/empty-trash.mjs).
alter table public.wardrobe_items add column if not exists deleted_at timestamptz;
alter table public.wardrobe_photos add column if not exists deleted_at timestamptz;
alter table public.trips add column if not exists deleted_at timestamptz;

-- The closet leaves the trash out (same columns as before)
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
left join public.wardrobe_products p on p.id = v.product_id
where i.deleted_at is null; -- the closet leaves the trash out

-- Everything in the trash more than `days` days, deleted for good; returns the photo files nothing
-- uses any more. Only the service role runs it (the weekly job), across everyone's rows.
create or replace function public.empty_trash(days integer default 30) returns setof text
language plpgsql security definer set search_path = public as $$
declare
  cutoff timestamptz := now() - make_interval(days => days);
  files text[];
begin
  -- never for a visitor or a member, even if granted by mistake: the weekly job has no JWT
  if auth.jwt() ->> 'role' in ('anon', 'authenticated') then raise exception 'empty_trash is for the weekly job'; end if;
  select coalesce(array_agg(distinct f), '{}') into files from (
    select p.path as f from public.wardrobe_photos p
      left join public.wardrobe_items i on i.id = p.item_id
      where p.deleted_at < cutoff or i.deleted_at < cutoff
    union all
    select photo_path from public.wardrobe_items where deleted_at < cutoff and photo_path is not null
    union all
    select photo_original from public.wardrobe_items where deleted_at < cutoff and photo_original is not null
  ) gone;
  delete from public.wardrobe_photos where deleted_at < cutoff;
  delete from public.wardrobe_items where deleted_at < cutoff; -- their photos go with them
  delete from public.trips where deleted_at < cutoff;
  return query select f from unnest(files) f
    where not exists (select 1 from public.wardrobe_photos p where p.path = f)
      and not exists (select 1 from public.wardrobe_items i where i.photo_path = f or i.photo_original = f);
end $$;
revoke all on function public.empty_trash(integer) from public, anon, authenticated;
grant execute on function public.empty_trash(integer) to service_role;
