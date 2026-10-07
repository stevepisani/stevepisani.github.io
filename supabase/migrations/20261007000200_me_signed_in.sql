-- me() is for someone signed in: Supabase grants new functions to anon by default, so take that
-- back (it returned null to them anyway).
revoke execute on function public.me() from anon;
