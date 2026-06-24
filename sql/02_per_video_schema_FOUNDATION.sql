-- =============================================================================
-- FOUNDATION schema for the per-video notes / acknowledgment subsystem
-- (review only — the UI + email build comes with the dedicated package)
-- =============================================================================
-- session_videos already exists: (id, match_session_id, drive_file_id, file_name).
-- Add an explicit ordering for strict sequential acknowledgment.
alter table public.session_videos add column if not exists position integer;

-- Backfill a stable order per session from file_name (run once):
-- with ordered as (
--   select id, row_number() over (partition by match_session_id order by file_name) - 1 as pos
--   from public.session_videos
-- )
-- update public.session_videos sv set position = ordered.pos from ordered where ordered.id = sv.id;

-- One acknowledgment per (video, collector). Strict-sequential is enforced in
-- the app (video N can only be acked after video N-1), and re-validated here.
create table if not exists public.video_acks (
  id uuid primary key default gen_random_uuid(),
  session_video_id uuid not null references public.session_videos(id) on delete cascade,
  hr_code text not null,
  acknowledged_at timestamptz not null default now(),
  unique (session_video_id, hr_code)
);

-- A collector note on a specific video.
create table if not exists public.video_notes (
  id uuid primary key default gen_random_uuid(),
  session_video_id uuid not null references public.session_videos(id) on delete cascade,
  match_session_id uuid references public.match_sessions(id) on delete cascade,
  hr_code text not null,                          -- author (collector)
  body text not null,
  status text not null default 'Open' check (status in ('Open','Replied','Resolved')),
  created_at timestamptz not null default now()
);
create index if not exists vn_video_idx on public.video_notes(session_video_id);
create index if not exists vn_match_idx on public.video_notes(match_session_id);

-- Replies from reviewers/quality to a note. First reply flips note -> 'Replied'.
create table if not exists public.note_replies (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.video_notes(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  author_label text,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists nr_note_idx on public.note_replies(note_id);

-- RLS (sketch): collectors read/write their own acks+notes; reviewers/admins
-- read all and write replies + status. To be finalized with the UI package.
