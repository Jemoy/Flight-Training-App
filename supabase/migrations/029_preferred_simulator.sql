-- Run this in Supabase SQL Editor.

alter table payments add column if not exists preferred_simulator_id uuid references simulators(id);
