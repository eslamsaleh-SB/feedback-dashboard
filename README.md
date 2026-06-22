# v37 – created_by fix + video visibility SQL + video embed

## Changes

### Code (copy to project root, then push to GitHub)
| File | Change |
|------|--------|
| `components/FeedbackReservationForm.tsx` | Records the logged-in user's email in `created_by` when creating a feedback session |
| `components/MyReportsView.tsx` | Videos embedded inline via iframe (no redirect to Drive) |
| `components/AdminReportsView.tsx` | Videos embedded inline via iframe (no redirect to Drive) |
| `app/(app)/my-reports/page.tsx` | Queries `match_session_id` column (was `session_id`) |
| `app/(app)/admin-reports/page.tsx` | Queries `match_session_id` column (was `session_id`) |

### SQL — MUST RUN IN SUPABASE (run v33_fix_videos_rls.sql)
Fixes the `my_collector_id()` function so collectors can see their own match sessions and videos.
Without this, videos will never show for collectors even if the code is deployed.

## Email setup (Resend)
1. Sign up free at https://resend.com
2. Add and verify your domain (or use resend.dev sandbox for testing)
3. Create an API key
4. In Vercel → Your project → Settings → Environment Variables, add:
   - `RESEND_API_KEY` = your key from Resend
   - `EMAIL_FROM` = e.g. `Feedback Dashboard <no-reply@yourdomain.com>`
   - `SUPABASE_SERVICE_ROLE_KEY` = from Supabase → Project Settings → API
5. Redeploy after adding the variables
