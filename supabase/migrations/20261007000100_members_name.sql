-- Who's signed in, to the app (docs/apps.md, "The shell"): the name it greets them by, and the
-- sections of SJPJr they see. The wardrobe and trips are each person's own (row-level security
-- by owner), and Steve's are the only ones there are, so Lexi sees Recipes, the one thing shared.
-- Giving someone more is a migration that changes their row. Safe to run again.
alter table public.members add column if not exists name text;
alter table public.members add column if not exists sections text[] not null default '{recipes}';
alter table public.members drop constraint if exists members_sections_known;
alter table public.members add constraint members_sections_known check (sections <@ '{today,closet,trips,recipes}');
update public.members set name = 'Steve', sections = '{today,closet,trips,recipes}' where email = 'sjp543@gmail.com';
update public.members set name = 'Lexi', sections = '{recipes}' where email = 'lexipisani@gmail.com';

-- The signed-in member's own row, as the app needs it (null for anyone who isn't one). The table
-- itself stays unreadable (no policies), like is_member().
create or replace function public.me() returns jsonb
  language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('name', m.name, 'sections', to_jsonb(m.sections))
  from public.members m where m.email = lower(auth.jwt() ->> 'email');
$$;
revoke all on function public.me() from public;
grant execute on function public.me() to authenticated;
