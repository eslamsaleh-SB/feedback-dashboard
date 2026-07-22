-- v59: add explicit `assigned_date` (date) to quizzes + presentations so the
-- admin can pick when the item should show as "assigned" (separate from
-- created_at timestamp). Backfill existing rows to today.

alter table public.quizzes
  add column if not exists assigned_date date not null default current_date;

alter table public.presentations
  add column if not exists assigned_date date not null default current_date;

-- Backfill (defensive) — the default handles new inserts, but any pre-existing
-- rows created before the column existed will get today's date here.
update public.quizzes       set assigned_date = current_date where assigned_date is null;
update public.presentations set assigned_date = current_date where assigned_date is null;

-- Quick sanity check
select 'quizzes' as t, id, title, assigned_date from public.quizzes order by created_at desc limit 5;
select 'presentations' as t, id, title, assigned_date from public.presentations order by created_at desc limit 5;
