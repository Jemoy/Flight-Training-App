-- Run this in Supabase SQL Editor.

alter table sessions add column if not exists aircraft_id uuid references aircraft(id);
alter table sessions add column if not exists aircraft_hours_applied boolean not null default false;

-- Idempotent: only ever applies once per session, guarded by aircraft_hours_applied.
-- IMPORTANT for app code: always finalize session_participants.hours_credited
-- BEFORE flipping a session's status to 'completed' — this reads whatever
-- hours_credited holds at the moment status becomes 'completed'.
create or replace function apply_aircraft_hours()
returns trigger as $$
declare
  v_hours numeric;
begin
  if new.status = 'completed' and new.aircraft_id is not null and new.aircraft_hours_applied = false then
    select coalesce(sum(hours_credited), 0) into v_hours
    from session_participants where session_id = new.id;

    update aircraft
      set total_flight_hours = total_flight_hours + v_hours,
          hours_before_50hr_maintenance = greatest(0, hours_before_50hr_maintenance - v_hours),
          hours_before_100hr_maintenance = greatest(0, hours_before_100hr_maintenance - v_hours)
      where id = new.aircraft_id;

    update sessions set aircraft_hours_applied = true where id = new.id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger after_session_insert_apply_aircraft_hours
after insert on sessions
for each row execute function apply_aircraft_hours();

create trigger after_session_update_apply_aircraft_hours
after update on sessions
for each row execute function apply_aircraft_hours();
