-- v59: extend collector_module_totals() to return `parts` alongside
-- `matches`. Previous approach (aggregating rows returned by
-- match_part_summary_fast) undercounts because that RPC groups by
-- (matchid, partid) and picks ONE hr_code per part via max(), so if two
-- collectors share the same match-part one of them gets 0 parts.
--
-- Return signature changes, so the function must be dropped + recreated.
-- Run in: Supabase Dashboard > SQL Editor.

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
