# v52 - Quizzes, Weekly Quality Scores, Reports "All Collectors", Thresholds Filters

Big release. Four items in one bundle:

1. **Reports** - new "Send to all collectors" checkbox on `/upload`.
2. **Performance Thresholds** - new Team + Collector filters.
3. **Weekly Quality Scores** - new upload page + view page + DB table.
4. **Quiz feature** - full Google-Forms-like quiz builder, taker, per-collector analytics, auto-grading, manual grading, assignment emails, resend, CSV export.

tsc noEmit clean.

## Deploy order

### 1) Run SQL (in Supabase SQL editor, once)

```
sql/01_weekly_quality_scores.sql
sql/02_quizzes.sql
```

Verify in Table Editor:
- `weekly_quality_scores`
- `quizzes`, `quiz_questions`, `quiz_assignments`, `quiz_submissions`, `quiz_answers`

### 2) Confirm env vars in Vercel Production

Nothing new. These already exist from earlier versions:
- `GMAIL_USER`, `GMAIL_APP_PASSWORD` (for quiz assignment / resend emails)
- `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_APP_URL`

### 3) Push these files (same relative paths as in this folder)

**Sidebar + shared components:**
```
components/Sidebar.tsx
components/UploadForm.tsx
components/PerformanceThresholdsView.tsx
```

**Weekly Quality Scores:**
```
app/api/weekly-quality-upload/route.ts
app/(app)/weekly-quality-upload/page.tsx
app/(app)/weekly-quality-score/page.tsx
components/WeeklyQualityScoreView.tsx
```

**Quiz:**
```
lib/quiz-notify.ts
app/api/admin/quizzes/route.ts
app/api/admin/quizzes/[id]/route.ts
app/api/admin/quizzes/[id]/assignments/route.ts
app/api/admin/quizzes/[id]/resend/route.ts
app/api/admin/quizzes/answers/[id]/route.ts
app/api/quizzes/[id]/submit/route.ts
app/(app)/admin-quizzes/page.tsx
app/(app)/admin-quizzes/new/page.tsx
app/(app)/admin-quizzes/[id]/page.tsx
app/(app)/admin-quizzes/[id]/submissions/[submissionId]/page.tsx
app/(app)/my-quizzes/page.tsx
app/(app)/my-quizzes/[id]/page.tsx
components/QuizBuilder.tsx
components/QuizAnalytics.tsx
components/QuizTaker.tsx
components/QuizResult.tsx
components/SubmissionReview.tsx
```

Commit + push. Vercel builds. Green.

---

## 1) Reports - Send to all collectors

`/upload` (Send Report) now has a checkbox above the collector picker: **Send to all collectors**. When ON:
- The single-collector dropdown is hidden.
- On submit, the client loops over every collector that has an `hr_code` and POSTs `/api/upload` once per collector using the same match name + review date + folder link + notes.
- A progress line shows `Sending... (done/total)`.
- Any failures are counted and the first error is surfaced. The submit does NOT stop on the first error - every collector is attempted.

This only works in "Create new match session" mode (existing sessions are per-collector).

## 2) Performance Thresholds - filters

Two new dropdowns in the top-right control bar (next to Top N):
- **Team** - filters to a single team.
- **Collector** - filters to a single hr_code (respects the Team filter above it).

Both apply BEFORE the threshold logic runs, so the resulting tables and Top N ranking already reflect the filter.

## 3) Weekly Quality Scores

New DB table `weekly_quality_scores` with columns:
- `hr_code`, `week_start_date` (Sunday), `players`, `event`, `formation_tactical`, `location`, `impact`, `extras`, `freeze_frame_score`

Unique on `(hr_code, week_start_date)` so re-uploading the same week overwrites.

Weeks run **Sunday - Saturday**. The upload page snaps any chosen date to the Sunday of that week.

CSV upload: any column named like `hr_code` is required. Optional columns:
```
players, event, formation_tactical, location, impact, extras, freeze_frame_score
```
Percent signs, commas, and quotes are stripped. Both `,` and tab separators are supported.

Two new sidebar entries:
- **Upload Data -> Weekly Quality Score Upload** (Admin, QualityLeader)
- **Performance -> Weekly Quality Score** (all reviewer roles)
- **Collector sidebar -> Weekly Quality Score** (Viewer sees their own rows only)

View page has Week + Team + Collector filters + Export CSV.

## 4) Quiz feature

### Reviewer flow

1. Sidebar -> **Upload Data -> Quizzes** -> `/admin-quizzes`.
2. Click **New quiz**. The builder page opens.
3. Fill title + description. Toggle **Published** when ready (draft mode is hidden from collectors).
4. Add questions. For each: choose a type, prompt, points, options (for MC / Checkbox / MC+Other), correct answer(s), optional Drive video link (renders in the taker), Required flag.
   - Types: `Multiple Choice`, `Checkboxes`, `Short Answer`, `Paragraph`, `Multiple Choice + Other`.
5. Assign collectors - checkboxes plus a **Select all** button and a search box.
6. Save. If Published + assignments exist, every assignee receives an email:
   > **New quiz assigned: {title}** with a CTA that links to `/my-quizzes/{id}`.
7. Open the quiz's detail page. Below the builder you see:
   - **Analytics cards** - Assigned, Completed, Pending, Completion %, Average score, Highest / Lowest.
   - **Filter bar** - Team, Collector, Status (all / completed / pending), From, To, Min score, Max score.
   - **Submissions table** - one row per assignee, filtered by the filters above.
     - Completed rows: **View** link -> `/admin-quizzes/{id}/submissions/{submissionId}`
     - Pending rows: **Resend email** link
   - **Resend to all pending** button (top-right).
   - **Export CSV** of the filtered set.
