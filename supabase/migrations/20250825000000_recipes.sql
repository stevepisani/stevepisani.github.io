-- The recipe tracker as it was first set up by hand in the dashboard (Aug 2025), recorded so
-- the project can be rebuilt from this folder. Idempotent: on the live project it changes
-- nothing. The access rules it had are replaced in 20260930000100_members.sql.
create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  link text,
  cooked boolean not null default false,
  date_cooked date,
  rating smallint default 0 check (rating >= 0 and rating <= 10),
  notes text,
  photo_url text,
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.recipes enable row level security;

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;
drop trigger if exists trg_recipes_updated_at on public.recipes;
create trigger trg_recipes_updated_at before update on public.recipes
  for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public) values ('photos', 'photos', false)
  on conflict (id) do nothing;
