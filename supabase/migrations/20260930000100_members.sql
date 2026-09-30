-- Who may edit: one table instead of the same two addresses written into seven policies (and
-- the page's source). is_member() is what every policy asks, and what the page calls (rpc) to
-- decide whether to show the editing tools.
create table if not exists public.members (
  email text primary key check (email = lower(email)),
  added_at timestamptz not null default now()
);
alter table public.members enable row level security; -- no policies: read only through is_member()
insert into public.members (email) values ('sjp543@gmail.com'), ('lexipisani@gmail.com')
  on conflict do nothing;

create or replace function public.is_member() returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members where email = lower(auth.jwt() ->> 'email'));
$$;
revoke all on function public.is_member() from public;
grant execute on function public.is_member() to anon, authenticated;

-- recipes: members only
drop policy if exists "write for specific emails" on public.recipes;
drop policy if exists "read for specific emails" on public.recipes;
drop policy if exists "members" on public.recipes;
create policy "members" on public.recipes for all to authenticated
  using ((select public.is_member())) with check ((select public.is_member()));

-- photos bucket: members only (it had two overlapping sets of rules)
drop policy if exists "photos delete for allowed emails" on storage.objects;
drop policy if exists "photos insert for allowed emails" on storage.objects;
drop policy if exists "photos read for allowed emails" on storage.objects;
drop policy if exists "photos delete for specific emails" on storage.objects;
drop policy if exists "photos write for specific emails" on storage.objects;
drop policy if exists "photos: members" on storage.objects;
create policy "photos: members" on storage.objects for all to authenticated
  using (bucket_id = 'photos' and (select public.is_member()))
  with check (bucket_id = 'photos' and (select public.is_member()));
