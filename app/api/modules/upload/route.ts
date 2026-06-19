import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// ---- Per-module column configuration -------------------------------------
// Maps each module to its table, the CSV header that holds the collector HR
// code, the date column + its format, and the extra columns to store.
// Header keys are matched case-insensitively against the CSV.
type FieldType = "text" | "num";
type ModuleConfig = {
  table: string;
  hrHeader: string; // CSV header for the collector HR code
  dateHeader: string;
  dateFormat: "dmy" | "mdy";
  // extra columns: csv header (lowercased) -> { col, type }
  fields: { csv: string; col: string; type: FieldType }[];
};

const COMMON = (hr: string): { csv: string; col: string; type: FieldType }[] => [
  { csv: "review_type", col: "review_type", type: "text" },
  { csv: "reviewer_code", col: "reviewer_code", type: "text" },
  { csv: hr, col: "hr_code", type: "text" },
  { csv: "collector_event", col: "collector_event", type: "text" },
  { csv: "video_timestamp", col: "video_timestamp", type: "text" },
  { csv: "error_type", col: "error_type", type: "text" },
  { csv: "defect_type", col: "defect_type", type: "text" },
];

export const MODULE_CONFIG: Record<string, ModuleConfig> = {
  event: {
    table: "event",
    hrHeader: "base_hr_code",
    dateHeader: "review_date",
    dateFormat: "dmy",
    fields: [
      ...COMMON("base_hr_code"),
      { csv: "base_squad", col: "squad", type: "text" },
      { csv: "reviewer event", col: "reviewer_event", type: "text" },
    ],
  },
  players: {
    table: "players",
    hrHeader: "players_hr_code",
    dateHeader: "review_date",
    dateFormat: "dmy",
    fields: [
      ...COMMON("players_hr_code"),
      { csv: "players_squad", col: "squad", type: "text" },
      { csv: "team_type", col: "team_type", type: "text" },
      { csv: "player_1_jersey_collector", col: "player_1_jersey_collector", type: "text" },
      { csv: "player_1_jersey_reviewer", col: "player_1_jersey_reviewer", type: "text" },
      { csv: "player_2_jersey_collector", col: "player_2_jersey_collector", type: "text" },
      { csv: "player_2_jersey_reviewer", col: "player_2_jersey_reviewer", type: "text" },
    ],
  },
  formation_tactical: {
    table: "formation_tactical",
    hrHeader: "formation_hr_code",
    dateHeader: "review_date",
    dateFormat: "dmy",
    fields: [
      ...COMMON("formation_hr_code"),
      { csv: "formation_squad", col: "squad", type: "text" },
      { csv: "formation_collector", col: "formation_collector", type: "text" },
      { csv: "formation_reviewer", col: "formation_reviewer", type: "text" },
    ],
  },
  location: {
    table: "location",
    hrHeader: "location_hr_code",
    dateHeader: "review_date",
    dateFormat: "dmy",
    fields: [
      ...COMMON("location_hr_code"),
      { csv: "location_squad", col: "squad", type: "text" },
      { csv: "actual_location_diff", col: "actual_location_diff", type: "num" },
    ],
  },
  impact: {
    table: "impact",
    hrHeader: "impact_hr_code",
    dateHeader: "review_date",
    dateFormat: "dmy",
    fields: [
      { csv: "reviewer_code", col: "reviewer_code", type: "text" },
      { csv: "impact_hr_code", col: "hr_code", type: "text" },
      { csv: "impact_squad", col: "squad", type: "text" },
      { csv: "collector_event", col: "collector_event", type: "text" },
      { csv: "video_timestamp", col: "video_timestamp", type: "text" },
      { csv: "error_type", col: "error_type", type: "text" },
      { csv: "impact_collector", col: "impact_collector", type: "num" },
      { csv: "impact_reviewer", col: "impact_reviewer", type: "num" },
      { csv: "impact_difference", col: "impact_difference", type: "num" },
    ],
  },
  extras: {
    table: "extras",
    hrHeader: "extras_hr_code",
    dateHeader: "review_date",
    dateFormat: "dmy",
    fields: [
      ...COMMON("extras_hr_code"),
      { csv: "extras_squad", col: "squad", type: "text" },
      { csv: "body-part_collector", col: "body_part_collector", type: "text" },
      { csv: "body-part_reviewer", col: "body_part_reviewer", type: "text" },
      { csv: "new extras collector", col: "new_extras_collector", type: "text" },
      { csv: "new extras reviewer", col: "new_extras_reviewer", type: "text" },
      { csv: "type_collector", col: "type_collector", type: "text" },
      { csv: "type_reviewer", col: "type_reviewer", type: "text" },
      { csv: "height_collector", col: "height_collector", type: "text" },
      { csv: "height_reviewer", col: "height_reviewer", type: "text" },
      { csv: "technique_collector", col: "technique_collector", type: "text" },
      { csv: "technique_reviewer", col: "technique_reviewer", type: "text" },
      { csv: "location_collector", col: "location_collector", type: "text" },
      { csv: "location_reviewer", col: "location_reviewer", type: "text" },
    ],
  },
  freeze_frame: {
    table: "freeze_frame",
    hrHeader: "collector_hr_code",
    dateHeader: "a_review_date",
    dateFormat: "mdy",
    fields: [
      { csv: "collector_hr_code", col: "hr_code", type: "text" },
      { csv: "videotimestamp", col: "video_timestamp", type: "text" },
      { csv: "avg. ff_score", col: "avg_ff_score", type: "text" },
      { csv: "total_errors", col: "total_errors", type: "num" },
      { csv: "player_count", col: "player_count", type: "num" },
      { csv: "a_shots", col: "a_shots", type: "num" },
      { csv: "changed_shooter", col: "changed_shooter", type: "num" },
      { csv: "changed_keeper", col: "changed_keeper", type: "num" },
      { csv: "changed_opponent", col: "changed_opponent", type: "num" },
      { csv: "changed_team", col: "changed_team", type: "num" },
      { csv: "added_player", col: "added_player", type: "num" },
      { csv: "deleted_player", col: "deleted_player", type: "num" },
      { csv: "changed_location", col: "changed_location", type: "num" },
      { csv: "added_shot", col: "added_shot", type: "num" },
      { csv: "changed_impact", col: "changed_impact", type: "num" },
    ],
  },
};

