-- =============================================================
-- Task 5 – New roles
--
--  Collection Team Leader  → read-only performance data, own team only
--  Collection Supervisor   → read-only all performance data
--  Quality Team Leader     → all collectors + quality data upload, no accounts/collectors page
--
-- Run AFTER the base schema (schema.sql + all previous migrations).
-- =============================================================

-- 1. Add new enum values (idempotent with DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'TeamLeader'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
  ) THEN
    ALTER TYPE public.user_role ADD VALUE 'TeamLeader';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'Supervisor'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
  ) THEN
    ALTER TYPE public.user_role ADD VALUE 'Supervisor';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'QualityLeader'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
  ) THEN
    ALTER TYPE public.user_role ADD VALUE 'QualityLeader';
  END IF;
END$$;

-- 2. Store which team a TeamLeader belongs to (so we can scope their data).
--    Re-use the existing `team` column on profiles if present, otherwise add it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'profiles'
      AND column_name  = 'team'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN team text;
  END IF;
END$$;

-- 3. Update current_role() helper — no change needed; it just returns the enum.

-- 4. Update RLS on module_totals to include the new roles.
--    TeamLeader: read own team's data.
--    Supervisor: read all.
--    QualityLeader: read all (they need to see all collectors).

-- Helper: return the team for the current user (used in RLS)
CREATE OR REPLACE FUNCTION public.my_team()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT team FROM public.profiles WHERE id = auth.uid();
$$;

-- Helper: return the hr_code for the current user
CREATE OR REPLACE FUNCTION public.my_hr_code()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT hr_code FROM public.profiles WHERE id = auth.uid();
$$;

-- 5. Update module_totals RLS
DROP POLICY IF EXISTS mt_select ON public.module_totals;
CREATE POLICY mt_select ON public.module_totals FOR SELECT USING (
  public.current_role() IN ('Admin', 'Uploader', 'Supervisor', 'QualityLeader')
  OR (
    public.current_role() = 'Viewer'
    AND public.norm_hr(hr_code) = public.norm_hr(public.my_hr_code())
  )
  OR (
    public.current_role() = 'TeamLeader'
    AND hr_code IN (
      SELECT c.hr_code FROM public.collectors c
      WHERE c.team = public.my_team()
    )
  )
);

-- 6. Update collector_module_totals RPC to handle new roles
CREATE OR REPLACE FUNCTION public.collector_module_totals(
  p_from date DEFAULT NULL,
  p_to   date DEFAULT NULL
)
RETURNS TABLE (
  hr_code text, players bigint, event bigint,
  formation_tactical bigint, location bigint,
  impact bigint, extras bigint, freeze_frame bigint, total bigint, matches bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH r AS (
    SELECT public.current_role()::text        AS role,
           public.norm_hr(public.my_hr_code()) AS myhr,
           public.my_team()                    AS myteam
  )
  SELECT
    COALESCE(mt.hr_code, '(unknown)') AS hr_code,
    COALESCE(SUM(total_mistakes) FILTER (WHERE module = 'players'),           0),
    COALESCE(SUM(total_mistakes) FILTER (WHERE module = 'event'),             0),
    COALESCE(SUM(total_mistakes) FILTER (WHERE module = 'formation_tactical'),0),
    COALESCE(SUM(total_mistakes) FILTER (WHERE module = 'location'),          0),
    COALESCE(SUM(total_mistakes) FILTER (WHERE module = 'impact'),            0),
    COALESCE(SUM(total_mistakes) FILTER (WHERE module = 'extras'),            0),
    COALESCE(SUM(total_mistakes) FILTER (WHERE module = 'freeze_frame'),      0),
    COALESCE(SUM(total_mistakes), 0),
    COUNT(DISTINCT mt.matchid)
  FROM public.module_totals mt, r
  WHERE (p_from IS NULL OR review_date >= p_from)
    AND (p_to   IS NULL OR review_date <= p_to)
    AND (
      r.role IN ('Admin', 'Uploader', 'Supervisor', 'QualityLeader')
      OR (r.role = 'Viewer'      AND public.norm_hr(mt.hr_code) = r.myhr)
      OR (r.role = 'TeamLeader'  AND mt.hr_code IN (
            SELECT c.hr_code FROM public.collectors c WHERE c.team = r.myteam
          ))
    )
  GROUP BY COALESCE(mt.hr_code, '(unknown)')
  ORDER BY 9 DESC;
$$;
GRANT EXECUTE ON FUNCTION public.collector_module_totals(date, date) TO anon, authenticated;

-- 7. Update match_part_summary_fast RPC
CREATE OR REPLACE FUNCTION public.match_part_summary_fast(
  p_from      date    DEFAULT NULL,
  p_to        date    DEFAULT NULL,
  p_collector text    DEFAULT NULL,
  p_limit     int     DEFAULT 500
)
RETURNS TABLE (
  matchid text, partid int, hr_code text, date date,
  players bigint, event bigint, formation_tactical bigint,
  location bigint, impact bigint, extras bigint,
  freeze_frame bigint, total bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH r AS (
    SELECT public.current_role()::text        AS role,
           public.norm_hr(public.my_hr_code()) AS myhr,
           public.my_team()                    AS myteam
  ),
  agg AS (
    SELECT mt.matchid, mt.partid, MAX(mt.hr_code) hr_code, MAX(mt.review_date) date,
      COALESCE(SUM(total_mistakes) FILTER (WHERE module = 'players'),           0) players,
      COALESCE(SUM(total_mistakes) FILTER (WHERE module = 'event'),             0) event,
      COALESCE(SUM(total_mistakes) FILTER (WHERE module = 'formation_tactical'),0) formation_tactical,
      COALESCE(SUM(total_mistakes) FILTER (WHERE module = 'location'),          0) location,
      COALESCE(SUM(total_mistakes) FILTER (WHERE module = 'impact'),            0) impact,
      COALESCE(SUM(total_mistakes) FILTER (WHERE module = 'extras'),            0) extras,
      COALESCE(SUM(total_mistakes) FILTER (WHERE module = 'freeze_frame'),      0) freeze_frame,
      COALESCE(SUM(total_mistakes), 0) total
    FROM public.module_totals mt, r
    WHERE (p_from IS NULL OR mt.review_date >= p_from)
      AND (p_to   IS NULL OR mt.review_date <= p_to)
      AND (p_collector IS NULL OR public.norm_hr(mt.hr_code) = public.norm_hr(p_collector))
      AND (
        r.role IN ('Admin', 'Uploader', 'Supervisor', 'QualityLeader')
        OR (r.role = 'Viewer'     AND public.norm_hr(mt.hr_code) = r.myhr)
        OR (r.role = 'TeamLeader' AND mt.hr_code IN (
              SELECT c.hr_code FROM public.collectors c WHERE c.team = r.myteam
            ))
      )
    GROUP BY mt.matchid, mt.partid
  )
  SELECT matchid, partid, hr_code, date,
         players, event, formation_tactical, location, impact, extras,
         freeze_frame, total
  FROM agg
  ORDER BY date DESC NULLS LAST
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.match_part_summary_fast(date, date, text, int) TO anon, authenticated;
