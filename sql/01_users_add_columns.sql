-- v56 P1 - Bring `users` table in line with the CSV structure.
-- (v56b: renamed `title` -> `job_title`.)
-- Every column uses `if not exists` so re-running is safe.

alter table public.users
  add column if not exists first_name    text,
  add column if not exists last_name     text,
  add column if not exists mobile_number text,
  add column if not exists legacy_id     text,
  add column if not exists squad         text,
  add column if not exists job_title     text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_hr_code_unique') then
    alter table public.users add constraint users_hr_code_unique unique (hr_code);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'users_legacy_id_unique') then
    alter table public.users add constraint users_legacy_id_unique unique (legacy_id);
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'users'
      and column_name  = 'is_active'
  ) then
    alter table public.users
      add column is_active boolean
      generated always as (
        squad is not null
        and length(trim(squad)) > 0
        and lower(trim(squad)) <> 'resigned'
      ) stored;
  end if;
end$$;

create index if not exists idx_users_hr_code   on public.users (hr_code);
create index if not exists idx_users_squad     on public.users (squad);
create index if not exists idx_users_is_active on public.users (is_active);
