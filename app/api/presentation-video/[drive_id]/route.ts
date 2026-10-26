import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "presentation-videos";

// GET /api/presentation-video/<drive_file_id>
// Videos copied from Google Drive into the private Supabase bucket are stored
// as "<drive_file_id>.<ext>". For a logged-in user we return a short-lived
// signed URL (302). If the file hasn't been copied yet we return 404 and the
// viewer falls back to the Drive iframe.
export async function GET(
  _req: NextRequest,
  { params }: { params: { drive_id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const driveId = decodeURIComponent(params.drive_id);
  if (!/^[A-Za-z0-9_-]+$/.test(driveId)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: "Storage not configured" }, { status: 500 });
  }
  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { persistSession: false },
  });

  // Find the stored file (extension may be mp4 / mov / webm ...).
  const { data: files } = await admin.storage.from(BUCKET).list("", { search: driveId, limit: 5 });
  const file = (files ?? []).find((f) => f.name.startsWith(driveId + "."));
  if (!file) {
    return NextResponse.json({ error: "Not migrated" }, { status: 404 });
  }

  // 6 hours is plenty for one presentation sitting.
  const { data: signed, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(file.name, 60 * 60 * 6);
  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? "Sign failed" }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl, {
    status: 302,
    headers: { "Cache-Control": "private, no-store" },
  });
}
