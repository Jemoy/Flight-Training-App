-- Run this in Supabase SQL Editor.

create table rotation_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table rotation_template_slots (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references rotation_templates(id) on delete cascade,
  slot_letter text not null,
  day_of_week int not null,   -- 1=Mon ... 6=Sat
  start_time text not null,   -- 'HH:MM'
  end_time text not null
);

create table rotation_batches (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references rotation_templates(id),
  stage_id uuid not null references stages(id),
  aircraft_id uuid references aircraft(id),
  start_date date not null,
  end_date date not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table rotation_batch_assignments (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references rotation_batches(id) on delete cascade,
  slot_letter text not null,
  student_id uuid not null references profiles(id),
  instructor_id uuid not null references profiles(id),
  unique (batch_id, slot_letter)
);

alter table rotation_templates enable row level security;
alter table rotation_template_slots enable row level security;
alter table rotation_batches enable row level security;
alter table rotation_batch_assignments enable row level security;

create policy "admin manages rotation_templates" on rotation_templates for all using (is_admin()) with check (is_admin());
create policy "admin manages rotation_template_slots" on rotation_template_slots for all using (is_admin()) with check (is_admin());
create policy "admin manages rotation_batches" on rotation_batches for all using (is_admin()) with check (is_admin());
create policy "admin manages rotation_batch_assignments" on rotation_batch_assignments for all using (is_admin()) with check (is_admin());

-- Seed the exact rotation pattern from the sample spreadsheet: 9 slots (a-i),
-- each flying 4 times a week, spread across Mon-Sat / six 80-minute blocks,
-- so no student is stuck with the same day/time every week.
with t as (
  insert into rotation_templates (name) values ('Standard 9-slot rotation') returning id
)
insert into rotation_template_slots (template_id, slot_letter, day_of_week, start_time, end_time)
select t.id, v.slot_letter, v.day_of_week, v.start_time, v.end_time from t, (values
  ('a', 1, '07:00', '08:20'), ('a', 3, '10:25', '11:45'), ('a', 4, '12:00', '13:20'), ('a', 2, '15:25', '16:45'),
  ('b', 1, '08:35', '09:55'), ('b', 5, '08:35', '09:55'), ('b', 4, '13:50', '15:10'), ('b', 6, '15:25', '16:45'),
  ('c', 4, '07:00', '08:20'), ('c', 1, '10:25', '11:45'), ('c', 6, '12:00', '13:20'), ('c', 3, '13:50', '15:10'),
  ('d', 2, '07:00', '08:20'), ('d', 4, '10:25', '11:45'), ('d', 5, '10:25', '11:45'), ('d', 1, '12:00', '13:20'),
  ('e', 3, '07:00', '08:20'), ('e', 6, '10:25', '11:45'), ('e', 1, '13:50', '15:10'), ('e', 4, '15:25', '16:45'),
  ('f', 4, '08:35', '09:55'), ('f', 5, '13:50', '15:10'), ('f', 1, '15:25', '16:45'), ('f', 3, '15:25', '16:45'),
  ('g', 5, '07:00', '08:20'), ('g', 3, '08:35', '09:55'), ('g', 6, '08:35', '09:55'), ('g', 2, '12:00', '13:20'),
  ('h', 6, '07:00', '08:20'), ('h', 2, '08:35', '09:55'), ('h', 5, '12:00', '13:20'), ('h', 2, '13:50', '15:10'),
  ('i', 2, '10:25', '11:45'), ('i', 3, '12:00', '13:20'), ('i', 6, '13:50', '15:10'), ('i', 5, '15:25', '16:45')
) as v(slot_letter, day_of_week, start_time, end_time);
