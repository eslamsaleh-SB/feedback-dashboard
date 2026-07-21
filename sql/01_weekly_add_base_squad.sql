-- v53: bring weekly_quality_scores columns in line with the actual Module Score CSV
--
-- The CSV reports these 7 modules per collector:
--   base, players, formation_tactical, location, impact, extras, squad
-- plus a separate Freeze Frame file (freeze_frame_score).
--
-- v52 created the table with `event` instead of `base` and no `squad`. Add the
-- missing columns. `event` is kept for backward compatibility but the upload
-- flow no longer writes to it.

alter table public.weekly_quality_scores
  add column if not exists base numeric;

alter table public.weekly_quality_scores
  add column if not exists squad numeric;
