-- FrameCrest Studios: saved report history
create table if not exists public.report_archives (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  date_from date,
  date_to date,
  report_data jsonb not null default '[]'::jsonb,
  client_id uuid references public.clients(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.report_archives enable row level security;
grant select, insert, delete on public.report_archives to authenticated;

drop policy if exists "admins manage report archives" on public.report_archives;
create policy "admins manage report archives" on public.report_archives
for all to authenticated
using (public.current_role() = 'admin')
with check (public.current_role() = 'admin');

drop policy if exists "clients read own report archives" on public.report_archives;
create policy "clients read own report archives" on public.report_archives
for select to authenticated
using (
  public.current_role() = 'client'
  and client_id = public.current_client_id()
);

drop policy if exists "clients save own report archives" on public.report_archives;
create policy "clients save own report archives" on public.report_archives
for insert to authenticated
with check (
  public.current_role() = 'client'
  and client_id = public.current_client_id()
  and created_by = auth.uid()
);

drop policy if exists "clients delete own report archives" on public.report_archives;
create policy "clients delete own report archives" on public.report_archives
for delete to authenticated
using (
  public.current_role() = 'client'
  and client_id = public.current_client_id()
);
