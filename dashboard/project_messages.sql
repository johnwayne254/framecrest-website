-- FrameCrest project messaging
-- Run once in Supabase SQL Editor before deploying the messaging UI.

create table if not exists public.project_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  message text not null check (char_length(trim(message)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists project_messages_project_created_idx
  on public.project_messages(project_id, created_at asc);

alter table public.project_messages enable row level security;

drop policy if exists "project participants read messages" on public.project_messages;
create policy "project participants read messages"
on public.project_messages for select to authenticated
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_messages.project_id
      and (
        public.current_role() = 'admin'
        or (public.current_role() = 'client' and p.client_id = public.current_client_id())
        or (public.current_role() = 'qa' and p.qa_id = auth.uid())
      )
  )
);

drop policy if exists "project participants send messages" on public.project_messages;
create policy "project participants send messages"
on public.project_messages for insert to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.projects p
    where p.id = project_messages.project_id
      and (
        public.current_role() = 'admin'
        or (public.current_role() = 'client' and p.client_id = public.current_client_id())
        or (public.current_role() = 'qa' and p.qa_id = auth.uid())
      )
  )
);

grant select, insert on public.project_messages to authenticated;
