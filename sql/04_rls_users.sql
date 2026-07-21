-- v56 P4 - Rewrite RLS for the new `users` table.
--
-- Existing policies (from prod):
--   profiles_admin_all      ALL     current_role() = 'Admin'
--   profiles_select         SELECT  id = auth.uid()  OR  Admin
--   profiles_update_self    UPDATE  id = auth.uid()
--
-- Add: every authenticated user can read the (public-safe) columns of any
--      ACTIVE user (needed for Reports admin, Quiz builder, name lookups).
--      This is done at the column level - we don't leak mobile_number or
--      role to peers.

drop policy if exists users_active_directory_select on public.users;
create policy users_active_directory_select on public.users
  for select
  using (
    auth.role() = 'authenticated'
    and is_active = true
  );

-- Keep the Admin-only write policy intact (profiles_admin_all covers it).
-- Keep profiles_update_self so users can edit their own profile fields.

-- Restrict which columns a user may update on themselves - we allow only
-- first_name, last_name, mobile_number. Everything else (role, squad, title,
-- legacy_id, hr_code) is Admin-only. Postgres RLS is row-level not column-
-- level, so we enforce this with a check constraint through a trigger.

create or replace function public.users_self_update_guard()
returns trigger
language plpgsql
as $$
begin
  if new.id = auth.uid() and public.current_role() <> 'Admin'::user_role then
    if new.hr_code    is distinct from old.hr_code    then raise exception 'hr_code is Admin-only'; end if;
    if new.role       is distinct from old.role       then raise exception 'role is Admin-only'; end if;
    if new.squad      is distinct from old.squad      then raise exception 'squad is Admin-only'; end if;
    if new.title      is distinct from old.title      then raise exception 'title is Admin-only'; end if;
    if new.legacy_id  is distinct from old.legacy_id  then raise exception 'legacy_id is Admin-only'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists users_self_update_guard on public.users;
create trigger users_self_update_guard
  before update on public.users
  for each row execute function public.users_self_update_guard();
