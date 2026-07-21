-- v56 P3 (v56c) - Repoint the 6 FKs off `collectors`, correctly this time.
--
-- Fix for 2BP01 (policy ms_select depended on collector_id): drop the policy
-- FIRST, then the column, then recreate the policy keyed on hr_code.
--
-- Also drops any other policies referencing collector_id via a generic sweep.

-- 1) match_sessions - remap collector_id (uuid) -> hr_code (text) keyed at users.

-- 1a) Add hr_code + backfill from the OLD collectors table.
alter table public.match_sessions
  add column if not exists hr_code text;

update public.match_sessions ms
   set hr_code = c.hr_code
  from public.collectors c
 where c.id = ms.collector_id
   and ms.hr_code is null;

-- 1b) Drop every RLS policy on match_sessions - we rebuild from scratch below
-- with hr_code-based predicates. This side-steps hidden dependencies.
do $$
declare
  p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename  = 'match_sessions'
  loop
    execute format('drop policy if exists %I on public.match_sessions', p.policyname);
  end loop;
end$$;

-- 1c) Drop old FK constraints on collector_id.
alter table public.match_sessions
  drop constraint if exists match_sessions_collector_id_users_fkey;
alter table public.match_sessions
  drop constraint if exists match_sessions_collector_id_fkey;

-- 1d) Drop the column. Nothing depends on it now.
alter table public.match_sessions
  drop column if exists collector_id;

-- 1e) Add the new FK on hr_code.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'match_sessions_hr_code_users_fkey'
  ) then
    alter table public.match_sessions
      add constraint match_sessions_hr_code_users_fkey
      foreign key (hr_code) references public.users(hr_code) on delete set null;
  end if;
end$$;

create index if not exists idx_match_sessions_hr_code
  on public.match_sessions (hr_code);

-- 1f) Recreate the RLS policies with hr_code-based predicates.
alter table public.match_sessions enable row level security;

drop policy if exists ms_reviewer_all on public.match_sessions;
create policy ms_reviewer_all on public.match_sessions
  for all
  using (
    exists (
      select 1 from public.users p
      where p.id = auth.uid()
        and p.role in ('Admin'::user_role, 'Uploader'::user_role, 'Supervisor'::user_role)
    )
  )
  with check (
    exists (
      select 1 from public.users p
      where p.id = auth.uid()
        and p.role in ('Admin'::user_role, 'Uploader'::user_role, 'Supervisor'::user_role)
    )
  );

drop policy if exists ms_owner_select on public.match_sessions;
create policy ms_owner_select on public.match_sessions
  for select
  using (
    exists (
      select 1 from public.users p
      where p.id = auth.uid()
        and p.hr_code = public.match_sessions.hr_code
    )
  );

-- 2) Denormalized actor_id on 4 metrics tables (hr_code already there).
alter table public.module_totals
  drop constraint if exists module_totals_actor_id_fkey;
alter table public.module_totals
  drop column if exists actor_id cascade;

alter table public.quality_scores
  drop constraint if exists quality_scores_actor_id_fkey;
alter table public.quality_scores
  drop column if exists actor_id cascade;

alter table public.freeze_frame_scores
  drop constraint if exists freeze_frame_scores_actor_id_fkey;
alter table public.freeze_frame_scores
  drop column if exists actor_id cascade;

alter table public.feedback_attendees
  drop constraint if exists feedback_attendees_actor_id_fkey;
alter table public.feedback_attendees
  drop column if exists actor_id cascade;

-- 3) users.collector_id - no longer needed.
alter table public.users
  drop constraint if exists profiles_collector_id_fkey;
alter table public.users
  drop column if exists collector_id cascade;
