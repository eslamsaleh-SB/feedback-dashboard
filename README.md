# v54 - Chart order + trend arrows + collector bar-chart color

## Files (all in this folder, mirror to the same paths in the repo)

```
components/QualityScoreDashboard.tsx     # left-to-right chart + green/red segments + up/down arrows + freeze frame flips with dark mode
components/CollectorDashboard.tsx        # "Mistakes by module" bar color uses bg-emerald-500 in dark mode
components/AnalyticsDashboard.tsx        # same bar-color fix on admin analytics
```

## Deploy

Push all three files. No SQL. No env vars. Vercel builds. Refresh
`/quality-score` and `/analytics`.

## What you'll see after deploy

- Quality Score module charts read May 2026 -> June 2026 -> July 2026 left to
  right (oldest -> newest).
- Between every pair of months the line is green if the score went up, red if
  it went down.
- Each point has a tiny up-triangle (green) if better than previous month, or
  a down-triangle (red) if worse. The first point has no triangle (no baseline).
- Freeze Frame chart uses the same color logic and flips light/dark with the
  page.
- Home page "Mistakes by module" bars are green in dark mode (were invisible
  slate-900 before).
