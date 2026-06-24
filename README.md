# v40 — Signup without confirmation email (fixes "email rate limit exceeded")

## Problem
New users trying to register hit Supabase's built-in email rate limit
("email rate limit exceeded"). Supabase's free tier sends only a handful
of confirmation/reset emails per hour, regardless of how many users you have.
The old signup flow used `supabase.auth.signUp()` which always tries to send
a confirmation email.

## Fix
Signup now goes through a server route that uses the **admin** API with
`email_confirm: true`, so Supabase never tries to email the new user.
The `handle_new_user()` trigger still runs and creates the profile + links
the collector exactly as before.

No email = no rate limit.

## Files

| File | Change |
| --- | --- |
| `app/api/auth/signup/route.ts` | **NEW** — public POST endpoint that validates the inputs, checks the HR code is free, and calls `auth.admin.createUser({ email_confirm: true })`. |
| `app/login/page.tsx` | Signup mode now POSTs to `/api/auth/signup` instead of calling `supabase.auth.signUp()`. |
| `middleware.ts` | Whitelist `/api/auth/signup` so unauthenticated callers can reach it (same pattern as `/api/teams`). |

## Deploy
1. Copy the three files above into the repo at the same relative paths.
2. Commit + push (`git push origin main`).
3. Vercel auto-deploys. No SQL, no env-var changes — `SUPABASE_SERVICE_ROLE_KEY`
   is already set on Vercel.

## How to verify
- Open the live site in an incognito window.
- Click "Need an account? Sign up", fill in name / HR code / team / email / password, submit.
- Expect "Account created. You can sign in now." — no email is sent, no rate-limit error.
- Sign in with the same email + password.

## Note about *password reset*
Password reset emails (`auth.resetPasswordForEmail`) still go through Supabase's
email service and **are still rate-limited**. Two options:

1. **Recommended** — configure custom SMTP in Supabase
   (Dashboard → Project Settings → Auth → SMTP Settings) using your existing
   Gmail creds (`GMAIL_USER` / `GMAIL_APP_PASSWORD`). Then resets go through
   Gmail and the limit no longer applies.
2. Use the admin **Reset PW** button on the Users page (already implemented in
   `/api/admin/users` `resetPassword`) — generates a temp password, no email.
