-- FrameCrest: separate client accounts from staff accounts
-- Run once in Supabase SQL Editor after deploying the matching dashboard update.
-- A client account is permanently classified as a client and cannot be converted into staff.

alter table public.profiles
  add column if not exists account_type text;

update public.profiles
set account_type = case
  when role = 'client' then 'client'
  else 'staff'
end
where account_type is null;

alter table public.profiles
  alter column account_type set not null;

alter table public.profiles
  drop constraint if exists profiles_account_type_check;

alter table public.profiles
  add constraint profiles_account_type_check
  check (account_type in ('client','staff'));

-- Only staff accounts may have staff roles; client accounts must retain the client role.
alter table public.profiles
  drop constraint if exists profiles_account_role_check;

alter table public.profiles
  add constraint profiles_account_role_check
  check (
    (account_type = 'client' and role = 'client')
    or (account_type = 'staff' and role in ('admin','editor','qa'))
  );

create or replace function public.protect_account_type()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.account_type is distinct from old.account_type then
    if not (
      old.account_type = 'client'
      and old.client_id is null
      and new.account_type = 'staff'
      and new.client_id is null
      and new.role in ('editor','qa')
    ) then
      raise exception 'Account type is permanent. Linked client accounts cannot be converted to staff accounts.';
    end if;
  end if;
  if new.account_type = 'client' and new.role <> 'client' then
    raise exception 'Client accounts cannot be assigned staff roles.';
  end if;
  if new.account_type = 'staff' and new.role not in ('admin','editor','qa') then
    raise exception 'Staff accounts must have an admin, editor or QA role.';
  end if;
  return new;
end; $$;

drop trigger if exists profiles_account_type_guard on public.profiles;
create trigger profiles_account_type_guard
before update on public.profiles
for each row execute function public.protect_account_type();

-- If a separate staff login was created and is still unlinked (client_id is NULL),
-- classify that account as staff. Never use a real client's login here.
-- update public.profiles p
-- set account_type = 'staff', role = 'editor', client_id = null
-- from auth.users u
-- where p.id = u.id
--   and lower(u.email) = lower('EDITOR_LOGIN_EMAIL')
--   and p.account_type = 'client'
--   and p.client_id is null;
--
-- Linked client accounts cannot be converted to staff accounts.


-- Ensure auth-triggered profiles have a client account type by default.
-- Staff invitations are safely promoted by the server-side invitation function.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id,full_name,role,account_type)
  values(new.id, coalesce(new.raw_user_meta_data->>'full_name',''), 'client', 'client')
  on conflict (id) do nothing;
  return new;
end; $$;
