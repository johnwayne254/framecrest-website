-- FrameCrest staff account controls
-- Run once in Supabase SQL Editor. Existing accounts remain active.
alter table public.profiles
  add column if not exists is_active boolean not null default true;
