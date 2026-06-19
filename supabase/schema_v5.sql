-- =============================================================
-- VIDEO FEEDBACK DASHBOARD — v5 migration
-- Composite (matchid, partid) model + per-collector linking by HR code,
-- and 7 module tables with their REAL columns (from the source CSVs).
--
-- Run this whole file in: Supabase Dashboard > SQL Editor.
-- Reuses helpers from earlier migrations:
--   public.current_role()     -> Admin | Uploader | Viewer
--   public.my_collector_id()  -> collector linked to the logged-in user
--
-- NOTE: this supersedes schema_v4.sql. It drops the v4 "matches" + module
-- tables (if you created them) and rebuilds everything for the new model.
-- =============================================================

-- ---------- 0. Clean up v4 objects if they exist ----------
drop table if exists public.players          cascade;
drop table if exists public.event            cascade;
drop table if exists public.formation_tactical cascade;
drop table if exists public.location         cascade;
drop table if exists public.impact           cascade;
drop table if exists public.extras           cascade;
drop table if exists public.freeze_frame     cascade;
drop table if exists public.matches          cascade;

-- ---------- 1. Collectors get an HR code (the CSV linking key) ----------
alter table public.collectors
  add column if not exists hr_code text;

-- One collector per HR code. A real UNIQUE constraint is required so that
-- match_assignments.hr_code can reference it as a foreign key. (NULLs are
-- allowed and don't conflict, so existing collectors without a code are fine.)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'collectors_hr_code_key'
  ) then
    alter table public.collectors
      add constraint collectors_hr_code_key unique (hr_code);
  end if;
end$$;

-- Helper: the HR code of the logged-in user's linked collector.
create or replace function public.my_hr_code()
returns text
language sql stable security definer set search_path = public
as $$
  select c.hr_code
  from public.collectors c
  where c.id = public.my_collector_id();
$$;

-- =============================================================
-- 2. match_assignments — the unit of work = (matchid, partid)
--    Each part of a match is assigned to one collector (by hr_code).
-- =============================================================
create table if not exists public.match_assignments (
  matchid     text        not null,
  partid      integer     not null,
  hr_code     text        references public.collectors(hr_code) on delete set null,
  date        date,
  uploaded_by uuid        references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (matchid, partid)
);

create index if not exists idx_ma_hr   on public.match_assignments(hr_code);
create index if not exists idx_ma_date on public.match_assignments(date);

-- =============================================================
-- 3. The 7 module (child) tables, each with their real columns.
--    Every child has (matchid, partid) -> match_assignments (FK)
--    and a UNIQUE(key) for per-module deduplication on upsert.
-- =============================================================

-- Common shape note: review_date/reviewer_code/hr_code/squad/collector_event/
-- video_timestamp/error_type/defect_type recur across most modules.

-- 3.1 event  (Event Error Details.csv)
create table if not exists public.event (
  id              uuid primary key default gen_random_uuid(),
  matchid         text not null,
  partid          integer not null,
  key             text not null unique,
  review_date     date,
  review_type     text,
  reviewer_code   text,
  hr_code         text,            -- base_HR_code
  squad           text,            -- base_squad
  video_timestamp text,
  error_type      text,
  defect_type     text,
  collector_event text,
  reviewer_event  text,            -- "reviewer event"
  created_at      timestamptz not null default now(),
  foreign key (matchid, partid) references public.match_assignments(matchid, partid) on delete cascade
);

-- 3.2 players  (changed players details.csv)
create table if not exists public.players (
  id              uuid primary key default gen_random_uuid(),
  matchid         text not null,
  partid          integer not null,
  key             text not null unique,
  review_date     date,
  review_type     text,
  reviewer_code   text,
  hr_code         text,            -- players_HR_code
  squad           text,            -- players_squad
  team_type       text,
  collector_event text,
  video_timestamp text,
  error_type      text,
  defect_type     text,
  player_1_jersey_collector text,
  player_1_jersey_reviewer  text,
  player_2_jersey_collector text,
  player_2_jersey_reviewer  text,
  created_at      timestamptz not null default now(),
  foreign key (matchid, partid) references public.match_assignments(matchid, partid) on delete cascade
);

-- 3.3 formation_tactical  (changed formation details.csv)
create table if not exists public.formation_tactical (
  id              uuid primary key default gen_random_uuid(),
  matchid         text not null,
  partid          integer not null,
  key             text not null unique,
  review_date     date,
  review_type     text,
  reviewer_code   text,
  hr_code         text,            -- formation_HR_code
  squad           text,            -- formation_squad
  video_timestamp text,
  error_type      text,
  defect_type     text,
  collector_event text,
  formation_collector text,
  formation_reviewer  text,
  created_at      timestamptz not null default now(),
  foreign key (matchid, partid) references public.match_assignments(matchid, partid) on delete cascade
);

-- 3.4 location  (changed location details.csv) — ignores the junk pivot columns
create table if not exists public.location (
  id              uuid primary key default gen_random_uuid(),
  matchid         text not null,
  partid          integer not null,
  key             text not null unique,
  review_date     date,
  review_type     text,
  reviewer_code   text,
  hr_code         text,            -- location_HR_code
  squad           text,            -- location_squad
  collector_event text,
  video_timestamp text,
  error_type      text,
  defect_type     text,
  actual_location_diff numeric,
  created_at      timestamptz not null default now(),
  foreign key (matchid, partid) references public.match_assignments(matchid, partid) on delete cascade
);

