-- Run this in Supabase SQL Editor.

create table stage_simulators (
  stage_id uuid not null references stages(id) on delete cascade,
  simulator_id uuid not null references simulators(id) on delete cascade,
  primary key (stage_id, simulator_id)
);

alter table stage_simulators enable row level security;

create policy "authenticated users can read stage_simulators"
on stage_simulators for select
using (auth.role() = 'authenticated');

create policy "admin can manage stage_simulators"
on stage_simulators for all
using (is_admin())
with check (is_admin());
