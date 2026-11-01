-- Real models made while the chat waits (My Tiny Planet, docs/planets.md). When someone's AI
-- previews a planet whose things are described in words, the Planets connector asks Meshy for
-- each one's model in the house style (supabase/functions/planets/models.js); this is where each
-- is followed, by its key (the words, hashed: the same words make the same model, on any planet,
-- so it's paid for once), and the public bucket planet-models holds what's made. Private: nobody
-- signed out or signed in reads or writes the table; the connector uses it with the service role.
-- Money is spent here, so the caps are in planet_models_claim(), which alone adds a row, and
-- counts what was paid for in planet_models_paid: one row each time Meshy is asked to start one,
-- a retry after a failure included (a retried model is still one row in planet_models).
create table if not exists public.planet_models (
  key text primary key check (key ~ '^[0-9a-f]{32}$'),
  words text not null check (char_length(words) between 1 and 600),
  slug text not null,                  -- the planet it was first asked for
  at timestamptz not null default now(),  -- when it was paid for (asked again after a failure: then)
  status text not null default 'new' check (status in ('new', 'picture', 'model', 'done', 'failed')),
  picture_task text,                   -- Meshy's text-to-image task
  model_task text,                     -- Meshy's image-to-3D task
  file text,                           -- in the bucket, once made
  small boolean not null default false, -- made small by the hourly job (tools/planet-model-copies.mjs)
  checked timestamptz,                 -- when Meshy was last asked how it's going
  error text check (char_length(error) <= 500)
);
create index if not exists planet_models_at on public.planet_models (at);
create index if not exists planet_models_slug on public.planet_models (slug);
alter table public.planet_models enable row level security;
revoke all on public.planet_models from anon, authenticated;

create table if not exists public.planet_models_paid (
  key text not null,
  slug text not null,                  -- the planet it was asked for
  at timestamptz not null default now()
);
create index if not exists planet_models_paid_at on public.planet_models_paid (at);
create index if not exists planet_models_paid_key on public.planet_models_paid (key);
create index if not exists planet_models_paid_slug on public.planet_models_paid (slug);
alter table public.planet_models_paid enable row level security;
revoke all on public.planet_models_paid from anon, authenticated;

insert into storage.buckets (id, name, public) values ('planet-models', 'planet-models', true)
  on conflict (id) do nothing;

-- Claims the models a preview asks for, in order, and returns the keys claimed: those not made or
-- being made already, while the month's and the planet's caps allow (each counts every time one
-- was paid for, failed or not). Words that failed twice aren't tried again. One at a time, so two
-- previews at once can't both take the last one.
create or replace function public.planet_models_claim(planet text, keys text[], words text[],
  monthly_cap integer, planet_cap integer)
  returns text[] language plpgsql security definer set search_path = '' as $$
declare
  claimed text[] := '{}';
  month_n integer;
  planet_n integer;
  i integer;
begin
  if coalesce(array_length(keys, 1), 0) <> coalesce(array_length(words, 1), 0) then raise exception 'keys and words differ in length'; end if;
  lock table public.planet_models in share row exclusive mode;
  select count(*) into month_n from public.planet_models_paid where at >= date_trunc('month', now());
  select count(*) into planet_n from public.planet_models_paid where slug = planet;
  for i in 1 .. coalesce(array_length(keys, 1), 0) loop
    if exists (select 1 from public.planet_models m where m.key = keys[i] and m.status <> 'failed') then continue; end if;
    if (select count(*) from public.planet_models_paid p where p.key = keys[i]) >= 2 then continue; end if;
    exit when month_n >= monthly_cap or planet_n >= planet_cap;
    insert into public.planet_models as m (key, words, slug, checked) values (keys[i], words[i], planet, now())
      on conflict (key) do update set words = excluded.words, slug = excluded.slug, at = now(), status = 'new',
        picture_task = null, model_task = null, file = null, small = false, checked = now(), error = null
        where m.status = 'failed';
    insert into public.planet_models_paid (key, slug) values (keys[i], planet);
    claimed := claimed || keys[i];
    month_n := month_n + 1;
    planet_n := planet_n + 1;
  end loop;
  return claimed;
end; $$;
revoke all on function public.planet_models_claim(text, text[], text[], integer, integer) from public, anon, authenticated;
grant execute on function public.planet_models_claim(text, text[], text[], integer, integer) to service_role;

-- Takes the turn to ask Meshy about one that's being made, at most once every few seconds however
-- many cards are open on it: the row, or nothing when it isn't due or isn't being made. A claimed
-- one is 'new' only until its picture is asked for, which the preview does at once; one left 'new'
-- (the preview stopped between) is started by whoever takes its turn.
create or replace function public.planet_model_turn(model_key text, every_seconds integer default 8)
  returns setof public.planet_models language sql security definer set search_path = '' as $$
  update public.planet_models set checked = now()
  where key = model_key and status in ('new', 'picture', 'model')
    and (checked is null or checked < now() - make_interval(secs => every_seconds))
  returning *;
$$;
revoke all on function public.planet_model_turn(text, integer) from public, anon, authenticated;
grant execute on function public.planet_model_turn(text, integer) to service_role;
