import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120; // multiple uploads can take a while

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID!;
const MAX_BYTES = 20 * 1024 * 1024; // 20MB per file
const MAX_FILES = 20;

// Send one file to Telegram and return its permanent file_id.
async function sendToTelegram(file: File): Promise<string> {
  const tgForm = new FormData();
  tgForm.append("chat_id", TELEGRAM_CHAT_ID);
  tgForm.append("video", file, file.name || "clip.mp4");

  const res = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVideo`,
    { method: "POST", body: tgForm }
  );
  const json = await res.json();
  if (!json.ok) {
    throw new Error(json.description || "Telegram sendVideo failed");
  }
  const r = json.result;
  const fileId: string | undefined =
    r?.video?.file_id ?? r?.document?.file_id ?? r?.animation?.file_id;
  if (!fileId) throw new Error("No file_id in Telegram response");
  return fileId;
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

  // ---- Read the form ----
  const form = await req.formData();
  const mode = (form.get("mode") as string) || "new"; // "new" | "existing"
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  const descriptions = form.getAll("descriptions").map((d) => String(d ?? ""));

  if (files.length === 0) {
    return NextResponse.json({ error: "No video files provided" }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Too many files (max ${MAX_FILES})` },
      { status: 400 }
    );
  }
  for (const f of files) {
    if (f.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `"${f.name}" is larger than 20MB` },
        { status: 413 }
      );
    }
  }

  // ---- Resolve / create the match session ----
  let matchSessionId: string;

  if (mode === "existing") {
    matchSessionId = String(form.get("match_session_id") || "");
    if (!matchSessionId) {
      return NextResponse.json(
        { error: "match_session_id is required when adding to an existing session" },
        { status: 400 }
      );
    }
    // Confirm the session exists and the user can see it (RLS-scoped read).
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
    const collectorId = String(form.get("collector_id") || "");
    const matchName = String(form.get("match_name") || "").trim();
    const reviewDate = String(form.get("review_date") || "") || null;
    const notes = String(form.get("overall_notes") || "");
    const scoreRaw = form.get("quality_score") as string | null;
    const score = scoreRaw ? parseInt(scoreRaw, 10) : null;

    if (!collectorId || !matchName) {
      return NextResponse.json(
        { error: "collector_id and match_name are required for a new session" },
        { status: 400 }
      );
    }
    if (score !== null && (score < 1 || score > 10)) {
      return NextResponse.json({ error: "quality_score must be 1–10" }, { status: 400 });
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

  // ---- Upload every file to Telegram, then save the rows ----
  const rows: {
    match_session_id: string;
    telegram_file_id: string;
    mistake_description: string;
  }[] = [];
  const failures: { name: string; error: string }[] = [];

  for (let i = 0; i < files.length; i++) {
    try {
      const fileId = await sendToTelegram(files[i]);
      rows.push({
        match_session_id: matchSessionId,
        telegram_file_id: fileId,
        mistake_description: descriptions[i] ?? "",
      });
    } catch (e: any) {
      failures.push({ name: files[i].name, error: e.message });
    }
  }

  if (rows.length > 0) {
    const { error: insertError } = await supabase
      .from("session_videos")
      .insert(rows);
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }
  }

  return NextResponse.json({
    ok: true,
    match_session_id: matchSessionId,
    uploaded: rows.length,
    failed: failures.length,
    failures,
  });
}
