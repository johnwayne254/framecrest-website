-- FrameCrest per-user project conversation read state
-- Run once in Supabase SQL Editor after project_messages.sql.

create table if not exists public.project_message_reads (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

alter table public.project_message_reads enable row level security;

drop policy if exists "users manage own project message read state" on public.project_message_reads;
create policy "users manage own project message read state"
on public.project_message_reads for all to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1 from public.projects p
    where p.id = project_message_reads.project_id
      and (
        public.current_role() = 'admin'
        or (public.current_role() = 'client' and p.client_id = public.current_client_id())
        or (public.current_role() = 'qa' and p.qa_id = auth.uid())
      )
  )
)
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.projects p
    where p.id = project_message_reads.project_id
      and (
        public.current_role() = 'admin'
        or (public.current_role() = 'client' and p.client_id = public.current_client_id())
        or (public.current_role() = 'qa' and p.qa_id = auth.uid())
      )
  )
);

grant select, insert, update on public.project_message_reads to authenticated;
