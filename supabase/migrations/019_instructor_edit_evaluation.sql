-- Run this in Supabase SQL Editor.

create policy "assigned instructor can update own evaluation"
on evaluations for update
using (evaluator_id = auth.uid())
with check (evaluator_id = auth.uid());
