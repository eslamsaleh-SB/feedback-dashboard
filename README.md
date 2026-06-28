# v45 - Gmail SMTP unification + deliverability hardening

Every transactional email in the app now goes through a single helper
(`lib/email.ts`) that sends via Gmail SMTP with a strictly aligned `From`
address, a plain-text alternative, a `List-Unsubscribe` header, and a
standard footer. Resend is removed from `/api/report-notify`. Password
resets / signup confirmations route through the same Gmail account once
you set Supabase Auth -> SMTP Settings (instructions below).

No SQL. No new env vars are required, but two existing ones change role
and two new optional ones are added (see "Environment variables" below).

## Deploy

Copy these files into the repo at the same relative paths and push to `main`:

- `lib/email.ts` *(new)*
- `app/api/upload/route.ts`
- `app/api/feedback-notify/route.ts`
- `app/api/session-notify/route.ts`
- `app/api/report-notify/route.ts`  (Resend code removed)
- `app/api/admin/note-reply/route.ts`
- `app/api/admin/inquiries/complete/route.ts`

## What changed

### 1. Single email helper

`lib/email.ts` exports two functions:

- `sendEmail({ to, subject, html, text? })` - posts via nodemailer +
  Gmail SMTP. Always adds the headers below; auto-generates a text
  alternative from the HTML when `text` is omitted.
- `renderEmail({ heading, intro?, bodyHtml?, bodyText?, cta?, closing? })`
  - wraps the message in a clean white card with the standard footer
  and produces a matching plain-text body in one call. Every route now
  uses this so the templates look identical.

### 2. Strict sender match (DMARC alignment)

`From:` is built as `"<EMAIL_FROM_NAME>" <GMAIL_USER>` - the email part
is **always** the authenticated Gmail account. The old code allowed
`EMAIL_FROM` to be any address (and `report-notify` even fell back to
`Feedback Dashboard <no-reply@feedbackdashboard.com>`, a domain you
don't own). That kind of mismatch is the single biggest reason mail
ends up in Spam. Now SPF and DKIM both align with `gmail.com`, DMARC
passes, and Gmail's filters treat the mail as authenticated.

### 3. Template fixes

Every email now includes:

- A real `text/plain` alternative alongside the HTML (HTML-only mail is
  a strong spam signal).
- A `List-Unsubscribe` header pointing at `mailto:<GMAIL_USER>?subject=unsubscribe`,
  plus `List-Unsubscribe-Post: List-Unsubscribe=One-Click` for compliance
  with the current Gmail / Yahoo bulk-sender rules.
- Clickable text links ("View Report", "Join the meeting", "Open my
  inquiries") instead of raw `<a href="https://...">https://...</a>`
  blobs.
- A consistent footer with the org name, the dashboard URL, and an
  inline unsubscribe instruction.
- `Reply-To:` (defaults to `GMAIL_USER`, override with
  `EMAIL_REPLY_TO`) so collectors can actually reply.

### 4. Removed Resend dependency from `/api/report-notify`

That route was the last place using `RESEND_API_KEY`. It now uses the
same helper as everything else. You can delete `RESEND_API_KEY` from
Vercel.

## Environment variables

| Var | Required? | What it does |
| --- | --- | --- |
| `GMAIL_USER` | Yes | The Gmail address used for SMTP auth and the `From:` email part. |
| `GMAIL_APP_PASSWORD` | Yes | A Google App Password for `GMAIL_USER` (https://myaccount.google.com/apppasswords). |
| `EMAIL_FROM_NAME` | Optional | Display name shown in the `From:` (default: `Hudl Stats Feedback`). |
| `EMAIL_REPLY_TO` | Optional | `Reply-To:` address (default: same as `GMAIL_USER`). |
| `NEXT_PUBLIC_APP_URL` | Optional | Used in the email footer + CTA links (default: the Vercel URL). |
| `EMAIL_FROM` | **Remove** | No longer used. Delete it from Vercel to avoid confusion. |
| `RESEND_API_KEY` | **Remove** | No longer used. |

After deploy: in Vercel -> Project Settings -> Environment Variables,
add `EMAIL_FROM_NAME` (and optionally `EMAIL_REPLY_TO`,
`NEXT_PUBLIC_APP_URL`); delete `EMAIL_FROM` and `RESEND_API_KEY`.

## Supabase Auth -> SMTP Settings (password resets + signup emails)

This routes password resets, signup confirmations, magic links, and any
other Supabase Auth email through your Gmail account too. Once enabled,
the built-in Supabase email rate limit no longer applies, and the From:
address matches every other email the app sends.

Go to **Supabase Dashboard -> Project Settings -> Auth -> SMTP Settings**
and enable custom SMTP. Enter these values exactly:

| Field | Value |
| --- | --- |
| **Enable Custom SMTP** | ON |
| **Sender email** | `<your Gmail address>` *(same value as `GMAIL_USER`)* |
| **Sender name** | `Hudl Stats Feedback` *(or whatever you set `EMAIL_FROM_NAME` to)* |
| **Host** | `smtp.gmail.com` |
| **Port** | `465` |
| **Minimum interval between emails** | 60 *(seconds; leave as Supabase's default if shown)* |
| **Username** | `<your Gmail address>` *(same as Sender email)* |
| **Password** | `<your Gmail App Password>` *(same value as `GMAIL_APP_PASSWORD`)* |

Notes:

- Use **port 465** with implicit TLS. If your account or network blocks
  465, try **port 587** with STARTTLS instead - the username/password
  stay the same.
- The Password field needs a **Google App Password**, not your normal
  Gmail password. Generate one at
  <https://myaccount.google.com/apppasswords> after enabling 2-step
  verification on the Google account.
- After saving, Supabase shows a "Send test email" button - run it
  once. The test should land in the Inbox (not Spam). If it lands in
  Spam, mark it "Not spam" once per recipient inbox; Gmail learns
  quickly.

## A note on Gmail SMTP and volume

Gmail accounts have hard sending limits:

- Personal Gmail: ~500 recipients / day.
- Google Workspace: ~2,000 recipients / day.

That's plenty for the current usage (one report per upload, one
session per reservation, etc.). If volume ever grows past those caps
the right move is a transactional sender on a verified domain (Resend
/ SendGrid / Postmark) - but until then, Gmail SMTP with the alignment
above will keep mail in the Inbox.

## Verify after deploy

1. Trigger one email of each kind:
   - Upload a new match session report (collector gets a "New Report:" email).
   - Book a feedback reservation (collector gets a "Feedback session scheduled" email).
   - Reply to an open note (collector gets a "Reply on your report" email).
   - Mark a match inquiry complete (collector gets "All inquiries answered" email).
2. In Gmail, open the message, click the three-dot menu -> **Show
   original**. Check that **SPF**, **DKIM**, and **DMARC** all say
   PASS. They should now that From: matches the authenticated Gmail
   account.
3. Confirm the message has both `text/plain` and `text/html` parts
   ("Show original" displays the MIME tree).
4. After saving Supabase SMTP, run the **Send test email** button in
   the Supabase dashboard and verify it arrives in the Inbox.
