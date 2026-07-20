-- Run this in Supabase SQL Editor.

create table aircraft (
  id uuid primary key default gen_random_uuid(),
  aircraft_type text not null,
  registry text not null unique,
  total_flight_hours numeric(8,2) not null default 0,
  hours_before_50hr_maintenance numeric(6,2) not null default 50,
  hours_before_100hr_maintenance numeric(6,2) not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table aircraft enable row level security;

create policy "authenticated users can read aircraft"
on aircraft for select
using (auth.role() = 'authenticated');

create policy "admin can manage aircraft"
on aircraft for all
using (is_admin())
with check (is_admin());

insert into aircraft (aircraft_type, registry, total_flight_hours, hours_before_50hr_maintenance, hours_before_100hr_maintenance) values
  ('C150', 'C150-1', 0, 50, 100),
  ('C150', 'C150-2', 0, 50, 100),
  ('C150', 'C150-3', 0, 50, 100),
  ('C150', 'C150-4', 0, 50, 100);
