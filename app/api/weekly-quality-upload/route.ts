import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isViewingAs } from "@/lib/effective";

export const runtime = "nodejs";
export const maxDuration = 60;

function parseNumeric(s: string): number | null {
  if (s == null) return null;
  const clean = String(s).replace(/[%\s,"]/g, "");
  if (!clean) return null;
  const n = parseFloat(clean);
  return Number.isFinite(n) ? n : null;
}

function parseCsv(text: string): string[][] {
  // Support both tab-separated and comma-separated CSVs. Sniff the first line.
  const clean = text.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const first = clean.split("\n")[0] ?? "";
  const sep = first.includes("\t") ? "\t" : ",";
  return clean
    .split("\n")
    .map((l) => {
      // naive comma parser that respects double-quoted cells with escaped quotes.
      if (sep === "\t") return l.split("\t").map((c) => c.trim());
      const out: string[] = [];
      let cur = "";
      let quoted = false;
      for (let i = 0; i < l.length; i++) {
        const ch = l[i];
        if (quoted) {
          if (ch === '"') {
            if (l[i + 1] === '"') { cur += '"'; i++; } else { quoted = false; }
          } else cur += ch;
        } else {
          if (ch === '"') quoted = true;
          else if (ch === ",") { out.push(cur.trim()); cur = ""; }
          else cur += ch;
        }
      }
      out.push(cur.trim());
      return out;
    })
    .filter((r) => r.some((c) => c));
}

// Column name -> DB field. Users' CSV headers can vary slightly, so accept synonyms.
const FIELD_MAP: Record<string, string> = {
  players: "players",
  event: "event",
  events: "event",
  "formation_tactical": "formation_tactical",
  "formation/tactical": "formation_tactical",
  "formation & tactical": "formation_tactical",
  "formation": "formation_tactical",
  location: "location",
  impact: "impact",
  extras: "extras",
  freeze_frame_score: "freeze_frame_score",
  freeze_frame: "freeze_frame_score",
  freezeframe: "freeze_frame_score",
  "ff_score": "freeze_frame_score",
  "freeze frame score": "freeze_frame_score",
};

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
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const role = profile?.role ?? "Viewer";
  if (!["Admin", "QualityLeader"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const form = await req.formData();
  const week = form.get("week") as string;   // YYYY-MM-DD (Sunday)
  const file = form.get("file") as File | null;
  if (!week || !file) {
    return NextResponse.json({ error: "Missing week or file" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) {
    return NextResponse.json({ error: "week must be YYYY-MM-DD" }, { status: 400 });
  }

  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let text: string;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) text = new TextDecoder("utf-16le").decode(buf);
  else text = new TextDecoder("utf-8").decode(buf);

  const rows = parseCsv(text);
  if (rows.length < 2) {
    return NextResponse.json({ error: "File is empty or has no data rows" }, { status: 400 });
  }

  const headers = rows[0].map((h) => h.toLowerCase().replace(/\s+/g, "_").replace(/\./g, ""));
  const hrIdx = headers.findIndex((h) => h.includes("hr_code") || h === "hr" || h === "code");
  if (hrIdx < 0) {
    return NextResponse.json({ error: "Could not find hr_code column" }, { status: 400 });
  }

  // Map column indexes to DB fields
  const fieldByIdx: Record<number, string> = {};
  headers.forEach((h, i) => {
    if (i === hrIdx) return;
    const key = h.replace(/_/g, " ").replace(/-/g, " ").trim().replace(/\s+/g, "_");
    const norm = key.toLowerCase();
    const mapped = FIELD_MAP[norm] ?? FIELD_MAP[norm.replace(/_/g, " ")] ?? null;
    if (mapped) fieldByIdx[i] = mapped;
  });

  if (Object.keys(fieldByIdx).length === 0) {
    return NextResponse.json(
      { error: "No recognized score columns found. Expected: players, event, formation_tactical, location, impact, extras, freeze_frame_score" },
      { status: 400 }
    );
  }

  const inserts: any[] = [];
  const warnings: string[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const hr = r[hrIdx]?.trim();
    if (!hr) continue;
    const row: any = {
      hr_code: hr,
      week_start_date: week,
      uploaded_by: user.id,
    };
    let anyValue = false;
    for (const [idxStr, field] of Object.entries(fieldByIdx)) {
      const value = parseNumeric(r[Number(idxStr)] ?? "");
      if (value != null) {
        row[field] = value;
        anyValue = true;
      }
    }
    if (!anyValue) {
      warnings.push(`Row ${i + 1} (${hr}): no numeric values, skipped`);
      continue;
    }
    inserts.push(row);
  }

  if (inserts.length === 0) {
    return NextResponse.json({ error: "No valid rows found in the file" }, { status: 400 });
  }

  const { error } = await supabase
    .from("weekly_quality_scores")
    .upsert(inserts, { onConflict: "hr_code,week_start_date" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    upserted: inserts.length,
    warnings: warnings.slice(0, 10),
  });
}
