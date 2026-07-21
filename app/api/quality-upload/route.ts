import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isViewingAs } from "@/lib/effective";

export const dynamic = "force-dynamic";

// Parse a percentage string like "95.91%" → 95.91
function parsePct(s: string): number | null {
  const clean = s.replace(/[%\s,"]/g, "");
  const n = parseFloat(clean);
  return Number.isFinite(n) ? n : null;
}

// Parse a number string that may have commas: "1,787" → 1787
function parseNum(s: string): number | null {
  const clean = s.replace(/[,\s"]/g, "");
  const n = parseInt(clean, 10);
  return Number.isFinite(n) ? n : null;
}

// Strip BOM and normalise line endings; split on tab
function parseTsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return clean
    .split("\n")
    .map((l) => l.split("\t").map((c) => c.trim()))
    .filter((r) => r.some((c) => c));
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
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  const role = profile?.role ?? "Viewer";
  if (!["Admin", "QualityLeader"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const form = await req.formData();
  const type = form.get("type") as string;        // "module" | "freeze_frame"
  const month = form.get("month") as string;      // "YYYY-MM"
  const file = form.get("file") as File | null;

  if (!type || !month || !file) {
    return NextResponse.json({ error: "Missing type, month, or file" }, { status: 400 });
  }

  // Convert YYYY-MM → first day of month for the DB date column
  const uploadMonth = `${month}-01`;

  const buf = await file.arrayBuffer();
  // Try UTF-16 LE (BOM = FF FE) first, fallback to UTF-8
  let text: string;
  const bytes = new Uint8Array(buf);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    text = new TextDecoder("utf-16le").decode(buf);
  } else {
    text = new TextDecoder("utf-8").decode(buf);
  }

  const rows = parseTsv(text);
  if (rows.length < 2) {
    return NextResponse.json({ error: "File is empty or has no data rows" }, { status: 400 });
  }

  const headers = rows[0].map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  let upserted = 0;
  let errors: string[] = [];

  if (type === "module") {
    // Expected columns: hr_code, module, collector_mod_event_count, collector_score, errors, match_count
    const hrIdx    = headers.findIndex((h) => h.includes("hr_code"));
    const modIdx   = headers.findIndex((h) => h === "module");
    const scoreIdx = headers.findIndex((h) => h.includes("score"));
    const matchIdx = headers.findIndex((h) => h.includes("match_count"));

    if (hrIdx < 0 || modIdx < 0 || scoreIdx < 0) {
      return NextResponse.json(
        { error: "Could not find required columns: hr_code, module, collector_score" },
        { status: 400 }
      );
    }

    const inserts: any[] = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const hr    = r[hrIdx]?.trim();
      const mod   = r[modIdx]?.trim();
      const score = parsePct(r[scoreIdx] ?? "");
      const mc    = matchIdx >= 0 ? parseNum(r[matchIdx] ?? "") : null;
      if (!hr || !mod || score === null) {
        if (hr || mod) errors.push(`Row ${i + 1}: skipped (hr=${hr}, mod=${mod}, score=${r[scoreIdx]})`);
        continue;
      }
      inserts.push({
        hr_code: hr,
        module: mod,
        score,
        match_count: mc,
        upload_month: uploadMonth,
        uploaded_by: user.id,
      });
    }

    if (inserts.length === 0) {
      return NextResponse.json({ error: "No valid rows found in the file" }, { status: 400 });
    }

    const { error: dbErr } = await supabase
      .from("quality_scores")
      .upsert(inserts, { onConflict: "hr_code,module,upload_month" });

    if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
    upserted = inserts.length;
  } else if (type === "freeze_frame") {
    // Expected columns: collector_hr_code, Avg. ff_score, match_count
    const hrIdx    = headers.findIndex((h) => h.includes("hr_code"));
    const scoreIdx = headers.findIndex((h) => h.includes("ff_score") || h.includes("score"));
    const matchIdx = headers.findIndex((h) => h.includes("match_count"));

    if (hrIdx < 0 || scoreIdx < 0) {
      return NextResponse.json(
        { error: "Could not find required columns: hr_code, ff_score" },
        { status: 400 }
      );
    }

    const inserts: any[] = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const hr    = r[hrIdx]?.trim();
      const score = parsePct(r[scoreIdx] ?? "");
      const mc    = matchIdx >= 0 ? parseNum(r[matchIdx] ?? "") : null;
      if (!hr || score === null) continue;
      inserts.push({
        hr_code: hr,
        score,
        match_count: mc,
        upload_month: uploadMonth,
        uploaded_by: user.id,
      });
    }

    if (inserts.length === 0) {
      return NextResponse.json({ error: "No valid rows found in the file" }, { status: 400 });
    }

    const { error: dbErr } = await supabase
      .from("freeze_frame_scores")
      .upsert(inserts, { onConflict: "hr_code,upload_month" });

    if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
    upserted = inserts.length;
  } else {
    return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, upserted, warnings: errors.slice(0, 10) });
}
