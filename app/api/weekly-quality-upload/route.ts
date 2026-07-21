import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isViewingAs } from "@/lib/effective";

export const runtime = "nodejs";
export const maxDuration = 60;

// v53: accept the SAME two file formats as the monthly quality upload.
//
//   type=module        -> "Collector Module Score" CSV (tall format).
//                         Columns: hr_code, module, collector_mod_event_count,
//                                  collector_score, errors, match_count
//                         Modules: base, players, formation_tactical, location,
//                                  impact, extras, squad
//   type=freeze_frame  -> "Freeze Frame Score" CSV.
//                         Columns: collector_hr_code, Avg. ff_score, match_count
//
// Files are usually UTF-16LE TSVs (Excel default). We sniff the BOM and fall
// back to UTF-8 comma or tab.

function parsePct(s: string): number | null {
  if (s == null) return null;
  const clean = String(s).replace(/[%\s,"]/g, "");
  if (!clean) return null;
  const n = parseFloat(clean);
  return Number.isFinite(n) ? n : null;
}

function parseRows(text: string): string[][] {
  const clean = text.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const first = clean.split("\n")[0] ?? "";
  const sep = first.includes("\t") ? "\t" : ",";
  return clean
    .split("\n")
    .map((l) => {
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

const MODULE_COLUMNS = new Set([
  "base",
  "players",
  "formation_tactical",
  "location",
  "impact",
  "extras",
  "squad",
]);

function normalizeModuleName(raw: string): string | null {
  const n = String(raw || "")
    .toLowerCase()
    .trim()
    .replace(/[\s.\-]+/g, "_")
    .replace(/\/+/g, "_");
  if (MODULE_COLUMNS.has(n)) return n;
  if (n === "event") return "base";                    // legacy alias
  if (n === "formation" || n === "tactical") return "formation_tactical";
  return null;
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
    .from("profiles").select("role").eq("id", user.id).single();
  const role = profile?.role ?? "Viewer";
  if (!["Admin", "QualityLeader"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const form = await req.formData();
  const type = String(form.get("type") || "");   // "module" | "freeze_frame"
  const week = String(form.get("week") || "");   // YYYY-MM-DD Sunday
  const file = form.get("file") as File | null;

  if (!week || !file || !type) {
    return NextResponse.json({ error: "Missing type, week, or file" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) {
    return NextResponse.json({ error: "week must be YYYY-MM-DD" }, { status: 400 });
  }
  if (!["module", "freeze_frame"].includes(type)) {
    return NextResponse.json({ error: "type must be module or freeze_frame" }, { status: 400 });
  }

  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let text: string;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) text = new TextDecoder("utf-16le").decode(buf);
  else text = new TextDecoder("utf-8").decode(buf);

  const rows = parseRows(text);
  if (rows.length < 2) {
    return NextResponse.json({ error: "File is empty or has no data rows" }, { status: 400 });
  }

  const headers = rows[0].map((h) =>
    h.toLowerCase().replace(/[\s.]+/g, "_").replace(/\/+/g, "_")
  );
  const warnings: string[] = [];

  // Pivot rows onto (hr_code, week_start_date) then upsert. We fetch existing
  // rows for this week first so we don't wipe modules that are in the DB but
  // not in the file (e.g. uploaded freeze_frame first, then module later, or
  // vice versa).
  const { data: existingRows } = await supabase
    .from("weekly_quality_scores")
    .select("hr_code, base, players, formation_tactical, location, impact, extras, squad, freeze_frame_score")
    .eq("week_start_date", week);

  const wideByHr = new Map<string, any>();
  for (const r of existingRows ?? []) wideByHr.set((r as any).hr_code, { ...(r as any) });

  if (type === "module") {
    const hrIdx    = headers.findIndex((h) => h.includes("hr_code"));
    const modIdx   = headers.findIndex((h) => h === "module");
    const scoreIdx = headers.findIndex((h) => h.includes("score"));
    if (hrIdx < 0 || modIdx < 0 || scoreIdx < 0) {
      return NextResponse.json(
        { error: "Could not find required columns: hr_code, module, collector_score" },
        { status: 400 }
      );
    }
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const hr = r[hrIdx]?.trim();
      const rawMod = r[modIdx]?.trim();
      const score = parsePct(r[scoreIdx] ?? "");
      if (!hr || !rawMod || score == null) continue;
      const col = normalizeModuleName(rawMod);
      if (!col) {
        warnings.push(`Row ${i + 1}: unknown module "${rawMod}", skipped`);
        continue;
      }
      const row = wideByHr.get(hr) ?? { hr_code: hr };
      row[col] = score;
      wideByHr.set(hr, row);
    }
  } else {
    const hrIdx    = headers.findIndex((h) => h.includes("hr_code"));
    const scoreIdx = headers.findIndex((h) => h.includes("ff_score") || h === "score" || h.includes("avg_ff_score"));
    if (hrIdx < 0 || scoreIdx < 0) {
      return NextResponse.json(
        { error: "Could not find required columns: hr_code, ff_score" },
        { status: 400 }
      );
    }
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const hr = r[hrIdx]?.trim();
      const score = parsePct(r[scoreIdx] ?? "");
      if (!hr || score == null) continue;
      const row = wideByHr.get(hr) ?? { hr_code: hr };
      row.freeze_frame_score = score;
      wideByHr.set(hr, row);
    }
  }

  const inserts = Array.from(wideByHr.values()).map((r: any) => ({
    hr_code: r.hr_code,
    week_start_date: week,
    base: r.base ?? null,
    players: r.players ?? null,
    formation_tactical: r.formation_tactical ?? null,
    location: r.location ?? null,
    impact: r.impact ?? null,
    extras: r.extras ?? null,
    squad: r.squad ?? null,
    freeze_frame_score: r.freeze_frame_score ?? null,
    uploaded_by: user.id,
  }));
  if (inserts.length === 0) {
    return NextResponse.json({ error: "No valid rows found in the file" }, { status: 400 });
  }

  const { error } = await supabase
    .from("weekly_quality_scores")
    .upsert(inserts, { onConflict: "hr_code,week_start_date" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    upserted: inserts.length,
    warnings: warnings.slice(0, 10),
  });
}
