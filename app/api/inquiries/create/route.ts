import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isViewingAs } from "@/lib/effective";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const DRIVE_API_KEY = process.env.GOOGLE_DRIVE_API_KEY!;

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
    .select("hr_code, role")
    .eq("id", user.id)
    .single();
  if (!profile?.hr_code) {
    return NextResponse.json(
      { error: "Your account isn't linked to a collector yet. Ask an admin to link it." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const matchId = String(body.match_id || "").trim();
  const folderUrl = String(body.folder_url || "");
  if (!matchId) {
    return NextResponse.json({ error: "Enter a Match ID." }, { status: 400 });
  }
  const folderId = extractFolderId(folderUrl);
  if (!folderId) {
    return NextResponse.json(
      { error: "Could not read a folder ID from that Google Drive link." },
      { status: 400 }
    );
  }

  // Find or create the inquiry row for this (collector, match).
  // We could rely on the UNIQUE (hr_code, match_id) constraint and do an
  // upsert + select, but a two-step look-then-create is clearer.
  let inquiryId: string;
  let merged = false;
  const { data: existing } = await supabase
    .from("match_inquiries")
    .select("id")
    .eq("hr_code", profile.hr_code)
    .eq("match_id", matchId)
    .maybeSingle();

  if (existing?.id) {
    inquiryId = existing.id as string;
    merged = true;
  } else {
    const { data: created, error: createErr } = await supabase
      .from("match_inquiries")
      .insert({
        hr_code: profile.hr_code,
        match_id: matchId,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (createErr || !created) {
      return NextResponse.json(
        { error: createErr?.message || "Could not create inquiry" },
        { status: 400 }
      );
    }
    inquiryId = created.id as string;
  }

  // Pull the videos from Drive.
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

  // Dedupe against videos already attached to this inquiry.
  const { data: existingVideos } = await supabase
    .from("match_inquiry_videos")
    .select("drive_file_id")
    .eq("inquiry_id", inquiryId);
  const existingIds = new Set(
    (existingVideos ?? []).map((v: any) => v.drive_file_id as string)
  );
  const newFiles = files.filter((f) => !existingIds.has(f.id));
  const skipped = files.length - newFiles.length;

  let inserted = 0;
  if (newFiles.length > 0) {
    const rows = newFiles.map((f) => ({
      inquiry_id: inquiryId,
      drive_file_id: f.id,
      file_name: f.name,
    }));
    const { error: insertError } = await supabase
      .from("match_inquiry_videos")
      .insert(rows);
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }
    inserted = rows.length;
  }

  return NextResponse.json({
    ok: true,
    inquiry_id: inquiryId,
    imported: inserted,
    skipped,
    merged,
  });
}
