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
grant select, insert, update on public.clients to authenticated;
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
