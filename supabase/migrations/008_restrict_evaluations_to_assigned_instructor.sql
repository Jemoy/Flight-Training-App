-- Run this in Supabase SQL Editor.

-- Replaces the old "any faculty/admin can evaluate" policy with one that
-- only allows the specific instructor assigned to a session (sessions.instructor_id)
-- to submit an evaluation for it — enforced at the database level, not just hidden in the UI.

drop policy if exists "faculty insert evaluations" on evaluations;

create policy "assigned instructor can insert evaluation"
on evaluations for insert
with check (
  evaluator_id = auth.uid()
  and exists (
    select 1 from sessions s
    where s.id = evaluations.session_id
      and s.instructor_id = auth.uid()
  )
);
