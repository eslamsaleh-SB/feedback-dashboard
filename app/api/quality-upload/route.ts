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

// Strip BOM, normalise line endings, auto-detect tab vs comma, honour "quoted, cells".
function parseTable(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const first = clean.slice(0, clean.indexOf("\n") >= 0 ? clean.indexOf("\n") : clean.length);
  const sep = first.includes("\t") ? "\t" : ",";
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (q) {
      if (ch === '"' && clean[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell.trim()); cell = ""; }
    else if (ch === "\n") { row.push(cell.trim()); out.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  row.push(cell.trim());
  out.push(row);
  return out.filter((r) => r.some((c) => c));
}

const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];
// "August" / "Aug" / "8" / "2026-08" -> 1..12 (null if unknown)
function monthNum(s: string): number | null {
  const v = (s ?? "").trim().toLowerCase();
  if (!v) return null;
  const iso = v.match(/^\d{4}-(\d{1,2})/);
  if (iso) return Number(iso[1]);
  if (/^\d{1,2}$/.test(v)) { const n = Number(v); return n >= 1 && n <= 12 ? n : null; }
  const i = MONTHS.findIndex((m) => m === v || m.slice(0, 3) === v.slice(0, 3));
  return i >= 0 ? i + 1 : null;
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

  const rows = parseTable(text);
  if (rows.length < 2) {
    return NextResponse.json({ error: "File is empty or has no data rows" }, { status: 400 });
  }

  const headers = rows[0].map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  let upserted = 0;
  let errors: string[] = [];
  let months: string[] = [month];

  if (type === "module") {
    // Columns: hr_code, module, score  (+ optional: Month, total_errors,
    // total_reviewed_events, match_count). With a Month column every row goes to
    // its own month (year = Year selector) and the Month selector is ignored.
    const hrIdx     = headers.findIndex((h) => h.includes("hr_code"));
    const modIdx    = headers.findIndex((h) => h === "module");
    const scoreIdx  = headers.findIndex((h) => h === "score" || h === "collector_score" || h.endsWith("_score"));
    const monthIdx  = headers.findIndex((h) => h === "month");            // first Month column only
    const errIdx    = headers.findIndex((h) => h.includes("total_errors") || h === "errors");
    const revIdx    = headers.findIndex((h) => h.includes("reviewed_events") || h.includes("mod_event_count"));
    const matchIdx  = headers.findIndex((h) => h.includes("match_count"));
    const year      = month.slice(0, 4);

    if (hrIdx < 0 || modIdx < 0 || scoreIdx < 0) {
      return NextResponse.json(
        { error: "Could not find required columns: hr_code, module, score" },
        { status: 400 }
      );
    }

    const byKey = new Map<string, any>();
    let blank = 0;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const hr  = r[hrIdx]?.trim();
      const mod = r[modIdx]?.trim().toLowerCase();
      if (!hr && !mod) { blank++; continue; }          // empty / #DIV/0! filler rows
      const score = parsePct(r[scoreIdx] ?? "");
      let rowMonth = uploadMonth;
      if (monthIdx >= 0) {
        const m = monthNum(r[monthIdx] ?? "");
        if (!m) { errors.push(`Row ${i + 1}: unknown month "${r[monthIdx] ?? ""}"`); continue; }
        rowMonth = `${year}-${String(m).padStart(2, "0")}-01`;
      }
      if (!hr || !mod || score === null) {
        errors.push(`Row ${i + 1}: skipped (hr=${hr}, module=${mod}, score=${r[scoreIdx]})`);
        continue;
      }
      // Same hr+module+month twice in the file -> keep the last one.
      byKey.set(`${hr}|${mod}|${rowMonth}`, {
        hr_code: hr,
        module: mod,
        score,
        match_count: matchIdx >= 0 ? parseNum(r[matchIdx] ?? "") : null,
        total_errors: errIdx >= 0 ? parseNum(r[errIdx] ?? "") : null,
        total_reviewed_events: revIdx >= 0 ? parseNum(r[revIdx] ?? "") : null,
        upload_month: rowMonth,
        uploaded_by: user.id,
      });
    }
    const inserts = Array.from(byKey.values());

    if (inserts.length === 0) {
      return NextResponse.json({ error: "No valid rows found in the file" }, { status: 400 });
    }

    for (let k = 0; k < inserts.length; k += 1000) {
      const { error: dbErr } = await supabase
        .from("quality_scores")
        .upsert(inserts.slice(k, k + 1000), { onConflict: "hr_code,module,upload_month" });
      if (dbErr) {
        return NextResponse.json(
          { error: `${dbErr.message} (saved ${k} of ${inserts.length} rows before the error)` },
          { status: 500 }
        );
      }
    }
    upserted = inserts.length;
    months = Array.from(new Set(inserts.map((x) => String(x.upload_month).slice(0, 7)))).sort();
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

  return NextResponse.json({
    ok: true,
    upserted,
    months,
    warningCount: errors.length,
    warnings: errors.slice(0, 10),
  });
}
