-- Test planets (docs/planets.md, "Testing the live connector"): a planet whose slug starts with
-- test- is a made-up one, sent by Claude to try the connector end to end. It's saved like any
-- other but marked test: it never takes a real planet's place under the caps (tests have their own
-- 20 a day), Steve is never told about it, and the hourly job deletes it a day later.
alter table public.planet_requests drop constraint if exists planet_requests_status_check;
alter table public.planet_requests add constraint planet_requests_status_check
  check (status in ('new', 'told', 'building', 'built', 'declined', 'test'));

create or replace function public.planet_request_add(spec jsonb, note text default null, contact text default null,
  daily_cap integer default 20, waiting_cap integer default 50)
  returns bigint language plpgsql security definer set search_path = '' as $$
declare made bigint; test boolean := (spec ->> 'slug') like 'test-%';
begin
  if (select count(*) from public.planet_requests r where r.at > now() - interval '1 day' and (r.status = 'test') = test) >= daily_cap then return null; end if;
  if not test and (select count(*) from public.planet_requests where status in ('new', 'told')) >= waiting_cap then return null; end if;
  insert into public.planet_requests (slug, name, spec, note, contact, status)
    values (spec ->> 'slug', spec -> 'who' ->> 'name', spec, nullif(btrim(note), ''), nullif(btrim(contact), ''), case when test then 'test' else 'new' end)
    returning id into made;
  return made;
end; $$;
revoke all on function public.planet_request_add(jsonb, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.planet_request_add(jsonb, text, text, integer, integer) to service_role;
