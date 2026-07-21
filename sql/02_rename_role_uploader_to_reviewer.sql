-- v57 - Rename the `Uploader` role value to `Reviewer` everywhere.
--
-- ALTER TYPE ... RENAME VALUE updates the enum definition AND every existing
-- row that has that value, in one atomic statement. No data migration
-- needed - run this AFTER deploying the code sweep that replaced the
-- "Uploader" string literal with "Reviewer" across app/, components/, lib/
-- (36 files), otherwise role comparisons in the app will stop matching.

alter type public.user_role rename value 'Uploader' to 'Reviewer';

select id, hr_code, email, role
from public.users
where role = 'Reviewer'::user_role
order by hr_code
limit 20;
