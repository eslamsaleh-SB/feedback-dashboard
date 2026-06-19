-- =============================================================
-- VIDEO FEEDBACK DASHBOARD — v8 migration
-- collector_module_totals(): per-collector per-module mistake counts.
--
-- Powers the new "Collectors" view (rank collectors by mistakes per module).
-- Optional p_from / p_to date bounds (inclusive) filter by each mistake's
-- review_date. SECURITY INVOKER (default) so existing RLS applies.
--
-- NOTE: This function has ALREADY been created in the live Supabase project
-- and verified. This file is for records / future re-setup; re-running is safe.
-- =============================================================

create or replace function public.collector_module_totals(
  p_from date default null,
  p_to   date default null
)
returns table (
  hr_code            text,
  players            bigint,
  event              bigint,
  formation_tactical bigint,
  location           bigint,
  impact             bigint,
  extras             bigint,
  freeze_frame       bigint,
  total              bigint
)
language sql
stable
as $$
  with m as (
    select hr_code, 'players'::text md, review_date from public.players
    union all select hr_code, 'event',              review_date from public.event
    union all select hr_code, 'formation_tactical', review_date from public.formation_tactical
    union all select hr_code, 'location',           review_date from public.location
    union all select hr_code, 'impact',             review_date from public.impact
    union all select hr_code, 'extras',             review_date from public.extras
    union all select hr_code, 'freeze_frame',       review_date from public.freeze_frame
  )
  select
    coalesce(hr_code, '(unknown)') as hr_code,
    count(*) filter (where md = 'players')            as players,
    count(*) filter (where md = 'event')              as event,
    count(*) filter (where md = 'formation_tactical') as formation_tactical,
    count(*) filter (where md = 'location')           as location,
    count(*) filter (where md = 'impact')             as impact,
    count(*) filter (where md = 'extras')             as extras,
    count(*) filter (where md = 'freeze_frame')       as freeze_frame,
    count(*)                                          as total
  from m
  where (p_from is null or review_date >= p_from)
    and (p_to   is null or review_date <= p_to)
  group by coalesce(hr_code, '(unknown)')
  order by total desc;
$$;

grant execute on function public.collector_module_totals(date, date) to anon, authenticated;
