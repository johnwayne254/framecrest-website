-- FrameCrest client project feedback and revision requests
-- Run once in Supabase SQL Editor.

create table if not exists public.project_feedback (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  message text not null check (char_length(trim(message)) between 1 and 3000),
  status text not null default 'Open' check (status in ('Open','In review','Resolved')),
  created_at timestamptz not null default now()
);

create index if not exists project_feedback_project_created_idx
  on public.project_feedback(project_id, created_at desc);

alter table public.project_feedback enable row level security;

drop policy if exists "clients submit feedback on own projects" on public.project_feedback;
create policy "clients submit feedback on own projects"
on public.project_feedback for insert to authenticated
with check (
  public.current_role() = 'client'
  and client_id = public.current_client_id()
  and exists (
    select 1 from public.projects p
    where p.id = project_feedback.project_id
      and p.client_id = public.current_client_id()
  )
);

drop policy if exists "clients read own project feedback" on public.project_feedback;
create policy "clients read own project feedback"
on public.project_feedback for select to authenticated
using (
  public.current_role() = 'client'
  and client_id = public.current_client_id()
);

drop policy if exists "admins manage project feedback" on public.project_feedback;
create policy "admins manage project feedback"
on public.project_feedback for all to authenticated
using (public.current_role() = 'admin')
with check (public.current_role() = 'admin');

grant select, insert on public.project_feedback to authenticated;
grant update, delete on public.project_feedback to authenticated;
