-- Enable Supabase Realtime events used by the FrameCrest notification popup.
-- Run this once in the Supabase SQL Editor.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception 'The supabase_realtime publication was not found. Enable Realtime in Supabase first.';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'project_messages'
  ) then
    alter publication supabase_realtime add table public.project_messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'projects'
  ) then
    alter publication supabase_realtime add table public.projects;
  end if;
end $$;
