import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isViewingAs } from "@/lib/effective";

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

type DateOrder = "dmy" | "mdy" | "ymd";

function cleanDate(v: string, order: DateOrder = "dmy"): string | null {
  if (!v) return null;
  const s = v.trim();
  const m = s.match(/^(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{1,4})/);
  if (m) {
    const [, p1, p2, p3] = m;
    let Y: number, M: number, D: number;
    if (p1.length === 4 || order === "ymd") {
      Y = +p1; M = +p2; D = +p3; // yyyy-mm-dd
    } else {
      Y = +p3;
      const first = +p1;
      const second = +p2;
      // Resolve EACH value on its own: a part > 12 can only be the day. This
      // makes the parser correct even when a file mixes dd/mm and mm/dd rows.
      if (first > 12 && second <= 12) {
        D = first; M = second;
      } else if (second > 12 && first <= 12) {
        M = first; D = second;
      } else if (order === "mdy") {
        M = first; D = second; // ambiguous -> fall back to the column's order
      } else {
        D = first; M = second;
      }
    }
    // Last-resort safety: an impossible month that fits as a day -> swap them.
    if (M > 12 && D <= 12) {
      const t = M; M = D; D = t;
    }
    if (Y < 100) Y += 2000;
    if (M >= 1 && M <= 12 && D >= 1 && D <= 31 && Y >= 1900 && Y <= 9999) {
      return `${String(Y).padStart(4, "0")}-${String(M).padStart(2, "0")}-${String(D).padStart(2, "0")}`;
    }
    // Out of range: skip just this date rather than aborting the whole upload.
    return null;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// Look at the whole date column to decide day/month order (dd/mm vs mm/dd).
// A value where the 1st part > 12 must be dd/mm; where the 2nd part > 12 must
// be mm/dd. This is only a fallback for values where BOTH parts are <= 12;
// cleanDate resolves unambiguous values (a part > 12) on its own.
function detectDateOrder(
  rows: Record<string, unknown>[],
  aliases: string[]
): DateOrder {
  let dmy = 0;
  let mdy = 0;
  for (const raw of rows) {
    const row: Record<string, unknown> = {};
    for (const k of Object.keys(raw)) row[k.trim().toLowerCase()] = raw[k];
    const v = pick(row, aliases);
    const m = v.match(/^(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{1,4})/);
    if (!m) continue;
    if (m[1].length === 4) return "ymd";
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > 12) dmy++;
    else if (b > 12) mdy++;
  }
  if (dmy > mdy) return "dmy";
  if (mdy > dmy) return "mdy";
  return "mdy";
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
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !["Admin", "Reviewer"].includes(profile.role)) {
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

  const dateOrder = detectDateOrder(rawRows, ALIASES.review_date);

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
    const rawDate = pick(row, ALIASES.review_date);
    const date = cleanDate(rawDate, dateOrder);
    if (rawDate && !date) {
      problems.push(`Row ${i + 1}: unreadable date "${rawDate}" (imported without a date)`);
    }
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

  // Resolve hr_code -> actor_id (collectors.id) so new rows carry the stable key
  // while hr_code is kept for CSV/Tableau compatibility.
  const idByHr = new Map<string, string>();
  if (hrCodes.length) {
    const { data: cols } = await supabase
      .from("collectors")
      .select("id, hr_code")
      .in("hr_code", hrCodes);
    (cols ?? []).forEach((c: any) => {
      if (c.hr_code) idByHr.set(String(c.hr_code).trim().toUpperCase(), c.id as string);
    });
  }

  // Upsert the per-part totals for this module (replace on conflict).
  const payload = aggregated.map((a) => ({
    matchid: a.matchid,
    partid: a.partid,
    module,
    hr_code: a.hr_code,
    actor_id: a.hr_code ? idByHr.get(a.hr_code.trim().toUpperCase()) ?? null : null,
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
