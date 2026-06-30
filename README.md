# v49 - Dashboard polish + Dark Mode

No SQL. No env-var changes.

## Files to push

- `tailwind.config.ts` (enables `darkMode: "class"`)
- `app/globals.css` (dark-mode body background/text)
- `app/layout.tsx` (no-flash theme bootstrap in `<head>`)
- `app/(app)/layout.tsx` (dark variants on the shell)
- `app/(app)/dashboard/page.tsx` (compareTo logic, shifted prev range)
- `components/DashboardView.tsx` (trend fix, compareTo picker, reorder, collapsibles, dark variants)
- `components/Sidebar.tsx` (dark variants + ThemeToggle button)
- `components/ThemeToggle.tsx` *(new)*

## What changed

### Trend arrows fix

Old code: when the previous period had zero data, the formula returned
`(curr - 0) / 0 * 100` and we clamped to `100%`. Result: every card
showed "↑ 100%" the first time you used the app. Fixed:

- `prev == 0 && curr == 0` -> "no change"
- `prev == 0 && curr > 0` -> renders the grey "no baseline" hint instead
  of a misleading 100%
- normal `prev > 0` case unchanged

### Comparison picker (Last month / quarter / year)

Dashboard now has a **Compare to** dropdown next to From / To:

- *Last month* (default) - shifts the `[from, to]` window back by 1
  calendar month
- *Last quarter* - shifts back by 3 calendar months
- *Last year* - shifts back by 1 year

A small line under the filter bar shows the exact previous window the
cards are comparing against. Persisted in `?compare=` URL param.

### Header date label fix

Removed the "vs YYYY-MM-DD to YYYY-MM-DD" string that lived next to the
Apply button (it was easy to mistake for today's date). The current
date sits cleanly under the page title; the comparison context now
lives directly under the filter bar as
*"Comparing against previous month: 2026-02-01 to 2026-03-31"*.

### Layout reorder + collapsible sections

New order:
1. Top stats - Submitted Reports / Collectors / Open Notes
2. Feedback Sessions (5 cards) - directly below the top stats
3. **Module Errors** - now a collapsible card with a chevron toggle
4. **Quality Scores** - same collapsible treatment

Click the chevron on the right of either section header to collapse / expand.

### Dark Mode

Sidewide light / dark theme:

- `tailwind.config.ts` enables Tailwind's `class` strategy.
- A tiny inline script in `<head>` reads `localStorage.theme` (or the
  OS preference) and applies `.dark` to `<html>` **before** React
  hydrates. No white flash.
- A **theme toggle button** lives at the bottom of the sidebar (shows
  the opposite mode's name). Click flips the theme and persists the
  choice.
- Dark variants applied to: app shell, sidebar, dashboard cards /
  collapsibles, header.

If you want to extend dark mode to other pages later, the pattern is
the same: add `dark:` classes on backgrounds (`bg-slate-900`),
borders (`border-slate-800`) and text (`text-slate-100`).

### UI polish

- Header tightened (page title + date stacked, filters right-aligned).
- All cards share one rounded / border treatment with hover state.
- Sidebar nav row now uses the same active / inactive pattern in both
  themes.
- Numbers render with `tabular-nums` where they appear in tables (no
  change needed - already in PerformanceThresholds).

## Verify

1. Open `/dashboard`. Bottom of the sidebar shows a **Dark** /
   **Light** button. Click it - whole UI flips. Reload - theme stays.
2. Comparison: pick `Compare to: Last quarter`, click Apply. The line
   under the filter bar should now say "Comparing against previous
   quarter (same dates, -3 months): <prev-from> to <prev-to>". The
   trend arrows on the cards update accordingly.
3. Trend correctness: pick a date range that has zero data in the
   previous window. Cards now show "no baseline" instead of "↑ 100%".
4. Layout: scroll the page - Feedback Sessions appears directly under
   the top stats; Module Errors and Quality Scores live below it as
   collapsible cards. Click the chevron to collapse; click again to
   expand.
