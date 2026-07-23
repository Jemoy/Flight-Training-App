-- Run this AFTER 023a has been committed (separate execution).
-- ⚠️ This clears out the OLD FS-track stages (PGC-EQC, ATF 212, ATF 322,
-- PPL_HOURS) and everything tied to them (payments, sessions, progress).
-- Only run this if that data is safe to lose (test data, per this build).

-- ============================================================
-- 2. Stage schema changes
-- ============================================================
alter table stages alter column required_hours drop not null;
alter table stages add column if not exists manual_completion_only boolean not null default false;

-- ============================================================
-- 3. Prerequisite graph — replaces "next sequence_order in same track"
-- ============================================================
create table stage_prerequisites (
  stage_id uuid not null references stages(id) on delete cascade,
  prerequisite_stage_id uuid not null references stages(id) on delete cascade,
  primary key (stage_id, prerequisite_stage_id)
);

alter table stage_prerequisites enable row level security;

create policy "authenticated users can read stage_prerequisites"
on stage_prerequisites for select
using (auth.role() = 'authenticated');

create policy "admin can manage stage_prerequisites"
on stage_prerequisites for all
using (is_admin())
with check (is_admin());

-- ============================================================
-- 4. Wipe the old FS-track stages and everything tied to them
-- ============================================================
delete from evaluations where session_id in (
  select id from sessions where stage_id in (
    select id from stages where code in ('ATF322','ATF212','PPL_HOURS','PGC_EQC')
  )
);
delete from session_participants where session_id in (
  select id from sessions where stage_id in (
    select id from stages where code in ('ATF322','ATF212','PPL_HOURS','PGC_EQC')
  )
);
delete from sessions where stage_id in (
  select id from stages where code in ('ATF322','ATF212','PPL_HOURS','PGC_EQC')
);
delete from payments where stage_id in (
  select id from stages where code in ('ATF322','ATF212','PPL_HOURS','PGC_EQC')
);
delete from student_stage_progress where stage_id in (
  select id from stages where code in ('ATF322','ATF212','PPL_HOURS','PGC_EQC')
);
delete from stage_simulators where stage_id in (
  select id from stages where code in ('ATF322','ATF212','PPL_HOURS','PGC_EQC')
);
delete from stages where code in ('ATF322','ATF212','PPL_HOURS','PGC_EQC');

-- ============================================================
-- 5. Seed the new stage structure
-- ============================================================
insert into stages (track, code, name, sequence_order, required_hours) values
  ('simulator', 'FS_VA',   'Virtual Aerodrome',            1, 1),
  ('simulator', 'FS_SIM',  'Simulator',                    2, 2),
  ('simulator', 'FS_RNAV', 'Rad Nav Simulator',             3, 10),
  ('ppl',       'PPL_1',   'PPL Build - Flying',            1, 5),
  ('ppl',       'PPL_2',   'PPL Build - Flying',            2, 30),
  ('cpl',       'CPL_SIM', 'CPL - Simulator',               1, 5),
  ('cpl',       'CPL_BAF', 'CPL BAF - Flying',               2, 10),
  ('ir',        'IR_SIM',  'IR - Simulator',                1, 20),
  ('ir',        'IR_FLY',  'IR Flying',                      2, 20),
  ('multi_engine', 'ME_SIM', 'Multi-Engine Simulator',       1, 10);

insert into stages (track, code, name, sequence_order, required_hours, manual_completion_only) values
  ('cpl', 'CPL_BUILD', 'CPL Build - Flying', 3, null, true);

-- ============================================================
-- 6. Wire up the dependency graph
-- ============================================================
insert into stage_prerequisites (stage_id, prerequisite_stage_id)
select (select id from stages where code = 'PPL_1'), id
from stages where code in ('FS_VA', 'FS_SIM');

insert into stage_prerequisites (stage_id, prerequisite_stage_id)
select (select id from stages where code = 'FS_RNAV'), (select id from stages where code = 'PPL_1');

insert into stage_prerequisites (stage_id, prerequisite_stage_id)
select (select id from stages where code = 'PPL_2'), id
from stages where code in ('FS_RNAV', 'PPL_1');

