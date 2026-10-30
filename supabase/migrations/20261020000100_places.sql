-- Places, and the inbox they come in through (docs/apps.md, "Places"; docs/vision.md, rules 1, 4
-- and 5). Safe to run again.
--
-- The inbox: one row for each thing that came in raw, kept as it came (a Takeout file today;
-- later photos, links, receipts), with its files in the photos bucket under inbox/<owner>/<id>/,
-- what was made from it, and whether that's done. A better model can read it again later.
create table if not exists public.inbox (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind ~ '^[a-z][a-z_]{0,39}$'),       -- file; later photo, link, receipt…
  source text not null check (source ~ '^[a-z][a-z_]{0,39}$'),   -- takeout; later shortcut, email…
  name text check (name is null or char_length(name) <= 300),    -- the file's own name
  paths text[] not null default '{}',                             -- what's kept, in the photos bucket
  status text not null default 'new' check (status in ('new', 'done', 'failed')),
  result jsonb not null default '{}' check (jsonb_typeof(result) = 'object'), -- what was made of it
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.inbox enable row level security;
drop policy if exists "owner" on public.inbox;
create policy "owner" on public.inbox for all to authenticated
  using ((select public.is_member()) and owner = (select auth.uid()))
  with check ((select public.is_member()) and owner = (select auth.uid()));
drop trigger if exists trg_inbox_updated_at on public.inbox;
create trigger trg_inbox_updated_at before update on public.inbox
  for each row execute function public.set_updated_at();

-- The photos bucket: the wardrobe's folder and the inbox's are each person's own
-- (wardrobe/<owner id>/…, inbox/<owner id>/…); the rest is members-wide, as before
drop policy if exists "photos: members" on storage.objects;
create policy "photos: members" on storage.objects for all to authenticated
  using (bucket_id = 'photos' and (select public.is_member())
    and (split_part(name, '/', 1) not in ('wardrobe', 'inbox') or split_part(name, '/', 2) = (select auth.uid())::text))
  with check (bucket_id = 'photos' and (select public.is_member())
    and (split_part(name, '/', 1) not in ('wardrobe', 'inbox') or split_part(name, '/', 2) = (select auth.uid())::text));

