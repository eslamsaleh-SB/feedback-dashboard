-- =============================================================================
-- v42 - STEP 2 (optional belt-and-suspenders): unique constraint on session_videos
-- =============================================================================
-- The /api/upload route now dedupes drive_file_id per match session in
-- application code. A unique constraint catches any future code that forgets
-- to dedupe (and is essentially free to maintain).

-- Drop any old duplicates first (keeps the lowest-id row per pair).
delete from public.session_videos a
using public.session_videos b
where  a.id > b.id
  and  a.match_session_id = b.match_session_id
  and  a.drive_file_id    = b.drive_file_id;

-- Then add the constraint (no-op if it already exists).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'session_videos_session_file_uniq'
  ) then
    alter table public.session_videos
      add constraint session_videos_session_file_uniq
      unique (match_session_id, drive_file_id);
  end if;
end$$;
