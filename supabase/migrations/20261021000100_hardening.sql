-- Hardening before the site is shared widely (docs/backend.md, "What a visitor can reach"). Safe to
-- run again.

-- 1. Someone signed out reaches only what the planet uses: bottles, the page count and the public
-- places. Row-level security already shows them nothing else; taking the grants back as well means
-- a mistake in a policy can't open a table to them, and the private tables drop out of what the
-- GraphQL schema shows them.
do $$
declare t text;
begin
  foreach t in array array['members', 'recipes', 'wardrobe_items', 'wardrobe_variants', 'wardrobe_products',
    'wardrobe_photos', 'wardrobe_closet', 'trips', 'trip_bags', 'trip_packing', 'trip_transport', 'trip_lodging',
    'trip_resources', 'events', 'inbox', 'places', 'places_api_usage', 'bartender_usage', 'bartender_asks'] loop
    if to_regclass('public.' || t) is not null then execute format('revoke all on public.%I from anon', t); end if;
  end loop;
end $$;
-- trigger functions, never called on their own
revoke all on function public.bottles_cap() from public, anon, authenticated;
revoke all on function public.places_guard() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
alter function public.set_updated_at() set search_path = '';

-- 2. The page count can't be used to fill the database: past 300 views in a minute across the
-- site (a busy day is a fraction of that), the rest aren't counted. Quietly: the page never knows.
create or replace function public.pageviews_cap() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.pageviews where at > now() - interval '1 minute') >= 300 then return null; end if;
  return new;
end; $$;
revoke all on function public.pageviews_cap() from public, anon, authenticated;
drop trigger if exists pageviews_cap on public.pageviews;
create trigger pageviews_cap before insert on public.pageviews
  for each row execute function public.pageviews_cap();

-- 3. The bartender: a day can't spend the month. Beside the monthly cap and 20 an hour per
-- visitor, at most 1,000 replies in any 24 hours (bartender_asks keeps a day of asks), so even
-- someone who gets round the per-visitor limit leaves three weeks of the month for everyone else.
drop function if exists public.bartender_take(text, integer, integer);
create or replace function public.bartender_take(visitor text, monthly_cap integer default 1500, hourly_cap integer default 20, daily_cap integer default 1000)
  returns boolean language plpgsql security definer set search_path = '' as $$
declare m date := date_trunc('month', now())::date;
begin
  delete from public.bartender_asks where at < now() - interval '1 day';
  if coalesce((select replies from public.bartender_usage where month = m), 0) >= monthly_cap then return false; end if;
  if (select count(*) from public.bartender_asks) >= daily_cap then return false; end if;
  if (select count(*) from public.bartender_asks a where a.visitor = bartender_take.visitor and a.at > now() - interval '1 hour') >= hourly_cap then return false; end if;
  insert into public.bartender_asks (visitor) values (bartender_take.visitor);
  insert into public.bartender_usage (month, replies) values (m, 1)
    on conflict (month) do update set replies = public.bartender_usage.replies + 1;
  return true;
end; $$;
revoke all on function public.bartender_take(text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.bartender_take(text, integer, integer, integer) to service_role;

-- 4. The fireflies: the planet's Realtime channel carries presence and nothing else. With only
-- private channels allowed (supabase/realtime.json), these are the only rules there are, so no one
-- can broadcast to everyone on the planet (each message to each visitor is billed). Skipped where
-- there's no Realtime (the tests).
do $$
begin
  if to_regclass('realtime.messages') is null then return; end if;
  execute 'drop policy if exists "planet: see who''s here" on realtime.messages';
  execute $p$create policy "planet: see who's here" on realtime.messages for select to anon, authenticated
    using (realtime.topic() = 'planet' and extension = 'presence')$p$;
  execute 'drop policy if exists "planet: say where you are" on realtime.messages';
  execute $p$create policy "planet: say where you are" on realtime.messages for insert to anon, authenticated
    with check (realtime.topic() = 'planet' and extension = 'presence')$p$;
end $$;