8. Submission viewer:
   - Shows collector info, timestamp, auto/manual/total scores, %.
   - Per question: prompt, embedded Drive preview (if any), collector's answer, expected correct answer for MC/CB, correct/incorrect badge.
   - For Short Answer / Paragraph questions: reviewer sets **Points awarded** (bounded by max) and **Reviewer notes** - saves on blur, recomputes `manual_score` immediately.

### Collector flow

1. Sidebar -> **Quizzes** -> `/my-quizzes`.
2. Sees only published quizzes assigned to them. Each row shows To do / Completed + score.
3. Open a quiz -> `QuizTaker` renders every question with the right widget type + embedded video preview for questions that have a Drive link.
4. Submit once. Confirmation dialog first. Auto-grade runs server-side. Screen re-renders with results (score, correct/incorrect badges, manual-review notice for text answers).
5. Trying to open a completed quiz again shows the results page, not the taker (single-attempt enforced by unique index + API check).

### Auto-grading rules

- **Multiple Choice** - correct if `selected_options[0] === correct_answers` (string).
- **Multiple Choice + Other** - correct if `selected_options[0] === correct_answers`. If the correct answer is `"Other"`, it counts as correct only when the collector selected `Other` AND provided text.
- **Checkboxes** - correct if the sets match exactly (order-independent).
- **Short Answer / Paragraph** - never auto-graded. `is_correct` stays `null`. Reviewer awards points manually.

Points come from `quiz_questions.points`. `quiz_submissions.total_score = auto_score + manual_score`.

### Email / notification behavior

- **On create with Published=true + assignees** -> notify everyone.
- **On edit that flips draft -> published** -> notify every existing assignee.
- **On adding new assignees while Published** -> notify only the newly added ones.
- **Resend endpoint** (`POST /api/admin/quizzes/[id]/resend`) accepts `{hr_codes: [...]}` or, if omitted, sends to every assignee who has NOT yet submitted.
- All emails use the same Gmail helper as Inquiries + Presentations. Stamps `quiz_assignments.last_notified_at` after send.

### CSV export

`Export CSV` in the analytics view downloads the filtered submissions table with columns:
```
HR Code, Name, Team, Status, Submitted At, Auto Score, Manual Score, Total Score, Max Score
```

### RLS summary

- Reviewers (Admin, Uploader, Supervisor): CRUD on every quiz table.
- Collectors: SELECT on quizzes / questions / assignments where their `hr_code` is on the assignment; INSERT their own submission + answers; SELECT their own results.
- Enforced by `is_reviewer()` helper + `profiles.hr_code = ...` predicate.

---

## Files at a glance

| File | Purpose |
| --- | --- |
| `sql/01_weekly_quality_scores.sql` | Weekly scores table + RLS. |
| `sql/02_quizzes.sql` | 5 quiz tables + RLS + `is_reviewer()` helper. |
| `components/UploadForm.tsx` | Send Report + "Send to all collectors" toggle. |
| `components/PerformanceThresholdsView.tsx` | Threshold view + Team / Collector filters. |
| `components/Sidebar.tsx` | New links: Weekly Quality Score (upload + view), Quizzes (admin + collector). |
| `components/WeeklyQualityScoreView.tsx` | Table view with Week / Team / Collector filters + CSV export. |
| `app/(app)/weekly-quality-upload/page.tsx` | CSV upload page. |
| `app/(app)/weekly-quality-score/page.tsx` | View page (server; paginates rows). |
| `app/api/weekly-quality-upload/route.ts` | Parses CSV/TSV, upserts by `(hr_code, week_start_date)`. |
| `lib/quiz-notify.ts` | Gmail helper for quiz assign / reminder. |
| `app/api/admin/quizzes/*` | Reviewer CRUD + assignments + resend + manual grading. |
| `app/api/quizzes/[id]/submit/route.ts` | Collector submit + auto-grade. |
| `app/(app)/admin-quizzes/*` | Reviewer list + new + detail (builder + analytics) + submission review. |
| `app/(app)/my-quizzes/*` | Collector list + taker + result. |
| `components/QuizBuilder.tsx` | Full builder UI. |
| `components/QuizAnalytics.tsx` | Analytics cards + filters + submissions table + resend + CSV. |
| `components/QuizTaker.tsx` | Collector taker. |
| `components/QuizResult.tsx` | Collector result view after submit. |
| `components/SubmissionReview.tsx` | Reviewer per-submission grading. |

## Verify checklist

- [ ] Run both SQLs.
- [ ] Push files, wait for Vercel green.
- [ ] Reports: open `/upload`, tick "Send to all collectors", pick a Match ID + folder link, submit -> every collector gets their own session.
- [ ] Thresholds: `/performance-thresholds` shows Team + Collector dropdowns.
- [ ] Weekly Quality Scores:
  - Upload a small CSV via `/weekly-quality-upload` (hr_code + a few score columns).
  - Open `/weekly-quality-score` as admin -> row appears with the right week.
  - As collector, open `/weekly-quality-score` -> only that collector's rows show.
- [ ] Quiz end-to-end:
  - Admin `/admin-quizzes -> New` -> add 1 MC + 1 Short Answer + 1 Checkbox question. Select 2 collectors. Publish + Create.
  - Each of the 2 collectors gets an assignment email.
  - Collector `/my-quizzes` shows the quiz -> take + submit -> result page shows.
  - Admin `/admin-quizzes/{id}` shows 1/2 completed (avg + highest/lowest visible).
  - Admin clicks View on the completed row -> grade the short-answer question -> manual_score updates.
  - Admin clicks Resend email on the pending row -> other collector receives a reminder.
  - Admin Export CSV -> file downloads with the filtered rows.
