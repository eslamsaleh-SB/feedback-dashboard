# v59 bundle — deploy notes

Everything below has been type-checked with `npx tsc --noEmit -p .` = exit 0.
Upload the whole tree (code files at their exact repo paths) to GitHub main,
wait for Vercel, then run the SQL in the order below.

## Scope

1. **Weekly Quality Score: Pressure module column**
   `weekly_quality_scores` was missing a `pressure` column; the upload parser
   silently dropped rows for that module.
2. **Quality Score charts: labels + delta % by default**
   Every line chart on `/quality-score` now shows each point's `%` and a
   green/red ▲/▼ delta vs the previous point. Delta sits above the score.
3. **Performance Thresholds: Parts column**
   Module Errors table + CSV now include a per-collector Parts count
   (`count(distinct (matchid, partid))` per hr_code). Also added Pressure +
   Squad rows to the Quality Scores filter, and removed the duplicate
   `Event` row (parser aliases `event` → `base`).
4. **Send Report / module upload fixes**
   Client picker keyed on hr_code (was undefined), match_sessions insert
   uses `hr_code` (v56 dropped `collector_id`), module upload no longer
   writes the dropped `actor_id`.
5. **Six stored SQL functions still saying 'Uploader'**
   `alter type ... rename value` doesn't rewrite function bodies — patched.
6. **Four remaining stale `collectors` refs** across `/my-reports`,
   `/dashboard`, `/module-upload`, `/api/session-notify`.
7. **Reply blocks: dark-mode contrast fix**
   Sky-50 backgrounds now have `dark:` variants.
8. **Quiz + Presentation: assign date**
   New `assigned_date` column (defaults to today) with picker in the
   Quiz/Presentation builders, shown next to titles on admin + collector
   lists. Backfill inserts today's date on the existing 1 quiz + 1
   presentation.
9. **/api/inquiries/followup — DISABLED stub**
   Collector reply-back on inquiries was scoped out. The route returns 404
   and the SQL file `05_...` is a no-op. Safe to leave, safe to delete
   later.

## Deploy order

1. Upload every file under `app/...` and `components/...` to GitHub main
   (drag-and-drop preserving the folder shape). Vercel redeploys.
2. In Supabase SQL Editor, run in order:
   1. `sql/01_weekly_add_pressure.sql`
   2. `sql/02_collector_module_totals_add_parts.sql`
   3. `sql/03_rename_uploader_in_functions.sql`
   4. `sql/04_quizzes_presentations_assigned_date.sql`
   5. (skip `sql/05_...` — no-op, scoped out)
3. Re-upload the latest weekly Module Score CSV to backfill pressure values.

## Verification

- `/quality-score` — every module chart shows month labels + green/red
  ▲/▼ deltas above each point.
- `/performance-thresholds` — Module Errors table now has a Parts column;
  Pressure + Squad appear in the Quality Scores filter; Event is gone.
- `/send-report` (from admin) — sending to a v57-created collector no
  longer throws "No matching collector records" and no longer errors on
  `actor_id` when uploading errors.
- `/my-reports` (as Jimmy or any Viewer) — reports render, no
  "not linked" banner.
- `/quality-score` reply blocks — reviewer reply text is readable in dark
  mode.
- `/admin-quizzes/new` + `/admin-presentations/new` — Assign date picker,
  defaults to today.
- `/my-quizzes` + `/my-presentations` — "Assigned YYYY-MM-DD" line.
