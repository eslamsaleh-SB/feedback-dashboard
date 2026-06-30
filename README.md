# v47 - CSV export + uniform From/To date filters

Two changes:

1. **CSV export** on the Performance Thresholds page. Each result table
   (Module Errors / Quality Scores) now has an "Export CSV" button that
   downloads the currently visible rows + columns with the threshold
   annotations included in the header.
2. **Uniform date filtering.** Every page with a date filter is now a
   plain `From` / `To` date-range pair. Pages that previously used
   Month / Quarter / Year buttons (Dashboard, Quality Score, Feedback
   Progress) have been converted. Performance Thresholds and Match
   Total Per Module already used `from` / `to` and are unchanged.

No SQL. No env-var changes.

## Files to push

- `app/(app)/dashboard/page.tsx`
- `app/(app)/quality-score/page.tsx`
- `components/DashboardView.tsx`
- `components/QualityScoreDashboard.tsx`
- `components/FeedbackProgress.tsx`
- `components/PerformanceThresholdsView.tsx`

## Per-page behavior

### Dashboard (`/dashboard`)

- Replaces the Month / Quarter / Year buttons with **From** + **To** inputs +
  an **Apply** button. Default range = Jan 1 of the current year through
  today.
- The "previous period" used for the green/red trend arrows is now computed
  as the **same-length window immediately before From**. Example: From
  2026-04-01 to 2026-06-30 (91 days) compares against 2026-01-01 to
  2026-03-31. The header shows `vs <prev range>` so it's explicit.

### Quality Score (`/quality-score`)

- Replaces Period + Year + Month / Quarter selectors with **From** + **To**
  inputs + Apply. Team + Collector filters unchanged. Default range = Jan 1
  to today.
- `upload_month` rows are filtered to those that fall in the chosen window
  (month boundaries inclusive).

### Feedback Progress (`/feedback-progress`)

- Replaces the Month / Quarter / Year buttons with **From** + **To** inputs.
  Default range = Jan 1 to today. Team + Collector + Status filters kept.
- Session list and summary cards both scope to the date range.

### Performance Thresholds (`/performance-thresholds`)

- Already had From / To from v46. v47 adds an **Export CSV** button next to
  each table title.
- The Module Errors CSV columns: `HR Code, Name, Team, <Module> (>= N)...`
  with one column per selected module. Each row is one matched collector
  and the raw error count for that module in the chosen window.
- The Quality Scores CSV columns: `HR Code, Name, Team, <Module> (<= N%)...`
  with the collector's average score (two decimal places) in the chosen
  window per selected module. Missing data renders as an empty cell.
- File names embed the date range, e.g.
  `module-errors_2026-01-01_to_2026-06-30.csv`.
- The button is disabled when no collectors match.
- The CSV uses a UTF-8 BOM so Excel opens it with correct encoding without
  any prompts.

## Verify after deploy

1. Open `/dashboard` - confirm From / To inputs are shown and changing them
   refreshes the page. Trend arrows are computed vs the previous
   same-length window (e.g. set From/To to one month, trend compares to the
   prior month).
2. Open `/quality-score` - confirm From / To inputs replace the old period
   dropdowns. Team + Collector still work and combine with the range.
3. Open `/feedback-progress` - confirm From / To inputs are present. Status,
   Team and Collector filters all combine with the range.
4. Open `/performance-thresholds`, set a Module Errors threshold (e.g.
   Players >= 100), click **Export CSV** on the Module Errors table. The
   file downloads, opens cleanly in Excel, and contains the same rows the
   table shows.
5. Repeat with Quality Scores filter enabled (e.g. Base <= 90%).
