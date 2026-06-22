-- =============================================================
-- v31 – Replace reports system with match_sessions-backed reports
-- Run in: Supabase Dashboard > SQL Editor
-- =============================================================

-- 1. Drop old reports tables (CASCADE removes report_acknowledgments + report_notes)
DROP TABLE IF EXISTS public.report_notes          CASCADE;
DROP TABLE IF EXISTS public.report_acknowledgments CASCADE;
DROP TABLE IF EXISTS public.reports               CASCADE;

-- 2. session_acknowledgments  (collector marks a match session as read)
CREATE TABLE IF NOT EXISTS public.session_acknowledgments (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid        NOT NULL REFERENCES public.match_sessions(id) ON DELETE CASCADE,
  hr_code    text        NOT NULL,
  acked_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sa_unique UNIQUE (session_id, hr_code)
);
CREATE INDEX IF NOT EXISTS sa_session_idx ON public.session_acknowledgments(session_id);
CREATE INDEX IF NOT EXISTS sa_hr_idx      ON public.session_acknowledgments(hr_code);

-- 3. session_notes  (collector adds a note/question on a session; admin updates status)
CREATE TABLE IF NOT EXISTS public.session_notes (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid        NOT NULL REFERENCES public.match_sessions(id) ON DELETE CASCADE,
  hr_code    text        NOT NULL,
  note_text  text        NOT NULL,
  status     text        NOT NULL DEFAULT 'Not Started'
               CHECK (status IN ('Not Started','In Progress','Complete')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sn_session_idx ON public.session_notes(session_id);
CREATE INDEX IF NOT EXISTS sn_hr_idx      ON public.session_notes(hr_code);

-- 4. Helper: returns the collectors.id for the logged-in user
CREATE OR REPLACE FUNCTION public.my_collector_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT c.id
  FROM   public.collectors c
  JOIN   public.profiles   p ON public.norm_hr(c.hr_code) = public.norm_hr(p.hr_code)
  WHERE  p.id = auth.uid()
  LIMIT  1;
$$;

-- 5. RLS on match_sessions – allow Viewer to read their own sessions
ALTER TABLE public.match_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ms_admin   ON public.match_sessions;
DROP POLICY IF EXISTS ms_viewer  ON public.match_sessions;

CREATE POLICY ms_admin ON public.match_sessions
  FOR ALL
  USING      (public.current_role() IN ('Admin','Uploader','Supervisor','TeamLeader','QualityLeader'))
  WITH CHECK (public.current_role() IN ('Admin','Uploader'));

CREATE POLICY ms_viewer ON public.match_sessions
  FOR SELECT USING (
    public.current_role() = 'Viewer'
    AND collector_id = public.my_collector_id()
  );

-- 6. RLS on new tables
ALTER TABLE public.session_acknowledgments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_notes           ENABLE ROW LEVEL SECURITY;

-- session_acknowledgments
DROP POLICY IF EXISTS sa_select ON public.session_acknowledgments;
CREATE POLICY sa_select ON public.session_acknowledgments FOR SELECT USING (
  public.current_role() IN ('Admin','Uploader','Supervisor','TeamLeader')
  OR (public.current_role() = 'Viewer'
      AND public.norm_hr(hr_code) = public.norm_hr(public.my_hr_code()))
);

DROP POLICY IF EXISTS sa_insert ON public.session_acknowledgments;
CREATE POLICY sa_insert ON public.session_acknowledgments FOR INSERT WITH CHECK (
  public.current_role() = 'Viewer'
  AND public.norm_hr(hr_code) = public.norm_hr(public.my_hr_code())
);

-- session_notes
DROP POLICY IF EXISTS sn_select ON public.session_notes;
CREATE POLICY sn_select ON public.session_notes FOR SELECT USING (
  public.current_role() = 'Admin'
  OR (public.current_role() = 'Viewer'
      AND public.norm_hr(hr_code) = public.norm_hr(public.my_hr_code()))
);

DROP POLICY IF EXISTS sn_insert ON public.session_notes;
CREATE POLICY sn_insert ON public.session_notes FOR INSERT WITH CHECK (
  public.current_role() = 'Viewer'
  AND public.norm_hr(hr_code) = public.norm_hr(public.my_hr_code())
);

DROP POLICY IF EXISTS sn_update ON public.session_notes;
CREATE POLICY sn_update ON public.session_notes FOR UPDATE
  USING (
    public.current_role() = 'Admin'
    OR (public.current_role() = 'Viewer'
        AND public.norm_hr(hr_code) = public.norm_hr(public.my_hr_code()))
  )
  WITH CHECK (
    public.current_role() = 'Admin'
    OR (public.current_role() = 'Viewer'
        AND public.norm_hr(hr_code) = public.norm_hr(public.my_hr_code()))
  );
