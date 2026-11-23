# Update – play Drive videos through a Google service account (no Supabase storage)

Assumes 2026-11-23_16-02 is already applied (VideoCopyControl / BulkVideoCopy stubs).

## Copy into the repo (same paths)
- app/api/presentation-video/[drive_id]/route.ts  (NEW: streams from Drive with the service account)
- components/DriveVideo.tsx          (native video first, Drive iframe fallback)
- components/PresentationViewer.tsx  (native video first + preload="metadata")
- components/MergeToDrive.tsx        (tries the dashboard route, then Drive)
- components/PresentationBuilder.tsx (help text)

## DELETE from the repo (if not yet deleted)
- app/api/admin/presentation-video-upload/route.ts
- scripts/drive-to-supabase.gs

## Manual steps
1. Google Drive: share the videos folder with
   dashboard-videos@feedback-dashboard-499511.iam.gserviceaccount.com  (Viewer).
2. Vercel -> Settings -> Environment Variables: GOOGLE_SERVICE_ACCOUNT_JSON = full contents of the
   key JSON (or its base64). Redeploy.
3. Supabase -> Storage -> presentation-videos: delete the files, then the bucket.
4. Never commit the key JSON to GitHub.

## Notes
- Not shared with the service account -> route returns 404 -> player falls back to Drive iframe.
- Video bytes pass through Vercel (60s limit per request; Range requests keep chunks short).
