-- Run this in Supabase SQL Editor.

alter table simulators add column if not exists total_operating_hours numeric(8,2) not null default 0;
alter table sessions add column if not exists simulator_hours_applied boolean not null default false;

-- Idempotent, mirrors apply_aircraft_hours: only ever applies once per session.
create or replace function apply_simulator_hours()
returns trigger as $$
declare
  v_hours numeric;
begin
  if new.status = 'completed' and new.simulator_id is not null and new.simulator_hours_applied = false then
    select coalesce(sum(hours_credited), 0) into v_hours
    from session_participants where session_id = new.id;

    update simulators
      set total_operating_hours = total_operating_hours + v_hours,
          hours_before_maintenance = greatest(0, coalesce(hours_before_maintenance, 0) - v_hours)
      where id = new.simulator_id;

    update sessions set simulator_hours_applied = true where id = new.id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger after_session_insert_apply_simulator_hours
after insert on sessions
for each row execute function apply_simulator_hours();

create trigger after_session_update_apply_simulator_hours
after update on sessions
for each row execute function apply_simulator_hours();
