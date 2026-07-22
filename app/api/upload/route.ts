import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isViewingAs } from "@/lib/effective";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { sendEmail, renderEmail } from "@/lib/email";

export const runtime = "nodejs";

const DRIVE_API_KEY = process.env.GOOGLE_DRIVE_API_KEY!;
const DASHBOARD_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://feedback-dashboard-7i8h.vercel.app";

function extractFolderId(input: string): string | null {
  const url = input.trim();
  const folders = url.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (folders) return folders[1];
  const idParam = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParam) return idParam[1];
  if (/^[a-zA-Z0-9_-]{15,}$/.test(url)) return url;
  return null;
}

async function listDriveVideos(folderId: string) {
  const q = encodeURIComponent(
    `'${folderId}' in parents and mimeType contains 'video' and trashed = false`
  );
  const url =
    `https://www.googleapis.com/drive/v3/files?q=${q}` +
    `&key=${DRIVE_API_KEY}` +
    `&fields=files(id,name,mimeType)` +
    `&pageSize=1000` +
    `&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) {
    throw new Error(
      json?.error?.message ||
        "Google Drive API error. Check the API key and that the folder is shared 'Anyone with the link'."
    );
  }
  return (json.files || []) as { id: string; name: string; mimeType: string }[];
}

async function notifyCollectorReport(opts: {
  hrCode: string;
  matchName: string;
  reviewDate: string | null;
  notes: string | null;
}) {
  const { hrCode, matchName, reviewDate, notes } = opts;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    console.warn("[upload-notify] SUPABASE_SERVICE_ROLE_KEY not set - email skipped");
    return;
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { persistSession: false } }
  );

  // v59: was reading from public.collectors (stale/orphaned since v56 moved
  // identity onto public.users). Look up the user directly by hr_code.
  const { data: profile } = await admin
    .from("users")
    .select("id")
    .eq("hr_code", hrCode)
    .single();
  if (!profile?.id) return;

  const { data: { user: targetUser } } = await admin.auth.admin.getUserById(profile.id);
  const email = targetUser?.email;
  if (!email) return;

  const dateStr = reviewDate ? ` for ${reviewDate}` : "";
  const bodyHtml = notes
    ? `<p style="margin:0 0 12px;color:#374151;white-space:pre-wrap;">${escapeText(notes)}</p>`
    : "";
  const { html, text } = renderEmail({
    heading: `New report: ${matchName}`,
    intro: `A new match session report has been uploaded for you${dateStr}.`,
    bodyHtml,
    bodyText: notes ?? "",
    cta: { label: "View Report", url: `${DASHBOARD_URL}/my-reports` },
    closing:
      "Open the dashboard to acknowledge the report and add any notes for your reviewer.",
  });

  await sendEmail({
    to: email,
    subject: `New Report: ${matchName}`,
    html,
    text,
  });
}

function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  if (isViewingAs()) {
    return NextResponse.json(
      { error: "Read-only: exit the 'View as' preview before making changes." },
      { status: 403 }
    );
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !["Admin", "Reviewer"].includes(profile.role)) {
    return NextResponse.json({ error: "Not allowed to upload" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const mode = body.mode === "existing" ? "existing" : "new";
  const folderUrl = String(body.folder_url || "");
  const folderId = extractFolderId(folderUrl);
  if (!folderId) {
    return NextResponse.json(
      { error: "Could not read a folder ID from that Google Drive link." },
      { status: 400 }
    );
  }

  let matchSessionId: string;
  let merged = false;
  let notify: {
    hrCode: string;
    matchName: string;
    reviewDate: string | null;
    notes: string | null;
  } | null = null;

  if (mode === "existing") {
    matchSessionId = String(body.match_session_id || "");
    if (!matchSessionId) {
      return NextResponse.json(
        { error: "Pick an existing match session." },
        { status: 400 }
      );
    }
    const { data: ms, error } = await supabase
      .from("match_sessions")
      .select("id")
      .eq("id", matchSessionId)
      .single();
    if (error || !ms) {
      return NextResponse.json(
        { error: "Match session not found or not accessible" },
        { status: 404 }
      );
    }
  } else {
    // v59: client's `collector_id` field carries an hr_code string (v56
    // dropped match_sessions.collector_id and repointed onto hr_code text).
    const hrCode = String(body.collector_id || "").trim();
    const matchName = String(body.match_name || "").trim();
    const reviewDate = String(body.review_date || "") || null;
    const notes = String(body.overall_notes || "");
    const score = body.quality_score != null ? parseInt(String(body.quality_score), 10) : null;

    if (!hrCode || !matchName) {
      return NextResponse.json(
        { error: "collector and match name are required" },
        { status: 400 }
      );
    }

    const { data: existingSessions } = await supabase
      .from("match_sessions")
      .select("id, match_name")
      .eq("hr_code", hrCode)
      .ilike("match_name", matchName);

    const existing =
      (existingSessions ?? []).find(
        (s: any) => (s.match_name ?? "").trim().toLowerCase() === matchName.toLowerCase()
      ) ?? null;

    if (existing) {
      matchSessionId = existing.id;
      merged = true;
    } else {
      const { data: created, error } = await supabase
        .from("match_sessions")
        .insert({
          hr_code: hrCode,
          uploader_id: user.id,
          match_name: matchName,
          review_date: reviewDate,
          quality_score: score,
          overall_notes: notes,
        })
        .select("id")
        .single();

      if (error || !created) {
        return NextResponse.json(
          { error: error?.message || "Could not create match session" },
          { status: 400 }
        );
      }
      matchSessionId = created.id;
      notify = { hrCode, matchName, reviewDate, notes: notes || null };
    }
  }

  let files: { id: string; name: string }[];
  try {
    files = await listDriveVideos(folderId);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }

  if (files.length === 0) {
    return NextResponse.json(
      {
        error:
          "No video files found in that folder. Make sure it contains videos and is shared 'Anyone with the link'.",
      },
      { status: 404 }
    );
  }

  const { data: existingVideos } = await supabase
    .from("session_videos")
    .select("drive_file_id")
    .eq("match_session_id", matchSessionId);
  const existingIds = new Set(
    (existingVideos ?? []).map((v: any) => v.drive_file_id as string)
  );
  const newFiles = files.filter((f) => !existingIds.has(f.id));
  const skipped = files.length - newFiles.length;

  let inserted = 0;
  if (newFiles.length > 0) {
    const rows = newFiles.map((f) => ({
      match_session_id: matchSessionId,
      drive_file_id: f.id,
      file_name: f.name,
    }));
    const { error: insertError } = await supabase
      .from("session_videos")
      .insert(rows);
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }
    inserted = rows.length;
  }

  if (notify) {
    try {
      await notifyCollectorReport(notify);
    } catch (e: any) {
      console.error(`[upload-notify] sendEmail failed: ${e?.message ?? e}`);
    }
  }

  return NextResponse.json({
    ok: true,
    match_session_id: matchSessionId,
    imported: inserted,
    skipped,
    merged,
  });
}
