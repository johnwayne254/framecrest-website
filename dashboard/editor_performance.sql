-- FrameCrest editor performance tracking
-- Run once in Supabase SQL Editor after deploying the matching dashboard update.
-- This migration records new production events; it does not invent historical timestamps.

create table if not exists public.editor_work_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  editor_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in (
    'editor_assigned',
    'work_started',
    'submitted_to_qa',
    'revision_requested',
    'resubmitted',
    'qa_passed',
    'delivered'
  )),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists editor_work_events_editor_created_idx
  on public.editor_work_events(editor_id, created_at desc);
create index if not exists editor_work_events_project_created_idx
  on public.editor_work_events(project_id, created_at desc);
create index if not exists editor_work_events_type_created_idx
  on public.editor_work_events(event_type, created_at desc);

alter table public.editor_work_events enable row level security;

drop policy if exists "Admins read all editor work events" on public.editor_work_events;
create policy "Admins read all editor work events"
on public.editor_work_events for select to authenticated
using (public.current_role() = 'admin');

drop policy if exists "Editors read own work events" on public.editor_work_events;
create policy "Editors read own work events"
on public.editor_work_events for select to authenticated
using (editor_id = auth.uid() and public.current_role() = 'editor');

drop policy if exists "Assigned QA read project work events" on public.editor_work_events;
create policy "Assigned QA read project work events"
on public.editor_work_events for select to authenticated
using (
  public.current_role() = 'qa'
  and exists (
    select 1 from public.projects p
    where p.id = editor_work_events.project_id
      and p.qa_id = auth.uid()
  )
);

grant select on public.editor_work_events to authenticated;

create or replace function public.record_editor_work_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_editor_id uuid;
  v_details jsonb;
begin
  v_editor_id := coalesce(new.editor_id, old.editor_id);
  v_details := jsonb_build_object(
    'due_date', new.due_date,
    'status', new.status,
    'qa_status', new.qa_status,
    'source', 'project_trigger'
  );

  if tg_op = 'INSERT' then
    if new.editor_id is not null then
      insert into public.editor_work_events(project_id, editor_id, actor_id, event_type, details)
      values(new.id, new.editor_id, auth.uid(), 'editor_assigned', v_details);
      if new.status = 'In progress' then
        insert into public.editor_work_events(project_id, editor_id, actor_id, event_type, details)
        values(new.id, new.editor_id, auth.uid(), 'work_started', v_details);
      elsif new.status = 'In QA' then
        insert into public.editor_work_events(project_id, editor_id, actor_id, event_type, details)
        values(new.id, new.editor_id, auth.uid(), 'submitted_to_qa', v_details);
      elsif new.status = 'Delivered' then
        insert into public.editor_work_events(project_id, editor_id, actor_id, event_type, details)
        values(new.id, new.editor_id, auth.uid(), 'delivered', v_details);
      end if;
    end if;
    return new;
  end if;

  if new.editor_id is distinct from old.editor_id and new.editor_id is not null then
    insert into public.editor_work_events(project_id, editor_id, actor_id, event_type, details)
    values(new.id, new.editor_id, auth.uid(), 'editor_assigned', v_details);
  end if;

  if v_editor_id is null then
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'In progress' then
      insert into public.editor_work_events(project_id, editor_id, actor_id, event_type, details)
      values(new.id, v_editor_id, auth.uid(), 'work_started', v_details);
    elsif new.status = 'In QA' then
      insert into public.editor_work_events(project_id, editor_id, actor_id, event_type, details)
      values(
        new.id, v_editor_id, auth.uid(),
        case when old.status = 'Revisions' then 'resubmitted' else 'submitted_to_qa' end,
        v_details
      );
    elsif new.status = 'Revisions' then
      insert into public.editor_work_events(project_id, editor_id, actor_id, event_type, details)
      values(new.id, v_editor_id, auth.uid(), 'revision_requested', v_details);
    elsif new.status = 'Delivered' then
      insert into public.editor_work_events(project_id, editor_id, actor_id, event_type, details)
      values(new.id, v_editor_id, auth.uid(), 'delivered', v_details);
    end if;
  elsif new.qa_status is distinct from old.qa_status then
    if new.qa_status = 'Changes required' and old.status <> 'Revisions' then
      insert into public.editor_work_events(project_id, editor_id, actor_id, event_type, details)
      values(new.id, v_editor_id, auth.uid(), 'revision_requested', v_details);
    elsif new.qa_status = 'Passed' then
      insert into public.editor_work_events(project_id, editor_id, actor_id, event_type, details)
      values(new.id, v_editor_id, auth.uid(), 'qa_passed', v_details);
    end if;
  end if;

  if new.status = 'Delivered'
     and new.status is distinct from old.status
     and new.qa_status = 'Passed'
     and old.qa_status is distinct from 'Passed' then
    insert into public.editor_work_events(project_id, editor_id, actor_id, event_type, details)
    values(new.id, v_editor_id, auth.uid(), 'qa_passed', v_details);
  end if;

  return new;
end;
$$;

drop trigger if exists projects_editor_work_event_trigger on public.projects;
create trigger projects_editor_work_event_trigger
after insert or update of editor_id, status, qa_status on public.projects
for each row execute function public.record_editor_work_event();

-- Establish a truthful baseline for projects already assigned when tracking is enabled.
-- These are migration-time baseline assignments, not reconstructed historical assignments.
insert into public.editor_work_events(project_id, editor_id, event_type, details)
select p.id, p.editor_id, 'editor_assigned',
       jsonb_build_object('due_date', p.due_date, 'status', p.status,
                          'qa_status', p.qa_status, 'baseline', true,
                          'source', 'migration_baseline')
from public.projects p
where p.editor_id is not null
  and not exists (
    select 1 from public.editor_work_events e
    where e.project_id = p.id
      and e.editor_id = p.editor_id
      and e.event_type = 'editor_assigned'
  );
