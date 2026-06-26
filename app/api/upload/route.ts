import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isViewingAs } from "@/lib/effective";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

export const runtime = "nodejs";

const DRIVE_API_KEY = process.env.GOOGLE_DRIVE_API_KEY!;

function extractFolderId(input: string): string | null {
  const url = input.trim();
  const folders = url.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (folders) return folders[1];
  const idParam = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParam) return idParam[1];
  if (/^[a-zA-Z0-9_-]{15,}$/.test(url)) return url; // pasted a raw id
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

// Notify the collector inline (server-side, awaited).
async function notifyCollectorReport(opts: {
  collectorId: string;
  matchName: string;
  reviewDate: string | null;
  notes: string | null;
}) {
  const { collectorId, matchName, reviewDate, notes } = opts;

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!serviceKey) {
    console.warn("[upload-notify] SUPABASE_SERVICE_ROLE_KEY not set - email skipped");
    return;
  }
  if (!gmailUser || !gmailPass) {
    console.warn("[upload-notify] GMAIL_USER or GMAIL_APP_PASSWORD not set - email skipped");
    return;
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { persistSession: false } }
  );

  const { data: collector } = await admin
    .from("collectors")
    .select("hr_code")
    .eq("id", collectorId)
    .single();
  if (!collector?.hr_code) {
    console.warn(`[upload-notify] no hr_code for collector ${collectorId} - email skipped`);
    return;
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("hr_code", collector.hr_code)
    .single();
  if (!profile?.id) {
    console.warn(`[upload-notify] no profile for hr_code ${collector.hr_code} - email skipped`);
    return;
  }

  const {
    data: { user: targetUser },
  } = await admin.auth.admin.getUserById(profile.id);
  const email = targetUser?.email;
  if (!email) {
    console.warn(`[upload-notify] no email for profile ${profile.id} - email skipped`);
    return;
  }

  const dateStr = reviewDate ? ` for ${reviewDate}` : "";
  const bodySection = notes
    ? `<p style="color:#374151;">${notes.replace(/\n/g, "<br>")}</p>`
    : "";
  const html = `
    <p>Hello,</p>
    <p>A new match session report has been uploaded for you${dateStr}:</p>
    <h3 style="margin:12px 0 4px;">${matchName}</h3>
    ${bodySection}
    <p>Please log in to the Collector Performance Dashboard to view your report, acknowledge it, and add any notes.</p>
  `;

  const from = process.env.EMAIL_FROM ?? `Hudl Feedback <${gmailUser}>`;
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailPass },
  });
  await transporter.sendMail({
    from,
    to: email,
    subject: `New Report: ${matchName}`,
    html,
  });
  console.log(`[upload-notify] Email sent to ${email}`);
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  if (isViewingAs()) {
    return NextResponse.json(
      { error: "Read-only: exit the 'View as' preview before making changes." },
      { status: 403 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !["Admin", "Uploader"].includes(profile.role)) {
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
  // "merged" tells the UI we appended to an existing report instead of creating
  // a new one (when an admin re-submits the same match for the same collector).
  let merged = false;
  // Only set for a brand-new session - used to email the collector at the end.
  let notify: {
    collectorId: string;
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
    const collectorId = String(body.collector_id || "");
    const matchName = String(body.match_name || "").trim();
    const reviewDate = String(body.review_date || "") || null;
    const notes = String(body.overall_notes || "");
    const score =
      body.quality_score != null ? parseInt(String(body.quality_score), 10) : null;

    if (!collectorId || !matchName) {
      return NextResponse.json(
        { error: "collector and match name are required" },
        { status: 400 }
      );
    }

    // Look for an existing report for this collector + match (case-insensitive).
    // If one exists we merge into it instead of creating a duplicate.
    const { data: existingSessions } = await supabase
      .from("match_sessions")
      .select("id, match_name")
      .eq("collector_id", collectorId)
      .ilike("match_name", matchName);

    const existing =
      (existingSessions ?? []).find(
        (s: any) =>
          (s.match_name ?? "").trim().toLowerCase() === matchName.toLowerCase()
      ) ?? null;

    if (existing) {
      matchSessionId = existing.id;
      merged = true;
    } else {
      const { data: created, error } = await supabase
        .from("match_sessions")
        .insert({
          collector_id: collectorId,
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
      notify = { collectorId, matchName, reviewDate, notes: notes || null };
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

  // Dedupe: skip any drive_file_id that's already attached to this session.
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

  // Email the collector (only on brand-new sessions). Never fail the upload.
  if (notify) {
    try {
      await notifyCollectorReport(notify);
    } catch (e: any) {
      console.error(`[upload-notify] Gmail send failed: ${e?.message ?? e}`);
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
