-- Run this in Supabase SQL Editor.

-- Purely a helper catalog for the UI dropdown — class_schedule.class_name
-- stores the name as plain text at creation time, so editing or deleting a
-- subject here never affects schedules already generated from it.
create table subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table subjects enable row level security;

create policy "authenticated users can read subjects"
on subjects for select
using (auth.role() = 'authenticated');

create policy "admin can manage subjects"
on subjects for all
using (is_admin())
with check (is_admin());
