-- Run this in Supabase SQL Editor.

-- Add the correct FAA terminology as new enum values (old guesses 'not_rated'
-- and 'basic' stay in the type for compatibility but go unused going forward —
-- Postgres enums can't have values removed, only added).
alter type simulator_type add value if not exists 'basic_simulator';
alter type simulator_type add value if not exists 'aatd';

-- Admin can add/edit/deactivate simulators (read access for everyone already exists)
create policy "admin can manage simulators"
on simulators for all
using (is_admin())
with check (is_admin());
