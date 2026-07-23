-- Run this AFTER 022a has been committed (separate execution) — this file
-- references the enum value 022a just added, which Postgres won't allow
-- inside the same transaction that created it.

-- Instructor's recommendation, captured on the evaluation that crosses the hour threshold
alter table evaluations add column if not exists recommend_advance boolean;

-- Track who approved a stage advancement and when
alter table student_stage_progress add column if not exists approved_by uuid references profiles(id);
alter table student_stage_progress add column if not exists approved_at timestamptz;

-- Recompute now stops at 'pending_approval' instead of auto-completing — it no
-- longer unlocks the next stage itself. It also never downgrades a stage that
-- admin already approved as 'complete'. It looks at the MOST RECENT evaluation
-- for the stage (not "any passing evaluation ever") to decide eligibility,
-- since that's the one that actually pushed hours over the threshold.
create or replace function recompute_stage_progress(p_student_id uuid, p_stage_id uuid)
returns void as $$
declare
  v_required_hours numeric;
  v_cumulative_hours numeric;
  v_current_status stage_status;
  v_latest_result evaluation_result;
  v_latest_recommend boolean;
  v_new_status stage_status;
begin
  select required_hours into v_required_hours from stages where id = p_stage_id;

  select coalesce(sum(sp.hours_credited), 0)
    into v_cumulative_hours
    from session_participants sp
    join sessions s on s.id = sp.session_id
    where sp.student_id = p_student_id
      and s.stage_id = p_stage_id
      and s.status = 'completed';

  select status into v_current_status
    from student_stage_progress
    where student_id = p_student_id and stage_id = p_stage_id;

  select e.result, e.recommend_advance
    into v_latest_result, v_latest_recommend
    from evaluations e
    join sessions s on s.id = e.session_id
    where e.student_id = p_student_id and s.stage_id = p_stage_id
    order by e.created_at desc
    limit 1;

  if v_current_status = 'complete' then
    v_new_status := 'complete'; -- never downgrade an admin-approved stage
  elsif v_cumulative_hours >= v_required_hours and v_latest_result = 'pass' and v_latest_recommend is true then
    v_new_status := 'pending_approval';
  else
    v_new_status := 'in_progress';
  end if;

  insert into student_stage_progress (student_id, stage_id, cumulative_hours, status)
  values (p_student_id, p_stage_id, v_cumulative_hours, v_new_status)
  on conflict (student_id, stage_id) do update
    set cumulative_hours = excluded.cumulative_hours,
        status = excluded.status;
end;
$$ language plpgsql security definer;

-- Admin approval: finalize the stage as complete and unlock the next one —
-- this is now the ONLY place that ever unlocks a subsequent stage.
create or replace function approve_stage_advancement(p_student_id uuid, p_stage_id uuid, p_approver uuid)
returns void as $$
declare
  v_track training_track;
  v_seq int;
  v_next_stage_id uuid;
begin
  update student_stage_progress
    set status = 'complete', completed_at = now(), approved_by = p_approver, approved_at = now()
    where student_id = p_student_id and stage_id = p_stage_id;

  select track, sequence_order into v_track, v_seq from stages where id = p_stage_id;

  select id into v_next_stage_id from stages
    where track = v_track and sequence_order = v_seq + 1;

  if v_next_stage_id is not null then
    insert into student_stage_progress (student_id, stage_id, status, unlocked_at)
    values (p_student_id, v_next_stage_id, 'in_progress', now())
    on conflict (student_id, stage_id) do nothing;
  end if;
end;
$$ language plpgsql security definer;

-- Admin rejection: send it back to in_progress. Stays there until a new
-- evaluation event (edit or new session) re-triggers pending_approval.
create or replace function reject_stage_advancement(p_student_id uuid, p_stage_id uuid)
returns void as $$
begin
  update student_stage_progress
    set status = 'in_progress'
    where student_id = p_student_id and stage_id = p_stage_id;
end;
$$ language plpgsql security definer;

-- Admin needs to call these RPCs
grant execute on function approve_stage_advancement(uuid, uuid, uuid) to authenticated;
grant execute on function reject_stage_advancement(uuid, uuid) to authenticated;
