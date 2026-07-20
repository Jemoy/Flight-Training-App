-- Run this in Supabase SQL Editor.

-- Converts simulators.type from a single enum value to an array, so one
-- physical unit can be classified as e.g. both ATD and AATD.
alter table simulators alter column type type simulator_type[] using array[type];