-- Places: what Steve saved, starred, reviewed or labeled in Google Maps, and his own maps. One row a
-- place (import_key: Google's id for it when the file has one, else its name and where it is, or
-- the label), the lists it's on, and every file it was read from (sources). Each waits in review
-- until Steve keeps or dismisses it, and is private until he says otherwise.
--
--   sensitive    why it can never be public, set by places_guard() below and never cleared: home,
--                work, personal (any labeled place: family's and friends' houses), lodging (a
--                hotel, an Airbnb), near_home (within a kilometre of home or work)
--   status       review (just came in), kept, dismissed (a re-import leaves it dismissed)
--   visibility   private (Steve), shared (members: Lexi), public (the site, through public_places);
--                public only once kept, and never if sensitive
create table if not exists public.places (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  import_key text not null check (char_length(import_key) between 1 and 300),
  name text not null check (char_length(name) between 1 and 300),
  address text check (address is null or char_length(address) <= 500),
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  lat double precision check (lat is null or lat between -90 and 90),
  lon double precision check (lon is null or lon between -180 and 180),
  located_by text check (located_by is null or located_by ~ '^[a-z][a-z_]{0,39}$'), -- takeout, places_api
  google_url text check (google_url is null or google_url ~ '^https?://'),
  google_place_id text check (google_place_id is null or char_length(google_place_id) <= 300),
  lists text[] not null default '{}',     -- Starred, Reviewed, Labeled, a saved list's or a map's name
  category text check (category is null or char_length(category) <= 120), -- a map's layer: "Tiki Bars"
  label text check (label is null or char_length(label) <= 120),          -- a labeled place's label
  rating smallint check (rating is null or rating between 1 and 5),
  review text check (review is null or char_length(review) <= 5000),
  note text check (note is null or char_length(note) <= 2000),
  saved_on date,
  reviewed_on date,
  data jsonb not null default '{}' check (jsonb_typeof(data) = 'object'),     -- anything else the file said
  sources jsonb not null default '[]' check (jsonb_typeof(sources) = 'array'), -- [{ inbox_id, file, kind, at }]
  sensitive text check (sensitive is null or sensitive in ('home', 'work', 'personal', 'lodging', 'near_home')),
  status text not null default 'review' check (status in ('review', 'kept', 'dismissed')),
  visibility text not null default 'private' check (visibility in ('private', 'shared', 'public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner, import_key),
  constraint places_public check (visibility <> 'public' or (status = 'kept' and sensitive is null))
);
create index if not exists places_owner_status on public.places (owner, status);

-- Steve's own; a member sees what he's shared or made public, once kept
alter table public.places enable row level security;
drop policy if exists "owner" on public.places;
create policy "owner" on public.places for all to authenticated
  using ((select public.is_member()) and owner = (select auth.uid()))
  with check ((select public.is_member()) and owner = (select auth.uid()));
drop policy if exists "shared" on public.places;
create policy "shared" on public.places for select to authenticated
  using ((select public.is_member()) and status = 'kept' and visibility in ('shared', 'public'));
drop trigger if exists trg_places_updated_at on public.places;
create trigger trg_places_updated_at before update on public.places
  for each row execute function public.set_updated_at();

-- Metres between two points on the Earth (haversine; close enough for "near")
create or replace function public.metres_between(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
  returns double precision language sql immutable set search_path = '' as $$
  select 2 * 6371000 * asin(sqrt(power(sin(radians(lat2 - lat1) / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)));
$$;

-- What can never be public, worked out here so nothing (the app, a chat, a bug) can get round it:
-- a labeled place (home and work by their label), lodging by its name, and anything within a
-- kilometre of home or work. Once set it stays, whatever an update says.
create or replace function public.places_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then new.sensitive := coalesce(old.sensitive, new.sensitive); end if;
  if new.sensitive is null and 'Labeled' = any (new.lists) then
    new.sensitive := case when new.label ~* '^\s*home\s*$' then 'home' when new.label ~* '^\s*work\s*$' then 'work' else 'personal' end;
  end if;
  if new.sensitive is null and new.name ~* '\m(hotels?|hostel|motel|inn|suites?|resort|airbnb|b ?& ?b|bnb|lodge|guest ?house|apartments?|residences?|vrbo)\M' then
    new.sensitive := 'lodging';
  end if;
  if new.sensitive is null and new.lat is not null and exists (
    select 1 from public.places h
    where h.owner = new.owner and h.id <> new.id and h.sensitive in ('home', 'work') and h.lat is not null
      and public.metres_between(h.lat, h.lon, new.lat, new.lon) < 1000) then
    new.sensitive := 'near_home';
  end if;
  return new;
end $$;
drop trigger if exists trg_places_guard on public.places;
create trigger trg_places_guard before insert or update on public.places
  for each row execute function public.places_guard();

-- An import (assets/js/apps/lib/places.js, from supabase/functions/_shared/takeout.js): the places
-- read from one inbox row, merged into what's there. A place already there keeps its status,
-- visibility and name; its lists and sources grow, and blanks are filled. Then whatever is now
-- near home or work is marked so, and the inbox row says what came of it. As the member
-- (row-level security applies). Returns { added, merged }.
create or replace function public.places_import(inbox_id uuid, places jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare added integer; merged integer;
begin
  if jsonb_typeof(places) <> 'array' then raise exception 'places is a list'; end if;
  with incoming as (
    select * from jsonb_to_recordset(places) as x(import_key text, name text, address text, country_code text, lat double precision, lon double precision,
      google_url text, lists text[], category text, label text, rating smallint, review text, note text, saved_on date, reviewed_on date, data jsonb, sources jsonb)
  ), up as (
    insert into public.places as p (import_key, name, address, country_code, lat, lon, located_by, google_url, lists, category, label, rating, review, note, saved_on, reviewed_on, data, sources)
    select import_key, name, address, country_code, lat, lon, case when lat is not null then 'takeout' end, google_url, coalesce(lists, '{}'), category, label, rating, review, note, saved_on, reviewed_on,
      coalesce(data, '{}'), coalesce(sources, '[]')
    from incoming
    on conflict (owner, import_key) do update set
      lists = (select coalesce(array_agg(distinct l order by l), '{}') from unnest(p.lists || excluded.lists) l),
      address = coalesce(p.address, excluded.address),
      country_code = coalesce(p.country_code, excluded.country_code),
      lat = coalesce(p.lat, excluded.lat),
      lon = coalesce(p.lon, excluded.lon),
      located_by = coalesce(p.located_by, excluded.located_by),
      google_url = coalesce(p.google_url, excluded.google_url),
      category = coalesce(p.category, excluded.category),
      label = coalesce(p.label, excluded.label),
      rating = coalesce(excluded.rating, p.rating),
      review = coalesce(excluded.review, p.review),
      note = coalesce(excluded.note, p.note),
      saved_on = coalesce(p.saved_on, excluded.saved_on),
      reviewed_on = coalesce(excluded.reviewed_on, p.reviewed_on),
      data = p.data || excluded.data,
      sources = p.sources || excluded.sources
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted) into added, merged from up;
  -- home may have come in after what's near it: the guard looks again
  update public.places set sensitive = null where owner = (select auth.uid()) and sensitive is null and lat is not null;
  update public.inbox set status = 'done', processed_at = now(), result = jsonb_build_object('places', jsonb_build_object('added', added, 'merged', merged))
    where id = inbox_id;
  return jsonb_build_object('added', added, 'merged', merged);
end $$;
revoke all on function public.places_import(uuid, jsonb) from public, anon;
grant execute on function public.places_import(uuid, jsonb) to authenticated;

-- The site reads only this: the places Steve kept and made public, where they are, and what he
-- gave them; nothing else of the row (no address, notes or review text). It runs as its owner, so
-- visitors read it without reading the table; the table's rule (places_public) already keeps
-- anything sensitive out, and so does this.
drop view if exists public.public_places;
create view public.public_places as
select id, name, lists, category, country_code, round(lat::numeric, 4)::double precision as lat, round(lon::numeric, 4)::double precision as lon, rating, google_url
from public.places
where visibility = 'public' and status = 'kept' and sensitive is null and lat is not null;
-- (a view this simple could be written through, as its owner: only reading is granted)
revoke all on public.public_places from public, anon, authenticated;
grant select on public.public_places to anon, authenticated;

-- The Places API (New), for places a file gives no coordinates for (supabase/functions/places-locate):
-- calls counted by month and capped in code, well inside Google's free monthly calls. take(n)
-- grants up to n of what's left this month, for a member.
create table if not exists public.places_api_usage (
  month date primary key,
  calls integer not null default 0
);
alter table public.places_api_usage enable row level security;
drop policy if exists "members read" on public.places_api_usage;
create policy "members read" on public.places_api_usage for select to authenticated using ((select public.is_member()));
create or replace function public.places_api_take(n integer)
  returns integer language plpgsql security definer set search_path = '' as $$
declare m date := date_trunc('month', now())::date; monthly_cap constant integer := 1000; used integer; granted integer;
begin
  if not public.is_member() then return 0; end if;
  insert into public.places_api_usage (month) values (m) on conflict (month) do nothing;
  select calls into used from public.places_api_usage where month = m for update;
  granted := greatest(0, least(coalesce(n, 0), monthly_cap - used));
  update public.places_api_usage set calls = calls + granted where month = m;
  return granted;
end $$;
revoke all on function public.places_api_take(integer) from public, anon;
grant execute on function public.places_api_take(integer) to authenticated;

-- Places is a section of SJPJr: Steve's
alter table public.members drop constraint if exists members_sections_known;
alter table public.members add constraint members_sections_known check (sections <@ '{today,closet,trips,places,recipes}');
