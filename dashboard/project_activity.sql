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
