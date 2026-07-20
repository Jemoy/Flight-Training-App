-- Run this in Supabase SQL Editor.

create policy "authenticated users can view all profiles for scheduling"
on profiles for select
using (auth.role() = 'authenticated');
