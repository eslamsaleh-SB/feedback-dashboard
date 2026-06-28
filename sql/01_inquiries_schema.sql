-- =============================================================================
-- v44 - Collector Inquiries
-- =============================================================================
-- Collectors can submit a "match inquiry" (a Match ID + a Google Drive folder
-- of clips they have questions about). Reviewers reply per video. Once every
-- video has a reply, the reviewer can mark the inquiry complete and an email
-- is sent to the collector.
--
-- Run this once in the Supabase SQL editor before deploying the v44 code.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table if not exists public.match_inquiries (
  id              uuid primary key default gen_random_uuid(),
  hr_code         text not null,
  match_id        text not null,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  completed_at    timestamptz,
  completed_by    uuid references auth.users(id) on delete set null,
  -- One inquiry per (collector, match). Re-submitting the same match appends
  -- to the existing inquiry instead.
  unique (hr_code, match_id)
);

create index if not exists match_inquiries_hr_idx
  on public.match_inquiries(hr_code);
create index if not exists match_inquiries_completed_idx
  on public.match_inquiries(completed_at);

create table if not exists public.match_inquiry_videos (
  id            uuid primary key default gen_random_uuid(),
  inquiry_id    uuid not null references public.match_inquiries(id) on delete cascade,
  drive_file_id text not null,
  file_name     text not null,
  question      text,
  reply_text    text,
  replied_at    timestamptz,
  replied_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  -- A given drive file appears at most once per inquiry.
  unique (inquiry_id, drive_file_id)
);

create index if not exists match_inquiry_videos_inquiry_idx
  on public.match_inquiry_videos(inquiry_id);

-- ---------------------------------------------------------------------------
-- 2. RLS
-- ---------------------------------------------------------------------------

alter table public.match_inquiries        enable row level security;
alter table public.match_inquiry_videos   enable row level security;

-- match_inquiries -----------------------------------------------------------

drop policy if exists mi_select on public.match_inquiries;
create policy mi_select on public.match_inquiries
  for select using (
    public.current_role() in
      ('Admin','Uploader','Supervisor','QualityLeader','TeamLeader')
    or hr_code = public.my_hr_code()
  );

drop policy if exists mi_insert on public.match_inquiries;
create policy mi_insert on public.match_inquiries
  for insert with check (
    hr_code = public.my_hr_code()
    or public.current_role() in ('Admin','Uploader')
  );

drop policy if exists mi_update on public.match_inquiries;
create policy mi_update on public.match_inquiries
  for update using (
    public.current_role() in ('Admin','Uploader','Supervisor')
  );

-- match_inquiry_videos ------------------------------------------------------

drop policy if exists miv_select on public.match_inquiry_videos;
create policy miv_select on public.match_inquiry_videos
  for select using (
    public.current_role() in
      ('Admin','Uploader','Supervisor','QualityLeader','TeamLeader')
    or exists (
      select 1 from public.match_inquiries q
      where  q.id = match_inquiry_videos.inquiry_id
        and  q.hr_code = public.my_hr_code()
    )
  );

drop policy if exists miv_insert on public.match_inquiry_videos;
create policy miv_insert on public.match_inquiry_videos
  for insert with check (
    exists (
      select 1 from public.match_inquiries q
      where  q.id = inquiry_id
        and (q.hr_code = public.my_hr_code()
             or public.current_role() in ('Admin','Uploader'))
    )
  );

drop policy if exists miv_update on public.match_inquiry_videos;
create policy miv_update on public.match_inquiry_videos
  for update using (
    public.current_role() in ('Admin','Uploader','Supervisor')
  );
