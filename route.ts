import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const DRIVE_API_KEY = process.env.GOOGLE_DRIVE_API_KEY!;

// Pull the folder id out of any common Google Drive folder URL,
// or accept a bare id.
function extractFolderId(input: string): string | null {
  const url = input.trim();
  const folders = url.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (folders) return folders[1];
  const idParam = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParam) return idParam[1];
  if (/^[a-zA-Z0-9_-]{15,}$/.test(url)) return url; // pasted a raw id
  return null;
}

// List all video files inside a public Drive folder using an API key.
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

export async function POST(req: NextRequest) {
  // ---- Auth + role ----
  const supabase = createClient();
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

  // ---- Read JSON body ----
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

  // ---- Resolve / create the match session ----
  let matchSessionId: string;

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
  }

  // ---- Fetch the videos from Google Drive ----
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

  // ---- Save the file references ----
  const rows = files.map((f) => ({
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

  return NextResponse.json({
    ok: true,
    match_session_id: matchSessionId,
    imported: rows.length,
  });
}
