-- Run this in Supabase SQL Editor.

create table stage_aircraft (
  stage_id uuid not null references stages(id) on delete cascade,
  aircraft_id uuid not null references aircraft(id) on delete cascade,
  primary key (stage_id, aircraft_id)
);

alter table stage_aircraft enable row level security;

create policy "authenticated users can read stage_aircraft"
on stage_aircraft for select
using (auth.role() = 'authenticated');

create policy "admin can manage stage_aircraft"
on stage_aircraft for all
using (is_admin())
with check (is_admin());
