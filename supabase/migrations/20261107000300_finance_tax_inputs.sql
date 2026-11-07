-- Keep calculation inputs alongside reviewed estimates so scenarios can be reopened and
-- recalculated in the browser without a local service. No personal defaults are seeded.
alter table public.finance_tax_scenarios add column if not exists inputs jsonb not null default '{}'::jsonb;
alter table public.finance_tax_scenarios drop constraint if exists finance_tax_inputs_bounded;
alter table public.finance_tax_scenarios add constraint finance_tax_inputs_bounded
  check (jsonb_typeof(inputs)='object' and octet_length(inputs::text)<=6000);
