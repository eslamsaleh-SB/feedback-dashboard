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

## Notes

- `is_active` stays a generated column (`squad is not null and squad <> 'Resigned'`)
  - not directly editable. The UI shows it as a read-only badge; edit `squad`
    to change it.
- `collectors` table is still not dropped - other app pages (Reports, Quiz
  assignment, etc.) still read from it. That code sweep is a separate,
  larger v58 effort (~30-40 files), unrelated to this fix.
- Email changes made via the Users admin page update `auth.users` too
  (`auth.admin.updateUserById`), so login stays in sync with the directory.
