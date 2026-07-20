-- Run this in Supabase SQL Editor.

-- Postgres resolves string literals inside a CASE expression as plain `text`
-- by default. Inserting that into a column typed as the `stage_status` enum
-- fails without an explicit cast on each branch.

create or replace function recompute_stage_progress(p_student_id uuid, p_stage_id uuid)
returns void as $$
declare
  v_required_hours numeric;
  v_cumulative_hours numeric;
  v_has_pass boolean;
  v_track training_track;
  v_seq int;
  v_next_stage_id uuid;
begin
  select required_hours, track, sequence_order
    into v_required_hours, v_track, v_seq
    from stages where id = p_stage_id;

  select coalesce(sum(sp.hours_credited), 0)
    into v_cumulative_hours
    from session_participants sp
    join sessions s on s.id = sp.session_id
    where sp.student_id = p_student_id
      and s.stage_id = p_stage_id
      and s.status = 'completed';

  select exists (
    select 1 from evaluations e
    join sessions s on s.id = e.session_id
    where e.student_id = p_student_id
      and s.stage_id = p_stage_id
      and e.result = 'pass'
  ) into v_has_pass;

  insert into student_stage_progress (student_id, stage_id, cumulative_hours, status, completed_at)
  values (
    p_student_id, p_stage_id, v_cumulative_hours,
    case when v_cumulative_hours >= v_required_hours and v_has_pass then 'complete'::stage_status else 'in_progress'::stage_status end,
    case when v_cumulative_hours >= v_required_hours and v_has_pass then now() else null end
  )
  on conflict (student_id, stage_id) do update
    set cumulative_hours = excluded.cumulative_hours,
        status = excluded.status,
        completed_at = excluded.completed_at;

  if v_cumulative_hours >= v_required_hours and v_has_pass then
    select id into v_next_stage_id from stages
      where track = v_track and sequence_order = v_seq + 1;

    if v_next_stage_id is not null then
      insert into student_stage_progress (student_id, stage_id, status, unlocked_at)
      values (p_student_id, v_next_stage_id, 'in_progress'::stage_status, now())
      on conflict (student_id, stage_id) do nothing;
    end if;
  end if;
end;
$$ language plpgsql security definer;
