-- Run this in Supabase SQL Editor.

-- A payment can now cover multiple separate 1-hour slots, not just one block.
-- We flip the relationship: sessions point back to the payment that covers them.
alter table sessions add column if not exists payment_id uuid references payments(id);

-- payments.session_id from the previous migration is no longer used by the app —
-- safe to leave in place (harmless) or drop it if you'd rather clean it up:
-- alter table payments drop column if exists session_id;
alter table payments drop column if exists session_id;
