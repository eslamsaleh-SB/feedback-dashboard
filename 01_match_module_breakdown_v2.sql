-- =============================================================================
-- v34 — Match Total per Module: server-side filtering across the FULL dataset
-- =============================================================================
-- Problem this fixes:
--   The "Errors (total) — match total" and module filters used to run in the
--   browser, so they only ever filtered the rows already loaded into the table
--   (a capped slice). Matches outside that slice were never considered.
--
-- This function moves the work into the database:
--   * computes each match's total ACROSS THE ENTIRE module_totals table,
--   * when a module is selected, the match total is based on THAT module only,
--   * applies the error threshold (>=, =, <=) at the match level,
--   * ranks matches by that metric and returns the top p_limit MATCHES,
--   * returns every part row for those matches (so the per-module columns still
--     render exactly like before).
--
-- Safe to run multiple times (CREATE OR REPLACE). It does NOT touch the old
-- match_module_breakdown function, so nothing breaks until the new page.tsx
-- (which calls match_module_breakdown_v2) is deployed.
-- =============================================================================

create or replace function public.match_module_breakdown_v2(
  p_from      date    default null,
  p_to        date    default null,
  p_collector text    default null,
  p_matchid   text    default null,
  p_module    text    default null,          -- null = all modules (use grand total)
  p_err_op    text    default 'gte',          -- 'gte' | 'eq' | 'lte'
  p_err_val   integer default null,           -- null = no error filter
  p_limit     integer default 250             -- max MATCHES returned (not rows)
)
returns table (
  matchid            text,
  partid             integer,
  hr_code            text,
  date               date,
  players            integer,
  event              integer,
  formation_tactical integer,
  location           integer,
  impact             integer,
  extras             integer,
  freeze_frame       integer,
  total              integer
)
language sql
stable
security invoker            -- respects RLS: Admin/Uploader see all rows
set search_path = public
as $$
  with filtered as (
    select mt.matchid, mt.partid, mt.hr_code, mt.module,
           mt.review_date, mt.total_mistakes
    from public.module_totals mt
    where (p_from      is null or mt.review_date >= p_from)
      and (p_to        is null or mt.review_date <= p_to)
      and (p_collector is null or mt.hr_code = p_collector)
      and (p_matchid   is null or mt.matchid = p_matchid)
  ),
  -- one row per (match, part, collector) with the modules pivoted into columns
  parts as (
    select
      f.matchid,
      f.partid,
      f.hr_code,
      max(f.review_date) as date,
      coalesce(sum(f.total_mistakes) filter (where f.module = 'players'), 0)            as players,
      coalesce(sum(f.total_mistakes) filter (where f.module = 'event'), 0)              as event,
      coalesce(sum(f.total_mistakes) filter (where f.module = 'formation_tactical'), 0) as formation_tactical,
      coalesce(sum(f.total_mistakes) filter (where f.module = 'location'), 0)           as location,
      coalesce(sum(f.total_mistakes) filter (where f.module = 'impact'), 0)             as impact,
      coalesce(sum(f.total_mistakes) filter (where f.module = 'extras'), 0)             as extras,
      coalesce(sum(f.total_mistakes) filter (where f.module = 'freeze_frame'), 0)       as freeze_frame,
      coalesce(sum(f.total_mistakes), 0)                                                as total
    from filtered f
    group by f.matchid, f.partid, f.hr_code
  ),
  -- the metric each part contributes: a single module's count, or the grand total
  part_metric as (
    select p.*,
      case p_module
        when 'players'            then p.players
        when 'event'              then p.event
        when 'formation_tactical' then p.formation_tactical
        when 'location'           then p.location
        when 'impact'             then p.impact
        when 'extras'             then p.extras
        when 'freeze_frame'       then p.freeze_frame
        else p.total
      end as metric
    from parts p
  ),
  -- match-level total of that metric, computed over the WHOLE dataset
  match_metric as (
    select matchid, sum(metric) as match_total
    from part_metric
    group by matchid
  ),
  -- apply the error threshold at the match level
  match_filtered as (
    select matchid, match_total
    from match_metric
    where p_err_val is null
       or (coalesce(p_err_op, 'gte') = 'gte' and match_total >= p_err_val)
       or (p_err_op = 'lte' and match_total <= p_err_val)
       or (p_err_op = 'eq'  and match_total =  p_err_val)
  ),
  ranked as (
    select matchid, match_total
    from match_filtered
    order by match_total desc, matchid
    limit greatest(coalesce(p_limit, 250), 0)
  )
  select
    pm.matchid, pm.partid, pm.hr_code, pm.date,
    pm.players, pm.event, pm.formation_tactical, pm.location,
    pm.impact, pm.extras, pm.freeze_frame, pm.total
  from part_metric pm
  join ranked r on r.matchid = pm.matchid
  order by r.match_total desc, pm.matchid, pm.partid, pm.metric desc;
$$;

grant execute on function public.match_module_breakdown_v2(
  date, date, text, text, text, text, integer, integer
) to authenticated;
