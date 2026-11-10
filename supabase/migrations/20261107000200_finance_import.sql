-- One import is one transaction: any invalid row rolls back the entire file.
-- Run as the caller, so table grants and owner RLS apply inside the RPC as well.
create or replace function public.finance_import(payload jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare section text; item jsonb; allowed text[]; target text; prepared jsonb;
  account uuid; existing public.finance_transactions; added integer := 0; n integer;
begin
  if not public.can_finance() then raise exception 'Finance access required' using errcode='42501'; end if;
  if jsonb_typeof(payload) is distinct from 'object' or payload->>'schema_version' is distinct from '1'
    or octet_length(payload::text) > 10000000 then raise exception 'Invalid import format or size'; end if;
  if exists(select 1 from jsonb_object_keys(payload) k where k not in ('schema_version','accounts','transactions','plans','budgets','scenarios')) then raise exception 'Unknown import field'; end if;
  foreach section in array array['accounts','transactions','plans','budgets','scenarios'] loop
    if jsonb_typeof(coalesce(payload->section,'[]'::jsonb)) <> 'array' then raise exception 'Expected record arrays'; end if;
    if jsonb_array_length(coalesce(payload->section,'[]'::jsonb)) > 10000 then raise exception 'Too many records in import'; end if;
    allowed := case section
      when 'accounts' then array['source_key','name','kind','balance_cents','currency','as_of','included']
      when 'transactions' then array['account_source_key','source_key','posted_on','description','amount_cents','currency','category','treatment','pending','note']
      when 'plans' then array['year','monthly_target_cents','retirement_goal_cents','retirement_funded_cents','tax_reserve_cents','contractor_reserve_cents','operations_reserve_cents','household_reserve_cents','expected_receipts_cents','reviewed_on','assumptions']
      when 'budgets' then array['month','category','target_cents']
      when 'scenarios' then array['year','source_key','name','profit_cents','federal_cents','state_cents','paid_cents','retirement_cents','assumptions','reviewed_on','inputs'] end;
    for item in select value from jsonb_array_elements(coalesce(payload->section,'[]'::jsonb)) loop
      if jsonb_typeof(item) <> 'object' then raise exception 'Invalid record'; end if;
      if exists(select 1 from jsonb_object_keys(item) k where not k=any(allowed)) then raise exception 'Unknown record field'; end if;
      -- Reject fractional money before PostgreSQL can coerce a numeric value to bigint.
      if exists(select 1 from jsonb_each(item) v where v.key like '%\_cents' escape '\' and
        (jsonb_typeof(v.value) <> 'number' or (v.value::text)::numeric <> trunc((v.value::text)::numeric))) then raise exception 'Amounts must be integer cents'; end if;
      if section = 'accounts' then
        if (item->>'as_of')::timestamptz > now()+interval '5 minutes' then raise exception 'Future balance timestamp'; end if;
        insert into public.finance_accounts(source_key,name,kind,balance_cents,currency,as_of,included)
        values(item->>'source_key',item->>'name',item->>'kind',(item->>'balance_cents')::bigint,coalesce(item->>'currency','USD'),(item->>'as_of')::timestamptz,coalesce((item->>'included')::boolean,true))
        on conflict(owner,source_key) do update set balance_cents=excluded.balance_cents,as_of=excluded.as_of
        where excluded.as_of >= finance_accounts.as_of and excluded.kind=finance_accounts.kind;
      elsif section = 'transactions' then
        select id into account from public.finance_accounts where owner=auth.uid() and source_key=item->>'account_source_key';
        if account is null then raise exception 'Account not found for imported transaction'; end if;
        if item->>'source_key' like 'csv:%' and exists (
          select 1 from public.finance_transactions t where t.owner=auth.uid() and t.account_id=account
          and t.source_key like 'csv:%' and split_part(t.source_key,':',2) <> split_part(item->>'source_key',':',2)
        ) then raise exception 'Use the existing CSV provider for this account to avoid duplicate records'; end if;
        select * into existing from public.finance_transactions where owner=auth.uid() and account_id=account and source_key=item->>'source_key';
        if found then
          if existing.amount_cents <> (item->>'amount_cents')::bigint or existing.posted_on <> (item->>'posted_on')::date then raise exception 'Existing transaction differs; review source instead of overwriting'; end if;
          -- Preserve all user corrections; only a pending record becoming posted may advance.
          update public.finance_transactions set pending=false where id=existing.id and pending and coalesce((item->>'pending')::boolean,false)=false;
          continue;
        end if;
        insert into public.finance_transactions(account_id,source_key,posted_on,description,amount_cents,currency,category,treatment,pending,note)
        values(account,item->>'source_key',(item->>'posted_on')::date,item->>'description',(item->>'amount_cents')::bigint,coalesce(item->>'currency','USD'),coalesce(item->>'category','Uncategorized'),coalesce(item->>'treatment','review'),coalesce((item->>'pending')::boolean,false),coalesce(item->>'note',''));
      else
        target := case section when 'plans' then 'finance_plans' when 'budgets' then 'finance_budgets' else 'finance_tax_scenarios' end;
        prepared := jsonb_build_object('retirement_funded_cents',0,'inputs','{}'::jsonb) || item || jsonb_build_object('owner',auth.uid(),'updated_at',now());
        if section='scenarios' then prepared := prepared || jsonb_build_object('id',gen_random_uuid()); end if;
        execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).* on conflict do nothing',target,target) using prepared;
      end if;
      get diagnostics n = row_count;
      added := added+n;
    end loop;
  end loop;
  return jsonb_build_object('written',added);
end; $$;
revoke all on function public.finance_import(jsonb) from public,anon;
grant execute on function public.finance_import(jsonb) to authenticated;
