# Video Feedback & Performance Dashboard

Next.js 14 (App Router) + Tailwind + Supabase (Postgres & Auth), using the
Telegram Bot API as backing storage for small videos (<20MB).

## Folder structure

```
video-feedback-dashboard/
├─ app/
│  ├─ (app)/                     # authenticated area (shared layout + navbar)
│  │  ├─ layout.tsx              # loads user + role, renders NavBar
│  │  ├─ dashboard/page.tsx      # stats + collector filter + video grid
│  │  ├─ upload/page.tsx         # Admin/Uploader only
│  │  └─ collectors/page.tsx     # Admin only (add / edit / delete)
│  ├─ api/
│  │  ├─ upload/route.ts         # POST: sendVideo -> save file_id
│  │  └─ video/[file_id]/route.ts# GET: getFile -> stream (Range-aware)
│  ├─ login/page.tsx             # sign in / sign up
│  ├─ globals.css
│  ├─ layout.tsx                 # root layout
│  └─ page.tsx                   # redirects to /dashboard
├─ components/
│  ├─ NavBar.tsx
│  ├─ DashboardClient.tsx
│  ├─ UploadForm.tsx
│  └─ CollectorsManager.tsx
├─ lib/supabase/
│  ├─ client.ts                  # browser client (anon key)
│  └─ server.ts                  # server client (reads session cookie)
├─ supabase/schema.sql           # tables + RLS + triggers
├─ middleware.ts                 # session refresh + route protection
├─ next.config.js                # 20MB body limit
├─ tailwind.config.ts
├─ postcss.config.js
├─ tsconfig.json
├─ package.json
└─ .env.local.example
```

## Setup

1. **Install**
   ```bash
   npm install
   ```

2. **Environment** — copy `.env.local.example` to `.env.local` and fill it in.
   `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` are **server-only** (no
   `NEXT_PUBLIC_` prefix) so they never reach the browser.

3. **Database** — open Supabase → SQL Editor → paste and run
   `supabase/schema.sql`. This creates the tables, RLS policies, and a trigger
   that gives every new signup the `Viewer` role.

4. **Telegram bot** — add the bot to your group/channel
   (`TELEGRAM_CHAT_ID = -1004359152674`) and make it an **admin** so it can post.

5. **Run**
   ```bash
   npm run dev
   ```
   Sign up once, then promote yourself to Admin by running the last (commented)
   query in `schema.sql` with your email.

## Roles

| Action                    | Admin | Uploader | Viewer |
|---------------------------|:-----:|:--------:|:------:|
| View dashboard            |  ✅   |   own    |  ✅    |
| Upload videos             |  ✅   |   ✅     |  ❌    |
| Delete sessions           |  ✅   |   ❌     |  ❌    |
| Add / edit collectors     |  ✅   |   ❌     |  ❌    |

Roles are enforced **twice**: in the UI/route handlers, and at the database
level via Row Level Security, so the rules hold even if someone calls the API
directly.

## How the Telegram "storage" works

- **Upload** (`/api/upload`): browser POSTs the file → server forwards it to
  Telegram `sendVideo` → reads `file_id` from the response → stores `file_id`
  in `feedback_sessions`.
- **Playback** (`/api/video/[file_id]`): Telegram download links expire after
  ~1 hour, so the row only stores the permanent `file_id`. On each play the
  route calls `getFile` to get a fresh `file_path`, then streams the bytes
  from `https://api.telegram.org/file/bot<token>/<file_path>`, forwarding
  `Range` headers so the player can seek. The token never leaves the server.

## ⚠️ Important notes

- **Rotate the bot token** in @BotFather — it was shared in plain text. Update
  `.env.local` afterward.
- **Hosting & the 20MB limit:** `next start` (self-hosted / VPS / Docker) handles
  the full 20MB. **Vercel serverless functions cap request bodies at ~4.5MB**, so
  large uploads will fail there — self-host, or stay under ~4MB on Vercel.
- Telegram's bot API allows files up to 50MB on download / 20MB on the simplest
  send path; this app caps at 20MB as requested.
- Using Telegram as a file store is a clever hack but isn't an official storage
  product — keep real backups of anything important.
