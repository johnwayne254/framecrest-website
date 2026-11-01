-- FrameCrest invoices and finance reporting support
-- Run once in Supabase SQL Editor.

create table if not exists public.project_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  project_id uuid not null references public.projects(id) on delete cascade,
  amount_usd numeric(12,2) not null check (amount_usd > 0),
  issue_date date not null default current_date,
  due_date date not null,
  status text not null default 'Issued'
    check (status in ('Draft','Issued','Paid','Void')),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_invoices_project_date_idx
  on public.project_invoices(project_id, issue_date desc);

alter table public.project_invoices enable row level security;
drop policy if exists "admin manage project invoices" on public.project_invoices;
create policy "admin manage project invoices" on public.project_invoices
for all to authenticated
using (public.current_role() = 'admin')
with check (public.current_role() = 'admin');

drop policy if exists "clients read own project invoices" on public.project_invoices;
create policy "clients read own project invoices" on public.project_invoices
for select to authenticated
using (
  public.current_role() = 'client'
  and exists (
    select 1 from public.projects p
    where p.id = project_invoices.project_id
      and p.client_id = public.current_client_id()
  )
);

grant select, insert, update, delete on public.project_invoices to authenticated;

-- Clients can see payment records for their own projects, but cannot add or change them.
drop policy if exists "clients read own project payments" on public.project_payments;
create policy "clients read own project payments" on public.project_payments
for select to authenticated
using (
  public.current_role() = 'client'
  and exists (
    select 1 from public.projects p
    where p.id = project_payments.project_id
      and p.client_id = public.current_client_id()
  )
);
