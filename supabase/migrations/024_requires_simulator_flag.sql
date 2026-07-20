-- Run this in Supabase SQL Editor.

alter table stages add column if not exists requires_simulator boolean not null default true;

update stages set requires_simulator = false
where code in ('PPL_1', 'PPL_2', 'CPL_BAF', 'CPL_BUILD', 'IR_FLY');
