-- =============================================================
-- VIDEO FEEDBACK DASHBOARD — v2 migration
-- Match-Session system + multi-video + Collector Profile linking
--
-- Run this whole file in: Supabase Dashboard > SQL Editor.
-- Safe to run on top of the original schema.sql (uses IF NOT EXISTS).
-- =============================================================

-- ---------- 1. Extend profiles: link to a collector + store email ----------
alter table public.profiles
  add column if not exists collector_id uuid references public.collectors(id) on delete set null;

alter table public.profiles
  add column if not exists email text;

-- Backfill email for accounts that already exist.
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is null;

-- Keep the signup trigger in sync (store email + full name on new signups).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (new.id, new.raw_user_meta_data->>'full_name', new.email, 'Viewer')
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

-- ---------- 2. match_sessions (one row per reviewed match) ----------
create table if not exists public.match_sessions (
  id             uuid primary key default gen_random_uuid(),
  collector_id   uuid not null references public.collectors(id) on delete cascade,
  uploader_id    uuid not null references auth.users(id) on delete cascade,
  match_name     text not null,
  review_date    date not null default current_date,
  quality_score  int  check (quality_score between 1 and 10),
  overall_notes  text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_ms_collector on public.match_sessions(collector_id);
create index if not exists idx_ms_uploader  on public.match_sessions(uploader_id);

-- ---------- 3. session_videos (many videos per match) ----------
create table if not exists public.session_videos (
  id                 uuid primary key default gen_random_uuid(),
  match_session_id   uuid not null references public.match_sessions(id) on delete cascade,
  telegram_file_id   text not null,
  mistake_description text,
  created_at         timestamptz not null default now()
);

create index if not exists idx_sv_session on public.session_videos(match_session_id);

-- =============================================================
-- 4. Helper functions (security definer => bypass RLS internally)
-- =============================================================
create or replace function public.my_collector_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select collector_id from public.profiles where id = auth.uid();
$$;

-- Can the current user SEE this match session?
create or replace function public.session_visible(sid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.match_sessions m
    where m.id = sid and (
      public.current_role() = 'Admin'
      or (public.current_role() = 'Uploader' and m.uploader_id = auth.uid())
      or (public.current_role() = 'Viewer'  and m.collector_id = public.my_collector_id())
    )
  );
$$;

-- Can the current user ADD/EDIT videos in this match session?
create or replace function public.session_editable(sid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.match_sessions m
    where m.id = sid
      and public.current_role() in ('Admin', 'Uploader')
      and (public.current_role() = 'Admin' or m.uploader_id = auth.uid())
  );
$$;

-- =============================================================
-- 5. Row Level Security
-- =============================================================
alter table public.match_sessions enable row level security;
alter table public.session_videos enable row level security;

-- ---------- match_sessions ----------
drop policy if exists "ms_select" on public.match_sessions;
create policy "ms_select" on public.match_sessions
  for select using (
    public.current_role() = 'Admin'
    or (public.current_role() = 'Uploader' and uploader_id = auth.uid())
    or (public.current_role() = 'Viewer'  and collector_id = public.my_collector_id())
  );

drop policy if exists "ms_insert" on public.match_sessions;
create policy "ms_insert" on public.match_sessions
  for insert with check (
    public.current_role() in ('Admin', 'Uploader') and uploader_id = auth.uid()
  );

drop policy if exists "ms_update" on public.match_sessions;
create policy "ms_update" on public.match_sessions
  for update using (
    public.current_role() = 'Admin' or uploader_id = auth.uid()
  ) with check (
    public.current_role() = 'Admin' or uploader_id = auth.uid()
  );

drop policy if exists "ms_delete" on public.match_sessions;
create policy "ms_delete" on public.match_sessions
  for delete using ( public.current_role() = 'Admin' );

-- ---------- session_videos ----------
drop policy if exists "sv_select" on public.session_videos;
create policy "sv_select" on public.session_videos
  for select using ( public.session_visible(match_session_id) );

drop policy if exists "sv_insert" on public.session_videos;
create policy "sv_insert" on public.session_videos
  for insert with check ( public.session_editable(match_session_id) );

drop policy if exists "sv_update" on public.session_videos;
create policy "sv_update" on public.session_videos
  for update using ( public.session_editable(match_session_id) )
  with check ( public.session_editable(match_session_id) );

drop policy if exists "sv_delete" on public.session_videos;
create policy "sv_delete" on public.session_videos
  for delete using (
    public.current_role() = 'Admin' or public.session_editable(match_session_id)
  );

-- =============================================================
-- 6. (Optional) retire the old single-video table once you're happy:
--    drop table if exists public.feedback_sessions;
-- =============================================================

-- =============================================================
-- 7. Link a login account to a collector (so "My Profile" works).
--    Run for each viewer, replacing the email + collector name.
-- =============================================================
-- update public.profiles
-- set collector_id = (select id from public.collectors where name = 'Ahmed Ali')
-- where email = 'ahmed@example.com';
