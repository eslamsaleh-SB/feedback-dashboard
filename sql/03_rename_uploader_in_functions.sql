-- v59: fix `invalid input value for enum user_role: "Uploader"` on upload.
--
-- Back in task #71 (v58) the enum value was renamed:
--   alter type public.user_role rename value 'Uploader' to 'Reviewer';
--
-- Postgres updates the enum label but does NOT rewrite function bodies stored
-- in pg_proc.prosrc. So every SQL/PL/pgSQL function that hardcoded 'Uploader'
-- or 'Uploader'::user_role kept the stale string, and now tries to cast it
-- against an enum that no longer has that label -> the error above.
--
-- The one remaining offender that also needs a code fix is session_visible:
-- it referenced match_sessions.collector_id and my_collector_id(), both of
-- which were dropped in v56 (identity moved onto hr_code / users). Repointed
-- onto hr_code here.
--
-- Run this in the Supabase SQL Editor (Admin) after deploying the v59 code.

-- ---- is_reviewer ----------------------------------------------------------
create or replace function public.is_reviewer()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.users
    where id = auth.uid()
      and role in ('Admin'::user_role, 'Reviewer'::user_role, 'Supervisor'::user_role)
  );
$function$;

-- ---- match_count ----------------------------------------------------------
create or replace function public.match_count(
  p_from date default null::date,
  p_to   date default null::date
)
returns bigint
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_role text := public.current_role()::text;
  v_hr   text := public.norm_hr(public.my_hr_code());
  v_n    bigint;
begin
  select count(distinct mt.matchid) into v_n
  from public.module_totals mt
  where (p_from is null or mt.review_date >= p_from)
    and (p_to   is null or mt.review_date <= p_to)
    and (v_role in ('Admin','Reviewer')
         or (v_role = 'Viewer' and public.norm_hr(mt.hr_code) = v_hr));
  return coalesce(v_n, 0);
end;
$function$;

-- ---- match_module_breakdown ----------------------------------------------
create or replace function public.match_module_breakdown(
  p_from      date    default null::date,
  p_to        date    default null::date,
  p_collector text    default null::text,
  p_matchid   text    default null::text,
  p_limit     integer default 8000
)
returns table(matchid text, partid integer, hr_code text, date date,
              players bigint, event bigint, formation_tactical bigint,
              location bigint, impact bigint, extras bigint,
              freeze_frame bigint, total bigint)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_role text := public.current_role()::text;
  v_hr   text := public.norm_hr(public.my_hr_code());
  v_pcol text := public.norm_hr(p_collector);
  v_mid  text := nullif(trim(p_matchid), '');
begin
  return query
  select mt.matchid, mt.partid, mt.hr_code, max(mt.review_date) as date,
    coalesce(sum(mt.total_mistakes) filter (where mt.module='players'),0),
    coalesce(sum(mt.total_mistakes) filter (where mt.module='event'),0),
    coalesce(sum(mt.total_mistakes) filter (where mt.module='formation_tactical'),0),
    coalesce(sum(mt.total_mistakes) filter (where mt.module='location'),0),
    coalesce(sum(mt.total_mistakes) filter (where mt.module='impact'),0),
    coalesce(sum(mt.total_mistakes) filter (where mt.module='extras'),0),
    coalesce(sum(mt.total_mistakes) filter (where mt.module='freeze_frame'),0),
    coalesce(sum(mt.total_mistakes),0)
  from public.module_totals mt
  where (p_from is null or mt.review_date >= p_from)
    and (p_to   is null or mt.review_date <= p_to)
    and (v_pcol is null or public.norm_hr(mt.hr_code) = v_pcol)
    and (v_mid  is null or mt.matchid = v_mid)
    and (v_role in ('Admin','Reviewer')
         or (v_role='Viewer' and public.norm_hr(mt.hr_code) = v_hr))
  group by mt.matchid, mt.partid, mt.hr_code
  order by max(mt.review_date) desc nulls last, mt.matchid, mt.partid
  limit p_limit;
end;
$function$;

-- ---- match_part_summary_fast ----------------------------------------------
create or replace function public.match_part_summary_fast(
  p_from      date    default null::date,
  p_to        date    default null::date,
  p_collector text    default null::text,
  p_limit     integer default 500
)
returns table(matchid text, partid integer, hr_code text, date date,
              players bigint, event bigint, formation_tactical bigint,
              location bigint, impact bigint, extras bigint,
              freeze_frame bigint, total bigint)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_role text := public.current_role()::text;
  v_hr   text := public.norm_hr(public.my_hr_code());
  v_pcol text := public.norm_hr(p_collector);
begin
  return query
  select
    mt.matchid,
    mt.partid,
    max(mt.hr_code) as hr_code,
    max(mt.review_date) as date,
    coalesce(sum(mt.total_mistakes) filter (where mt.module = 'players'), 0),
    coalesce(sum(mt.total_mistakes) filter (where mt.module = 'event'), 0),
    coalesce(sum(mt.total_mistakes) filter (where mt.module = 'formation_tactical'), 0),
    coalesce(sum(mt.total_mistakes) filter (where mt.module = 'location'), 0),
    coalesce(sum(mt.total_mistakes) filter (where mt.module = 'impact'), 0),
    coalesce(sum(mt.total_mistakes) filter (where mt.module = 'extras'), 0),
    coalesce(sum(mt.total_mistakes) filter (where mt.module = 'freeze_frame'), 0),
    coalesce(sum(mt.total_mistakes), 0)
  from public.module_totals mt
  where (p_from is null or mt.review_date >= p_from)
    and (p_to   is null or mt.review_date <= p_to)
    and (v_pcol is null or public.norm_hr(mt.hr_code) = v_pcol)
    and (
      v_role in ('Admin', 'Reviewer')
      or (v_role = 'Viewer' and public.norm_hr(mt.hr_code) = v_hr)
    )
  group by mt.matchid, mt.partid
  order by max(mt.review_date) desc nulls last
  limit p_limit;
end;
$function$;

-- ---- session_editable ----------------------------------------------------
create or replace function public.session_editable(sid uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.match_sessions m
    where m.id = sid
      and public.current_role() in ('Admin', 'Reviewer')
      and (public.current_role() = 'Admin' or m.uploader_id = auth.uid())
  );
$function$;

-- ---- session_visible -----------------------------------------------------
-- Additional fix: original body referenced match_sessions.collector_id and
-- my_collector_id(), both dropped in v56. Repointed onto hr_code.
create or replace function public.session_visible(sid uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.match_sessions m
    where m.id = sid and (
      public.current_role() = 'Admin'
      or (public.current_role() = 'Reviewer' and m.uploader_id = auth.uid())
      or (public.current_role() = 'Viewer'   and m.hr_code = public.my_hr_code())
    )
  );
$function$;

-- ---- Verify: no function body still contains 'Uploader' ------------------
-- Expected: 0 rows.
--
-- Filter to normal functions (prokind='f'): pg_get_functiondef() throws
-- `"array_agg" is an aggregate function` when applied to aggregates.
select n.nspname as schema, p.proname as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind = 'f'
  and pg_get_functiondef(p.oid) ilike '%Uploader%'
order by p.proname;
