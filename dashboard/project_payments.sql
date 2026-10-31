-- FrameCrest payment history and transaction tracking
-- Run once in Supabase SQL Editor. Existing paid totals are preserved as opening balances.

create table if not exists public.project_payments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  amount_usd numeric(12,2) not null check (amount_usd > 0),
  payment_date date not null default current_date,
  payment_method text not null default 'Other'
    check (payment_method in ('Bank transfer','Card','PayPal','Wise','Cash','Other')),
  reference text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists project_payments_project_date_idx
  on public.project_payments(project_id, payment_date desc, created_at desc);

alter table public.project_payments enable row level security;

drop policy if exists "admin manage project payments" on public.project_payments;
create policy "admin manage project payments" on public.project_payments
for all to authenticated
using (public.current_role() = 'admin')
with check (public.current_role() = 'admin');

grant select, insert, update, delete on public.project_payments to authenticated;

-- Preserve paid totals already entered in the old finance form as opening balances.
insert into public.project_payments(project_id, amount_usd, payment_date, payment_method, notes)
select f.project_id, f.paid_usd, current_date, 'Other', 'Opening balance transferred from previous finance records'
from public.project_financials f
where f.paid_usd > 0
  and not exists (
    select 1 from public.project_payments p
    where p.project_id = f.project_id
  );

create or replace function public.sync_project_paid_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
begin
  if tg_op = 'DELETE' then
    v_project_id := old.project_id;
  else
    v_project_id := new.project_id;
  end if;

  update public.project_financials
  set paid_usd = coalesce((
    select sum(amount_usd)
    from public.project_payments
    where project_id = v_project_id
  ), 0),
  updated_at = now()
  where project_id = v_project_id;

  if tg_op = 'UPDATE' and old.project_id is distinct from new.project_id then
    update public.project_financials
    set paid_usd = coalesce((
      select sum(amount_usd)
      from public.project_payments
      where project_id = old.project_id
    ), 0),
    updated_at = now()
    where project_id = old.project_id;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists project_payments_sync_total on public.project_payments;
create trigger project_payments_sync_total
after insert or update or delete on public.project_payments
for each row execute function public.sync_project_paid_total();
