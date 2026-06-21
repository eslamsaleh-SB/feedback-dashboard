-- v20: collector_module_totals now also returns each collector's distinct
-- match count, so the "Match Count" card can show matches for the selected
-- collector (instead of always the whole range).
--
-- The return signature changes, so the function must be dropped + recreated.
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
  matches bigint
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
    count(distinct mt.matchid)
  from public.module_totals mt, r
  where (p_from is null or review_date >= p_from)
    and (p_to is null or review_date <= p_to)
    and (
      r.role in ('Admin', 'Uploader')
      or (r.role = 'Viewer' and public.norm_hr(mt.hr_code) = r.myhr)
    )
  group by coalesce(mt.hr_code, '(unknown)')
  order by 9 desc;
$$;

grant execute on function public.collector_module_totals(date, date) to anon, authenticated;
