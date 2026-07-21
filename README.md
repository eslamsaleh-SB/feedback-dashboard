# v57 - Users admin CRUD + blank-email fix + single-table consolidation

## What was broken

1. **Blank emails.** The v56 `users-import` route wrote `email` into `auth.users`
   and into the `users_import` staging table, but never into `public.users`
   itself. Every collector imported via CSV ended up with `email = null` on
   their `users` row.
2. **Broken self-update trigger.** `users_self_update_guard()` (from v56
   `sql/04_rls_users.sql`) still checked `old.title` / `new.title`, but that
   column was renamed to `job_title` in v56b. Any update to `users` where
   `new.id = auth.uid()` would throw `column "title" does not exist`.
3. **Users admin page was fully broken.** `app/(app)/users/page.tsx` and
   `app/api/admin/users/route.ts` still queried `.from("profiles")` (renamed
   to `users` in v56) and joined against `.from("collectors")` for name/team.
   Since `profiles` no longer exists, every query silently returned nothing -
   that's why the whole page rendered blank, not just email.
4. **Two tables for one concept.** `users_import` was a write-only staging
   table the app never read. Consolidated into `users` alone.

## Deploy order

**1. Run the SQL first:**

```
sql/01_fix_and_consolidate.sql
```

This backfills `email` from `auth.users`, fixes the trigger, and drops
`users_import`. Safe to run once the code below is deployed (so nothing
tries to write to `users_import` afterward).

**2. Push the code files (overwrite in place):**

```
app/api/admin/users-import/route.ts     # OVERWRITES v56 version - adds email, drops staging insert
app/(app)/users/page.tsx                # OVERWRITES - reads `users` directly, no more `profiles`/`collectors` join
app/api/admin/users/route.ts            # OVERWRITES - full CRUD on `users`, no more `profiles`/`collectors`
components/UsersManager.tsx             # OVERWRITES - every column editable: hr_code, legacy_id,
                                         #   first_name, last_name, email, mobile_number, squad, job_title, role
```

**3. Verify:**

```sql
select count(*) from public.users where email is null or email = '';
-- should be 0 (or very close - anyone with no auth email at all)
```

Then open `/users` as Admin and confirm every column shows real data and is
editable.

## v57b - critical access-control bug + role rename

**`lib/effective.ts` was never patched in v56/v57 and still queried the
dropped `profiles` table.** Every page that gates on `profile?.role !== "Admin"`
(and every `getEffective()` call, which is most of the app) silently got a
`null` row back and fell through to the `role: "Viewer"` fallback. Result:
every real Admin was treated as a Collector app-wide - not a cosmetic sidebar
bug, an actual access-control failure. Fixed directly in `lib/effective.ts`:
now selects from `users`, derives `full_name` from `first_name`/`last_name`,
and reads `team` from `squad` (keeps the same `EffProfile` shape so no other
file needs to change).

**Role rename: `Uploader` -> `Reviewer`.** Swept all 36 live files under
`app/`, `components/`, `lib/` that referenced the `"Uploader"` string literal
(role comparisons, type unions, nav gating) and replaced it with
`"Reviewer"`. Files touched directly in the repo (already edited, need
`git commit` + push):

```
lib/effective.ts
components/Sidebar.tsx
components/UsersManager.tsx
components/AccountsManager.tsx
components/AnalyticsDashboard.tsx
components/DashboardClient.tsx
components/NavBar.tsx
app/(app)/admin-inquiries/page.tsx
app/(app)/admin-presentations/**  (4 files)
app/(app)/admin-quizzes/**  (4 files)
app/(app)/admin-sessions/page.tsx
app/(app)/analytics/page.tsx
app/(app)/feedback-progress/page.tsx
app/(app)/feedback-reservation/page.tsx
app/(app)/match-totals/page.tsx
app/(app)/module-upload/page.tsx
app/(app)/performance-thresholds/page.tsx
app/(app)/upload/page.tsx
app/api/admin/inquiries/**  (2 files)
app/api/admin/note-reply/route.ts
app/api/admin/presentations/**  (4 files)
app/api/admin/quizzes/**  (5 files)
app/api/modules/upload/route.ts
app/api/upload/route.ts
```

