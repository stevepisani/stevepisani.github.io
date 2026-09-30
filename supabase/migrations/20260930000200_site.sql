-- The planet's shared bits.

-- Messages in bottles: anyone can throw one in (it waits, unapproved, until a member approves
-- it); everyone sees the approved ones. At most 200 wait at a time, so the table can't be flooded.
create table if not exists public.bottles (
  id bigint generated always as identity primary key,
  message text not null check (char_length(message) between 1 and 280),
  signed text check (char_length(signed) <= 40),
  approved boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.bottles enable row level security;
drop policy if exists "read approved" on public.bottles;
create policy "read approved" on public.bottles for select to anon, authenticated using (approved);
drop policy if exists "throw one in" on public.bottles;
create policy "throw one in" on public.bottles for insert to anon, authenticated with check (not approved);
drop policy if exists "members moderate" on public.bottles;
create policy "members moderate" on public.bottles for all to authenticated
  using ((select public.is_member())) with check ((select public.is_member()));

create or replace function public.bottles_cap() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.bottles where not approved) >= 200 then
    raise exception 'The sea is full of bottles right now. Try again later.';
  end if;
  return new;
end; $$;
drop trigger if exists bottles_cap on public.bottles;
create trigger bottles_cap before insert on public.bottles
  for each row when (not new.approved) execute function public.bottles_cap();

-- Page views, counted without cookies or IP addresses: which page, where from (the referring
-- site's host only), and the kind of screen. Anyone can add one; nobody but members can read
-- rows. pageviews_daily() gives everyone the daily totals (for the lab's charts).
create table if not exists public.pageviews (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  path text not null check (char_length(path) <= 200 and path like '/%'),
  referrer text check (char_length(referrer) <= 100),
  screen text check (screen in ('phone', 'tablet', 'desktop'))
);
create index if not exists pageviews_at on public.pageviews (at);
alter table public.pageviews enable row level security;
drop policy if exists "count a view" on public.pageviews;
create policy "count a view" on public.pageviews for insert to anon, authenticated with check (at between now() - interval '1 minute' and now() + interval '1 minute');
drop policy if exists "members read" on public.pageviews;
create policy "members read" on public.pageviews for select to authenticated using ((select public.is_member()));

create or replace function public.pageviews_daily(since date default current_date - 90)
  returns table (day date, path text, views bigint)
  language sql stable security definer set search_path = '' as $$
  select (at at time zone 'America/New_York')::date, path, count(*)
  from public.pageviews where at >= since group by 1, 2 order by 1, 2;
$$;
revoke all on function public.pageviews_daily(date) from public;
grant execute on function public.pageviews_daily(date) to anon, authenticated;
