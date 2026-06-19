import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Allowed modules (the `module` dimension of module_totals).
export const MODULES = [
  "players",
  "event",
  "formation_tactical",
  "location",
  "impact",
  "extras",
  "freeze_frame",
] as const;
type Module = (typeof MODULES)[number];

// Header aliases (lowercased) we accept for each field.
const ALIASES = {
  matchid: ["matchid", "match_id", "match id"],
  partid: ["partid", "part_id", "part id"],
  hr_code: [
    "collector",
    "hr_code",
    "collector_hr_code",
    "base_hr_code",
    "players_hr_code",
    "formation_hr_code",
    "location_hr_code",
    "impact_hr_code",
    "extras_hr_code",
  ],
  review_date: ["review_date", "a_review_date", "date"],
  total_mistakes: ["total_mistakes", "total", "mistakes", "count"],
};

function pick(row: Record<string, unknown>, aliases: string[]): string {
  for (const a of aliases) {
    if (row[a] != null && String(row[a]).trim() !== "") return String(row[a]).trim();
  }
  return "";
}

function cleanDate(v: string): string | null {
  if (!v) return null;
  const m = v.match(/^(\d{1,4})[\/\-](\d{1,2})[\/\-](\d{1,4})/);
  if (m) {
    let [, a, b, c] = m;
    let Y: string, M: string, D: string;
    if (a.length === 4) {
      Y = a; M = b; D = c; // yyyy-mm-dd
    } else if (Number(a) > 12) {
      D = a; M = b; Y = c; // dd/mm/yyyy
    } else {
      D = a; M = b; Y = c; // assume dd/mm/yyyy (Tableau/Hudl exports)
    }
    const iso = `${Y.padStart(4, "20")}-${M.padStart(2, "0")}-${D.padStart(2, "0")}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !["Admin", "Uploader"].includes(profile.role)) {
    return NextResponse.json({ error: "Only Admins/Uploaders can upload" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const module = String(body.module || "") as Module;
  if (!MODULES.includes(module)) {
    return NextResponse.json(
      { error: `Unknown module. Pick one of: ${MODULES.join(", ")}` },
      { status: 400 }
    );
  }

  const rawRows: Record<string, unknown>[] = Array.isArray(body.rows) ? body.rows : [];
  if (rawRows.length === 0) {
    return NextResponse.json({ error: "No rows found in the uploaded CSV." }, { status: 400 });
  }

  // Detect whether the file is pre-aggregated (has a total_mistakes column).
  const lcFirst = Object.fromEntries(
    Object.keys(rawRows[0]).map((k) => [k.trim().toLowerCase(), k])
  );
  const hasTotal = ALIASES.total_mistakes.some((a) => a in lcFirst);

  // Aggregate by (matchid, partid): sum total_mistakes if present, else count rows.
  type Agg = { matchid: string; partid: number; hr_code: string | null; review_date: string | null; total: number };
  const map = new Map<string, Agg>();
  const problems: string[] = [];

  rawRows.forEach((raw, i) => {
    const row: Record<string, unknown> = {};
    for (const k of Object.keys(raw)) row[k.trim().toLowerCase()] = raw[k];

    const matchid = pick(row, ALIASES.matchid);
    const partidStr = pick(row, ALIASES.partid);
    if (!matchid || !partidStr) {
      problems.push(`Row ${i + 1}: missing matchid/partid`);
      return;
    }
    const partid = parseInt(partidStr, 10);
    if (isNaN(partid)) return problems.push(`Row ${i + 1}: bad partid`);

    const hr = pick(row, ALIASES.hr_code) || null;
    const date = cleanDate(pick(row, ALIASES.review_date));
    const inc = hasTotal ? Number(pick(row, ALIASES.total_mistakes)) || 0 : 1;

    const key = `${matchid}|${partid}`;
    const cur = map.get(key);
    if (cur) {
      cur.total += inc;
      if (!cur.hr_code && hr) cur.hr_code = hr;
      if (date && (!cur.review_date || date > cur.review_date)) cur.review_date = date;
    } else {
      map.set(key, { matchid, partid, hr_code: hr, review_date: date, total: inc });
    }
  });

  const aggregated = Array.from(map.values());
  if (aggregated.length === 0) {
    return NextResponse.json(
      { error: `Nothing to import. ${problems.slice(0, 3).join("; ")}` },
      { status: 400 }
    );
  }

  // Ensure a collector row exists for each HR code (for names + RLS).
  const hrCodes = Array.from(
    new Set(aggregated.map((a) => a.hr_code).filter(Boolean) as string[])
  );
  if (hrCodes.length) {
    await supabase
      .from("collectors")
      .upsert(hrCodes.map((hr) => ({ hr_code: hr, name: hr })), {
        onConflict: "hr_code",
        ignoreDuplicates: true,
      });
  }

  // Upsert the per-part totals for this module (replace on conflict).
  const payload = aggregated.map((a) => ({
    matchid: a.matchid,
    partid: a.partid,
    module,
    hr_code: a.hr_code,
    review_date: a.review_date,
    total_mistakes: a.total,
  }));

  const { error, count } = await supabase
    .from("module_totals")
    .upsert(payload, { onConflict: "matchid,partid,module", count: "exact" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    module,
    aggregated: hasTotal ? "pre-aggregated (summed total_mistakes)" : "counted raw rows",
    parts_upserted: count ?? payload.length,
    mistakes_total: aggregated.reduce((s, a) => s + a.total, 0),
    collectors_touched: hrCodes.length,
    skipped: problems.length,
    notes: problems.slice(0, 5),
  });
}
