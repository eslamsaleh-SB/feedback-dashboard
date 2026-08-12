-- v59: per-slide countdown timer.
alter table public.presentation_pages
  add column if not exists duration_seconds integer;
select 'presentation_pages.duration_seconds added' as status;
