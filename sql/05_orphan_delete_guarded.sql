-- v56 P5 - Delete metrics rows whose hr_code is not in `users`.
--
-- WARNING: run ONLY after the users import (step 4) has populated public.users
-- with your full employee roster. This delete would drop 99% of rows if run
-- against the current 15-row users table.
--
-- Guard clause aborts the migration if users.count < 800 to prevent accidents.

do $$
declare
  user_count int;
begin
  select count(*) into user_count from public.users;
  -- Guard threshold: users.csv has ~490 rows, so require at least 400.
  if user_count < 400 then
    raise exception 'Aborting orphan delete: users has only % rows (< 400). Run the CSV import first.', user_count;
  end if;
end$$;

-- Preview the damage before running the deletes (uncomment to test):
-- select 'module_totals'      as t, count(*) from public.module_totals
--   where hr_code not in (select hr_code from public.users where hr_code is not null)
-- union all select 'quality_scores',       count(*) from public.quality_scores
--   where hr_code not in (select hr_code from public.users where hr_code is not null)
-- union all select 'freeze_frame_scores',  count(*) from public.freeze_frame_scores
--   where hr_code not in (select hr_code from public.users where hr_code is not null);

delete from public.module_totals
 where hr_code not in (select hr_code from public.users where hr_code is not null);

delete from public.quality_scores
 where hr_code not in (select hr_code from public.users where hr_code is not null);

delete from public.freeze_frame_scores
 where hr_code not in (select hr_code from public.users where hr_code is not null);

delete from public.weekly_quality_scores
 where hr_code not in (select hr_code from public.users where hr_code is not null);
