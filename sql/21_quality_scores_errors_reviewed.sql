-- Module score upload now also keeps the raw counts behind each score.
ALTER TABLE public.quality_scores ADD COLUMN IF NOT EXISTS total_errors int;
ALTER TABLE public.quality_scores ADD COLUMN IF NOT EXISTS total_reviewed_events int;
ALTER TABLE public.freeze_frame_scores ADD COLUMN IF NOT EXISTS total_errors int;
ALTER TABLE public.freeze_frame_scores ADD COLUMN IF NOT EXISTS total_reviewed_events int;
