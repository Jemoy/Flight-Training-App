-- (This file was split from the original 022 after discovering the enum-in-
-- same-transaction issue live — see 022b for why.)
-- Run this in Supabase SQL Editor.

-- New intermediate status: hours + pass are met, but admin hasn't signed off yet
alter type stage_status add value if not exists 'pending_approval';
-- Run this SEPARATELY, in its own execution, before 022b — Postgres
