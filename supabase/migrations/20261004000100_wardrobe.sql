-- The wardrobe (/apps/wardrobe; docs/apps.md): Steve's clothes, each with a photo, what it is, and
-- where to buy another. Private to its owner, not shared between members: every row belongs to
-- the account that added it, and only that account sees it. ChatGPT reaches it through the
-- wardrobe MCP server, signed in as the same account, so the same rules apply.
create table if not exists public.wardrobe_items (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  category text not null default 'tops'
    check (category in ('tops', 'bottoms', 'outerwear', 'suits', 'shoes', 'accessories', 'workout', 'swim')),
  photo_path text,
  brand text,
  colour text,
  size text,
  fit text,                 -- how it fits: "runs small, size up"
  material text,
  seasons text[] not null default '{}' check (seasons <@ array['spring', 'summer', 'autumn', 'winter']),
  warmth text check (warmth in ('light', 'mid', 'warm')),
  dressiness text check (dressiness in ('casual', 'smart casual', 'smart', 'formal')),
  price numeric(10, 2) check (price >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  bought_on date,
  buy_link text,            -- where to buy another
  notes text,
  retired boolean not null default false, -- worn out or given away: kept, but out of the closet
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wardrobe_items_owner on public.wardrobe_items (owner, category);
alter table public.wardrobe_items enable row level security;
drop policy if exists "owner" on public.wardrobe_items;
create policy "owner" on public.wardrobe_items for all to authenticated
  using ((select public.is_member()) and owner = (select auth.uid()))
  with check ((select public.is_member()) and owner = (select auth.uid()));
drop trigger if exists trg_wardrobe_items_updated_at on public.wardrobe_items;
create trigger trg_wardrobe_items_updated_at before update on public.wardrobe_items
  for each row execute function public.set_updated_at();

-- Photos: the bucket stays members-only, but the wardrobe's folder is per person:
-- wardrobe/<owner id>/... is that account's alone. (Permissive policies add up, so this is one
-- policy with both rules, not a second one.)
drop policy if exists "photos: members" on storage.objects;
create policy "photos: members" on storage.objects for all to authenticated
  using (bucket_id = 'photos' and (select public.is_member())
    and (split_part(name, '/', 1) <> 'wardrobe' or split_part(name, '/', 2) = (select auth.uid())::text))
  with check (bucket_id = 'photos' and (select public.is_member())
    and (split_part(name, '/', 1) <> 'wardrobe' or split_part(name, '/', 2) = (select auth.uid())::text));
