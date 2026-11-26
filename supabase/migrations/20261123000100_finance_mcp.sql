-- Separate, revocable read access for one owner's connected app. Existing grants gain nothing.
create table if not exists public.finance_connector_grants (
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id text not null check (length(client_id) between 1 and 256),
  granted_at timestamptz not null default now(),
  primary key (owner, client_id)
);
alter table public.finance_connector_grants enable row level security;
alter table public.finance_connector_grants force row level security;
revoke all on public.finance_connector_grants from public, anon, authenticated;
grant select, insert, delete on public.finance_connector_grants to authenticated;
drop policy if exists finance_grant_owner on public.finance_connector_grants;
create policy finance_grant_owner on public.finance_connector_grants
  for all to authenticated
  using ((select public.can_finance()) and owner = (select auth.uid()))
  with check ((select public.can_finance()) and owner = (select auth.uid()));

-- can_finance remains first-party-only, including all write/import paths.
create or replace function public.can_read_finance() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and exists (select 1 from public.members m
      where m.email = lower(auth.jwt()->>'email') and m.finance_enabled)
    and (nullif(auth.jwt()->>'client_id', '') is null or exists (
      select 1 from public.finance_connector_grants g
      where g.owner = auth.uid() and g.client_id = auth.jwt()->>'client_id'
    ));
$$;
revoke all on function public.can_read_finance() from public, anon;
grant execute on function public.can_read_finance() to authenticated;
do $$
declare t text;
begin
  foreach t in array array['finance_accounts','finance_transactions','finance_plans','finance_budgets','finance_tax_scenarios'] loop
    execute format('drop policy if exists finance_reader on public.%I', t);
    execute format('create policy finance_reader on public.%I for select to authenticated using ((select public.can_read_finance()) and owner = (select auth.uid()))', t);
  end loop;
end $$;
