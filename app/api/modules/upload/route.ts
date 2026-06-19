import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// The only tables the uploader is ever allowed to write to. Anything not in
// this allowlist is rejected — prevents a crafted request from targeting an
// arbitrary table.
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

// Columns the client is allowed to map CSV headers into.
const CHILD_FIELDS = [
  "key",
  "review_date",
  "description",
  "category",
  "severity",
  "video_timestamp",
  "notes",
] as const;

type IncomingRow = {
  match_id?: string;
  key?: string;
  review_date?: string | null;
  description?: string | null;
  category?: string | null;
  severity?: string | null;
  video_timestamp?: string | null;
  notes?: string | null;
};

function cleanDate(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
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

  // ---- Read + validate body ----
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const module = String(body.module || "") as Module;
  if (!MODULES.includes(module)) {
    return NextResponse.json(
      { error: `Unknown module. Pick one of: ${MODULES.join(", ")}` },
      { status: 400 }
    );
  }

  const collectorId = String(body.collector_id || "");
  if (!collectorId) {
    return NextResponse.json(
      { error: "A collector must be assigned to these matches." },
      { status: 400 }
    );
  }

  const rawRows: IncomingRow[] = Array.isArray(body.rows) ? body.rows : [];
  if (rawRows.length === 0) {
    return NextResponse.json(
      { error: "No rows found in the uploaded CSV." },
      { status: 400 }
    );
  }

  // ---- Normalise the child rows + collect the parent matches ----
  const childRows: Record<string, unknown>[] = [];
  const matchesById = new Map<string, string | null>(); // match_id -> date

  const problems: string[] = [];

  rawRows.forEach((r, i) => {
    const match_id = String(r.match_id ?? "").trim();
    const key = String(r.key ?? "").trim();
    if (!match_id) {
      problems.push(`Row ${i + 1}: missing match_id`);
      return;
    }
    if (!key) {
      problems.push(`Row ${i + 1}: missing key`);
      return;
    }

    const review_date = cleanDate(r.review_date);

    // Parent match: keep the most recent non-null date we see for it.
    if (!matchesById.has(match_id)) matchesById.set(match_id, review_date);
    else if (review_date && !matchesById.get(match_id))
      matchesById.set(match_id, review_date);

    const row: Record<string, unknown> = { match_id, key, review_date };
    for (const f of CHILD_FIELDS) {
      if (f === "key" || f === "review_date") continue;
      const v = (r as Record<string, unknown>)[f];
      row[f] = v == null || String(v).trim() === "" ? null : String(v).trim();
    }
    childRows.push(row);
  });

  if (childRows.length === 0) {
    return NextResponse.json(
      { error: `Nothing to import. ${problems.slice(0, 3).join("; ")}` },
      { status: 400 }
    );
  }

  // ---- 1) Upsert the parent matches (onConflict: match_id) ----
  const matchPayload = Array.from(matchesById.entries()).map(
    ([match_id, date]) => ({
      match_id,
      collector_id: collectorId,
      uploaded_by: user.id,
      // Only set date if we parsed one; let the DB default handle the rest.
      ...(date ? { date } : {}),
    })
  );

  const { error: matchErr } = await supabase
    .from("matches")
    .upsert(matchPayload, { onConflict: "match_id" });
  if (matchErr) {
    return NextResponse.json(
      { error: `Could not save matches: ${matchErr.message}` },
      { status: 400 }
    );
  }

  // ---- 2) Upsert the child rows (onConflict: key => dedup within module) ----
  // De-dupe within this single CSV first, so Postgres doesn't reject the
  // batch for "ON CONFLICT DO UPDATE command cannot affect row a second time".
  const seen = new Map<string, Record<string, unknown>>();
  for (const row of childRows) seen.set(String(row.key), row); // last one wins
  const dedupedChild = Array.from(seen.values());

  const { error: childErr, count } = await supabase
    .from(module)
    .upsert(dedupedChild, { onConflict: "key", count: "exact" });
  if (childErr) {
    return NextResponse.json(
      { error: `Could not save ${module} rows: ${childErr.message}` },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    module,
    matches_upserted: matchPayload.length,
    rows_upserted: count ?? dedupedChild.length,
    duplicates_collapsed: childRows.length - dedupedChild.length,
    skipped: problems.length,
    notes: problems.slice(0, 5),
  });
}
