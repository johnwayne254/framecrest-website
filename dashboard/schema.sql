-- FrameCrest Studios dashboard database
-- Run this entire script in Supabase SQL Editor on a new project.
create extension if not exists pgcrypto;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  email text,
  phone text,
  location text,
  website text,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'client' check (role in ('admin','editor','client')),
  client_id uuid references public.clients(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  project_code text unique,
  name text not null,
  client_id uuid not null references public.clients(id),
  service text not null check (service in ('Photo Editing','Virtual Staging','Floor Plan Design','Real Estate Video Editing')),
  quantity integer not null default 1 check (quantity > 0),
  editor_id uuid references public.profiles(id) on delete set null,
  due_date date,
  status text not null default 'Awaiting files' check (status in ('Awaiting files','In progress','In QA','Revisions','Delivered','Cancelled')),
  qa_status text not null default 'Not started' check (qa_status in ('Not started','Pending review','Passed','Changes required')),
  brief text,
  folder_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_financials (
  project_id uuid primary key references public.projects(id) on delete cascade,
  quote_usd numeric(12,2) not null default 0 check (quote_usd >= 0),
  paid_usd numeric(12,2) not null default 0 check (paid_usd >= 0),
  updated_at timestamptz not null default now()
);

create or replace function public.make_project_code()
returns trigger language plpgsql as $$
begin
  if new.project_code is null or new.project_code = '' then
    new.project_code := 'FC-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  end if;
  new.updated_at := now();
  return new;
end; $$;
drop trigger if exists projects_code_trigger on public.projects;
create trigger projects_code_trigger before insert or update on public.projects
for each row execute function public.make_project_code();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id,full_name,role)
  values(new.id, coalesce(new.raw_user_meta_data->>'full_name',''), 'client')
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.current_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;
create or replace function public.current_client_id()
returns uuid language sql stable security definer set search_path = public as $$
  select client_id from public.profiles where id = auth.uid()
$$;

alter table public.clients enable row level security;
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_financials enable row level security;

-- Profiles: users can read their own profile; admins can read/manage all.
drop policy if exists "profile self read" on public.profiles;
create policy "profile self read" on public.profiles for select to authenticated
using (id = auth.uid() or public.current_role() = 'admin');
drop policy if exists "admin manage profiles" on public.profiles;
create policy "admin manage profiles" on public.profiles for all to authenticated
using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

-- Clients: only administrators can manage the directory.
drop policy if exists "admin manage clients" on public.clients;
create policy "admin manage clients" on public.clients for all to authenticated
using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

-- Projects: admins see all; editors see assigned projects; clients see their own projects.
drop policy if exists "project visibility" on public.projects;
create policy "project visibility" on public.projects for select to authenticated
using (
  public.current_role() = 'admin'
  or (public.current_role() = 'editor' and editor_id = auth.uid())
  or (public.current_role() = 'client' and client_id = public.current_client_id())
);
drop policy if exists "admin create projects" on public.projects;
create policy "admin create projects" on public.projects for insert to authenticated
with check (public.current_role() = 'admin');
drop policy if exists "admin update projects" on public.projects;
create policy "admin update projects" on public.projects for update to authenticated
using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
drop policy if exists "editor update assigned projects" on public.projects;
create policy "editor update assigned projects" on public.projects for update to authenticated
using (public.current_role() = 'editor' and editor_id = auth.uid())
with check (public.current_role() = 'editor' and editor_id = auth.uid());

-- Financial records are administrator-only. They are never exposed to client/editor accounts.
drop policy if exists "admin manage project financials" on public.project_financials;
create policy "admin manage project financials" on public.project_financials for all to authenticated
using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.clients to authenticated;
grant select, insert, update on public.projects to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.project_financials to authenticated;

-- After creating your first account in Supabase Authentication > Users,
-- promote it to administrator using this SQL (replace with your login email):
-- update public.profiles p set role='admin'
-- from auth.users u where p.id=u.id and u.email='YOUR_ADMIN_EMAIL';
-- To link a client's login to a client record:
-- update public.profiles p set client_id='CLIENT_UUID'
-- from auth.users u where p.id=u.id and u.email='CLIENT_LOGIN_EMAIL';
-- To invite an editor, create their auth user, then run:
-- update public.profiles p set role='editor'
-- from auth.users u where p.id=u.id and u.email='EDITOR_LOGIN_EMAIL';

-- Create a financial row automatically for every new project.
create or replace function public.create_project_financials()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.project_financials(project_id, quote_usd, paid_usd)
  values(new.id, 0, 0)
  on conflict (project_id) do nothing;
  return new;
end; $$;
drop trigger if exists projects_financials_trigger on public.projects;
create trigger projects_financials_trigger after insert on public.projects
for each row execute function public.create_project_financials();

