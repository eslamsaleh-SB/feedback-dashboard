# v56 - Users Refactor (single source of truth)

## Reality check (from live introspection)

- `profiles` was already renamed to `users` in a prior migration.
- `collectors` still exists with 950 rows.
- `users` has 15 rows (mostly admins).
- 99% of `module_totals`, `quality_scores`, `freeze_frame_scores` rows are orphans against the current `users` (because 935 employees never had a login).
- **Critical:** the "delete orphans" step in Requirement 4 must run AFTER you onboard the CSV, otherwise it nukes 99% of your metrics.

## Deploy order

**Safe first — additive changes only (steps 1-2):**

1. Run `sql/01_users_add_columns.sql` — adds `first_name`, `last_name`, `mobile_number`, `legacy_id`, `squad`, `title`, generated `is_active` column + unique constraints on `hr_code` and `legacy_id`.
2. Run `sql/02_users_import_staging.sql` — creates `users_import` staging table + Admin-only RLS.

**Then push the code files:**

```
app/api/admin/users-import/route.ts       # NEW - CSV -> auth.users + public.users
app/api/auth/signup/route.ts              # OVERWRITES existing - returns 410
middleware.ts                             # OVERWRITES existing - kills /signup, adds is_active gate
```

**Then onboard from your CSV:**

3. Curl or admin-UI a POST to `/api/admin/users-import` with the CSV as multipart `file`. Every row that has `email` and `hr_code` gets:
   - An `auth.users` row (email_confirm=true).
   - A `public.users` row (upserted by id).
   - A password-recovery email (unless you send `send_recovery=false`).
   - A `users_import` staging row for audit.
   - Failed rows are returned in the response, first 25 shown.

4. Verify `select count(*) from users` returns ~950 (or however many CSV rows). If it's still ~15, DO NOT proceed - re-check the import.

**Only after step 4 verified (destructive from here):**

5. Run `sql/03_repoint_fks.sql` — drops `actor_id` on 4 metrics tables, drops `users.collector_id`, repoints `match_sessions.collector_id` at `users.id`.
6. Run `sql/04_rls_users.sql` — adds active-directory SELECT policy + self-update guard trigger.
7. Run `sql/05_orphan_delete_guarded.sql` — deletes hr_code-orphans from metrics tables. Guard clause aborts if users count < 800.
8. Run `sql/06_drop_collectors.sql` — drops the `collectors` table.

**UI cleanup (safe anytime after step 3):**

Delete these files manually (Windows read-only mount):

```
app/(auth)/signup/page.tsx          # if it exists
app/signup/page.tsx                 # if it exists
app/register/page.tsx               # if it exists
components/SignupForm.tsx           # if it exists
```

Remove any `<Link href="/signup">Sign up</Link>` from `app/(auth)/login/page.tsx` or wherever. Middleware will redirect them anyway.

## What the migration guarantees

- `users` becomes the single source of truth (email + hr_code + first/last + mobile + legacy_id + squad + title).
- `is_active` auto-flips based on `squad`. Squad = null / empty / "Resigned" -> inactive. Middleware signs the user out on their next request.
- Public signup is closed. `POST /api/auth/signup` returns HTTP 410 Gone. `/signup` and `/register` URLs redirect to `/login`.
- Admin can still create users manually via `/admin/users` (existing page) or bulk via the new `/api/admin/users-import` route.
- Metrics tables (module_totals, quality_scores, freeze_frame_scores, weekly_quality_scores) drop rows for hr_codes not present in `users`.
- `collectors` is gone. Every FK that pointed at it is either dropped (denormalized `actor_id` columns) or repointed at `users.id` (`match_sessions.collector_id`).

## Not in this bundle (follow-ups)

- Repointing every `.from("collectors")` in the codebase to `.from("users")`. ~30-40 files. Deliberately deferred so this bundle only touches the database + import route + auth. Feature routes still read collectors until the code sweep, which will be v57.
- Deleting the SignupForm / signup page files - blocked by the Windows mount, need to be removed manually.
- Rewriting `UsersManager.tsx` to expose the new fields (`first_name`, `last_name`, `mobile_number`, `legacy_id`, `squad`, `title`) - deferred to v57 as well.

## Files in this bundle

```
sql/01_users_add_columns.sql            # additive
sql/02_users_import_staging.sql         # additive
sql/03_repoint_fks.sql                  # DESTRUCTIVE - after CSV import
sql/04_rls_users.sql                    # additive
sql/05_orphan_delete_guarded.sql        # DESTRUCTIVE - guarded (aborts if users < 800)
sql/06_drop_collectors.sql              # DESTRUCTIVE - very last
app/api/admin/users-import/route.ts     # NEW - CSV import
app/api/auth/signup/route.ts            # 410 Gone
middleware.ts                           # active-user gate + kill /signup
README.md                               # this file
```
