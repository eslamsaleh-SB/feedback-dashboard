-- =============================================================
-- VIDEO FEEDBACK DASHBOARD — Supabase schema + RLS
-- Run this whole file in: Supabase Dashboard > SQL Editor
-- =============================================================

-- ---------- ENUM for roles ----------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('Admin', 'Uploader', 'Viewer');
  end if;
end$$;

-- =============================================================
-- 1. profiles  (1 row per auth user — stores their role)
-- =============================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  role        public.user_role not null default 'Viewer',
  created_at  timestamptz not null default now()
);

-- =============================================================
-- 2. collectors  (employees being evaluated)
-- =============================================================
create table if not exists public.collectors (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- =============================================================
-- 3. feedback_sessions
-- =============================================================
create table if not exists public.feedback_sessions (
  id                 uuid primary key default gen_random_uuid(),
  collector_id       uuid not null references public.collectors(id) on delete cascade,
  uploader_id        uuid not null references auth.users(id) on delete cascade,
  telegram_file_id   text not null,
  feedback_notes     text,
  performance_score  int  check (performance_score between 1 and 10),
  created_at         timestamptz not null default now()
);

create index if not exists idx_feedback_collector on public.feedback_sessions(collector_id);
create index if not exists idx_feedback_uploader  on public.feedback_sessions(uploader_id);

-- =============================================================
-- 4. Auto-create a profile row when a new user signs up
-- =============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data->>'full_name', 'Viewer');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =============================================================
-- 5. Helper: read current user's role (avoids RLS recursion)
-- =============================================================
create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- =============================================================
-- 6. ENABLE ROW LEVEL SECURITY
-- =============================================================
alter table public.profiles          enable row level security;
alter table public.collectors        enable row level security;
alter table public.feedback_sessions enable row level security;

-- ---------- PROFILES policies ----------
-- Everyone can read their own profile; Admins can read all.
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using ( id = auth.uid() or public.current_role() = 'Admin' );

-- A user may update their own non-role fields; only Admins change roles.
drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
  for update using ( id = auth.uid() ) with check ( id = auth.uid() );

drop policy if exists "profiles_admin_all" on public.profiles;
create policy "profiles_admin_all" on public.profiles
  for all using ( public.current_role() = 'Admin' )
  with check ( public.current_role() = 'Admin' );

-- ---------- COLLECTORS policies ----------
-- Any authenticated user can read collectors (for filters/dropdowns).
drop policy if exists "collectors_select" on public.collectors;
create policy "collectors_select" on public.collectors
  for select using ( auth.role() = 'authenticated' );

-- Only Admins create / edit / delete collectors.
drop policy if exists "collectors_admin_write" on public.collectors;
create policy "collectors_admin_write" on public.collectors
  for all using ( public.current_role() = 'Admin' )
  with check ( public.current_role() = 'Admin' );

-- ---------- FEEDBACK_SESSIONS policies ----------
-- SELECT: Admins & Viewers see everything; Uploaders see only their own.
drop policy if exists "sessions_select" on public.feedback_sessions;
create policy "sessions_select" on public.feedback_sessions
  for select using (
    public.current_role() in ('Admin', 'Viewer')
    or uploader_id = auth.uid()
  );

-- INSERT: Admins & Uploaders, and the row must belong to the inserter.
drop policy if exists "sessions_insert" on public.feedback_sessions;
create policy "sessions_insert" on public.feedback_sessions
  for insert with check (
    public.current_role() in ('Admin', 'Uploader')
    and uploader_id = auth.uid()
  );

-- UPDATE: Admins anything; Uploaders only their own rows.
drop policy if exists "sessions_update" on public.feedback_sessions;
create policy "sessions_update" on public.feedback_sessions
  for update using (
    public.current_role() = 'Admin' or uploader_id = auth.uid()
  ) with check (
    public.current_role() = 'Admin' or uploader_id = auth.uid()
  );

-- DELETE: Admins only (matches "Admin can delete sessions").
drop policy if exists "sessions_delete" on public.feedback_sessions;
create policy "sessions_delete" on public.feedback_sessions
  for delete using ( public.current_role() = 'Admin' );

-- =============================================================
-- 7. Make yourself an Admin (run AFTER you sign up once)
-- Replace the email with your own.
-- =============================================================
-- update public.profiles set role = 'Admin'
-- where id = (select id from auth.users where email = 'eslam.saleh@hudl.com');
