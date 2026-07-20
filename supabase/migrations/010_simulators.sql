-- Run this in Supabase SQL Editor.

create type simulator_type as enum ('not_rated', 'basic', 'atd');

create table simulators (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type simulator_type not null,
  is_active boolean not null default true
);

insert into simulators (name, type) values
  ('Simulator 1', 'not_rated'),
  ('Simulator 2', 'atd'),
  ('Simulator 3', 'atd'),
  ('Simulator 4', 'basic');

alter table sessions add column if not exists simulator_id uuid references simulators(id);

-- Simulators table has no sensitive data — readable by anyone logged in
alter table simulators enable row level security;
create policy "authenticated users can read simulators"
on simulators for select
using (auth.role() = 'authenticated');
