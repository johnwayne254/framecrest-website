-- FrameCrest editor quality scoring and direct feedback
-- Run once in Supabase SQL Editor.

create table if not exists public.editor_quality_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  editor_id uuid not null references public.profiles(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete restrict,
  quality_score integer not null check (quality_score between 0 and 100),
  feedback text not null check (length(trim(feedback)) between 3 and 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists editor_quality_reviews_editor_created_idx
  on public.editor_quality_reviews(editor_id, created_at desc);
create index if not exists editor_quality_reviews_project_idx
  on public.editor_quality_reviews(project_id, created_at desc);

alter table public.editor_quality_reviews enable row level security;

drop policy if exists "Editors read own quality reviews" on public.editor_quality_reviews;
create policy "Editors read own quality reviews"
on public.editor_quality_reviews for select to authenticated
using (editor_id = auth.uid());

drop policy if exists "Admins and assigned QA read quality reviews" on public.editor_quality_reviews;
create policy "Admins and assigned QA read quality reviews"
on public.editor_quality_reviews for select to authenticated
using (
  public.current_role() = 'admin'
  or exists (
    select 1 from public.projects p
    where p.id = editor_quality_reviews.project_id
      and p.qa_id = auth.uid()
  )
);

drop policy if exists "Admins and assigned QA create quality reviews" on public.editor_quality_reviews;
create policy "Admins and assigned QA create quality reviews"
on public.editor_quality_reviews for insert to authenticated
with check (
  reviewer_id = auth.uid()
  and exists (
    select 1 from public.projects p
    where p.id = editor_quality_reviews.project_id
      and p.editor_id = editor_quality_reviews.editor_id
      and (
        public.current_role() = 'admin'
        or (public.current_role() = 'qa' and p.qa_id = auth.uid())
      )
  )
);

drop policy if exists "Admins and assigned QA update quality reviews" on public.editor_quality_reviews;
create policy "Admins and assigned QA update quality reviews"
on public.editor_quality_reviews for update to authenticated
using (
  public.current_role() = 'admin'
  or exists (
    select 1 from public.projects p
    where p.id = editor_quality_reviews.project_id
      and p.qa_id = auth.uid()
  )
)
with check (
  reviewer_id = auth.uid()
  and exists (
    select 1 from public.projects p
    where p.id = editor_quality_reviews.project_id
      and p.editor_id = editor_quality_reviews.editor_id
      and (
        public.current_role() = 'admin'
        or (public.current_role() = 'qa' and p.qa_id = auth.uid())
      )
  )
);

grant select, insert, update on public.editor_quality_reviews to authenticated;
