-- Quiz feature
-- Tables:
--   quizzes                  -> quiz metadata
--   quiz_questions           -> questions in a quiz (ordered)
--   quiz_assignments         -> which collectors were assigned
--   quiz_submissions         -> one row per (quiz, collector) attempt (unique)
--   quiz_answers             -> per-question answer within a submission
--
-- Question types: 'multiple_choice', 'checkboxes', 'short_answer', 'paragraph', 'multiple_choice_other'
--
-- Grading:
--   * Objective types (multiple_choice, checkboxes, multiple_choice_other) auto-grade
--     against `correct_answers` on submit.
--   * Text types (short_answer, paragraph) never auto-grade; reviewer can set
--     `points_awarded` and `reviewer_notes` on each answer row.
--   * `quiz_submissions.total_score` is auto_score + sum(points_awarded) on
--     manual-graded answers.

create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  created_by uuid references auth.users(id) on delete set null,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  question_order int not null,
  question_type text not null check (
    question_type in ('multiple_choice','checkboxes','short_answer','paragraph','multiple_choice_other')
  ),
  prompt text not null,
  options jsonb,               -- for MC / Checkbox / MC_other: array of strings
  correct_answers jsonb,       -- MC: single string. Checkbox: array. MC_other: single string or "Other"
  points int not null default 1,
  video_link text,             -- optional Drive link
  drive_file_id text,          -- extracted from video_link
  required boolean not null default true,
  created_at timestamptz not null default now(),
  unique (quiz_id, question_order)
);
create index if not exists idx_quiz_questions_quiz on public.quiz_questions (quiz_id);

create table if not exists public.quiz_assignments (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  hr_code text not null,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  last_notified_at timestamptz,
  unique (quiz_id, hr_code)
);
create index if not exists idx_quiz_assignments_quiz on public.quiz_assignments (quiz_id);
create index if not exists idx_quiz_assignments_hr on public.quiz_assignments (hr_code);

create table if not exists public.quiz_submissions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  hr_code text not null,
  submitted_at timestamptz not null default now(),
  auto_score numeric not null default 0,
  manual_score numeric not null default 0,
  total_score numeric generated always as (auto_score + manual_score) stored,
  max_score numeric not null default 0,
  unique (quiz_id, hr_code)
);
create index if not exists idx_quiz_submissions_quiz on public.quiz_submissions (quiz_id);

create table if not exists public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.quiz_submissions(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  answer_text text,
  selected_options jsonb,      -- for MC/Checkbox/MC_other: array of picked strings
  other_text text,             -- for MC_other: the free-form "Other" text
  is_correct boolean,
  points_awarded numeric not null default 0,
  reviewer_notes text,
  unique (submission_id, question_id)
);
create index if not exists idx_quiz_answers_sub on public.quiz_answers (submission_id);
create index if not exists idx_quiz_answers_q on public.quiz_answers (question_id);

-- --------- RLS ---------
alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_assignments enable row level security;
alter table public.quiz_submissions enable row level security;
alter table public.quiz_answers enable row level security;

-- Reviewer helper: Admin, Uploader, Supervisor.
create or replace function public.is_reviewer()
returns boolean language sql stable as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('Admin','Uploader','Supervisor')
  );
$$;

-- quizzes: reviewers CRUD; collectors SELECT rows they're assigned to.
drop policy if exists quizzes_reviewer_all on public.quizzes;
create policy quizzes_reviewer_all on public.quizzes
  for all using (public.is_reviewer()) with check (public.is_reviewer());

drop policy if exists quizzes_assigned_select on public.quizzes;
create policy quizzes_assigned_select on public.quizzes
  for select using (
    exists (
      select 1
      from public.quiz_assignments a
      join public.profiles p on p.hr_code = a.hr_code
      where a.quiz_id = public.quizzes.id
        and p.id = auth.uid()
    )
  );

-- quiz_questions: reviewers CRUD; collectors SELECT for assigned quizzes.
drop policy if exists quiz_questions_reviewer_all on public.quiz_questions;
create policy quiz_questions_reviewer_all on public.quiz_questions
  for all using (public.is_reviewer()) with check (public.is_reviewer());

drop policy if exists quiz_questions_assigned_select on public.quiz_questions;
create policy quiz_questions_assigned_select on public.quiz_questions
  for select using (
    exists (
      select 1
      from public.quiz_assignments a
      join public.profiles p on p.hr_code = a.hr_code
      where a.quiz_id = public.quiz_questions.quiz_id
        and p.id = auth.uid()
    )
  );

-- quiz_assignments: reviewers CRUD; collectors SELECT their own.
drop policy if exists quiz_assignments_reviewer_all on public.quiz_assignments;
create policy quiz_assignments_reviewer_all on public.quiz_assignments
  for all using (public.is_reviewer()) with check (public.is_reviewer());

drop policy if exists quiz_assignments_collector_select on public.quiz_assignments;
create policy quiz_assignments_collector_select on public.quiz_assignments
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.hr_code = public.quiz_assignments.hr_code
    )
  );

-- quiz_submissions: reviewers CRUD; collectors SELECT + INSERT their own.
drop policy if exists quiz_submissions_reviewer_all on public.quiz_submissions;
create policy quiz_submissions_reviewer_all on public.quiz_submissions
  for all using (public.is_reviewer()) with check (public.is_reviewer());

drop policy if exists quiz_submissions_collector_select on public.quiz_submissions;
create policy quiz_submissions_collector_select on public.quiz_submissions
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.hr_code = public.quiz_submissions.hr_code
    )
  );

drop policy if exists quiz_submissions_collector_insert on public.quiz_submissions;
create policy quiz_submissions_collector_insert on public.quiz_submissions
  for insert with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.hr_code = public.quiz_submissions.hr_code
    )
  );

-- quiz_answers: reviewers CRUD; collectors SELECT + INSERT their own via submission.
drop policy if exists quiz_answers_reviewer_all on public.quiz_answers;
create policy quiz_answers_reviewer_all on public.quiz_answers
  for all using (public.is_reviewer()) with check (public.is_reviewer());

drop policy if exists quiz_answers_collector_select on public.quiz_answers;
create policy quiz_answers_collector_select on public.quiz_answers
  for select using (
    exists (
      select 1
      from public.quiz_submissions s
      join public.profiles p on p.hr_code = s.hr_code
      where s.id = public.quiz_answers.submission_id
        and p.id = auth.uid()
    )
  );

drop policy if exists quiz_answers_collector_insert on public.quiz_answers;
create policy quiz_answers_collector_insert on public.quiz_answers
  for insert with check (
    exists (
      select 1
      from public.quiz_submissions s
      join public.profiles p on p.hr_code = s.hr_code
      where s.id = public.quiz_answers.submission_id
        and p.id = auth.uid()
    )
  );

drop trigger if exists quizzes_touch on public.quizzes;
create trigger quizzes_touch
  before update on public.quizzes
  for each row execute function public.set_updated_at();
