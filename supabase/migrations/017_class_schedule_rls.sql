-- Run this in Supabase SQL Editor.

alter table class_schedule enable row level security;

create policy "admin can manage all class schedules"
on class_schedule for all
using (is_admin())
with check (is_admin());

create policy "students can view own class schedule"
on class_schedule for select
using (auth.uid() = student_id);
