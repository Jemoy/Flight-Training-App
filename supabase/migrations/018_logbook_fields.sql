-- Run this in Supabase SQL Editor.

-- Student's license/certificate number, set once by admin
alter table profiles add column if not exists pel_number text;

-- Master list of route points (e.g. RPVM, LOCAL), used for both From and To dropdowns
create table routes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

alter table routes enable row level security;

create policy "authenticated users can read routes"
on routes for select
using (auth.role() = 'authenticated');

create policy "admin can manage routes"
on routes for all
using (is_admin())
with check (is_admin());

-- Per-session logbook details, filled in by the assigned instructor at evaluation time
alter table sessions add column if not exists aircraft_type text;
alter table sessions add column if not exists route_from text;
alter table sessions add column if not exists route_to text;
alter table sessions add column if not exists flight_category text; -- 'local' | 'cross_country'
alter table sessions add column if not exists duty_type text;       -- 'dual' | 'solo' | 'pic'