**Deploy order for this part:**

1. Commit + push the 36 edited files above (code side of the rename + the
   critical `effective.ts` fix). Deploy to Vercel.
2. Only after that's live, run `sql/02_rename_role_uploader_to_reviewer.sql`.
   `ALTER TYPE ... RENAME VALUE` updates the enum AND every existing row
   atomically - no data migration step needed. Running it before the code
   deploys would break every `role === "Reviewer"` check until the deploy
   catches up (they'd still be stored as `Uploader` in a stale deploy, or
   vice versa) - keep the order.

## v57c - the actual reason "nothing happened" after your deploy

**This mounted folder is not connected to your git repo.** `git status` here
returns "not a git repository." Every fix I made earlier by editing files
directly (the `effective.ts` patch, the Uploader->Reviewer sweep) only
existed in this scratch copy - your deploy pipeline pulls from a separate
repo you push to yourself, so "Admin Access" (the deployment that ran 8 min
after you said you deployed) shipped your repo's untouched code. Nothing
changed on the live site because the fix never left this folder.

**Second, bigger discovery:** `lib/effective.ts` wasn't the only broken file.
`app/(app)/layout.tsx` - the file that actually builds the `role` prop passed
to `<Sidebar>` - had two of its own direct `.from("profiles")` queries,
completely bypassing `getEffective()`. Beyond that, **25 more live files**
(every admin-gate check in Presentations, Quizzes, Inquiries, uploads, notify
routes, and view-as) still queried the dropped `profiles` table directly.
Every one of those has been checking `role` against a query that silently
returned nothing since v56 shipped - not just the sidebar label, actual
authorization on ~25 endpoints.

All of it is fixed now, directly in this workspace, and verified with
`tsc --noEmit` (zero errors). **You need to copy these 52 files into your
real repo and push:**

