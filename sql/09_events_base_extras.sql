-- v59: per-event error detail tables backing the "Base Final" / "Extras Final"
-- Google Sheet tabs. Powers the Performance top-events view (rank corrected
-- events by count) and the Matches page (filter by Collector Event / Reviewer
-- Event).
--
-- Base Final columns (row = one collector's mistake on one event):
--   Review Date | Match ID | Part ID | Code | Error Type | Event Name
--     | Collector Event | Reviewer Event | Total Count
--
-- Extras Final columns:
--   Review Date | Match ID | hr_code | Part ID | Event Name
--     | Extra Field | Changed From | Changed To | Total Count

create table if not exists public.base_events (
  id uuid primary key default gen_random_uuid(),
  review_date date,
  match_id text,
  part_id int,
  hr_code text,                 -- Code column
  error_type text,              -- e.g. "P" (event mistake), "Q" (extras), "R" (reviewer)
  event_name text,
  collector_event text,
  reviewer_event text,
  total_count int not null default 1,
  uploaded_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_base_events_hr on public.base_events (hr_code);
create index if not exists idx_base_events_date on public.base_events (review_date);
create index if not exists idx_base_events_event on public.base_events (event_name);
create index if not exists idx_base_events_col_event on public.base_events (collector_event);
create index if not exists idx_base_events_rev_event on public.base_events (reviewer_event);

create table if not exists public.extras_events (
  id uuid primary key default gen_random_uuid(),
  review_date date,
  match_id text,
  part_id int,
  hr_code text,
  event_name text,
  extra_field text,
  changed_from text,
  changed_to text,
  total_count int not null default 1,
  uploaded_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_extras_events_hr on public.extras_events (hr_code);
create index if not exists idx_extras_events_date on public.extras_events (review_date);
create index if not exists idx_extras_events_event on public.extras_events (event_name);

alter table public.base_events   enable row level security;
alter table public.extras_events enable row level security;

-- Reviewer + Admin can read/write; Viewer can read their own rows only.
drop policy if exists be_reviewer_all on public.base_events;
create policy be_reviewer_all on public.base_events
  for all using (
    exists (
      select 1 from public.users p
      where p.id = auth.uid()
        and p.role in ('Admin'::user_role, 'Reviewer'::user_role, 'Supervisor'::user_role)
    )
  )
  with check (
    exists (
      select 1 from public.users p
      where p.id = auth.uid()
        and p.role in ('Admin'::user_role, 'Reviewer'::user_role, 'Supervisor'::user_role)
    )
  );

drop policy if exists be_owner_select on public.base_events;
create policy be_owner_select on public.base_events
  for select using (
    exists (
      select 1 from public.users p
      where p.id = auth.uid()
        and p.hr_code = public.base_events.hr_code
    )
  );

drop policy if exists ee_reviewer_all on public.extras_events;
create policy ee_reviewer_all on public.extras_events
  for all using (
    exists (
      select 1 from public.users p
      where p.id = auth.uid()
        and p.role in ('Admin'::user_role, 'Reviewer'::user_role, 'Supervisor'::user_role)
    )
  )
  with check (
    exists (
      select 1 from public.users p
      where p.id = auth.uid()
        and p.role in ('Admin'::user_role, 'Reviewer'::user_role, 'Supervisor'::user_role)
    )
  );

drop policy if exists ee_owner_select on public.extras_events;
create policy ee_owner_select on public.extras_events
  for select using (
    exists (
      select 1 from public.users p
      where p.id = auth.uid()
        and p.hr_code = public.extras_events.hr_code
    )
  );

select 'base_events + extras_events ready' as status;