-- Editors may update production progress only. They cannot change ownership,
-- client, pricing-related project details, scope, assignment or delivery links.
create or replace function public.guard_editor_project_updates()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.current_role() = 'editor' then
    if new.project_code is distinct from old.project_code
      or new.name is distinct from old.name
      or new.client_id is distinct from old.client_id
      or new.service is distinct from old.service
      or new.quantity is distinct from old.quantity
      or new.editor_id is distinct from old.editor_id
      or new.due_date is distinct from old.due_date
      or new.brief is distinct from old.brief
      or new.folder_url is distinct from old.folder_url
      or new.created_at is distinct from old.created_at then
      raise exception 'Editors may only update project status and QA status.';
    end if;
    if new.status not in ('In progress','In QA','Revisions') then
      raise exception 'Editors may set status to In progress, In QA or Revisions only.';
    end if;
    if new.qa_status not in ('Pending review','Changes required','Not started') then
      raise exception 'Only administrators can mark QA as Passed.';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists projects_editor_guard_trigger on public.projects;
create trigger projects_editor_guard_trigger before update on public.projects
for each row execute function public.guard_editor_project_updates();
-- Backfill financial rows for projects created before this trigger was added.
insert into public.project_financials(project_id, quote_usd, paid_usd)
select p.id, 0, 0
from public.projects p
left join public.project_financials f on f.project_id = p.id
where f.project_id is null
on conflict (project_id) do nothing;


-- Project activity and revision tracking (also available in project_activity.sql).
-- FrameCrest project activity and revision tracking
-- Run once in Supabase SQL Editor after the dashboard project-edit feature is deployed.

create table if not exists public.project_activity (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text not null default 'System',
  activity_type text not null check (activity_type in (
    'project_created','status_changed','qa_changed','revision_requested','details_updated'
  )),
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists project_activity_project_created_idx
  on public.project_activity(project_id, created_at desc);

alter table public.project_activity enable row level security;

drop policy if exists "project activity visibility" on public.project_activity;
create policy "project activity visibility" on public.project_activity
for select to authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = project_activity.project_id
      and (
        public.current_role() = 'admin'
        or (public.current_role() = 'editor' and p.editor_id = auth.uid())
        or (public.current_role() = 'client' and p.client_id = public.current_client_id())
      )
  )
);

grant select on public.project_activity to authenticated;

create or replace function public.log_project_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_name text;
begin
  select coalesce(nullif(full_name,''), 'Team member')
    into v_actor_name
  from public.profiles
  where id = auth.uid();

  v_actor_name := coalesce(v_actor_name, 'System');

  if tg_op = 'INSERT' then
    insert into public.project_activity(project_id, actor_id, actor_name, activity_type, message)
    values(new.id, auth.uid(), v_actor_name, 'project_created', 'Project created');
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.project_activity(project_id, actor_id, actor_name, activity_type, message)
    values(new.id, auth.uid(), v_actor_name, 'status_changed',
      'Status changed from ' || old.status || ' to ' || new.status);
  end if;

  if new.qa_status is distinct from old.qa_status then
    insert into public.project_activity(project_id, actor_id, actor_name, activity_type, message)
    values(
      new.id, auth.uid(), v_actor_name,
      case when new.qa_status = 'Changes required' then 'revision_requested' else 'qa_changed' end,
      'QA changed from ' || old.qa_status || ' to ' || new.qa_status
    );
  end if;

  if new.name is distinct from old.name
    or new.client_id is distinct from old.client_id
    or new.service is distinct from old.service
    or new.quantity is distinct from old.quantity
    or new.editor_id is distinct from old.editor_id
    or new.due_date is distinct from old.due_date
    or new.brief is distinct from old.brief
    or new.folder_url is distinct from old.folder_url then
    insert into public.project_activity(project_id, actor_id, actor_name, activity_type, message)
    values(new.id, auth.uid(), v_actor_name, 'details_updated', 'Project details updated');
  end if;

  return new;
end;
$$;

drop trigger if exists projects_activity_trigger on public.projects;
create trigger projects_activity_trigger
after insert or update on public.projects
for each row execute function public.log_project_activity();

-- Add a creation event for existing projects that predate this migration.
insert into public.project_activity(project_id, actor_id, actor_name, activity_type, message)
select p.id, null, 'System', 'project_created', 'Project added to activity tracking'
from public.projects p
where not exists (
  select 1 from public.project_activity a
  where a.project_id = p.id and a.activity_type = 'project_created'
);


-- Project payment history (also available in project_payments.sql).
-- FrameCrest payment history and transaction tracking
-- Run once in Supabase SQL Editor. Existing paid totals are preserved as opening balances.

create table if not exists public.project_payments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  amount_usd numeric(12,2) not null check (amount_usd > 0),
  payment_date date not null default current_date,
  payment_method text not null default 'Other'
    check (payment_method in ('Bank transfer','Card','PayPal','Wise','Cash','Other')),
  reference text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists project_payments_project_date_idx
  on public.project_payments(project_id, payment_date desc, created_at desc);

alter table public.project_payments enable row level security;

drop policy if exists "admin manage project payments" on public.project_payments;
create policy "admin manage project payments" on public.project_payments
for all to authenticated
using (public.current_role() = 'admin')
with check (public.current_role() = 'admin');

grant select, insert, update, delete on public.project_payments to authenticated;

