-- Finance is a separate, explicit capability. No existing member or OAuth grant gains it.
-- Only the deployment administrator can change this flag; members has no user write policy.
alter table public.members add column if not exists finance_enabled boolean not null default false;
create or replace function public.can_finance() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and nullif(auth.jwt()->>'client_id', '') is null
    and exists (select 1 from public.members m
      where m.email = lower(auth.jwt()->>'email') and m.finance_enabled);
$$;
revoke all on function public.can_finance() from public, anon;
grant execute on function public.can_finance() to authenticated;

create table if not exists public.finance_accounts (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_key text not null check (length(source_key) between 1 and 200),
  name text not null check (length(name) between 1 and 160),
  kind text not null check (kind in ('cash', 'credit', 'loan', 'investment')),
  balance_cents bigint not null check (abs(balance_cents) <= 1000000000000),
  currency text not null default 'USD' check (currency = 'USD'),
  as_of timestamptz not null,
  included boolean not null default true,
  updated_at timestamptz not null default now(),
  unique(owner, source_key), unique(owner, id)
);
create table if not exists public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid not null,
  source_key text not null check (length(source_key) between 1 and 200),
  posted_on date not null,
  description text not null check (length(description) between 1 and 500),
  amount_cents bigint not null check (abs(amount_cents) <= 1000000000000),
  currency text not null default 'USD' check (currency = 'USD'),
  category text not null default 'Uncategorized' check (length(category) between 1 and 100),
  treatment text not null default 'review' check (treatment in
    ('review', 'personal', 'business_income', 'business_expense', 'contractor', 'transfer', 'financing', 'tax_payment', 'retirement')),
  pending boolean not null default false,
  note text not null default '' check (length(note) <= 2000),
  updated_at timestamptz not null default now(),
  foreign key(owner, account_id) references public.finance_accounts(owner, id),
  unique(owner, account_id, source_key)
);
create index if not exists finance_transactions_owner_date on public.finance_transactions(owner, posted_on desc, id);
create table if not exists public.finance_plans (
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  year integer not null check (year between 2020 and 2100),
  monthly_target_cents bigint not null check (monthly_target_cents between 0 and 1000000000000),
  retirement_goal_cents bigint not null check (retirement_goal_cents between 0 and 1000000000000),
  retirement_funded_cents bigint not null default 0 check (retirement_funded_cents between 0 and 1000000000000),
  tax_reserve_cents bigint not null check (tax_reserve_cents between 0 and 1000000000000),
  contractor_reserve_cents bigint not null check (contractor_reserve_cents between 0 and 1000000000000),
  operations_reserve_cents bigint not null check (operations_reserve_cents between 0 and 1000000000000),
  household_reserve_cents bigint not null check (household_reserve_cents between 0 and 1000000000000),
  expected_receipts_cents bigint not null check (expected_receipts_cents between 0 and 1000000000000),
  reviewed_on date not null,
  assumptions text not null check (length(assumptions) <= 8000),
  updated_at timestamptz not null default now(),
  primary key(owner, year)
);
create table if not exists public.finance_budgets (
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  category text not null check (length(category) between 1 and 100),
  target_cents bigint not null check (target_cents between 0 and 1000000000000),
  updated_at timestamptz not null default now(),
  primary key(owner, month, category)
);
-- Reviewed tax scenarios retain their assumptions and provenance. They are estimates, not returns.
create table if not exists public.finance_tax_scenarios (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  year integer not null check (year between 2020 and 2100),
  source_key text not null check (length(source_key) between 1 and 200),
  name text not null check (length(name) between 1 and 160),
  profit_cents bigint not null check (abs(profit_cents) <= 1000000000000),
  federal_cents bigint not null check (federal_cents between 0 and 1000000000000),
  state_cents bigint not null check (state_cents between 0 and 1000000000000),
  paid_cents bigint not null check (paid_cents between 0 and 1000000000000),
  retirement_cents bigint not null check (retirement_cents between 0 and 1000000000000),
  assumptions text not null check (length(assumptions) between 1 and 8000),
  reviewed_on date not null,
  updated_at timestamptz not null default now(),
  unique(owner, year, source_key)
);
-- No public view, anonymous grants, shared visibility, storage bucket or MCP tools.
do $$
declare t text;
begin
  foreach t in array array['finance_accounts', 'finance_transactions', 'finance_plans', 'finance_budgets', 'finance_tax_scenarios'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists finance_owner on public.%I', t);
    execute format('create policy finance_owner on public.%I for all to authenticated using ((select public.can_finance()) and owner = (select auth.uid())) with check ((select public.can_finance()) and owner = (select auth.uid()))', t);
    execute format('drop trigger if exists finance_updated on public.%I', t);
    execute format('create trigger finance_updated before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;
