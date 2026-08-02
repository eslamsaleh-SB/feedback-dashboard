-- v59: reviewer ↔ collector assignment history.
--
-- One collector has AT MOST one active reviewer at any point in time.
-- When the admin picks a new reviewer for a collector, the current active
-- row is CLOSED (end_date = today - 1) and a NEW row is inserted with
-- start_date = today, end_date = null.
--
-- History is queried by intersecting date ranges with the requested filter.

create table if not exists public.collector_reviewer_assignments (
  id uuid primary key default gen_random_uuid(),
  collector_hr_code text not null,
  reviewer_id uuid not null references public.users(id) on delete cascade,
  start_date date not null default current_date,
  end_date date,
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null
);

create index if not exists idx_cra_collector on public.collector_reviewer_assignments (collector_hr_code);
create index if not exists idx_cra_reviewer on public.collector_reviewer_assignments (reviewer_id);
create index if not exists idx_cra_active
  on public.collector_reviewer_assignments (collector_hr_code)
  where end_date is null;

-- Only one open (end_date null) row per collector.
create unique index if not exists uniq_cra_active_per_collector
  on public.collector_reviewer_assignments (collector_hr_code)
  where end_date is null;

alter table public.collector_reviewer_assignments enable row level security;

drop policy if exists cra_admin_all on public.collector_reviewer_assignments;
create policy cra_admin_all on public.collector_reviewer_assignments
  for all
  using (
    exists (
      select 1 from public.users p
      where p.id = auth.uid() and p.role = 'Admin'::user_role
    )
  )
  with check (
    exists (
      select 1 from public.users p
      where p.id = auth.uid() and p.role = 'Admin'::user_role
    )
  );

-- Reviewers may SELECT their own assignments (to know who they are covering).
drop policy if exists cra_reviewer_select on public.collector_reviewer_assignments;
create policy cra_reviewer_select on public.collector_reviewer_assignments
  for select
  using (
    reviewer_id = auth.uid()
  );

-- Sanity peek
select 'collector_reviewer_assignments ready' as status;
