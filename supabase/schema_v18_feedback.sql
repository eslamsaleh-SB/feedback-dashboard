-- =============================================================
-- VIDEO FEEDBACK DASHBOARD — v18 migration
-- Feedback Reservation + Feedback Progress
--
-- Adds two tables:
--   feedback_reservations  — one scheduled feedback session
--   feedback_attendees     — one row per collector in a session
--                            (a single session has 1 row; a group has many)
--
-- Access: Admins and Uploaders (Reviewers) have full access.
--         Viewers (collectors) have no access.
--
-- Run this in: Supabase Dashboard > SQL Editor.
-- =============================================================

create extension if not exists pgcrypto;

-- ---------- 1. Reservations ----------
create table if not exists public.feedback_reservations (
  id           uuid primary key default gen_random_uuid(),
  session_date date not null,
  session_time text,                                   -- 'HH:MM'
  shift        text check (shift in ('Morning','Night','Overnight')),
  mode         text not null check (mode in ('Online','Offline')),
  is_group     boolean not null default false,
  location     text check (location in ('Mahmoud El-Badry','Hassan Ma''moun','Maadi')),
  meet_link    text,
  created_by   uuid default auth.uid() references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- ---------- 2. Attendees (one per collector per session) ----------
create table if not exists public.feedback_attendees (
  id             uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.feedback_reservations(id) on delete cascade,
  hr_code        text not null,
  attendance     text check (attendance in ('Attended','Attended Late','Absent','Cancelled')),
  comment        text,
  created_at     timestamptz not null default now()
);

create index if not exists fa_res_idx  on public.feedback_attendees(reservation_id);
create index if not exists fa_hr_idx   on public.feedback_attendees(hr_code);
create index if not exists fr_date_idx on public.feedback_reservations(session_date);

-- ---------- 3. RLS: Admin + Uploader(Reviewer) only ----------
alter table public.feedback_reservations enable row level security;
alter table public.feedback_attendees    enable row level security;

drop policy if exists fr_all on public.feedback_reservations;
create policy fr_all on public.feedback_reservations for all
  using      (public.current_role() in ('Admin','Uploader'))
  with check (public.current_role() in ('Admin','Uploader'));

drop policy if exists fa_all on public.feedback_attendees;
create policy fa_all on public.feedback_attendees for all
  using      (public.current_role() in ('Admin','Uploader'))
  with check (public.current_role() in ('Admin','Uploader'));

-- Done.
