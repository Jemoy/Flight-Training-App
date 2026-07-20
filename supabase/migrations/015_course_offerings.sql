-- Run this in Supabase SQL Editor.

-- Replaces the simple 'subjects' name list with a full course-offering catalog
-- matching the real master schedule (subject code/title, instructor, section,
-- year level, days, time, room, type, hours). Multiple rows can share the same
-- subject code/title for different sections or blocks.

create table course_offerings (
  id uuid primary key default gen_random_uuid(),
  subject_code text not null,
  subject_title text not null,
  instructor_name text,
  section text,
  year_level text,
  days int[] not null default '{}',   -- 1=Mon ... 6=Sat, matches the rest of the app
  start_time text not null,           -- 'HH:MM'
  end_time text not null,             -- 'HH:MM'
  room text,
  type text,                          -- 'Lecture' | 'Laboratory' | 'Lecture&Lab'
  created_at timestamptz not null default now()
);

alter table course_offerings enable row level security;

create policy "authenticated users can read course_offerings"
on course_offerings for select
using (auth.role() = 'authenticated');

create policy "admin can manage course_offerings"
on course_offerings for all
using (is_admin())
with check (is_admin());

-- The old simple subjects table is superseded — safe to drop since
-- class_schedule.class_name always stored plain text, never a live reference.
drop table if exists subjects;
