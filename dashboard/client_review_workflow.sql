-- FrameCrest client review and approval workflow
-- Run once in Supabase SQL Editor after deploying the matching dashboard update.

alter table public.projects drop constraint if exists projects_status_check;
alter table public.projects add constraint projects_status_check
  check (status in ('Awaiting files','In progress','In QA','Revisions','Ready for Client Review','Delivered','Cancelled'));

alter table public.projects
  add column if not exists client_approved_at timestamptz,
  add column if not exists client_approved_by uuid references public.profiles(id) on delete set null;


-- Allow the QA handoff trigger to change only the status after QA has passed.
-- All other QA updates remain restricted to the QA status field.
create or replace function public.guard_editor_project_updates()
returns trigger language plpgsql set search_path = public as $
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
      or new.created_at is distinct from old.created_at then
      raise exception 'QA reviewers may only update QA status.';
    end if;
    if new.status is distinct from old.status
      and not (
        old.status = 'In QA'
        and new.status = 'Ready for Client Review'
        and old.qa_status = 'Passed'
        and new.qa_status = 'Passed'
      ) then
      raise exception 'QA reviewers may only change project status through the approved QA handoff.';
    end if;
  end if;
  return new;
end;
$;

create or replace function public.move_qa_passed_project_to_client_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.qa_status = 'Passed' and old.qa_status is distinct from 'Passed' and new.status = 'In QA' then
    update public.projects set status = 'Ready for Client Review' where id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists projects_client_review_handoff on public.projects;
create trigger projects_client_review_handoff after update of qa_status on public.projects
for each row execute function public.move_qa_passed_project_to_client_review();

create or replace function public.client_approve_project(p_project_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.current_role() <> 'client' then raise exception 'Only the project client can approve delivery.'; end if;
  update public.projects set status = 'Delivered', client_approved_at = now(), client_approved_by = auth.uid()
  where id = p_project_id and client_id = public.current_client_id()
    and status = 'Ready for Client Review' and qa_status = 'Passed';
  if not found then raise exception 'This project is not awaiting your approval or is not eligible for delivery.'; end if;
end;
$$;
revoke all on function public.client_approve_project(uuid) from public;
grant execute on function public.client_approve_project(uuid) to authenticated;

create or replace function public.client_request_project_revision(p_project_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.current_role() <> 'client' then raise exception 'Only the project client can request changes.'; end if;
  update public.projects set status = 'Revisions', qa_status = 'Changes required',
    client_approved_at = null, client_approved_by = null
  where id = p_project_id and client_id = public.current_client_id() and status = 'Ready for Client Review';
  if not found then raise exception 'This project is not currently awaiting client review.'; end if;
end;
$$;
revoke all on function public.client_request_project_revision(uuid) from public;
grant execute on function public.client_request_project_revision(uuid) to authenticated;
