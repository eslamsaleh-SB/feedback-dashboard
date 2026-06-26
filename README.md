# v42 - Reports + Home + Feedback Progress + Quality batch

A single batch covering the requested updates across Reports, Notes, Home dashboard, Feedback Progress, Quality Upload, and Quality Score pages.

## Deploy order

1. **Run SQL `sql/01_note_replies.sql`** in the Supabase SQL editor.
   Adds `reply_text`, `replied_at`, `replied_by` columns to `session_notes` so admin replies can be stored.
2. *(Optional, recommended)* **Run SQL `sql/02_session_videos_unique.sql`**.
   Removes any duplicate `session_videos` rows that may have been inserted in the past, then adds a unique constraint on `(match_session_id, drive_file_id)` as a safety net behind the app-level dedupe.
3. Copy the files in this package into the repo at the same relative paths and push to `main` (Vercel auto-deploys).

No env-var changes. Existing `SUPABASE_SERVICE_ROLE_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `EMAIL_FROM` are used.

## What changed

### Reports

| # | Change | Files |
| - | --- | --- |
| 1 | Videos are now deduped when adding from the same folder (skipped duplicates are reported back to the admin). | `app/api/upload/route.ts`, `components/UploadForm.tsx` |
| 2 | When adding a match that already has a report for the same collector, the new videos are appended to the existing report and the admin is told "this match already had a report - the videos were added to the existing one". | `app/api/upload/route.ts`, `components/UploadForm.tsx` |
| 3 | Admin Reports: real **Collector** dropdown filter (case-insensitive selection by HR code), new **Acknowledgement** filter (All / Acknowledged / Not Acknowledged), existing Note Status filter kept. | `app/(app)/admin-reports/page.tsx`, `components/AdminReportsView.tsx` |
| 4 | Admin Reports: 5 summary cards across the top - Total / Not Acknowledged / Acknowledged / Incomplete Notes / Completed Reports. | `components/AdminReportsView.tsx` |
| 5 | Notes support replies. Admin types a reply on any open note - the note is marked **Complete** automatically and the collector is emailed with the original note + the reviewer reply quoted. The reply also appears on the collector's My Reports view. | `app/api/admin/note-reply/route.ts` *(new)*, `app/(app)/admin-reports/page.tsx`, `app/(app)/my-reports/page.tsx`, `components/AdminReportsView.tsx`, `components/MyReportsView.tsx`, `sql/01_note_replies.sql` |
| 6 | Videos section inside a report is collapsible (collapsed by default; toggle with "Show / Hide"). Same on the collector view. | `components/AdminReportsView.tsx`, `components/MyReportsView.tsx` |

### Feedback Progress (admin)

- 8 summary cards across the top: Total / Completed / Not Completed / Attended / Late / Absent / Cancelled / Not Marked. *(`components/FeedbackProgress.tsx`)*

### Quality Score Upload

- Single Month dropdown replaced with **Year** + **Month** selectors. *(`app/(app)/quality-upload/page.tsx`)*

### Home Page (admin)

- "Send Report" card renamed to **Submitted Reports** (counts reports in the selected period).
- Quick Actions section removed - every card now navigates on click.
- **Scheduled Sessions card replaced** with a row of 5 feedback cards (Total / Completed / Incomplete / Cancelled / Absent) for the selected period.
- New **Total Module Errors** card with a green/red trend arrow showing % change vs the previous period.
- New **Average Quality Score** card with the same trend treatment.
- New **Month / Quarter / Year** filter at the top of the page; everything on the page reflows to the chosen period.
- *(`app/(app)/dashboard/page.tsx`, `components/DashboardView.tsx` (new))*

### Quality Score page

- New **Period** selector (Month / Quarter / Year) plus separate **Year** + **Month** (or **Quarter**) selectors.
- New **Team** filter that narrows the Collector dropdown to that team.
- Collector filter retained; existing line charts and summary still render for whatever range/scope is chosen.
- *(`app/(app)/quality-score/page.tsx`, `components/QualityScoreDashboard.tsx`)*

## SQL (run by you, in order)

| File | Purpose | When |
| --- | --- | --- |
| `sql/01_note_replies.sql` | Adds `reply_text`, `replied_at`, `replied_by` to `session_notes`. | Run **before** deploy. The reply UI fails silently if these columns are missing. |
| `sql/02_session_videos_unique.sql` | Removes existing duplicate `session_videos` rows and adds a unique `(match_session_id, drive_file_id)` constraint. | Optional but recommended. Safe to run any time. |

## Verification checklist

After running the SQL and deploying:

- Reports: upload the same Drive folder twice in a row - the second upload should report "skipped N duplicate(s)" and not create extra videos.
- Reports: submit a new report for a collector with an existing match name - the UI should say "this match already had a report... the new videos were added to the existing one".
- Admin Reports: pick a collector from the new dropdown - the list filters to just their reports. Pick "Not acknowledged" - only pending reports remain.
- Admin Reports: type a reply on an open note and hit Reply. The note flips to **Complete**, the reply shows in the blue panel underneath, and the collector receives an email.
- My Reports (as collector): the reviewer reply appears in the blue panel under the original note.
- Videos: click "Show" on a report's Videos block - iframes load; click "Hide" - they collapse.
- Feedback Progress: 8 cards across the top show the right counts.
- Quality Upload: pick Year + Month separately, upload as usual.
- Home: switch Month / Quarter / Year - all cards reflow, trend arrows compare to the prior period.
- Quality Score page: Team filter narrows the Collector dropdown; Quarter view shows 3 months of data; Year view shows 12.
