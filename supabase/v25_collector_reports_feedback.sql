-- =============================================================
-- Task 4 – Collector Reports, Acknowledgments, Notes, Feedback visibility
-- Run in: Supabase Dashboard > SQL Editor
-- =============================================================

-- 1. reports  (sent by Admin to one or all collectors)
CREATE TABLE IF NOT EXISTS public.reports (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text        NOT NULL,
  body        text,
  url         text,
  report_date date,
  hr_code     text,   -- NULL = visible to all collectors; otherwise specific collector
  created_by  uuid    REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rp_hr_idx   ON public.reports(hr_code);
CREATE INDEX IF NOT EXISTS rp_date_idx ON public.reports(report_date);

-- 2. report_acknowledgments  (collector marks "I have read this report")
CREATE TABLE IF NOT EXISTS public.report_acknowledgments (
  id        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid        NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  hr_code   text        NOT NULL,
  acked_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ra_unique UNIQUE (report_id, hr_code)
);

CREATE INDEX IF NOT EXISTS ra_report_idx ON public.report_acknowledgments(report_id);
CREATE INDEX IF NOT EXISTS ra_hr_idx     ON public.report_acknowledgments(hr_code);

-- 3. report_notes  (collector can ask a question / request clarification)
CREATE TABLE IF NOT EXISTS public.report_notes (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id  uuid        NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  hr_code    text        NOT NULL,
  note_text  text        NOT NULL,
  status     text        NOT NULL DEFAULT 'Not Started'
               CHECK (status IN ('Not Started','In Progress','Complete')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rn_report_idx ON public.report_notes(report_id);
CREATE INDEX IF NOT EXISTS rn_hr_idx     ON public.report_notes(hr_code);
CREATE INDEX IF NOT EXISTS rn_status_idx ON public.report_notes(status);

-- 4. feedback_meetings  (Admin schedules a meeting; collector can see it)
--    This is DIFFERENT from feedback_reservations (the scheduling form).
--    feedback_meetings is the collector-facing record.
CREATE TABLE IF NOT EXISTS public.feedback_meetings (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  hr_code      text        NOT NULL,
  session_date date        NOT NULL,
  mode         text        NOT NULL CHECK (mode IN ('Online','Offline')),
  notes        text,
  status       text        NOT NULL DEFAULT 'Scheduled'
                 CHECK (status IN ('Scheduled','Completed','Cancelled')),
  meet_link    text,
  location     text,
  notify_email boolean     NOT NULL DEFAULT true,
  created_by   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fm_hr_idx   ON public.feedback_meetings(hr_code);
CREATE INDEX IF NOT EXISTS fm_date_idx ON public.feedback_meetings(session_date);

-- ---- RLS ----

ALTER TABLE public.reports                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_acknowledgments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_notes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_meetings      ENABLE ROW LEVEL SECURITY;

-- reports: Admin can do everything; collectors see their own or global reports
DROP POLICY IF EXISTS rp_select ON public.reports;
CREATE POLICY rp_select ON public.reports FOR SELECT USING (
  public.current_role() IN ('Admin','Uploader','Supervisor','TeamLeader','QualityLeader')
  OR (
    public.current_role() = 'Viewer'
    AND (hr_code IS NULL OR public.norm_hr(hr_code) = public.norm_hr(public.my_hr_code()))
  )
);

DROP POLICY IF EXISTS rp_admin ON public.reports;
CREATE POLICY rp_admin ON public.reports
  FOR ALL
  USING      (public.current_role() = 'Admin')
  WITH CHECK (public.current_role() = 'Admin');

-- report_acknowledgments: collectors manage their own; Admins read all
DROP POLICY IF EXISTS ra_select ON public.report_acknowledgments;
CREATE POLICY ra_select ON public.report_acknowledgments FOR SELECT USING (
  public.current_role() IN ('Admin','Uploader','Supervisor','TeamLeader')
  OR (
    public.current_role() = 'Viewer'
    AND public.norm_hr(hr_code) = public.norm_hr(public.my_hr_code())
  )
);

DROP POLICY IF EXISTS ra_insert ON public.report_acknowledgments;
CREATE POLICY ra_insert ON public.report_acknowledgments FOR INSERT WITH CHECK (
  public.current_role() = 'Viewer'
  AND public.norm_hr(hr_code) = public.norm_hr(public.my_hr_code())
);

DROP POLICY IF EXISTS ra_delete ON public.report_acknowledgments;
CREATE POLICY ra_delete ON public.report_acknowledgments FOR DELETE USING (
  public.current_role() = 'Admin'
);

-- report_notes: collectors write/read own notes; Admins read + update status
DROP POLICY IF EXISTS rn_select ON public.report_notes;
CREATE POLICY rn_select ON public.report_notes FOR SELECT USING (
  public.current_role() = 'Admin'
  OR (
    public.current_role() = 'Viewer'
    AND public.norm_hr(hr_code) = public.norm_hr(public.my_hr_code())
  )
);

DROP POLICY IF EXISTS rn_insert ON public.report_notes;
CREATE POLICY rn_insert ON public.report_notes FOR INSERT WITH CHECK (
  public.current_role() = 'Viewer'
  AND public.norm_hr(hr_code) = public.norm_hr(public.my_hr_code())
);

DROP POLICY IF EXISTS rn_update ON public.report_notes;
CREATE POLICY rn_update ON public.report_notes FOR UPDATE USING (
  public.current_role() = 'Admin'
  OR (
    public.current_role() = 'Viewer'
    AND public.norm_hr(hr_code) = public.norm_hr(public.my_hr_code())
  )
) WITH CHECK (
  public.current_role() = 'Admin'
  OR (
    public.current_role() = 'Viewer'
    AND public.norm_hr(hr_code) = public.norm_hr(public.my_hr_code())
  )
);

-- feedback_meetings: Admins can do everything; collectors see their own
DROP POLICY IF EXISTS fm_select ON public.feedback_meetings;
CREATE POLICY fm_select ON public.feedback_meetings FOR SELECT USING (
  public.current_role() IN ('Admin','Uploader','Supervisor')
  OR (
    public.current_role() = 'Viewer'
    AND public.norm_hr(hr_code) = public.norm_hr(public.my_hr_code())
  )
);

DROP POLICY IF EXISTS fm_admin ON public.feedback_meetings;
CREATE POLICY fm_admin ON public.feedback_meetings
  FOR ALL
  USING      (public.current_role() IN ('Admin','Uploader'))
  WITH CHECK (public.current_role() IN ('Admin','Uploader'));
