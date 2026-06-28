# v44 - Collector Inquiries ("Ask a Question")

A new feature that lets collectors submit a Match ID + a Google Drive folder of clips they have questions about. Reviewers reply per video. Once every video has a reply, the reviewer marks the inquiry complete and the collector is emailed.

## Deploy order

1. **Run SQL `sql/01_inquiries_schema.sql`** in the Supabase SQL editor.
   Creates `match_inquiries` + `match_inquiry_videos` with unique constraints on `(hr_code, match_id)` and `(inquiry_id, drive_file_id)`, plus RLS so collectors can read/insert their own rows and reviewers can read/update everything.
2. Copy these files into the repo at the same relative paths and push to `main`:
   - `app/(app)/my-inquiries/page.tsx`
   - `app/(app)/admin-inquiries/page.tsx`
   - `app/api/inquiries/create/route.ts`
   - `app/api/admin/inquiries/reply/route.ts`
   - `app/api/admin/inquiries/complete/route.ts`
   - `components/MyInquiriesView.tsx`
   - `components/AdminInquiriesView.tsx`
   - `components/Sidebar.tsx`

No env-var changes. `GOOGLE_DRIVE_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `EMAIL_FROM` are already set.

## Collector flow (Viewer role)

- New sidebar entry **"Ask a Question"** -> `/my-inquiries`.
- Submit form: **Match ID** + **Google Drive folder link**. The same dedupe and validation logic as Send Report:
  - Re-submitting the same Match ID appends new videos to the existing inquiry (UI tells the collector that's what happened).
  - Videos already attached to the inquiry are skipped on re-submit (UI reports how many were skipped).
- Below the form the collector sees every inquiry they've submitted with a collapsible Videos block per match. Each video shows its iframe preview plus either the reviewer's reply or "Waiting for reviewer reply...".

## Reviewer flow (Admin/Uploader/Supervisor)

- New sidebar entry under **Administration -> Inquiries** -> `/admin-inquiries`.
- Top of the page:
  - **Total matches submitted** card
  - **Completed matches** card
  - **Pending videos** card (sum of unreplied videos across all inquiries)
- Filters: searchable Collector dropdown, Status (All / Pending / Completed), free-text search across match ID / HR code / name / team.
- Each inquiry row expands to show a collapsible Videos block. For each video the reviewer either sees the existing reply or a reply input + Reply button.
- Once every video has a reply, the **Mark complete & email collector (Match XXX)** button enables. Pressing it:
  - Sets `completed_at` / `completed_by` on the inquiry.
  - Emails the collector ("All inquiries answered - Match XXX") with a link back to the dashboard.
  - The button is server-side validated; if any video is still without a reply, the request is refused with an error.

## Schema notes

- `match_inquiries (id, hr_code, match_id, created_by, created_at, completed_at, completed_by)` with `UNIQUE (hr_code, match_id)`.
- `match_inquiry_videos (id, inquiry_id, drive_file_id, file_name, question, reply_text, replied_at, replied_by, created_at)` with `UNIQUE (inquiry_id, drive_file_id)`.

`question` is reserved for a future per-video question field; the UI doesn't expose it yet (collectors just describe their question in the file name / clip).

## Verify after deploy

- Sign in as a Viewer. The sidebar shows **Ask a Question**. Submit a Match ID + Drive folder; the page should list the inquiry with all videos and "Waiting for reviewer reply..." underneath each.
- Try submitting the same Match ID with the same folder again - the form should report "you already had an inquiry for this Match ID" and "Skipped N duplicate(s)".
- Sign in as Admin. **Administration -> Inquiries** lists the inquiry. Reply to each video. The header badge changes from "Pending" to "Ready to complete" once every video has a reply.
- Click **Mark complete & email collector**. The status changes to "Completed"; the collector receives an email containing the Match ID.
- Back on the collector view, every reviewer reply is now visible next to the corresponding video.
