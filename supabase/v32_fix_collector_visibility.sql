-- =============================================================
-- v32 – Fix collector visibility for match sessions & videos
-- Run in: Supabase Dashboard > SQL Editor
-- =============================================================

-- 1. Fix my_collector_id() to use hr_code (not profiles.collector_id which is NULL)
CREATE OR REPLACE FUNCTION public.my_collector_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id
  FROM   public.collectors c
  JOIN   public.profiles   p ON lower(trim(c.hr_code)) = lower(trim(p.hr_code))
  WHERE  p.id = auth.uid()
  LIMIT  1;
$$;

-- 2. Ensure match_sessions Viewer policy uses updated function
--    (Drop old ms_select if it conflicts, keep the one that uses my_collector_id)
DROP POLICY IF EXISTS "ms_viewer" ON public.match_sessions;
CREATE POLICY "ms_viewer" ON public.match_sessions
  FOR SELECT USING (
    public.current_role() = 'Viewer'
    AND collector_id = public.my_collector_id()
  );

-- 3. Create session_acknowledgments and session_notes tables if not yet created
CREATE TABLE IF NOT EXISTS public.session_acknowledgments (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid        NOT NULL REFERENCES public.match_sessions(id) ON DELETE CASCADE,
  hr_code    text        NOT NULL,
  acked_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sa_unique UNIQUE (session_id, hr_code)
);

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

ALTER TABLE public.session_acknowledgments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_notes           ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sa_select ON public.session_acknowledgments;
CREATE POLICY sa_select ON public.session_acknowledgments FOR SELECT USING (
  public.current_role() IN ('Admin','Uploader','Supervisor','TeamLeader')
  OR (public.current_role() = 'Viewer' AND lower(trim(hr_code)) = lower(trim(public.my_hr_code())))
);
DROP POLICY IF EXISTS sa_insert ON public.session_acknowledgments;
CREATE POLICY sa_insert ON public.session_acknowledgments FOR INSERT WITH CHECK (
  public.current_role() = 'Viewer'
  AND lower(trim(hr_code)) = lower(trim(public.my_hr_code()))
);

DROP POLICY IF EXISTS sn_select ON public.session_notes;
CREATE POLICY sn_select ON public.session_notes FOR SELECT USING (
  public.current_role() = 'Admin'
  OR (public.current_role() = 'Viewer' AND lower(trim(hr_code)) = lower(trim(public.my_hr_code())))
);
DROP POLICY IF EXISTS sn_insert ON public.session_notes;
CREATE POLICY sn_insert ON public.session_notes FOR INSERT WITH CHECK (
  public.current_role() = 'Viewer'
  AND lower(trim(hr_code)) = lower(trim(public.my_hr_code()))
);
DROP POLICY IF EXISTS sn_update ON public.session_notes;
CREATE POLICY sn_update ON public.session_notes FOR UPDATE
  USING (public.current_role() = 'Admin' OR (public.current_role() = 'Viewer' AND lower(trim(hr_code)) = lower(trim(public.my_hr_code()))))
  WITH CHECK (public.current_role() = 'Admin' OR (public.current_role() = 'Viewer' AND lower(trim(hr_code)) = lower(trim(public.my_hr_code()))));
