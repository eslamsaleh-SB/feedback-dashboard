import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isViewingAs } from "@/lib/effective";

export const runtime = "nodejs";
export const maxDuration = 60;

// v59: uploader for the two per-event tabs from the Google Sheet.
//
//  type=base   -> base_events
//    columns:  Review Date | Match ID | Part ID | Code | Error Type
//              | Event Name | Collector Event | Reviewer Event | Total Count
//
//  type=extras -> extras_events
//    columns:  Review Date | Match ID | hr_code | Part ID
//              | Event Name | Extra Field | Changed From | Changed To | Total Count
//
// Both accept CSV (comma) or TSV (tab) and UTF-16LE with BOM (Excel default).
// A repeat upload of the same rows is treated as an append; run the Admin
// delete widget to wipe a date range before re-uploading if needed.

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

function normHeader(h: string) {
  return h.toLowerCase().replace(/[\s.]+/g, "_").replace(/\/+/g, "_");
}

function toIntOrOne(s: string | undefined) {
  const n = parseInt(String(s ?? "").replace(/[,\s"]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function toIsoDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // MM/DD/YYYY (Sheets default when exported to CSV in US locale).
  const m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/.exec(s);
  if (m) {
    let [, mm, dd, yy] = m;
    if (yy.length === 2) yy = String(2000 + Number(yy));
    return `${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  return null;
}

async function requireAdmin(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", status: 401 as const };
  const { data: me } = await supabase.from("users").select("role").eq("id", user.id).single();
  if ((me as any)?.role !== "Admin") return { error: "Admins only", status: 403 as const };
  return { user };
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  if (isViewingAs()) {
    return NextResponse.json({ error: "Read-only in 'View as' mode." }, { status: 403 });
  }
  const auth = await requireAdmin(supabase);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const form = await req.formData();
  const type = String(form.get("type") || "");
  const file = form.get("file") as File | null;
  if (!file || !["base", "extras"].includes(type)) {
    return NextResponse.json({ error: "Missing type (base|extras) or file." }, { status: 400 });
  }

  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const text =
    bytes[0] === 0xff && bytes[1] === 0xfe
      ? new TextDecoder("utf-16le").decode(buf)
      : new TextDecoder("utf-8").decode(buf);

  const rows = parseRows(text);
  if (rows.length < 2) {
    return NextResponse.json({ error: "File is empty or has no data rows." }, { status: 400 });
  }

  const headers = rows[0].map(normHeader);
  const idx = (name: string) => headers.findIndex((h) => h === name || h.includes(name));

  const skipped: string[] = [];

  if (type === "base") {
    const iDate = idx("review_date");
    const iMatch = idx("match_id");
    const iPart = idx("part_id");
    const iHr = idx("code");
    const iErr = idx("error_type");
    const iName = idx("event_name");
    const iCol = idx("collector_event");
    const iRev = idx("reviewer_event");
    const iCount = idx("total_count");
    if (iMatch < 0 || iName < 0) {
      return NextResponse.json({
        error: "Base file must include Match ID + Event Name columns.",
      }, { status: 400 });
    }

    const inserts: any[] = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      inserts.push({
        review_date: toIsoDate(r[iDate]),
        match_id: (r[iMatch] ?? "").trim() || null,
        part_id: r[iPart] ? Number(r[iPart]) || null : null,
        hr_code: (r[iHr] ?? "").trim() || null,
        error_type: (r[iErr] ?? "").trim() || null,
        event_name: (r[iName] ?? "").trim() || null,
        collector_event: iCol >= 0 ? (r[iCol] ?? "").trim() || null : null,
        reviewer_event: iRev >= 0 ? (r[iRev] ?? "").trim() || null : null,
        total_count: iCount >= 0 ? toIntOrOne(r[iCount]) : 1,
        uploaded_by: auth.user.id,
      });
    }
    if (inserts.length === 0) {
      return NextResponse.json({ error: "No valid rows in the file." }, { status: 400 });
    }
    const { error } = await supabase.from("base_events").insert(inserts);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, inserted: inserts.length, skipped });
  }

  // type === "extras"
  const iDate = idx("review_date");
  const iMatch = idx("match_id");
  const iPart = idx("part_id");
  const iName = idx("event_name");
  const iExtra = idx("extra_field");
  const iFrom = idx("changed_from");
  const iTo = idx("changed_to");
  const iCount = idx("total_count");
  // Accept "hr_code" or legacy "code".
  const iHr = (() => { const a = idx("hr_code"); return a >= 0 ? a : idx("code"); })();
  if (iMatch < 0 || iName < 0) {
    return NextResponse.json({
      error: "Extras file must include Match ID + Event Name columns.",
    }, { status: 400 });
  }

  const inserts: any[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    inserts.push({
      review_date: toIsoDate(r[iDate]),
      match_id: (r[iMatch] ?? "").trim() || null,
      part_id: r[iPart] ? Number(r[iPart]) || null : null,
      hr_code: iHr >= 0 ? (r[iHr] ?? "").trim() || null : null,
      event_name: (r[iName] ?? "").trim() || null,
      extra_field: iExtra >= 0 ? (r[iExtra] ?? "").trim() || null : null,
      changed_from: iFrom >= 0 ? (r[iFrom] ?? "").trim() || null : null,
      changed_to: iTo >= 0 ? (r[iTo] ?? "").trim() || null : null,
      total_count: iCount >= 0 ? toIntOrOne(r[iCount]) : 1,
      uploaded_by: auth.user.id,
    });
  }
  if (inserts.length === 0) {
    return NextResponse.json({ error: "No valid rows in the file." }, { status: 400 });
  }
  const { error } = await supabase.from("extras_events").insert(inserts);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, inserted: inserts.length, skipped });
}
