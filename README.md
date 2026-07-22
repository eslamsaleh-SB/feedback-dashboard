# v59 — Pressure column + Chart labels + Parts count

Requested from the collector-performance dashboard.

## What's in here

### 1. Weekly Quality Score: Pressure module
Weekly Quality Score CSV includes a `pressure` module. App was silently
dropping it: missing from `MODULE_COLUMNS`, missing from the table, missing
from the DB schema.

Files:
- `sql/01_weekly_add_pressure.sql` — adds `pressure numeric`
- `app/api/weekly-quality-upload/route.ts` — accepts `pressure` from CSV
- `app/(app)/weekly-quality-score/page.tsx` — SELECT includes pressure; friendly
  fallback if the SQL migration hasn't been applied yet
- `components/WeeklyQualityScoreView.tsx` — renders Pressure column

### 2. Quality Score charts: labels + delta % by default
Every point on every line chart on `/quality-score` shows:
- its score % right above the dot (no more hover-only)
- the change vs the previous point (▲ / ▼ + delta %), colored green/red
- delta label sits well above the score label so they don't overlap

Files:
- `components/QualityScoreDashboard.tsx` — LineChart taller viewBox +
  always-on value/delta labels

### 3. Performance Thresholds: parts count next to errors
Errors alone are hard to read (5 errors on 10 parts vs 200 parts is very
different). Module Errors table + CSV export now include a Parts column.

**Fix v2**: earlier attempt aggregated `match_part_summary_fast` client-side
and produced Parts=0 for many collectors. Root cause: that RPC groups by
(matchid, partid) and picks ONE hr_code per part via `max()`, so when two
collectors share a match-part one of them gets 0 parts.

Correct fix: extend `collector_module_totals()` to also return `parts` as
`count(distinct (matchid, partid))` per hr_code, computed server-side.

Files:
- `sql/02_collector_module_totals_add_parts.sql` — new RPC return column
- `app/(app)/performance-thresholds/page.tsx` — reads `parts` from the RPC
  directly (falls back to `matches` if the SQL hasn't been applied yet)
- `components/PerformanceThresholdsView.tsx` — new Parts column + CSV field

### 4. Performance Thresholds: Quality Scores filter list
- Added `Pressure` + `Squad` to the score-filter checkboxes to match the
  module set stored in `quality_scores` (monthly upload).
- Removed the duplicate `Event` row — the monthly upload parser aliases
  `event` → `base`, so both mapped to the same underlying score.

Same file: `components/PerformanceThresholdsView.tsx`.

## Deploy order

1. Upload all code files under `app/...` and `components/...` to GitHub
   main at their exact paths.
2. Wait for Vercel to redeploy.
3. In Supabase SQL Editor, run **both** SQL files in this bundle:
   - `sql/01_weekly_add_pressure.sql`
   - `sql/02_collector_module_totals_add_parts.sql`
4. Re-upload the latest weekly Module Score CSV to backfill pressure values.

## Verification

- `npx tsc --noEmit -p .` → exit 0.
- Upload weekly module CSV with `module=pressure` rows → Pressure column populates.
- `/quality-score` → every module chart shows month labels + up/down deltas
  above each point, delta above score.
- `/performance-thresholds` → Module Errors table shows Parts column with
  distinct (matchid, partid) count per collector (no more 0s where errors > 0).