-- Preserve paid totals already entered in the old finance form as opening balances.
insert into public.project_payments(project_id, amount_usd, payment_date, payment_method, notes)
select f.project_id, f.paid_usd, current_date, 'Other', 'Opening balance transferred from previous finance records'
from public.project_financials f
where f.paid_usd > 0
  and not exists (
    select 1 from public.project_payments p
    where p.project_id = f.project_id
  );

create or replace function public.sync_project_paid_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
begin
  if tg_op = 'DELETE' then
    v_project_id := old.project_id;
  else
    v_project_id := new.project_id;
  end if;

  update public.project_financials
  set paid_usd = coalesce((
    select sum(amount_usd)
    from public.project_payments
    where project_id = v_project_id
  ), 0),
  updated_at = now()
  where project_id = v_project_id;

  if tg_op = 'UPDATE' and old.project_id is distinct from new.project_id then
    update public.project_financials
    set paid_usd = coalesce((
      select sum(amount_usd)
      from public.project_payments
      where project_id = old.project_id
    ), 0),
    updated_at = now()
    where project_id = old.project_id;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists project_payments_sync_total on public.project_payments;
create trigger project_payments_sync_total
after insert or update or delete on public.project_payments
for each row execute function public.sync_project_paid_total();


-- Team roles and QA assignment migration (also available in team_roles.sql).
-- FrameCrest team roles and QA assignment
-- Run once in Supabase SQL Editor after deploying the matching dashboard update.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin','editor','qa','client'));

alter table public.projects
  add column if not exists qa_id uuid references public.profiles(id) on delete set null;

drop policy if exists "project visibility" on public.projects;
create policy "project visibility" on public.projects for select to authenticated
using (
  public.current_role() = 'admin'
  or (public.current_role() = 'editor' and editor_id = auth.uid())
  or (public.current_role() = 'qa' and qa_id = auth.uid())
  or (public.current_role() = 'client' and client_id = public.current_client_id())
);

drop policy if exists "editor update assigned projects" on public.projects;
create policy "editor update assigned projects" on public.projects for update to authenticated
using (public.current_role() = 'editor' and editor_id = auth.uid())
with check (public.current_role() = 'editor' and editor_id = auth.uid());

drop policy if exists "qa update assigned projects" on public.projects;
create policy "qa update assigned projects" on public.projects for update to authenticated
using (public.current_role() = 'qa' and qa_id = auth.uid())
with check (public.current_role() = 'qa' and qa_id = auth.uid());

create or replace function public.guard_editor_project_updates()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.current_role() = 'editor' then
    if new.project_code is distinct from old.project_code
      or new.name is distinct from old.name
      or new.client_id is distinct from old.client_id
      or new.service is distinct from old.service
      or new.quantity is distinct from old.quantity
      or new.editor_id is distinct from old.editor_id
      or new.qa_id is distinct from old.qa_id
      or new.due_date is distinct from old.due_date
      or new.brief is distinct from old.brief
      or new.folder_url is distinct from old.folder_url
      or new.qa_status is distinct from old.qa_status
      or new.created_at is distinct from old.created_at then
      raise exception 'Editors may only update production status.';
    end if;
    if new.status not in ('In progress','In QA','Revisions') then
      raise exception 'Editors may set status to In progress, In QA or Revisions only.';
    end if;
  elsif public.current_role() = 'qa' then
    if new.project_code is distinct from old.project_code
      or new.name is distinct from old.name
      or new.client_id is distinct from old.client_id
      or new.service is distinct from old.service
      or new.quantity is distinct from old.quantity
      or new.editor_id is distinct from old.editor_id
      or new.qa_id is distinct from old.qa_id
      or new.due_date is distinct from old.due_date
      or new.brief is distinct from old.brief
      or new.folder_url is distinct from old.folder_url
      or new.status is distinct from old.status
      or new.created_at is distinct from old.created_at then
      raise exception 'QA reviewers may only update QA status.';
    end if;
  end if;
  return new;
end; $$;

drop policy if exists "project activity visibility" on public.project_activity;
create policy "project activity visibility" on public.project_activity
for select to authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = project_activity.project_id
      and (
        public.current_role() = 'admin'
        or (public.current_role() = 'editor' and p.editor_id = auth.uid())
        or (public.current_role() = 'qa' and p.qa_id = auth.uid())
        or (public.current_role() = 'client' and p.client_id = public.current_client_id())
      )
  )
);



-- Permanent client/staff account separation (also available in account_types.sql).
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
    raise exception 'Account type is permanent. Client accounts cannot be converted to staff accounts.';
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

-- Classify the existing editor login as staff only if it is a separate,
-- newly-created staff account. Replace the email and run this statement separately:
-- update public.profiles p
-- set account_type = 'staff', role = 'editor', client_id = null
-- from auth.users u
-- where p.id = u.id
--   and lower(u.email) = lower('EDITOR_LOGIN_EMAIL')
--   and p.account_type = 'client'
--   and p.client_id is null;
--
-- IMPORTANT: Do not run that statement for a real client account.
