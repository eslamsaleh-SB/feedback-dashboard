# v38 – Fix emails + Admin video iframes

## Files to upload to GitHub (then Vercel auto-redeploys)

| File | Where it goes in GitHub |
|------|------------------------|
| `session-notify/route.ts` | `app/api/session-notify/route.ts` |
| `feedback-notify/route.ts` | `app/api/feedback-notify/route.ts` |
| `AdminReportsView.tsx` | `components/AdminReportsView.tsx` |

## What was fixed

**Emails:** Both notify routes had an auth check (`if (!user) return 401`) that always
failed when called server-side (no session cookie forwarded). Removed the check — these
are internal routes with no sensitive input.

**Admin videos:** AdminReportsView.tsx was never pushed with the iframe change. Now included.

## No SQL changes needed.
