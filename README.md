# v59 — Pressure column + Chart labels + Parts count

Three small fixes, all requested from the collector-performance dashboard.

## What's in here

### 1. Weekly Quality Score: Pressure module
The weekly Quality Score CSV includes a `pressure` module but the app was
silently dropping it (missing from `MODULE_COLUMNS`, missing from the table,
missing from the DB schema).

Files:
- `sql/01_weekly_add_pressure.sql` — adds `pressure numeric` column
- `app/api/weekly-quality-upload/route.ts` — accepts `pressure` from CSV, writes it
- `app/(app)/weekly-quality-score/page.tsx` — SELECT includes pressure; friendly
  fallback if the SQL migration hasn't been applied yet
- `components/WeeklyQualityScoreView.tsx` — renders Pressure column in the table

### 2. Quality Score charts: labels + delta % by default
Every point on every line chart on `/quality-score` now shows:
- its score % right above the dot (no more hover-only)
- the change vs the previous point (▲ / ▼ + delta %), colored green/red
Files:
- `components/QualityScoreDashboard.tsx` — LineChart rewritten with taller
  viewbox + always-on value/delta text labels

### 3. Performance Thresholds: parts count next to errors
Errors on their own are hard to read (5 errors on 10 parts vs 200 parts is
very different). The Module Errors table + CSV export now include a Parts
column alongside the module error columns.

Files:
- `app/(app)/performance-thresholds/page.tsx` — pulls `match_part_summary_fast`
  and aggregates parts per hr_code
- `components/PerformanceThresholdsView.tsx` — new Parts column + CSV field

## Deploy order

1. Upload all 6 code files under `app/...` and `components/...` to GitHub main
   at their exact paths (drag-and-drop in the GitHub upload UI).
2. Wait for Vercel to redeploy.
3. In Supabase SQL Editor, run `sql/01_weekly_add_pressure.sql`. The app is
   backwards-compatible — if you don't run the SQL, the weekly page will show
   an amber hint but keep working with pressure as blank.
4. Re-upload the latest weekly Module Score CSV to backfill pressure values.

## Verification

- `npx tsc --noEmit -p .` → 0 errors before this bundle was cut.
- Weekly Quality Score: upload a weekly module CSV that includes rows with
  `module=pressure` → the Pressure column now populates.
- Quality Score: open `/quality-score`, each module chart shows month
  labels above each point + up/down deltas.
- Performance Thresholds: pick a module + threshold, the Module Errors
  table now shows a Parts column.
