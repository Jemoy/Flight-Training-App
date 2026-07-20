-- Run this in Supabase SQL Editor.

alter table profiles add column if not exists is_active boolean not null default true;
