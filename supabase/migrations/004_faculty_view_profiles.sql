-- Run this in Supabase SQL Editor.

-- A plain policy on `profiles` that queries `profiles` to check the caller's
-- role would recurse into itself. A SECURITY DEFINER function sidesteps that
-- by running with the function owner's privileges, bypassing RLS internally.
create or replace function is_faculty_or_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role in ('faculty_personnel', 'admin')
  );
$$;

create policy "faculty can view all profiles"
on profiles for select
using (is_faculty_or_admin());
