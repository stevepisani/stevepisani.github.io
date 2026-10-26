-- My Tiny Planet's requests (docs/planets.md): when someone is happy with the planet they designed
-- with their ChatGPT or Claude, the Planets connector's send_planet saves it here for Steve to
-- build by hand. Private: nobody signed out or signed in can read or write it; the connector adds
-- through planet_request_add() (service role), members read and update (the status), and the
-- hourly Supabase workflow tells Steve about new ones (tools/planet-requests.mjs).
create table if not exists public.planet_requests (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  slug text not null,
  name text not null,
  spec jsonb not null,
  note text check (char_length(note) <= 1000),       -- anything they'd like Steve to know, their words
  contact text check (char_length(contact) <= 200),  -- how to reach them, only if they gave it
  status text not null default 'new' check (status in ('new', 'told', 'building', 'built', 'declined'))
);
create index if not exists planet_requests_at on public.planet_requests (at);
alter table public.planet_requests enable row level security;
revoke all on public.planet_requests from anon, authenticated;
grant select, update on public.planet_requests to authenticated;
drop policy if exists "members read" on public.planet_requests;
create policy "members read" on public.planet_requests for select to authenticated using ((select public.is_member()));
drop policy if exists "members update" on public.planet_requests;
create policy "members update" on public.planet_requests for update to authenticated
  using ((select public.is_member())) with check ((select public.is_member()));

-- Adds one, or returns null when it's full: at most 20 in a day and 50 waiting to be built, so
-- the table can't be filled and the planets can't outrun the hands that build them.
create or replace function public.planet_request_add(spec jsonb, note text default null, contact text default null,
  daily_cap integer default 20, waiting_cap integer default 50)
  returns bigint language plpgsql security definer set search_path = '' as $$
declare made bigint;
begin
  if (select count(*) from public.planet_requests where at > now() - interval '1 day') >= daily_cap then return null; end if;
  if (select count(*) from public.planet_requests where status in ('new', 'told')) >= waiting_cap then return null; end if;
  insert into public.planet_requests (slug, name, spec, note, contact)
    values (spec ->> 'slug', spec -> 'who' ->> 'name', spec, nullif(btrim(note), ''), nullif(btrim(contact), ''))
    returning id into made;
  return made;
end; $$;
revoke all on function public.planet_request_add(jsonb, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.planet_request_add(jsonb, text, text, integer, integer) to service_role;