```
app/(app)/accounts/page.tsx                                          # now redirects to /users (old page queried dropped columns)
app/(app)/admin-inquiries/page.tsx                                    # Uploader -> Reviewer
app/(app)/admin-presentations/page.tsx                                 # Uploader -> Reviewer
app/(app)/admin-presentations/new/page.tsx                             # Uploader -> Reviewer
app/(app)/admin-presentations/[id]/page.tsx                            # Uploader -> Reviewer
app/(app)/admin-presentations/[id]/preview/page.tsx                    # profiles -> users, Uploader -> Reviewer
app/(app)/admin-quizzes/page.tsx                                       # Uploader -> Reviewer
app/(app)/admin-quizzes/new/page.tsx                                   # Uploader -> Reviewer
app/(app)/admin-quizzes/[id]/page.tsx                                  # Uploader -> Reviewer
app/(app)/admin-quizzes/[id]/submissions/[submissionId]/page.tsx       # Uploader -> Reviewer
app/(app)/admin-sessions/page.tsx                                      # Uploader -> Reviewer
app/(app)/analytics/page.tsx                                           # Uploader -> Reviewer
app/(app)/feedback-progress/page.tsx                                   # Uploader -> Reviewer
app/(app)/feedback-reservation/page.tsx                                # Uploader -> Reviewer
app/(app)/layout.tsx                                                  # profiles -> users (THE sidebar-role bug), dropped dead signup auto-provision code
app/(app)/match-totals/page.tsx                                        # Uploader -> Reviewer
app/(app)/module-upload/page.tsx                                       # Uploader -> Reviewer
app/(app)/performance-thresholds/page.tsx                              # Uploader -> Reviewer
app/(app)/upload/page.tsx                                              # Uploader -> Reviewer
app/(app)/users/page.tsx                                               # v57 rewrite - reads `users` directly
app/api/admin/inquiries/complete/route.ts                              # profiles -> users
app/api/admin/inquiries/reply/route.ts                                 # profiles -> users
app/api/admin/note-reply/route.ts                                      # profiles -> users
app/api/admin/presentations/route.ts                                   # profiles -> users
app/api/admin/presentations/[id]/route.ts                              # profiles -> users
app/api/admin/presentations/[id]/assignments/route.ts                  # profiles -> users
app/api/admin/presentations/[id]/export-slides/route.ts                # profiles -> users
app/api/admin/quizzes/route.ts                                         # profiles -> users
app/api/admin/quizzes/[id]/route.ts                                    # profiles -> users
app/api/admin/quizzes/[id]/assignments/route.ts                        # profiles -> users
app/api/admin/quizzes/[id]/resend/route.ts                             # profiles -> users
app/api/admin/quizzes/answers/[id]/route.ts                            # profiles -> users
app/api/admin/users/route.ts                                           # v57 rewrite - full CRUD on `users`
app/api/admin/users-import/route.ts                                    # v57 rewrite - adds email, drops staging insert
app/api/feedback-notify/route.ts                                       # profiles -> users
app/api/inquiries/create/route.ts                                      # profiles -> users
app/api/modules/upload/route.ts                                        # profiles -> users
app/api/quality-upload/route.ts                                        # profiles -> users
app/api/quizzes/[id]/submit/route.ts                                   # profiles -> users
app/api/report-notify/route.ts                                         # profiles -> users
app/api/session-notify/route.ts                                        # profiles -> users
app/api/upload/route.ts                                                # profiles -> users
app/api/view-as/route.ts                                                # profiles -> users
app/api/weekly-quality-upload/route.ts                                 # profiles -> users
components/AccountsManager.tsx                                        # now orphaned/unused (safe to delete later)
components/AnalyticsDashboard.tsx                                      # Uploader -> Reviewer
components/DashboardClient.tsx                                        # Uploader -> Reviewer
components/NavBar.tsx                                                 # Uploader -> Reviewer (dead component, not imported anywhere - safe to delete later)
components/Sidebar.tsx                                                # Uploader -> Reviewer
components/UsersManager.tsx                                            # v57 rewrite + Uploader -> Reviewer
lib/effective.ts                                                      # profiles -> users (the original fix)
lib/presentation-notify.ts                                             # profiles -> users
lib/quiz-notify.ts                                                    # profiles -> users
```

Copy the whole `app/`, `components/`, and `lib/` folders from this workspace
into your actual repo (overwrites are safe - every file above compiles clean)
if that's easier than 52 individual copies. Then:

```
git add -A
git commit -m "fix: repoint profiles->users across auth gates, rename Uploader role to Reviewer"
git push
```

**Already fixed live, no deploy needed:** the forgot-password bug. Root
cause was unrelated to code - your Supabase **Site URL** and **Redirect
URLs** (Authentication -> URL Configuration) were still set to
`https://feedback-dashboard-v966.onrender.com`, a dead domain from an earlier
hosting setup, not your Vercel app. Every password-reset email was linking
there instead of `/reset-password`. Updated Site URL to
`https://feedback-dashboard-7i8h.vercel.app` and added
`https://feedback-dashboard-7i8h.vercel.app/**` to the redirect allow-list.
New reset emails will land correctly - test it again whenever.

**Still to do, in order, after you push:**

1. Confirm the new Vercel deployment is Ready.
2. Sign out and back in - Sidebar should show Admin nav + "Admin" badge.
3. Run `sql/02_rename_role_uploader_to_reviewer.sql` (only after the deploy
   above is live - the enum rename and the code rename must land together).

## Notes

- `is_active` stays a generated column (`squad is not null and squad <> 'Resigned'`)
  - not directly editable. The UI shows it as a read-only badge; edit `squad`
    to change it.
- `collectors` table is still not dropped - other app pages (Reports, Quiz
  assignment, etc.) still read from it. That code sweep is a separate,
  larger v58 effort (~30-40 files), unrelated to this fix.
- Email changes made via the Users admin page update `auth.users` too
  (`auth.admin.updateUserById`), so login stays in sync with the directory.
