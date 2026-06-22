-- =============================================================
-- Task 7 – Quality Score tables
-- Run in: Supabase Dashboard > SQL Editor
-- =============================================================

-- ---------- 1. Module quality scores (monthly) ----------
CREATE TABLE IF NOT EXISTS public.quality_scores (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  hr_code      text        NOT NULL,
  module       text        NOT NULL,
  score        numeric(6,2) NOT NULL,   -- e.g. 95.91 (%)
  match_count  int,
  upload_month date        NOT NULL,    -- stored as first day of the month
  uploaded_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT qs_unique UNIQUE (hr_code, module, upload_month)
);

CREATE INDEX IF NOT EXISTS qs_hr_idx    ON public.quality_scores(hr_code);
CREATE INDEX IF NOT EXISTS qs_month_idx ON public.quality_scores(upload_month);

-- ---------- 2. Freeze frame quality scores (monthly) ----------
CREATE TABLE IF NOT EXISTS public.freeze_frame_scores (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  hr_code      text        NOT NULL,
  score        numeric(6,2) NOT NULL,
  match_count  int,
  upload_month date        NOT NULL,
  uploaded_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ffs_unique UNIQUE (hr_code, upload_month)
);

CREATE INDEX IF NOT EXISTS ffs_hr_idx    ON public.freeze_frame_scores(hr_code);
CREATE INDEX IF NOT EXISTS ffs_month_idx ON public.freeze_frame_scores(upload_month);

-- ---------- 3. RLS ----------
ALTER TABLE public.quality_scores      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.freeze_frame_scores ENABLE ROW LEVEL SECURITY;

-- Read: all authenticated roles
DROP POLICY IF EXISTS qs_select  ON public.quality_scores;
CREATE POLICY qs_select ON public.quality_scores FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS ffs_select ON public.freeze_frame_scores;
CREATE POLICY ffs_select ON public.freeze_frame_scores FOR SELECT
  USING (auth.role() = 'authenticated');

-- Write: Admin and QualityLeader only
DROP POLICY IF EXISTS qs_write  ON public.quality_scores;
CREATE POLICY qs_write ON public.quality_scores
  FOR ALL
  USING      (public.current_role() IN ('Admin', 'QualityLeader'))
  WITH CHECK (public.current_role() IN ('Admin', 'QualityLeader'));

DROP POLICY IF EXISTS ffs_write ON public.freeze_frame_scores;
CREATE POLICY ffs_write ON public.freeze_frame_scores
  FOR ALL
  USING      (public.current_role() IN ('Admin', 'QualityLeader'))
  WITH CHECK (public.current_role() IN ('Admin', 'QualityLeader'));
