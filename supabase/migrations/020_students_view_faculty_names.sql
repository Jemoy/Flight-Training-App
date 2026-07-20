-- Run this in Supabase SQL Editor.

create policy "authenticated users can view faculty and admin names"
on profiles for select
using (role in ('faculty_personnel', 'admin'));
