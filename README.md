# v51 - Presentations Feature (Final Push Bundle)

Single consolidated folder with every file needed to ship the presentation builder end-to-end. Push these exact paths and the feature is live.

## Push order

**1. Run SQL (once, in Supabase SQL editor)**
```
sql/01_presentations_schema.sql
```
Skip if already run in an earlier session.

**2. Ensure env vars in Vercel Production**

| Key | Value |
| --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `client_email` from the JSON service-account key |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | `private_key` from the JSON key (paste as-is, keep the `\n` sequences) |
| `GOOGLE_SLIDES_SHARE_WITH` | optional, comma-separated Google-account emails to grant EDIT access to each generated deck |
| `GMAIL_USER` + `GMAIL_APP_PASSWORD` | already set from previous versions - needed for assignment email |
| `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SUPABASE_URL` | already set - needed for email routing |

**3. Push these files (mirror the same relative paths)**

Root config:
```
package.json                                           # adds googleapis, restored from truncation
```

Sidebar (Presentations under "Upload Data"):
```
components/Sidebar.tsx
```

Feature components:
```
components/PresentationBuilder.tsx                     # Preview button + safe JSON parse
components/PresentationViewer.tsx                      # backHref/backLabel props
```

Feature helper:
```
lib/presentation-notify.ts                             # NEW - assignment email helper
```

Feature pages:
```
app/(app)/admin-presentations/page.tsx                 # Preview + Edit buttons on each row
app/(app)/admin-presentations/new/page.tsx
app/(app)/admin-presentations/[id]/page.tsx
app/(app)/admin-presentations/[id]/preview/page.tsx    # NEW - reviewer preview page
app/(app)/my-presentations/page.tsx
app/(app)/my-presentations/[id]/page.tsx
```

Feature API routes:
```
app/api/admin/presentations/route.ts                   # POST create + email initial assignees
app/api/admin/presentations/[id]/route.ts              # PUT update, DELETE
app/api/admin/presentations/[id]/assignments/route.ts  # PUT diff + email new assignees
app/api/admin/presentations/[id]/export-slides/route.ts # maxDuration=60 + try/catch + anyone-with-link
```

**4. Install googleapis locally, then commit**
```
npm install
git add package.json package-lock.json
git commit -m "feat: presentation builder"
git push
```
(Or push package.json alone; Vercel installs on next deploy.)

## Verify

1. Vercel deploy green.
2. Sign in as Admin -> **Upload Data -> Presentations -> New presentation**.
3. Fill title + 1 page (Header, Description, Drive video link). Add a collector as assignee. Click **Create**.
4. The assignee receives **"New presentation assigned: {title}"** email within ~10 seconds.
5. On the edit page, click **Preview** -> opens the exact collector viewer in a new tab.
6. Click **Convert to Google Slides** -> new tab opens with a real Google Slides deck. Copy the URL, open in an incognito window -> deck loads without sign-in and can be downloaded as PDF/PPTX.

## Fallback if "Convert to Google Slides" errors

The client now surfaces the exact server error. If you see:
- `Export crashed: error:0909006C:PEM routines...` -> `GOOGLE_SERVICE_ACCOUNT_KEY` env var is malformed. Repaste the full `private_key` value from the JSON, including `-----BEGIN...` through `-----END PRIVATE KEY-----\n`.
- `Access Not Configured. Google Slides API has not been used in project ...` -> Cloud Console -> APIs & Services -> Library -> enable **Google Slides API** and **Google Drive API**.
- `Server returned 504 with no body.` -> Function still timed out; check Vercel Runtime Logs for the true stack trace under `[export-slides] uncaught:`.

## What's in each file (quick reference)

| File | Purpose |
| --- | --- |
| `sql/01_presentations_schema.sql` | 3 tables + RLS + updated_at trigger |
| `package.json` | adds `googleapis`, restores previously-truncated JSON |
| `components/Sidebar.tsx` | Presentations link moved from Administration -> Upload Data |
| `components/PresentationBuilder.tsx` | Editor with pages + assignee picker + Preview / Save / Delete / Convert-to-Slides |
| `components/PresentationViewer.tsx` | Paginated viewer with iframe + Prev/Next/pills; accepts `backHref`/`backLabel` |
| `lib/presentation-notify.ts` | `notifyPresentationAssignees()` - Gmail via `lib/email.ts` |
| `app/(app)/admin-presentations/*` | Reviewer list + new + edit + **preview** pages |
| `app/(app)/my-presentations/*` | Collector list + viewer (marks `viewed_at`) |
| `app/api/admin/presentations/route.ts` | POST create + send assignment email |
| `app/api/admin/presentations/[id]/route.ts` | PUT update, DELETE |
| `app/api/admin/presentations/[id]/assignments/route.ts` | PUT diff, email only newly-added `hr_codes` |
| `app/api/admin/presentations/[id]/export-slides/route.ts` | Service-account Slides + Drive; anyone-with-link viewer; 60s maxDuration; global try/catch |
