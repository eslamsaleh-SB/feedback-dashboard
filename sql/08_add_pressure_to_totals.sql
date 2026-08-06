-- v59: add `pressure` bigint to the three module-aggregating RPCs so the
-- Collectors Performance table + Match Total per Module can render a
-- Pressure column. The underlying data source `public.module_totals` uses a
-- text `module` column, so no table alteration is needed — only the
-- generated per-module columns in each function need to be added.
--
-- Return signatures change, so functions must be dropped + recreated.

-- ---- collector_module_totals -------------------------------------------
drop function if exists public.collector_module_totals(date, date);

create or replace function public.collector_module_totals(
  p_from date default null,
  p_to date default null
)
returns table (
  hr_code text,
  players bigint,
  event bigint,
  formation_tactical bigint,
  location bigint,
  impact bigint,
  extras bigint,
  pressure bigint,
  freeze_frame bigint,
  total bigint,
  matches bigint,
  parts bigint
)
language sql stable security definer set search_path = public
as $$
  with r as (
    select public.current_role()::text role,
           public.norm_hr(public.my_hr_code()) myhr
  )
  select
    coalesce(mt.hr_code, '(unknown)') hr_code,
    coalesce(sum(total_mistakes) filter (where module = 'players'), 0),
    coalesce(sum(total_mistakes) filter (where module = 'event'), 0),
    coalesce(sum(total_mistakes) filter (where module = 'formation_tactical'), 0),
    coalesce(sum(total_mistakes) filter (where module = 'location'), 0),
    coalesce(sum(total_mistakes) filter (where module = 'impact'), 0),
    coalesce(sum(total_mistakes) filter (where module = 'extras'), 0),
    coalesce(sum(total_mistakes) filter (where module = 'pressure'), 0),
    coalesce(sum(total_mistakes) filter (where module = 'freeze_frame'), 0),
    coalesce(sum(total_mistakes), 0),
    count(distinct mt.matchid),
    count(distinct (mt.matchid, mt.partid))
  from public.module_totals mt, r
  where (p_from is null or review_date >= p_from)
    and (p_to is null or review_date <= p_to)
    and (
      r.role in ('Admin', 'Reviewer')
      or (r.role = 'Viewer' and public.norm_hr(mt.hr_code) = r.myhr)
    )
  group by coalesce(mt.hr_code, '(unknown)')
$$;

grant execute on function public.collector_module_totals(date, date) to anon, authenticated;

-- ---- match_part_summary_fast -------------------------------------------
drop function if exists public.match_part_summary_fast(date, date, text, integer);

create or replace function public.match_part_summary_fast(
  p_from date default null,
  p_to date default null,
  p_collector text default null,
  p_limit integer default 500
)
returns table(matchid text, partid integer, hr_code text, date date,
              players bigint, event bigint, formation_tactical bigint,
              location bigint, impact bigint, extras bigint,
              pressure bigint,
              freeze_frame bigint, total bigint)
language plpgsql stable security definer set search_path = public
as $$
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
    coalesce(sum(mt.total_mistakes) filter (where mt.module = 'pressure'), 0),
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
$$;

grant execute on function public.match_part_summary_fast(date, date, text, integer) to anon, authenticated;

-- ---- match_module_breakdown --------------------------------------------
drop function if exists public.match_module_breakdown(date, date, text, text, integer);

create or replace function public.match_module_breakdown(
  p_from      date    default null,
  p_to        date    default null,
  p_collector text    default null,
  p_matchid   text    default null,
  p_limit     integer default 8000
)
returns table(matchid text, partid integer, hr_code text, date date,
              players bigint, event bigint, formation_tactical bigint,
              location bigint, impact bigint, extras bigint,
              pressure bigint,
              freeze_frame bigint, total bigint)
language plpgsql stable security definer set search_path = public
as $$
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
    coalesce(sum(mt.total_mistakes) filter (where mt.module='pressure'),0),
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
$$;

grant execute on function public.match_module_breakdown(date, date, text, text, integer) to anon, authenticated;
