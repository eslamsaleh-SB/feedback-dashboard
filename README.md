# v36 — Admin "View As" (read‑only preview)

Lets an Admin preview the app exactly as any user (any role) sees it — their nav,
their pages, their data — without logging in as them. It never touches the target's
account or session, and writes are blocked while previewing.

## Do I need to run any SQL?
**No.** This is entirely application code — no schema change, no migration, no query.
(The only still‑pending DB item is the separate Team‑Leader error cleanup, which is
unrelated to this.)

## How it works
- A `view_as` cookie (set only for Admins, via `/api/view-as`) holds the target profile id.
- `lib/effective.ts → getEffective()` returns the **target's** role + HR code when an Admin
  is previewing, otherwise the real profile. Every page uses this for its role‑gate and data.
- A top bar (`ViewAsBar`) lets the Admin pick any user and shows a "Viewing as … — Exit" banner.
- Mutating API routes refuse to run while a preview is active (read‑only).

## Files to deploy (path = destination; replace existing, or create new)
**New files**
- `lib/effective.ts`
- `components/ViewAsBar.tsx`
- `app/api/view-as/route.ts`

**Changed files**
- `app/(app)/layout.tsx`            (renders the bar; sidebar/role follow the preview)
- `app/api/upload/route.ts`         (read‑only guard)
- `app/api/modules/upload/route.ts` (read‑only guard)
- `app/api/quality-upload/route.ts` (read‑only guard)
- `app/api/admin/users/route.ts`    (read‑only guard)
- 18 pages under `app/(app)/…/page.tsx` (use the effective profile):
  accounts, admin-reports, admin-sessions, analytics, collectors, dashboard,
  feedback-progress, feedback-reservation, match-totals, module-upload,
  my-matches, my-reports, my-sessions, quality-score, report-monitoring,
  reports-sessions, upload, users

Every file in this folder is already at its correct relative path, so you can copy the
tree straight over your project (or push your project folder — these are the same files
already saved there) and commit once.

## Deploy order (only matters if uploading one folder at a time)
Upload **`lib/effective.ts` first** — once it exists, every other changed file compiles,
so `main` stays green no matter the order of the remaining commits.

## Quick test after deploy (as an Admin)
1. Top bar shows an "Admin preview — View as a user…" picker.
2. Pick a Collector → you land on their Home/My Reports/My Match Details with **their** data;
   the sidebar shows the Collector menu; an amber "Viewing as … (read‑only)" banner appears.
3. Pick a Reviewer → you see the Reviewer pages.
4. Try an upload or a Users edit while previewing → blocked ("Read‑only: exit the preview…").
5. Click **Exit** → back to your own Admin view.

## Notes
- Previewing uses **your** Admin read access to show the target's data; it does not use
  their login and cannot change their account or session.
- Self‑account is excluded from the picker; the cookie is Admin‑gated server‑side.
