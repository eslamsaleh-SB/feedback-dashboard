# Update – remove Supabase video copies (Drive only)

## 1) Copy these files over the same paths in the repo
- components/VideoCopyControl.tsx   (keeps only `useMyEmail`; upload code removed)
- components/BulkVideoCopy.tsx      (now a no-op; "Copy all from Drive" button gone)
- components/DriveVideo.tsx         (Drive iframe only, with `authuser=<viewer email>`)
- components/PresentationViewer.tsx (Drive iframe only, with `authuser=<viewer email>`)
- components/MergeToDrive.tsx       (reads clips from Drive only)
- components/PresentationBuilder.tsx (help text updated)

## 2) DELETE these files from the repo
- app/api/admin/presentation-video-upload/route.ts   (upload endpoint)
- app/api/presentation-video/[drive_id]/route.ts     (served Supabase copies)
- scripts/drive-to-supabase.gs                       (bulk copier)

## 3) Supabase / Google (manual)
- Supabase -> Storage -> presentation-videos: delete all files (then delete the bucket).
- If you ran drive-to-supabase.gs in script.google.com, delete that project / any trigger
  so it cannot refill the bucket.
- Optional: remove SUPABASE_SERVICE_ROLE_KEY from Vercel only if nothing else uses it
  (other admin routes do, so normally keep it).

## Behaviour after this update
Videos play from Google Drive. Drive links are Hudl-only, so the viewer must be signed in to a
Hudl Google account in the browser. `authuser=<email>` makes Drive use the dashboard email's
account when several Google accounts are signed in. Non-Hudl viewers will see Drive's
"You need access" page.
