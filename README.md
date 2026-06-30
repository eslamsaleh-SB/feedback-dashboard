# v46 - Performance Thresholds page

A new admin/reviewer view that filters collectors by per-module thresholds
on either Module Errors, Quality Scores, or both, scoped to a date range.

No SQL.

## Deploy

Copy these files into the repo at the same relative paths and push to `main`:

- `app/(app)/performance-thresholds/page.tsx` *(new)*
- `components/PerformanceThresholdsView.tsx` *(new)*
- `components/Sidebar.tsx` *(adds "Performance Thresholds" entry under Performance)*

## How it works

Sidebar -> **Performance -> Performance Thresholds** -> `/performance-thresholds`
(visible to Admin / Uploader / Supervisor).

### Filters

1. **Date range** - From / To inputs at the top. Defaults to **Jan 1 of the
   current year -> today**. Clicking *Apply date range* re-renders the page
   server-side (the underlying SQL queries use this range).
2. **Match logic** - dropdown: *Any selected criterion* (default) or *All
   selected criteria*. Determines whether a collector must trip at least one
   threshold or every threshold to appear in the result.
3. **Module Errors filter** *(toggle checkbox)* - one row per module
   (Players / Event / Formation-Tactical / Location / Impact / Extras /
   Freeze Frame). Each row has its own checkbox plus a numeric input.
   A criterion is "active" when both the master toggle is on, the module
   row is checked, and a value is entered. The criterion fires when the
   collector's error count in that module is **at or above** the threshold.
4. **Quality Scores filter** *(toggle checkbox)* - one row per scored
   module (Base / Players / Event / Formation-Tactical / Location / Impact
   / Extras / Freeze Frame). Same checkbox + numeric input pattern (0-100,
   step 0.1). The criterion fires when the collector's **average** quality
   score across the date range is **at or below** the threshold.

### Result tables

- The **Module Errors** table renders only when at least one Module Errors
  criterion is active. Columns: HR Code, Name, Team, then one column per
  selected module showing the collector's error count. Values that meet or
  exceed the threshold are bolded red.
- The **Quality Scores** table renders only when at least one Quality
  Scores criterion is active. Columns: HR Code, Name, Team, then one column
  per selected module showing the collector's average score. Values at or
  below the threshold are bolded red.
- If both filters are active, both tables render. If only one is active,
  only that one renders. If none are active, the page shows
  "Pick at least one module and enter a threshold to see results."

### Data sources

- Module Errors comes from the existing `collector_module_totals(p_from, p_to)`
  RPC (one row per collector with each module column as a sum across matches
  in the date range).
- Quality Scores comes from `public.quality_scores` (one row per collector
  per module per `upload_month`) filtered to months that overlap the date
  range, plus `public.freeze_frame_scores` for the synthetic Freeze Frame
  card. Multiple monthly rows are averaged per (hr_code, module).

## Verify after deploy

- Open the page. Default date range is this year -> today; default filter is
  Module Errors **on**, Quality Scores **off**.
- Check the **Players** module box and enter e.g. `100`. The Module Errors
  table renders with HR Code / Name / Team / Players. Anyone with >= 100
  Players errors in the date range shows up.
- Check additionally **Event** with `50`. Match logic = Any -> a collector
  needs >= 100 Players OR >= 50 Event errors to appear. Switch to All ->
  the collector must hit both.
- Toggle Quality Scores on, check **Base** with `90`. Now both tables
  render. The Quality Scores table lists each matched collector's Base
  score in red if it's at or below 90%.
- Set From and To to a different window and click *Apply date range*.
  The underlying numbers refresh.
