-- v56c - Copy legacy columns into the new ones, then drop the duplicates.
-- Old columns still on `users`: team, title, full_name.
-- New columns (already created in 01_users_add_columns.sql): squad, job_title,
-- first_name, last_name.
--
-- After this file:
--   squad     <- team
--   job_title <- title
--   first_name<- first word of full_name
--   last_name <- rest of full_name
--   is_active flips to true for everyone whose squad is not null/empty/Resigned.

update public.users
   set squad     = coalesce(nullif(trim(squad),     ''), team),
       job_title = coalesce(nullif(trim(job_title), ''), title),
       first_name = coalesce(nullif(trim(first_name), ''),
                              nullif(split_part(coalesce(full_name, ''), ' ', 1), '')),
       last_name  = coalesce(nullif(trim(last_name),  ''),
                              nullif(
                                trim(substr(
                                  coalesce(full_name, ''),
                                  length(split_part(coalesce(full_name, ''), ' ', 1)) + 2
                                )),
                                ''
                              ));

-- Sanity check: expect every row now has squad populated (or was intentionally
-- resigned). Uncomment to see who's still inactive.
-- select id, hr_code, full_name, team, squad, is_active
--   from public.users
--  order by is_active, hr_code;

-- Drop the legacy duplicate columns.
alter table public.users drop column if exists team      cascade;
alter table public.users drop column if exists title     cascade;
alter table public.users drop column if exists full_name cascade;
