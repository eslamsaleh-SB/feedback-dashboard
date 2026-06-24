# v38 — ALL pending changes, in one package

Everything prepared so far, consolidated so you can commit once. Every file is at
its correct relative path — copy the tree over your project (or push your project
folder, since these are the same files already saved there) and commit.

Type‑checks clean against the project's `tsconfig.json`.

------------------------------------------------------------------------------
## A) Code — deploy these files (no order needed if committed together; if you
##    upload folder‑by‑folder, upload `lib/effective.ts` FIRST so the build stays green)
------------------------------------------------------------------------------

**View As (read‑only admin preview) + per‑user Reset PW**
- `lib/effective.ts`                      (new — effective-profile resolver)
- `components/ViewAsBar.tsx`              (new — top bar + "Viewing as… Exit")
- `app/api/view-as/route.ts`             (new — admin-only cookie set/clear)
- `app/(app)/layout.tsx`                 (top bar + sidebar/role follow the preview)
- `components/UsersManager.tsx`          (adds **Reset PW** button per user)
- `app/api/admin/users/route.ts`         (adds `resetPassword` action; read‑only guard)
- `app/api/upload/route.ts`              (read‑only guard while previewing)
- `app/api/modules/upload/route.ts`      (read‑only guard)
- `app/api/quality-upload/route.ts`      (read‑only guard)
- 18 pages under `app/(app)/.../page.tsx` (use the effective profile for role + data):
  accounts, admin-reports, admin-sessions, analytics, collectors, dashboard,
  feedback-progress, feedback-reservation, match-totals, module-upload,
  my-matches, my-reports, my-sessions, quality-score, report-monitoring,
  reports-sessions, upload, users

**Feedback status sync**
- `components/feedback-progress` lives in `components/FeedbackProgress.tsx`
  (already in the list above as part of feedback-progress) — marking attendance now
  also updates the collector‑facing `feedback_meetings` row, so the collector's
  "My Sessions" shows the same status as the admin.
  Mapping: Attended/Attended Late→Completed, Absent→Absent, Cancelled→Cancelled, blank→Scheduled.

------------------------------------------------------------------------------
## B) SQL — run in Supabase (currently down for me; run when it's back)
------------------------------------------------------------------------------
- `sql/01_remove_non_collector_errors.sql`
  Removes module_totals rows attributed to non‑Collector roles (role != Viewer).
  **Run the PREVIEW select first**, then uncomment the DELETE.
- `sql/02_per_video_schema_FOUNDATION.sql`
  Foundation tables for the per‑video notes/acknowledgment feature (acks, notes,
  replies, status) + `position` on session_videos for strict sequential order.
  Review only for now — it pairs with the per‑video UI (see C).

------------------------------------------------------------------------------
## C) NOT included yet — per‑video notes & acknowledgment UI (the large build)
------------------------------------------------------------------------------
The schema is in `sql/02_…`. The UI + behaviour still to build:
- Reviewer: after importing videos, redirect to the report and comment per video.
- Collector: **strict sequential** acknowledgment (watch+ack video 1 before video 2
  unlocks), plus a note per video.
- Reviewers reply to notes; first reply flips the note Open→Replied; mark Resolved.
- Progress tracker (Open/Replied/Resolved) for both sides.
- Email to the collector once every note on a report has a reply (includes match
  name + report date, "reviewed by the Quality team").
This is ~8–10 new files + an email route; it's the next dedicated build.

------------------------------------------------------------------------------
## Reset password note
The "email rate limit exceeded" you saw is Supabase's built‑in email cap. The new
**Reset PW** button avoids email entirely (sets a temp password to share). To make
the *emailed* reset reliable, configure custom SMTP in Supabase → Auth → SMTP.
