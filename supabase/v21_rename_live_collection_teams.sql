-- v21: rename "Live Collection Team N" -> "L.C Team N" (display name).
-- Only affects the numbered live-collection teams; the plain "Live Collection"
-- team (team leaders) is left unchanged.
-- Run in: Supabase Dashboard > SQL Editor.

update public.collectors
set team = replace(team, 'Live Collection Team', 'L.C Team')
where team like 'Live Collection Team%';

update public.profiles
set team = replace(team, 'Live Collection Team', 'L.C Team')
where team like 'Live Collection Team%';

-- verify
select team, count(*) n
from public.collectors
where team like 'L.C Team%'
group by team
order by team;
