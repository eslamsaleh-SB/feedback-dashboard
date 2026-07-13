import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// GET /api/admin/presentations/slides-diag
// Reviewer-only. Reports which Google service account + project + APIs the
// server currently sees, so we can prove where the "The caller does not have
// permission" error is coming from without printing any secret data.

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!me || !["Admin", "Uploader", "Supervisor"].includes((me as any).role)) {
    return NextResponse.json({ error: "Reviewers only" }, { status: 403 });
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || null;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const key = rawKey?.replace(/\\n/g, "\n") ?? null;

  let derivedProjectId: string | null = null;
  if (email) {
    const m = email.match(/@([^.]+)\.iam\.gserviceaccount\.com$/i);
    if (m) derivedProjectId = m[1];
  }

  const keyPresent = !!key;
  const keyHasBeginLine = key ? key.includes("-----BEGIN PRIVATE KEY-----") : false;
  const keyHasEndLine = key ? key.includes("-----END PRIVATE KEY-----") : false;
  const keyLength = key ? key.length : 0;

  const result: any = {
    ok: true,
    service_account_email: email,
    derived_project_id: derivedProjectId,
    key_present: keyPresent,
    key_begins_correctly: keyHasBeginLine,
    key_ends_correctly: keyHasEndLine,
    key_length_bytes: keyLength,
    slides_share_with: process.env.GOOGLE_SLIDES_SHARE_WITH ?? null,
    node_env: process.env.NODE_ENV ?? null,
  };

  if (email && key && keyHasBeginLine && keyHasEndLine) {
    try {
      // @ts-ignore
      const { google } = await import("googleapis");
      const jwt = new google.auth.JWT({
        email,
        key,
        scopes: [
          "https://www.googleapis.com/auth/presentations",
          "https://www.googleapis.com/auth/drive",
        ],
      });
      await jwt.authorize();
      result.jwt_authorize = "ok";

      try {
        const drive = google.drive({ version: "v3", auth: jwt });
        const about = await drive.about.get({ fields: "user,storageQuota" });
        result.drive_about = {
          email: about.data.user?.emailAddress ?? null,
          displayName: about.data.user?.displayName ?? null,
        };
      } catch (e: any) {
        result.drive_about_error = e?.message ?? String(e);
      }

      try {
        const slides = google.slides({ version: "v1", auth: jwt });
        const drive = google.drive({ version: "v3", auth: jwt });
        const c = await slides.presentations.create({
          requestBody: { title: "diag-scratch" },
        });
        const pid = c.data.presentationId as string;
        result.slides_create = "ok";
        result.slides_create_id = pid;
        try {
          await drive.files.delete({ fileId: pid });
          result.slides_delete = "ok";
        } catch (e: any) {
          result.slides_delete_error = e?.message ?? String(e);
        }
      } catch (e: any) {
        result.slides_create_error = e?.message ?? String(e);
      }
    } catch (e: any) {
      result.jwt_authorize_error = e?.message ?? String(e);
    }
  } else {
    result.note = "Skipping live test - env vars missing or malformed.";
  }

  return NextResponse.json(result, { status: 200 });
}
