-- Run this in Supabase SQL Editor.

alter table simulators add column if not exists deactivated_at timestamptz;
alter table simulators add column if not exists expected_reactivation_date date;
alter table simulators add column if not exists hours_before_maintenance numeric(6,2);
alter table simulators add column if not exists maintenance_duration text;