-- 3.5 impact  (changed impact details.csv) — no review_type / defect_type
create table if not exists public.impact (
  id              uuid primary key default gen_random_uuid(),
  matchid         text not null,
  partid          integer not null,
  key             text not null unique,
  review_date     date,
  reviewer_code   text,
  hr_code         text,            -- impact_HR_code
  squad           text,            -- impact_squad
  collector_event text,
  video_timestamp text,
  error_type      text,
  impact_collector  numeric,
  impact_reviewer   numeric,
  impact_difference numeric,
  created_at      timestamptz not null default now(),
  foreign key (matchid, partid) references public.match_assignments(matchid, partid) on delete cascade
);

-- 3.6 extras  (changed extras details.csv)
create table if not exists public.extras (
  id              uuid primary key default gen_random_uuid(),
  matchid         text not null,
  partid          integer not null,
  key             text not null unique,
  review_date     date,
  review_type     text,
  reviewer_code   text,
  hr_code         text,            -- extras_HR_code
  squad           text,            -- extras_squad
  collector_event text,
  video_timestamp text,
  error_type      text,
  defect_type     text,
  body_part_collector  text,
  body_part_reviewer   text,
  new_extras_collector text,
  new_extras_reviewer  text,
  type_collector       text,
  type_reviewer        text,
  height_collector     text,
  height_reviewer      text,
  technique_collector  text,
  technique_reviewer   text,
  location_collector   text,
  location_reviewer    text,
  created_at      timestamptz not null default now(),
  foreign key (matchid, partid) references public.match_assignments(matchid, partid) on delete cascade
);

-- 3.7 freeze_frame  (Shot Details.csv)
create table if not exists public.freeze_frame (
  id              uuid primary key default gen_random_uuid(),
  matchid         text not null,
  partid          integer not null,
  key             text not null unique,
  review_date     date,            -- a_review_date
  hr_code         text,            -- collector_hr_code
  video_timestamp text,            -- videotimestamp
  avg_ff_score    text,            -- e.g. "100.00%"
  total_errors    numeric,
  player_count    numeric,
  a_shots         numeric,
  changed_shooter  numeric,
  changed_keeper   numeric,
  changed_opponent numeric,
  changed_team     numeric,
  added_player     numeric,
  deleted_player   numeric,
  changed_location numeric,
  added_shot       numeric,
  changed_impact   numeric,
  created_at      timestamptz not null default now(),
  foreign key (matchid, partid) references public.match_assignments(matchid, partid) on delete cascade
);

-- Indexes for "all mistakes for this match/part" lookups.
do $$
declare m text;
declare mods text[] := array['players','event','formation_tactical','location','impact','extras','freeze_frame'];
begin
  foreach m in array mods loop
    execute format('create index if not exists %I on public.%I(matchid, partid);', 'idx_'||m||'_mp', m);
  end loop;
end$$;

-- =============================================================
-- 4. Row Level Security
--    Admin            -> everything
--    Uploader         -> assignments they uploaded
--    Viewer/Collector -> assignments whose hr_code = their own hr_code
-- =============================================================
alter table public.match_assignments enable row level security;

drop policy if exists "ma_select" on public.match_assignments;
create policy "ma_select" on public.match_assignments
  for select using (
    public.current_role() = 'Admin'
    or (public.current_role() = 'Uploader' and uploaded_by = auth.uid())
    or (public.current_role() = 'Viewer'  and hr_code = public.my_hr_code())
  );

drop policy if exists "ma_write" on public.match_assignments;
create policy "ma_write" on public.match_assignments
  for all using ( public.current_role() in ('Admin','Uploader') )
  with check ( public.current_role() in ('Admin','Uploader') );

-- Can the current user SEE this (matchid, partid)?
create or replace function public.assignment_visible(p_matchid text, p_partid integer)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.match_assignments a
    where a.matchid = p_matchid and a.partid = p_partid and (
      public.current_role() = 'Admin'
      or (public.current_role() = 'Uploader' and a.uploaded_by = auth.uid())
      or (public.current_role() = 'Viewer'  and a.hr_code = public.my_hr_code())
    )
  );
$$;

-- Apply identical RLS to all 7 module tables.
do $$
declare m text;
declare mods text[] := array['players','event','formation_tactical','location','impact','extras','freeze_frame'];
begin
  foreach m in array mods loop
    execute format('alter table public.%I enable row level security;', m);

    execute format('drop policy if exists %I on public.%I;', m||'_select', m);
    execute format(
      'create policy %I on public.%I for select using ( public.assignment_visible(matchid, partid) );',
      m||'_select', m
    );

    execute format('drop policy if exists %I on public.%I;', m||'_write', m);
    execute format(
      'create policy %I on public.%I for all
         using ( public.current_role() in (''Admin'',''Uploader'') )
         with check ( public.current_role() in (''Admin'',''Uploader'') );',
      m||'_write', m
    );
  end loop;
end$$;

-- =============================================================
-- 5. (Reference) Upload performs, per module CSV:
--   a) ensure collectors:  upsert collectors(hr_code, name) on conflict (hr_code) do nothing
--   b) upsert match_assignments(matchid, partid, hr_code, date) on conflict (matchid, partid)
--   c) upsert <module>(...) on conflict (key)   -- dedup within the module
-- =============================================================
