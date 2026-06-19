-- =============================================================
-- VIDEO FEEDBACK DASHBOARD — v7 migration
-- match_part_summary view: per-(matchid, partid) mistake counts.
--
-- NOTE: This view has ALREADY been created in the live Supabase project.
-- This file is kept only for records / future re-setup. Re-running it is safe.
--
-- security_invoker = true => the view runs with the QUERYING user's
-- permissions, so existing RLS on match_assignments + the 7 module tables
-- still applies (Admin sees all; a Viewer sees only their own).
-- =============================================================

create or replace view public.match_part_summary
with (security_invoker = true) as
select
  a.matchid,
  a.partid,
  a.hr_code,
  a.date,
  coalesce(pl.c, 0) as players,
  coalesce(ev.c, 0) as event,
  coalesce(ft.c, 0) as formation_tactical,
  coalesce(lo.c, 0) as location,
  coalesce(im.c, 0) as impact,
  coalesce(ex.c, 0) as extras,
  coalesce(fz.c, 0) as freeze_frame,
  (coalesce(pl.c, 0) + coalesce(ev.c, 0) + coalesce(ft.c, 0)
   + coalesce(lo.c, 0) + coalesce(im.c, 0) + coalesce(ex.c, 0)
   + coalesce(fz.c, 0)) as total
from public.match_assignments a
left join (select matchid, partid, count(*) c from public.players            group by 1,2) pl on pl.matchid=a.matchid and pl.partid=a.partid
left join (select matchid, partid, count(*) c from public.event              group by 1,2) ev on ev.matchid=a.matchid and ev.partid=a.partid
left join (select matchid, partid, count(*) c from public.formation_tactical group by 1,2) ft on ft.matchid=a.matchid and ft.partid=a.partid
left join (select matchid, partid, count(*) c from public.location           group by 1,2) lo on lo.matchid=a.matchid and lo.partid=a.partid
left join (select matchid, partid, count(*) c from public.impact             group by 1,2) im on im.matchid=a.matchid and im.partid=a.partid
left join (select matchid, partid, count(*) c from public.extras             group by 1,2) ex on ex.matchid=a.matchid and ex.partid=a.partid
left join (select matchid, partid, count(*) c from public.freeze_frame       group by 1,2) fz on fz.matchid=a.matchid and fz.partid=a.partid;

grant select on public.match_part_summary to anon, authenticated;
