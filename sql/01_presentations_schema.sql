-- =============================================================================
-- Presentation Builder schema
-- =============================================================================
-- Reviewers build multi-page "lessons" and assign them to collectors.
-- One presentation -> many pages. Assignments are many-to-many between
-- presentations and collectors (via hr_code).

create table if not exists public.presentations (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  description     text,
  google_slides_url text,        -- populated after Convert-to-Slides
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.presentation_pages (
  id              uuid primary key default gen_random_uuid(),
  presentation_id uuid not null references public.presentations(id) on delete cascade,
  page_order      int not null,
  header          text not null,
  description     text,
  video_link      text,          -- raw Google Drive URL as pasted
  drive_file_id   text,          -- extracted file id for iframe embed
  created_at      timestamptz not null default now(),
  unique (presentation_id, page_order)
);
create index if not exists pp_pres_idx on public.presentation_pages(presentation_id);

create table if not exists public.presentation_assignments (
  id              uuid primary key default gen_random_uuid(),
  presentation_id uuid not null references public.presentations(id) on delete cascade,
  hr_code         text not null,
  assigned_by     uuid references auth.users(id) on delete set null,
  assigned_at     timestamptz not null default now(),
  viewed_at       timestamptz,
  unique (presentation_id, hr_code)
);
create index if not exists pa_hr_idx  on public.presentation_assignments(hr_code);
create index if not exists pa_pres_idx on public.presentation_assignments(presentation_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.presentations             enable row level security;
alter table public.presentation_pages        enable row level security;
alter table public.presentation_assignments  enable row level security;

-- Reviewers (Admin/Uploader/Supervisor) see and modify everything.
-- Collectors see only presentations they are assigned to.

-- presentations ------------------------------------------------------------
drop policy if exists pr_select on public.presentations;
create policy pr_select on public.presentations for select using (
  public.current_role() in
    ('Admin','Uploader','Supervisor','QualityLeader','TeamLeader')
  or exists (
    select 1 from public.presentation_assignments a
    where  a.presentation_id = presentations.id
      and  a.hr_code = public.my_hr_code()
  )
);
drop policy if exists pr_write on public.presentations;
create policy pr_write on public.presentations for all
  using      (public.current_role() in ('Admin','Uploader','Supervisor'))
  with check (public.current_role() in ('Admin','Uploader','Supervisor'));

-- presentation_pages -------------------------------------------------------
drop policy if exists pp_select on public.presentation_pages;
create policy pp_select on public.presentation_pages for select using (
  public.current_role() in
    ('Admin','Uploader','Supervisor','QualityLeader','TeamLeader')
  or exists (
    select 1 from public.presentation_assignments a
    where  a.presentation_id = presentation_pages.presentation_id
      and  a.hr_code = public.my_hr_code()
  )
);
drop policy if exists pp_write on public.presentation_pages;
create policy pp_write on public.presentation_pages for all
  using      (public.current_role() in ('Admin','Uploader','Supervisor'))
  with check (public.current_role() in ('Admin','Uploader','Supervisor'));

-- presentation_assignments -------------------------------------------------
drop policy if exists pa_select on public.presentation_assignments;
create policy pa_select on public.presentation_assignments for select using (
  public.current_role() in
    ('Admin','Uploader','Supervisor','QualityLeader','TeamLeader')
  or hr_code = public.my_hr_code()
);
drop policy if exists pa_write on public.presentation_assignments;
create policy pa_write on public.presentation_assignments for all
  using      (public.current_role() in ('Admin','Uploader','Supervisor'))
  with check (public.current_role() in ('Admin','Uploader','Supervisor'));

-- Auto-update updated_at on presentations
create or replace function public.touch_presentations_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists tr_presentations_touch on public.presentations;
create trigger tr_presentations_touch
  before update on public.presentations
  for each row execute function public.touch_presentations_updated_at();
