-- The AI bartender's limits, kept by the database so no one can talk it past them:
-- bartender_take(visitor) says yes only while this month is under its reply cap and that
-- visitor (a salted hash of their IP, changed daily, never the IP) has asked fewer than 20
-- times in the past hour; bartender_spent() records the tokens each reply used.
-- Only the bartender function (service role) can call either.
create table if not exists public.bartender_usage (
  month date primary key,
  replies integer not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0
);
create table if not exists public.bartender_asks (
  visitor text not null,
  at timestamptz not null default now()
);
create index if not exists bartender_asks_visitor on public.bartender_asks (visitor, at);
alter table public.bartender_usage enable row level security;
alter table public.bartender_asks enable row level security;
drop policy if exists "members read" on public.bartender_usage;
create policy "members read" on public.bartender_usage for select to authenticated using ((select public.is_member()));

create or replace function public.bartender_take(visitor text, monthly_cap integer default 1500, hourly_cap integer default 20)
  returns boolean language plpgsql security definer set search_path = '' as $$
declare m date := date_trunc('month', now())::date;
begin
  delete from public.bartender_asks where at < now() - interval '1 day';
  if coalesce((select replies from public.bartender_usage where month = m), 0) >= monthly_cap then return false; end if;
  if (select count(*) from public.bartender_asks a where a.visitor = bartender_take.visitor and a.at > now() - interval '1 hour') >= hourly_cap then return false; end if;
  insert into public.bartender_asks (visitor) values (bartender_take.visitor);
  insert into public.bartender_usage (month, replies) values (m, 1)
    on conflict (month) do update set replies = public.bartender_usage.replies + 1;
  return true;
end; $$;

create or replace function public.bartender_spent(input_tokens integer, output_tokens integer)
  returns void language sql security definer set search_path = '' as $$
  update public.bartender_usage
     set input_tokens = public.bartender_usage.input_tokens + bartender_spent.input_tokens,
         output_tokens = public.bartender_usage.output_tokens + bartender_spent.output_tokens
   where month = date_trunc('month', now())::date;
$$;
revoke all on function public.bartender_take(text, integer, integer) from public, anon, authenticated;
revoke all on function public.bartender_spent(integer, integer) from public, anon, authenticated;
grant execute on function public.bartender_take(text, integer, integer) to service_role;
grant execute on function public.bartender_spent(integer, integer) to service_role;
