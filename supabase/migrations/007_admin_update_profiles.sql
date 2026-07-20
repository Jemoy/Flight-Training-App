-- Run this in Supabase SQL Editor.

create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

create policy "admin can update any profile"
on profiles for update
using (is_admin())
with check (is_admin());
