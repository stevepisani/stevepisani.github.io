-- Trips for the wardrobe (/apps/wardrobe, Trips; docs/apps.md): where Steve's going and when, what
-- he'll wear each day, and what to pack. Private to its owner like the clothes. Mostly built in
-- ChatGPT through the wardrobe MCP server; the app shows it, with the weather, and ticks off the
-- packing. The parts are small lists, kept on the trip as JSON (checked by the MCP server and the
-- app, which are the only writers):
--   legs:    [{ place, country, lat, lon, from: "YYYY-MM-DD", to: "YYYY-MM-DD" }]  in order
--   days:    [{ date, occasion, items: [wardrobe item ids], note }]                 one per date
--   packing: [{ item_id, label, qty, packed }]   an item from the wardrobe, or a label ("charger")
create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  notes text,
  legs jsonb not null default '[]' check (jsonb_typeof(legs) = 'array'),
  days jsonb not null default '[]' check (jsonb_typeof(days) = 'array'),
  packing jsonb not null default '[]' check (jsonb_typeof(packing) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists trips_owner on public.trips (owner);
alter table public.trips enable row level security;
drop policy if exists "owner" on public.trips;
create policy "owner" on public.trips for all to authenticated
  using ((select public.is_member()) and owner = (select auth.uid()))
  with check ((select public.is_member()) and owner = (select auth.uid()));
drop trigger if exists trg_trips_updated_at on public.trips;
create trigger trg_trips_updated_at before update on public.trips
  for each row execute function public.set_updated_at();
