-- Run this in Supabase SQL Editor.

alter table sessions add column if not exists check_type text;
