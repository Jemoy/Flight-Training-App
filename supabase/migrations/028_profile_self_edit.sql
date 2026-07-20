-- Run this in Supabase SQL Editor.

create policy "users can update own profile"
on profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

-- RLS only checks row ownership, not which columns changed — without this
-- guard, a student could craft a raw update request and set their own role
-- to 'admin'. This trigger silently forces sensitive fields back to their
-- prior value unless the person making the change is an admin.
create or replace function guard_profile_self_edit()
returns trigger as $$
begin
  if not is_admin() then
    new.role := old.role;
    new.is_active := old.is_active;
    new.student_number := old.student_number;
    new.pel_number := old.pel_number;
    new.instructor_roles := old.instructor_roles;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger before_profile_update_guard
before update on profiles
for each row execute function guard_profile_self_edit();
