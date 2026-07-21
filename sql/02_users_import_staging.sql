-- v56 P2 - Staging table for the CSV upload. (v56b: title -> job_title)

create table if not exists public.users_import (
  id uuid primary key default gen_random_uuid(),
  email          text,
  hr_code        text,
  first_name     text,
  last_name      text,
  mobile_number  text,
  legacy_id      text,
  squad          text,
  job_title      text,
  created_at     timestamptz not null default now(),
  processed_at   timestamptz,
  process_error  text
);

-- If the staging table already exists from the previous run with `title`,
-- rename it in place.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='users_import' and column_name='title'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='users_import' and column_name='job_title'
  ) then
    alter table public.users_import rename column title to job_title;
  end if;
end$$;

create index if not exists idx_users_import_hr    on public.users_import (hr_code);
create index if not exists idx_users_import_pending
  on public.users_import (processed_at)
  where processed_at is null;

alter table public.users_import enable row level security;

drop policy if exists users_import_admin_all on public.users_import;
create policy users_import_admin_all on public.users_import
  for all using (public.current_role() = 'Admin'::user_role)
  with check   (public.current_role() = 'Admin'::user_role);
