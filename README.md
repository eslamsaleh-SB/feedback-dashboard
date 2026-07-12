# v50 - Fix "June not showing" (Supabase row limit)

## Root cause

The Quality Score / Dashboard / Performance Thresholds pages query
`quality_scores` (and `freeze_frame_scores`) with a date range filter and
`.order("upload_month", { ascending: true })` but no explicit `.limit()`.

PostgREST / Supabase caps the response at ~1,000 rows when no limit is set.
Your DB has:

- `2026-05-01` -> 2972 rows
- `2026-06-01` -> 1930 rows

The query returned only ~1,671 May rows (all it could fit under the cap)
sorted ASC by month, so June never made it into the payload. Result: cards
and charts showed May data only, and looked like your June upload wasn't
reflected.

## Fix

Added `.limit(50000)` to every unbounded `quality_scores` /
`freeze_frame_scores` fetch. 50000 is well above any realistic monthly
volume and stays under PostgREST's hard ceiling.

## Files to push

- `app/(app)/dashboard/page.tsx`
- `app/(app)/quality-score/page.tsx`
- `app/(app)/performance-thresholds/page.tsx`
- `components/QualityScoreDashboard.tsx` *(dark-mode chart fix)*

No SQL. No env-var changes.

## Dark-mode chart fix (also in this update)

The LineChart used a hard-coded `#0f172a` (near-black) stroke. On the
dark background the line + dots + area fill all disappeared. Changed the
default color to `currentColor` and wrapped the SVG in
`text-slate-800 dark:text-slate-100`, so the chart flips its stroke and
dot colour automatically between light and dark mode. The freeze-frame
chart still uses its explicit sky colour and reads clearly in both modes.
Axis labels also use `fill-slate-500 dark:fill-slate-400` so tick text
stays legible.

## Verify

After deploy, open `/quality-score?from=2026-05-01&to=2026-06-30`. You
should now see:

- Header still says "Average for 2026-05-01 to 2026-06-30".
- Cards should shift because they now include June rows in the average.
- "Module scores over time" charts should show **two** dots per module
  (May 2026 and Jun 2026), joined by a line.

Also verify Dashboard and Performance Thresholds pages: numbers should
change to reflect the full month range.
