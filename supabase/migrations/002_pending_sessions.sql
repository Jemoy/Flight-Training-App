-- Run this in Supabase SQL Editor.

-- A session can now sit as a tentative hold before faculty approves the payment it's tied to.
alter type session_status add value if not exists 'pending';

-- Link a payment to the session the student requested alongside it (nullable —
-- students booking against already-verified hours via the Schedule page don't set this).
alter table payments add column if not exists session_id uuid references sessions(id);
