# v58 — deploy pending fixes

58 files. Folder structure inside = exact repo paths. Only `lib/effective.ts` already live on main; rest missing.

## Upload
1. Go to https://github.com/eslamsaleh-SB/feedback-dashboard
2. "Add file" -> "Upload files"
3. Drag this whole `v58__deploy-pending-fixes` folder in (Chrome preserves subfolders)
4. Commit directly to `main`
5. Vercel auto-redeploys

## Then run in Supabase SQL editor (after deploy confirmed live)
- Updates/v57__users-admin-crud/sql/01_fix_and_consolidate.sql (if not run yet)
- Updates/v57__users-admin-crud/sql/02_rename_role_uploader_to_reviewer.sql

## Fixes included
- app/(app)/layout.tsx — root cause #2 of Admin-shown-as-Collector bug
- v57 Users CRUD: users-import route, /users page, users API, UsersManager.tsx
- 25 files: profiles -> users
- 36 files: "Uploader" -> "Reviewer" (incl. lib/effective.ts, already live)
- 18 files: collectors -> users lookup (fixes team-filter null + "Code + Code" display)
- 2 redirects: /accounts, /collectors -> /users
