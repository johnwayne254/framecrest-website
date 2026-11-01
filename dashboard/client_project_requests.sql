-- Client project requests and safe client-side financial visibility
create table if not exists public.project_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  project_name text not null,
  service text not null check (service in ('Photo Editing','Virtual Staging','Floor Plan Design','Real Estate Video Editing')),
  quantity integer not null default 1 check (quantity > 0),
  property_address text,
  preferred_due_date date,
  brief text,
  status text not null default 'Submitted'
    check (status in ('Submitted','Under review','Approved','Declined')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists project_requests_client_created_idx
  on public.project_requests(client_id, created_at desc);
alter table public.project_requests enable row level security;
drop policy if exists "clients submit own project requests" on public.project_requests;
create policy "clients submit own project requests" on public.project_requests
for insert to authenticated
with check (
  public.current_role()='client'
  and client_id=public.current_client_id()
  and public.current_client_id() is not null
);
drop policy if exists "clients read own project requests" on public.project_requests;
create policy "clients read own project requests" on public.project_requests
for select to authenticated
using (public.current_role()='client' and client_id=public.current_client_id());
drop policy if exists "admins manage project requests" on public.project_requests;
create policy "admins manage project requests" on public.project_requests
for all to authenticated
using (public.current_role()='admin')
with check (public.current_role()='admin');
grant select, insert, update on public.project_requests to authenticated;

-- Clients may view only the quote and paid total for their own projects.
drop policy if exists "clients read own project financials" on public.project_financials;
create policy "clients read own project financials" on public.project_financials
for select to authenticated
using (
  public.current_role()='client'
  and exists (
    select 1 from public.projects p
    where p.id=project_financials.project_id
      and p.client_id=public.current_client_id()
  )
);
-- Clients may view payment history for their own projects, but cannot add or edit payments.
drop policy if exists "clients read own project payments" on public.project_payments;
create policy "clients read own project payments" on public.project_payments
for select to authenticated
using (
  public.current_role()='client'
  and exists (
    select 1 from public.projects p
    where p.id=project_payments.project_id
      and p.client_id=public.current_client_id()
  )
);
