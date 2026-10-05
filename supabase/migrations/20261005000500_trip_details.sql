-- Trips, in detail (docs/apps.md, "Trips"): who's going, where they sleep, how they get there, what
-- goes in which bag, and a packing list everyone shares. The trip keeps its legs (place and dates,
-- for the weather) and its days; what follows is added beside them.
--
--   trips.travelers  [{ id, key, name, type, notes }]  who's going: key ("steve", "dominic") is what
--                    packing and bags point at; type adult | child | infant | other
--   trips.laundry    { available, frequency_days, notes } or null: can clothes be washed on the way
--   trips.days[]     gains activities: [{ id, title, type, start_time, end_time, location, notes }]
--
-- The parts with their own tables (each row its own id; a trip's parts go with the trip, to the
-- trash and out of it): packing entries, bags, transport, lodging and resources (links: insurance,
-- tickets, bookings). Kinds (a bag's type, a category, an activity) are checked by the MCP server,
-- not here, so a new one needs no migration; a packing entry's status is checked here.
alter table public.trips
  add column if not exists travelers jsonb not null default '[]' check (jsonb_typeof(travelers) = 'array'),
  add column if not exists laundry jsonb check (laundry is null or jsonb_typeof(laundry) = 'object');

-- A part of a trip is its owner's, and on one of their trips
create or replace function public.trip_part_ok(trip uuid, who uuid) returns boolean
language sql stable set search_path = public as $$
  select (select public.is_member()) and who = (select auth.uid())
    and exists (select 1 from public.trips t where t.id = trip and t.owner = (select auth.uid()))
$$;

-- Bags and other things that carry: checked_1, steve_carry_on, stroller
create table if not exists public.trip_bags (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_]{1,40}$'),
  label text not null check (char_length(label) between 1 and 120),
  type text,
  traveler_key text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id, key),
  unique (trip_id, id)
);

-- The packing list: a wardrobe item (by id, never copied) or anything else by label
create table if not exists public.trip_packing (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- no foreign key: a garment deleted later stays named here, and the trip says it's gone
  item_id uuid,
  label text check (label is null or char_length(label) between 1 and 120),
  traveler_key text,
  category text not null default 'misc',
  qty integer not null default 1 check (qty between 1 and 999),
  status text not null default 'needed' check (status in ('needed', 'to_buy', 'ready', 'packed')),
  bag_id uuid,
  essential boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (item_id is not null or label is not null),
  -- a bag of the same trip; taking the bag away leaves the entry, unassigned
  foreign key (trip_id, bag_id) references public.trip_bags (trip_id, id) on delete set null (bag_id)
);

-- Flights, trains, transfers: times as given (ISO 8601, with the place's UTC offset when known)
create table if not exists public.trip_transport (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null,
  date date not null,
  origin text not null,
  destination text not null,
  origin_code text,
  destination_code text,
  departure_time text,
  arrival_time text,
  carrier text,
  number text,
  confirmation text,
  booking_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trip_lodging (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  place text,
  address text,
  check_in date not null,
  check_out date not null check (check_out >= check_in),
  confirmation text,
  booking_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trip_resources (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null default 'other',
  label text not null check (char_length(label) between 1 and 200),
  url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['trip_bags', 'trip_packing', 'trip_transport', 'trip_lodging', 'trip_resources'] loop
    execute format('create index if not exists %1$s_trip on public.%1$s (trip_id)', t);
    execute format('alter table public.%s enable row level security', t);
    execute format('drop policy if exists "owner" on public.%s', t);
    execute format('create policy "owner" on public.%s for all to authenticated using (public.trip_part_ok(trip_id, owner)) with check (public.trip_part_ok(trip_id, owner))', t);
    execute format('drop trigger if exists trg_%1$s_updated_at on public.%1$s', t);
    execute format('create trigger trg_%1$s_updated_at before update on public.%1$s for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- The packing kept on the trip until now becomes entries, in the same order: a ticked one is
-- packed, the rest needed; a garment is clothing, shoes or accessories by its category, anything
-- else misc; nobody's and in no bag (nothing made up). Then the old list goes.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'trips' and column_name = 'packing') then
    insert into public.trip_packing (trip_id, owner, item_id, label, qty, status, category, created_at)
    select t.id, t.owner, (e.p ->> 'item_id')::uuid, nullif(left(trim(e.p ->> 'label'), 120), ''),
      least(999, greatest(1, coalesce((e.p ->> 'qty')::int, 1))),
      case when coalesce((e.p ->> 'packed')::boolean, false) then 'packed' else 'needed' end,
      case when e.p ->> 'item_id' is null then 'misc'
        else coalesce((select case i.category when 'shoes' then 'shoes' when 'accessories' then 'accessories' else 'clothing' end
          from public.wardrobe_items i where i.id = (e.p ->> 'item_id')::uuid), 'clothing') end,
      t.created_at + e.n * interval '1 millisecond'
    from public.trips t, jsonb_array_elements(t.packing) with ordinality as e(p, n)
    where e.p ->> 'item_id' is not null or nullif(trim(e.p ->> 'label'), '') is not null;
    alter table public.trips drop column packing;
  end if;
end $$;

-- The trash's emptying (20261005000400_trash.sql) takes a trip's parts with it: the foreign keys
-- cascade, so nothing more is needed there.
