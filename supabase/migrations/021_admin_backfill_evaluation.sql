-- Run this in Supabase SQL Editor.

-- Backfilling historical data is an administrative correction, not a live
-- evaluation acting as instructor-of-record — this policy is additive
-- (OR'd with the existing one), so faculty's "must be assigned instructor"
-- restriction is completely unchanged. Only admin gets this extra path.
create policy "admin can insert evaluation for backfill"
on evaluations for insert
with check (is_admin());
