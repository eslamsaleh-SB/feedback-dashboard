# v43 - Per-module cards + searchable filters + default Year

Follow-up to v42. No SQL.

## Deploy
Copy these files into the repo at the same relative paths and push to `main`:

- `app/(app)/dashboard/page.tsx`
- `app/(app)/quality-score/page.tsx`
- `components/DashboardView.tsx`
- `components/QualityScoreDashboard.tsx`
- `components/AdminReportsView.tsx`
- `components/FeedbackProgress.tsx`

## What changed

### Home (Admin)
- "Total module errors" card replaced with **8 cards**: a Total card plus one card per module (Players / Event / Formation / Tactical / Location / Impact / Extras / Freeze Frame). Each card shows the period total + a green/red trend arrow vs the previous period.
- "Average quality score" card replaced with **per-module quality cards** plus a separate **Freeze Frame** card, each with the same trend treatment.
- Default period is now **Year** (so the page surfaces all data unless the admin narrows it). Month / Quarter / Year switcher unchanged.

### Reports (Admin)
- The **Collector** filter is now a searchable Combobox (type to filter by HR code or name).

### Feedback Progress
- **Team** and **Collector** filters are now searchable Combobox dropdowns instead of a single text input.
- New **Month / Quarter / Year** filter at the top of the page (default Year). All summary cards and the session list scope to the chosen period via `session_date`.

### Quality Score page
- Default period is now **Year**.
- **Team** and **Collector** filters converted to searchable Combobox dropdowns (Team narrows the Collector list).

## Verify after deploy
- Home: load `/dashboard` - you should see Module errors with 8 cards, Quality scores with per-module + Freeze Frame cards, default Year, switch to Month / Quarter to see trends update.
- Reports: open the Collector filter - typing should narrow the list.
- Feedback Progress: default view shows all of this year's sessions; Team / Collector are searchable.
- Quality Score: default Year shows the full year's uploads.
