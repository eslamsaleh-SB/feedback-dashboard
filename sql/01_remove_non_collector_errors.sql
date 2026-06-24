-- =============================================================================
-- Remove module errors attributed to NON-Collector accounts (rule: by role)
-- =============================================================================
-- Errors should only belong to Collectors. A collector's hr_code maps to a
-- profile; if that profile's role is anything other than 'Viewer' (Collector)
-- -- e.g. TeamLeader, Reviewer/Uploader, Supervisor, QualityLeader, Admin --
-- its module_totals rows are incorrect and removed here.
--
-- STEP 1 — PREVIEW what will be deleted (run this first, eyeball it):
select mt.hr_code, p.role, count(*) AS rows, sum(mt.total_mistakes) AS mistakes
from public.module_totals mt
join public.profiles p
  on public.norm_hr(p.hr_code) = public.norm_hr(mt.hr_code)
where p.role <> 'Viewer'
group by mt.hr_code, p.role
order by mistakes desc;

-- STEP 2 — DELETE (run after confirming the preview looks right):
-- delete from public.module_totals mt
-- using public.profiles p
-- where public.norm_hr(p.hr_code) = public.norm_hr(mt.hr_code)
--   and p.role <> 'Viewer';

-- Optional: do the same for quality scores if those should also be Collector-only.
-- (Uncomment if desired — preview first by swapping delete->select.)
-- delete from public.quality_module_scores qs using public.profiles p
--   where public.norm_hr(p.hr_code)=public.norm_hr(qs.hr_code) and p.role <> 'Viewer';
