-- v57 - Fix blank emails + broken self-update trigger + consolidate to ONE users table.
--
-- Root causes fixed:
-- 1) The v56 users-import route only wrote email into auth.users + the
--    users_import staging table, never into public.users. That's why the
--    Users admin page showed blank emails for most rows.
-- 2) users_self_update_guard() (sql/04_rls_users.sql) still checks
--    old.title / new.title, but that column was renamed to job_title in
--    v56b. Every self-update on `users` has been throwing 42703 since.
-- 3) users_import was a second table with no purpose beyond one-time audit.
--    Dropping it makes `users` the single source of truth, as originally
--    intended. Safe to run AFTER the v57 users-import route.ts is deployed
--    (that patch removes the staging-table insert).

-- 1) Backfill email from auth.users wherever it's missing.
update public.users u
set email = au.email
from auth.users au
where u.id = au.id
  and (u.email is null or u.email = '')
  and au.email is not null;

-- 2) Fix the trigger: title -> job_title.
create or replace function public.users_self_update_guard()
returns trigger
language plpgsql
as $$
begin
  if new.id = auth.uid() and public.current_role() <> 'Admin'::user_role then
    if new.hr_code    is distinct from old.hr_code    then raise exception 'hr_code is Admin-only'; end if;
    if new.role       is distinct from old.role       then raise exception 'role is Admin-only'; end if;
    if new.squad      is distinct from old.squad      then raise exception 'squad is Admin-only'; end if;
    if new.job_title  is distinct from old.job_title  then raise exception 'job_title is Admin-only'; end if;
    if new.legacy_id  is distinct from old.legacy_id  then raise exception 'legacy_id is Admin-only'; end if;
  end if;
  return new;
end;
$$;

-- 3) Consolidate to one table. Only run this after the v57 users-import
--    route.ts (which stops writing to users_import) is deployed.
drop table if exists public.users_import;

select
  (select count(*) from public.users) as users_count,
  (select count(*) from public.users where email is null or email = '') as still_blank_emails,
  'v57 fix applied' as status;
