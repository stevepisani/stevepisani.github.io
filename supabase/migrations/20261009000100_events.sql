-- Events: what happened, a day at a time (docs/apps.md, "Days"; docs/vision.md, rule 2). One row a
-- thing that happened: what Steve wore, a line about the day, and later where he went, what he ate,
-- cooked or bought. A new kind is a word, not a migration: `kind` names it, the garments go in
-- item_ids, a line of text in `text`, anything else in `data`.
--
--   kind         wore (item_ids: the garments) | journal (text: one line) | later visited, ate, cooked, bought…
--   date         the day it happened, where he was (a trip leg's own date, else home's)
--   trip_id      the trip that day was on, if any
--   source       how it came in: app, mcp; later camera, receipt, import…
--   recorded_by  who: steve (he tapped or typed it himself), or the assistant that sent it
--   evidence     how it was known, kept so a better model can read it again (vision rule 1): the
--                outfit planned that day, whether it was worn as planned, the names said and what
--                they were matched to, Steve's own words
--
-- Rows are only added: logging a day again adds a row, and the newest one for a day's wore (or
-- journal) is what that day says; the older ones stay as the history of it. Undo moves a row to
-- the trash (deleted_at), like a garment or trip, and the weekly job empties it after 30 days.
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  kind text not null check (kind ~ '^[a-z][a-z_]{0,39}$'),
  trip_id uuid references public.trips (id) on delete set null,
  -- no foreign key: a garment deleted later stays named here, as on a packing list
  item_ids uuid[] not null default '{}',
  text text check (text is null or char_length(text) <= 500),
  data jsonb not null default '{}' check (jsonb_typeof(data) = 'object'),
  source text not null default 'app' check (source ~ '^[a-z][a-z_]{0,39}$'),
  recorded_by text check (recorded_by is null or char_length(recorded_by) <= 120),
  evidence jsonb not null default '{}' check (jsonb_typeof(evidence) = 'object'),
  -- the caller's own id for what it sent, so a retry returns what was stored instead of adding it twice
  client_ref text check (client_ref is null or char_length(client_ref) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists events_owner_date on public.events (owner, date);
create unique index if not exists events_client_ref on public.events (owner, client_ref) where client_ref is not null;

-- Private to its owner, like the clothes; a day on a trip is on one of their own trips
alter table public.events enable row level security;
drop policy if exists "owner" on public.events;
create policy "owner" on public.events for all to authenticated
  using ((select public.is_member()) and owner = (select auth.uid()))
  with check ((select public.is_member()) and owner = (select auth.uid())
    and (trip_id is null or exists (select 1 from public.trips t where t.id = trip_id and t.owner = (select auth.uid()))));
drop trigger if exists trg_events_updated_at on public.events;
create trigger trg_events_updated_at before update on public.events
  for each row execute function public.set_updated_at();

-- The trash's emptying (20261005000400_trash.sql) takes events in the trash too; the rest as before
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
  delete from public.events where deleted_at < cutoff;
  return query select f from unnest(files) f
    where not exists (select 1 from public.wardrobe_photos p where p.path = f)
      and not exists (select 1 from public.wardrobe_items i where i.photo_path = f or i.photo_original = f);
end $$;
revoke all on function public.empty_trash(integer) from public, anon, authenticated;
grant execute on function public.empty_trash(integer) to service_role;
