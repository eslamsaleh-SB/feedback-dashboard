-- Weekly Quality Scores
-- Wide table: one row per collector per week, with a column per module + freeze frame.
-- Weeks run Sunday -> Saturday. `week_start_date` is the Sunday.

create table if not exists public.weekly_quality_scores (
  id uuid primary key default gen_random_uuid(),
  hr_code text not null,
  week_start_date date not null,
  players numeric,
  event numeric,
  formation_tactical numeric,
  location numeric,
  impact numeric,
  extras numeric,
  freeze_frame_score numeric,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (hr_code, week_start_date)
);

create index if not exists idx_weekly_quality_scores_week
  on public.weekly_quality_scores (week_start_date desc);
create index if not exists idx_weekly_quality_scores_hr
  on public.weekly_quality_scores (hr_code);

alter table public.weekly_quality_scores enable row level security;

-- Reviewers (Admin, Uploader, Supervisor, QualityLeader) see everything.
drop policy if exists weekly_quality_scores_reviewer_select on public.weekly_quality_scores;
create policy weekly_quality_scores_reviewer_select
  on public.weekly_quality_scores
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('Admin','Uploader','Supervisor','QualityLeader','TeamLeader')
    )
  );

-- Collectors see only their own rows.
drop policy if exists weekly_quality_scores_collector_select on public.weekly_quality_scores;
create policy weekly_quality_scores_collector_select
  on public.weekly_quality_scores
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'Viewer'
        and p.hr_code = public.weekly_quality_scores.hr_code
    )
  );

-- Only Admin + QualityLeader may insert / update.
drop policy if exists weekly_quality_scores_upsert on public.weekly_quality_scores;
create policy weekly_quality_scores_upsert
  on public.weekly_quality_scores
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('Admin','QualityLeader')
    )
  );

drop policy if exists weekly_quality_scores_update on public.weekly_quality_scores;
create policy weekly_quality_scores_update
  on public.weekly_quality_scores
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('Admin','QualityLeader')
    )
  );

drop policy if exists weekly_quality_scores_delete on public.weekly_quality_scores;
create policy weekly_quality_scores_delete
  on public.weekly_quality_scores
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('Admin')
    )
  );

-- updated_at trigger.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists weekly_quality_scores_touch on public.weekly_quality_scores;
create trigger weekly_quality_scores_touch
  before update on public.weekly_quality_scores
  for each row execute function public.set_updated_at();
