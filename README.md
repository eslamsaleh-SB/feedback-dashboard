# v46 - Presentation / Lesson Builder

Full-stack feature. Reviewers build multi-page "lessons" with embedded Drive
videos, assign them to specific collectors, and export the finished deck to
real Google Slides on demand.

Note: an earlier update also lived under `Updates/v46_...` (Performance
Thresholds). This one uses **double underscore** (`v46__presentation-builder`)
so they don't collide.

## Deploy order

1. **Run SQL** `sql/01_presentations_schema.sql` in the Supabase SQL editor.
   Creates `presentations`, `presentation_pages`, `presentation_assignments`
   with RLS: reviewers CRUD everything, collectors SELECT only rows they're
   assigned to. Adds an updated-at trigger.
2. **Install `googleapis`** (needed for the Slides export). One of:
   - Locally: `npm install`, commit the updated `package.json` + `package-lock.json`, push.
   - Or push package.json alone; Vercel installs it on the next deploy.
3. **Set env vars in Vercel** (see "Google Cloud setup" below). Only needed
   if you want the "Convert to Google Slides" button to work; the rest of
   the feature works without it.
4. **Push these files** into the repo at the same relative paths:
   - `app/(app)/admin-presentations/page.tsx`
   - `app/(app)/admin-presentations/new/page.tsx`
   - `app/(app)/admin-presentations/[id]/page.tsx`
   - `app/(app)/my-presentations/page.tsx`
   - `app/(app)/my-presentations/[id]/page.tsx`
   - `app/api/admin/presentations/route.ts`
   - `app/api/admin/presentations/[id]/route.ts`
   - `app/api/admin/presentations/[id]/assignments/route.ts`
   - `app/api/admin/presentations/[id]/export-slides/route.ts`
   - `components/PresentationBuilder.tsx` *(new)*
   - `components/PresentationViewer.tsx` *(new)*
   - `components/Sidebar.tsx` *(adds two entries)*
   - `package.json` *(adds `googleapis`)*

## What the feature does

### Reviewer flow

1. Sidebar -> **Administration -> Presentations** -> `/admin-presentations`.
2. Click **New presentation**. The builder page loads with:
   - Title + Description at the top.
   - One default page with three fields per page: **Header**, **Description**, **Google Drive video link**.
   - As soon as a valid Drive link is pasted, the page renders a **live iframe preview** (same embed style as the Reports / Ask-a-Question videos).
   - Buttons to **Add page**, reorder (up/down), and remove pages.
   - Assignee picker at the bottom - searchable list of every collector with a checkbox per row. The counter shows how many are selected.
3. Click **Create**. The presentation, its pages, and the assignments are persisted.
4. Opening an existing presentation loads the same builder pre-populated. Changing the assignee list here also **PUTs the delta** so add/remove works at any time.
5. Click **Convert to Google Slides**. The API creates a real Google Slides file (title slide + one slide per page with header + description + video URL). The link opens in a new tab and is stored on the row so the builder shows it next time.

### Collector flow

1. Sidebar -> **Presentations** -> `/my-presentations`.
2. See only presentations you're assigned to (RLS-enforced).
3. Click one -> `/my-presentations/[id]`. Full viewer with:
   - Header + description at top, back link to the list.
   - Big embedded Drive iframe for the current page's video.
   - Prev / Next buttons + numbered page pills for direct jump.
   - `viewed_at` on the assignment row updates on open (best-effort).

## Google Cloud setup for "Convert to Google Slides"

1. Open <https://console.cloud.google.com>. Create or pick a project.
2. **APIs & Services -> Library** -> enable **Google Slides API** AND **Google Drive API**.
3. **APIs & Services -> Credentials -> Create Credentials -> Service Account**. Skip role assignment. Create.
4. On the new service account -> **Keys -> Add Key -> JSON**. A key file downloads.
5. Open the JSON key file and copy:
   - `client_email` -> paste as env var `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` -> paste as env var `GOOGLE_SERVICE_ACCOUNT_KEY` (the value looks like `-----BEGIN PRIVATE KEY-----\n...`. Paste it as-is; the route unescapes the `\n` sequences.)
6. Optionally set `GOOGLE_SLIDES_SHARE_WITH` to a comma-separated list of user emails - the newly created Slides file will be shared with those users as editors so they can open it from their Google Drive. Example: `eslam.saleh@hudl.com,someone.else@hudl.com`.
7. In Vercel, add all three env vars to **Production** (and Preview if you want).

The service account owns the created deck. Without `GOOGLE_SLIDES_SHARE_WITH` set, only the service account can open the file (its identity is not a normal Google user). Setting the share list is what makes the URL usable to real people.

## Verify

- Sign in as Admin -> **Administration -> Presentations** -> **New presentation**. Add a title, one page with a Drive video link. Below the link field, a live iframe should render.
- Add three more pages. Reorder them with the arrow buttons.
- Check three collectors in the assignee picker. Click **Create**. You should end up on the edit page.
- Sign in as one of those collectors -> **Presentations** in the sidebar -> click the deck -> the viewer opens on Page 1. Click Next to page 2.
- Back as Admin, click **Convert to Google Slides**. If env vars are set, a new tab opens with a real Google Slides deck. If env vars are missing you get a 500 with the setup instructions.

## Files at a glance

| File | Purpose |
| --- | --- |
| `sql/01_presentations_schema.sql` | Tables + RLS + updated_at trigger. |
| `components/PresentationBuilder.tsx` | Client component - full builder with pages editor, assignment picker, Save + Delete + Convert-to-Slides buttons. |
| `components/PresentationViewer.tsx` | Client component - paginated collector viewer with iframe + Prev/Next/page pills. |
| `app/(app)/admin-presentations/*` | List, new, edit pages for reviewers. |
| `app/(app)/my-presentations/*` | List + viewer pages for collectors (marks `viewed_at`). |
| `app/api/admin/presentations/route.ts` | POST create. |
| `app/api/admin/presentations/[id]/route.ts` | PUT update, DELETE. |
| `app/api/admin/presentations/[id]/assignments/route.ts` | PUT replaces assignment list. |
| `app/api/admin/presentations/[id]/export-slides/route.ts` | POST creates real Google Slides via the service account. |
| `components/Sidebar.tsx` | Adds "Presentations" to Collector sidebar + Administration group. |
| `package.json` | Adds `googleapis` dependency. |
