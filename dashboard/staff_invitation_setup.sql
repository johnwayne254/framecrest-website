-- FrameCrest staff invitation support
-- Run once after account_types.sql. New auth profiles default to client;
-- the secure invite-team-member Edge Function then promotes invited staff.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id,full_name,role,account_type)
  values(new.id, coalesce(new.raw_user_meta_data->>'full_name',''), 'client', 'client')
  on conflict (id) do nothing;
  return new;
end; $$;
