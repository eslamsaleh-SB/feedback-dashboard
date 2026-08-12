-- v59: per-slide video length (used to loop Drive iframe by reloading it).
alter table public.presentation_pages
  add column if not exists video_seconds integer;
select 'presentation_pages.video_seconds added' as status;
