-- Run this in Supabase SQL Editor.

drop policy if exists "faculty full access payments" on payments;

create policy "admin full access payments"
on payments for all
using (is_admin())
with check (is_admin());
