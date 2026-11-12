# Update – reduce Supabase Cached Egress

Copy these files over the same paths in the repo, then commit and deploy.

1. `app/api/presentation-video/[drive_id]/route.ts`
   Redirect Cache-Control changed from `no-store` to `private, max-age=3000`.
   Before: every play got a new signed URL, so the browser re-downloaded the whole video each time.
   After: the same signed URL is reused for ~50 min, so the browser cache serves repeat plays.

2. `components/PresentationViewer.tsx`
   Added `preload="metadata"` to the main `<video>` (DriveVideo.tsx already had it).
   Before: the browser could pre-download the full video on page load, even if not played.

Not in this update (bigger savings): compress the videos (720p, lower bitrate) before copying them to the
`presentation-videos` bucket, or serve them from Drive / Cloudflare R2. Pro plan gives 250 GB cached egress.