insert into stage_prerequisites (stage_id, prerequisite_stage_id)
select s.id, (select id from stages where code = 'PPL_2')
from stages s where s.code in ('CPL_SIM', 'IR_SIM', 'ME_SIM');

insert into stage_prerequisites (stage_id, prerequisite_stage_id) values
  ((select id from stages where code = 'CPL_BAF'),   (select id from stages where code = 'CPL_SIM')),
  ((select id from stages where code = 'CPL_BUILD'), (select id from stages where code = 'CPL_BAF')),
  ((select id from stages where code = 'IR_FLY'),    (select id from stages where code = 'IR_SIM'));

-- ============================================================
-- 7. Rewritten unlock engine
-- ============================================================

create or replace function recompute_stage_progress(p_student_id uuid, p_stage_id uuid)
returns void as $$
declare
  v_required_hours numeric;
  v_manual_only boolean;
  v_cumulative_hours numeric;
  v_current_status stage_status;
  v_latest_result evaluation_result;
  v_latest_recommend boolean;
  v_new_status stage_status;
begin
  select required_hours, manual_completion_only into v_required_hours, v_manual_only
    from stages where id = p_stage_id;

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

  if v_manual_only then
    v_new_status := coalesce(v_current_status, 'in_progress');
  else
    select e.result, e.recommend_advance
      into v_latest_result, v_latest_recommend
      from evaluations e
      join sessions s on s.id = e.session_id
      where e.student_id = p_student_id and s.stage_id = p_stage_id
      order by e.created_at desc
      limit 1;

    if v_current_status = 'complete' then
      v_new_status := 'complete';
    elsif v_required_hours is not null and v_cumulative_hours >= v_required_hours
          and v_latest_result = 'pass' and v_latest_recommend is true then
      v_new_status := 'pending_approval';
    else
      v_new_status := 'in_progress';
    end if;
  end if;

  insert into student_stage_progress (student_id, stage_id, cumulative_hours, status)
  values (p_student_id, p_stage_id, v_cumulative_hours, v_new_status)
  on conflict (student_id, stage_id) do update
    set cumulative_hours = excluded.cumulative_hours,
        status = case when student_stage_progress.status = 'complete' then 'complete' else excluded.status end;
end;
$$ language plpgsql security definer;

create or replace function approve_stage_advancement(p_student_id uuid, p_stage_id uuid, p_approver uuid)
returns void as $$
declare
  v_dependent record;
  v_missing_count int;
begin
  insert into student_stage_progress (student_id, stage_id, status, completed_at, approved_by, approved_at)
  values (p_student_id, p_stage_id, 'complete', now(), p_approver, now())
  on conflict (student_id, stage_id) do update
    set status = 'complete', completed_at = now(), approved_by = p_approver, approved_at = now();

  for v_dependent in
    select distinct stage_id from stage_prerequisites where prerequisite_stage_id = p_stage_id
  loop
    select count(*) into v_missing_count
    from stage_prerequisites sp
    where sp.stage_id = v_dependent.stage_id
      and not exists (
        select 1 from student_stage_progress ssp
        where ssp.student_id = p_student_id
          and ssp.stage_id = sp.prerequisite_stage_id
          and ssp.status = 'complete'
      );

    if v_missing_count = 0 then
      insert into student_stage_progress (student_id, stage_id, status, unlocked_at)
      values (p_student_id, v_dependent.stage_id, 'in_progress', now())
      on conflict (student_id, stage_id) do nothing;
    end if;
  end loop;
end;
$$ language plpgsql security definer;

create or replace function reject_stage_advancement(p_student_id uuid, p_stage_id uuid)
returns void as $$
begin
  update student_stage_progress
    set status = 'in_progress'
    where student_id = p_student_id and stage_id = p_stage_id;
end;
$$ language plpgsql security definer;

grant execute on function approve_stage_advancement(uuid, uuid, uuid) to authenticated;
grant execute on function reject_stage_advancement(uuid, uuid) to authenticated;
