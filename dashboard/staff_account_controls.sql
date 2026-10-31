-- FrameCrest staff account controls
-- Run once in Supabase SQL Editor. Existing accounts remain active.
alter table public.profiles
  add column if not exists is_active boolean not null default true;

-- Disabled staff accounts must immediately lose database access,
-- even if they still hold an unexpired sign-in token.
create or replace function public.current_role()
returns text language sql stable security definer set search_path = public as $$
  select role
  from public.profiles
  where id = auth.uid()
    and coalesce(is_active, true) = true
$$;
