-- =============================================================
-- VIDEO FEEDBACK DASHBOARD — v4 migration
-- Relational "matches + 7 modules" model + per-module deduplication.
--
-- Run this whole file in: Supabase Dashboard > SQL Editor.
-- Safe to run on top of v1 + v2 + v3 (uses IF NOT EXISTS / IF EXISTS).
-- Reuses helpers from earlier migrations:
--   public.current_role()      -> Admin | Uploader | Viewer
--   public.my_collector_id()   -> the collector linked to the logged-in user
-- =============================================================

-- =============================================================
-- 1. matches  (one row per reviewed match — the parent table)
--    match_id is a TEXT business key supplied in the uploaded CSV
--    (e.g. 'M-2026-014'), so the 7 module tables can reference it.
-- =============================================================
create table if not exists public.matches (
  match_id     text        primary key,
  collector_id uuid        not null references public.collectors(id) on delete cascade,
  date         date        not null default current_date,
  uploaded_by  uuid        references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_matches_collector on public.matches(collector_id);
create index if not exists idx_matches_date      on public.matches(date);

-- =============================================================
-- 2. The 7 module (child) tables.
--    Every child table has:
--      * match_id  -> FK to matches(match_id)
--      * key       -> the dedup key (UNIQUE *within this table only*)
--      * fixed text columns to hold the rest of each CSV row
--    The same mistake "key" may appear in different modules, but never
--    twice inside the same module (enforced by the UNIQUE constraint).
--
--    NOTE: the CSV column that holds `key` is NOT the same across the
--    different module CSVs — the Admin uploader maps it at import time,
--    so the storage schema below is intentionally uniform.
-- =============================================================
do $$
declare
  m text;
  modules text[] := array[
    'players',
    'event',
    'formation_tactical',
    'location',
    'impact',
    'extras',
    'freeze_frame'
  ];
begin
  foreach m in array modules loop
    execute format($f$
      create table if not exists public.%I (
        id             uuid        primary key default gen_random_uuid(),
        match_id       text        not null references public.matches(match_id) on delete cascade,
        key            text        not null,
        review_date    date,
        description    text,
        category       text,
        severity       text,
        video_timestamp text,
        notes          text,
        created_at     timestamptz not null default now(),
        -- Deduplication: a key can never be duplicated within this module.
        constraint %I unique (key)
      );
    $f$, m, m || '_key_unique');

    -- Helpful index for "all mistakes for this match" lookups (View 1).
    execute format(
      'create index if not exists %I on public.%I(match_id);',
      'idx_' || m || '_match', m
    );
  end loop;
end$$;

-- =============================================================
-- 3. Row Level Security
--    Admin            -> global view (everything)
--    Uploader         -> matches they uploaded
--    Viewer/Collector -> only their own assigned matches
-- =============================================================
alter table public.matches enable row level security;

drop policy if exists "matches_select" on public.matches;
create policy "matches_select" on public.matches
  for select using (
    public.current_role() = 'Admin'
    or (public.current_role() = 'Uploader' and uploaded_by = auth.uid())
    or (public.current_role() = 'Viewer'  and collector_id = public.my_collector_id())
  );

drop policy if exists "matches_insert" on public.matches;
create policy "matches_insert" on public.matches
  for insert with check (
    public.current_role() in ('Admin', 'Uploader')
  );

drop policy if exists "matches_update" on public.matches;
create policy "matches_update" on public.matches
  for update using (
    public.current_role() = 'Admin' or uploaded_by = auth.uid()
  ) with check (
    public.current_role() = 'Admin' or uploaded_by = auth.uid()
  );

drop policy if exists "matches_delete" on public.matches;
create policy "matches_delete" on public.matches
  for delete using ( public.current_role() = 'Admin' );

-- Can the current user SEE this match? (mirrors matches_select)
create or replace function public.match_visible(mid text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.matches m
    where m.match_id = mid and (
      public.current_role() = 'Admin'
      or (public.current_role() = 'Uploader' and m.uploaded_by = auth.uid())
      or (public.current_role() = 'Viewer'  and m.collector_id = public.my_collector_id())
    )
  );
$$;

-- Apply identical RLS to all 7 module tables.
do $$
declare
  m text;
  modules text[] := array[
    'players','event','formation_tactical','location','impact','extras','freeze_frame'
  ];
begin
  foreach m in array modules loop
    execute format('alter table public.%I enable row level security;', m);

    execute format('drop policy if exists %I on public.%I;', m || '_select', m);
    execute format(
      'create policy %I on public.%I for select using ( public.match_visible(match_id) );',
      m || '_select', m
    );

    execute format('drop policy if exists %I on public.%I;', m || '_write', m);
    execute format(
      'create policy %I on public.%I for all
         using ( public.current_role() in (''Admin'',''Uploader'') )
         with check ( public.current_role() in (''Admin'',''Uploader'') );',
      m || '_write', m
    );
  end loop;
end$$;

-- =============================================================
-- 4. (Reference) The upsert the Admin uploader performs per module:
--
--   -- parent (one per distinct match_id in the CSV):
--   upsert into matches (match_id, collector_id, date)
--     on conflict (match_id) do update ...
--
--   -- child rows (deduplicated by key):
--   supabase.from('<module>').upsert(rows, { onConflict: 'key' })
--
-- Because each module table has UNIQUE(key), re-uploading a CSV with a
-- duplicate key overwrites the existing row instead of inserting a copy.
-- =============================================================
