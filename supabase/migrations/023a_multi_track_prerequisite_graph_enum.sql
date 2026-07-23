-- (Split from the original 023 — the enum additions must be committed
-- separately before anything in 023b can use those new values.)
-- Run this in Supabase SQL Editor, on its own.

-- ============================================================
-- 1. New track values
-- ============================================================
alter type training_track add value if not exists 'ppl';
alter type training_track add value if not exists 'cpl';
alter type training_track add value if not exists 'ir';
alter type training_track add value if not exists 'multi_engine';
alter type training_track add value if not exists 'build_time';