// ---- helpers --------------------------------------------------------------
function parseDate(v: unknown, fmt: "dmy" | "mdy"): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  // dd/mm/yyyy or m/d/yyyy (also tolerate '-')
  const m = s.match(/^(\d{1,4})[\/\-](\d{1,2})[\/\-](\d{1,4})/);
  if (!m) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  let a = m[1], b = m[2], c = m[3];
  let day: string, mon: string, year: string;
  if (a.length === 4) {
    // yyyy-mm-dd
    year = a; mon = b; day = c;
  } else if (fmt === "dmy") {
    day = a; mon = b; year = c;
  } else {
    mon = a; day = b; year = c;
  }
  const Y = year.padStart(4, "20");
  const M = mon.padStart(2, "0");
  const D = day.padStart(2, "0");
  const iso = `${Y}-${M}-${D}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function parseNum(v: unknown): number | null {
  const s = String(v ?? "").trim().replace(/%$/, "");
  if (!s || s.toLowerCase() === "nan") return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

function clean(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s || s.toLowerCase() === "nan") return null;
  return s;
}

// Lowercase every key of an incoming row so header matching is case-insensitive.
function lc(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(row)) out[k.trim().toLowerCase()] = row[k];
  return out;
}

export async function POST(req: NextRequest) {
  // ---- Auth + role (Admin/Uploader only) ----
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
    return NextResponse.json(
      { error: "Only Admins/Uploaders can upload module data" },
      { status: 403 }
    );
  }

  // ---- Validate body ----
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const module = String(body.module || "");
  const cfg = MODULE_CONFIG[module];
  if (!cfg) {
    return NextResponse.json(
      { error: `Unknown module. Pick one of: ${Object.keys(MODULE_CONFIG).join(", ")}` },
      { status: 400 }
    );
  }

  const rawRows: Record<string, unknown>[] = Array.isArray(body.rows)
    ? body.rows
    : [];
  if (rawRows.length === 0) {
    return NextResponse.json(
      { error: "No rows found in the uploaded CSV." },
      { status: 400 }
    );
  }

  // ---- Transform rows ----
  const childRows: Record<string, unknown>[] = [];
  // matchid|partid -> { matchid, partid, hr_code, date }
  const assignments = new Map<
    string,
    { matchid: string; partid: number; hr_code: string | null; date: string | null }
  >();
  const hrCodes = new Set<string>();
  const problems: string[] = [];

  rawRows.forEach((raw, i) => {
    const r = lc(raw);
    const matchid = clean(r["matchid"]);
    const partidRaw = clean(r["partid"]);
    const key = clean(r["key"]);

    if (!matchid) return problems.push(`Row ${i + 1}: missing matchid`);
    if (!partidRaw) return problems.push(`Row ${i + 1}: missing partid`);
    if (!key) return problems.push(`Row ${i + 1}: missing key`);

    const partid = parseInt(partidRaw, 10);
    if (isNaN(partid))
      return problems.push(`Row ${i + 1}: bad partid "${partidRaw}"`);

    const hr_code = clean(r[cfg.hrHeader]);
    const date = parseDate(r[cfg.dateHeader], cfg.dateFormat);
    if (hr_code) hrCodes.add(hr_code);

    const akey = `${matchid}|${partid}`;
    if (!assignments.has(akey))
      assignments.set(akey, { matchid, partid, hr_code, date });

    // Build the child row.
    const child: Record<string, unknown> = { matchid, partid, key, review_date: date };
    for (const f of cfg.fields) {
      child[f.col] = f.type === "num" ? parseNum(r[f.csv]) : clean(r[f.csv]);
    }
    childRows.push(child);
  });

  if (childRows.length === 0) {
    return NextResponse.json(
      { error: `Nothing to import. ${problems.slice(0, 3).join("; ")}` },
      { status: 400 }
    );
  }

  // ---- 1) Ensure a collector row exists for every HR code (auto-create) ----
  if (hrCodes.size > 0) {
    const collectorRows = Array.from(hrCodes).map((hr) => ({
      hr_code: hr,
      name: hr, // placeholder name; Admin can rename on the Collectors page
    }));
    const { error: cErr } = await supabase
      .from("collectors")
      .upsert(collectorRows, { onConflict: "hr_code", ignoreDuplicates: true });
    if (cErr) {
      return NextResponse.json(
        { error: `Could not ensure collectors: ${cErr.message}` },
        { status: 400 }
      );
    }
  }

  // ---- 2) Upsert match_assignments on (matchid, partid) ----
  const assignmentPayload = Array.from(assignments.values()).map((a) => ({
    matchid: a.matchid,
    partid: a.partid,
    hr_code: a.hr_code,
    uploaded_by: user.id,
    ...(a.date ? { date: a.date } : {}),
  }));

  const { error: aErr } = await supabase
    .from("match_assignments")
    .upsert(assignmentPayload, { onConflict: "matchid,partid" });
  if (aErr) {
    return NextResponse.json(
      { error: `Could not save match assignments: ${aErr.message}` },
      { status: 400 }
    );
  }

  // ---- 3) Upsert child rows on key (dedup within module) ----
  // Collapse duplicate keys inside this CSV (last wins) to avoid a Postgres
  // "ON CONFLICT cannot affect row a second time" error.
  const seen = new Map<string, Record<string, unknown>>();
  for (const row of childRows) seen.set(String(row.key), row);
  const dedupedChild = Array.from(seen.values());

  const { error: childErr, count } = await supabase
    .from(cfg.table)
    .upsert(dedupedChild, { onConflict: "key", count: "exact" });
  if (childErr) {
    return NextResponse.json(
      { error: `Could not save ${cfg.table} rows: ${childErr.message}` },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    module,
    assignments_upserted: assignmentPayload.length,
    collectors_touched: hrCodes.size,
    rows_upserted: count ?? dedupedChild.length,
    duplicates_collapsed: childRows.length - dedupedChild.length,
    skipped: problems.length,
    notes: problems.slice(0, 5),
  });
}
