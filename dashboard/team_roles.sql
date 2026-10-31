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

