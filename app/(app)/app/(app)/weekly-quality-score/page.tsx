import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffective } from "@/lib/effective";
import WeeklyQualityScoreView from "@/components/WeeklyQualityScoreView";

export const dynamic = "force-dynamic";

async function fetchAllRange(builder: any, pageSize = 1000): Promise<any[]> {
  const out: any[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await builder.range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return out;
}

export default async function WeeklyQualityScorePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const eff = await getEffective(supabase);
  const profile = eff?.profile ?? null;
  const role = profile?.role ?? "Viewer";

  const { data: usersDirRaw } = await supabase
    .from("users")
    .select("hr_code, first_name, last_name, squad")
    .not("hr_code", "is", null)
    .order("hr_code");
  const collectors = (usersDirRaw ?? []).map((u: any) => ({
    hr_code: u.hr_code,
    name: [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || null,
    team: u.squad ?? null,
  }));

  // Try the v53 column set (with base + squad). If the DB is still on v52
  // (missing those columns), fall back to the older set + surface a clear
  // hint so the admin knows to run the v53 SQL migration.
  let rows: any[] = [];
  let dbHint: string | null = null;
  try {
    rows = await fetchAllRange(
      supabase
        .from("weekly_quality_scores")
        .select(
          "hr_code, week_start_date, base, players, formation_tactical, location, impact, extras, squad, freeze_frame_score"
        )
        .order("week_start_date", { ascending: false })
    );
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    if (/does not exist|column .* does not exist|schema cache/i.test(msg)) {
      // Retry without the v53-only columns.
      try {
        const legacy = await fetchAllRange(
          supabase
            .from("weekly_quality_scores")
            .select(
              "hr_code, week_start_date, players, formation_tactical, location, impact, extras, freeze_frame_score"
            )
            .order("week_start_date", { ascending: false })
        );
        rows = legacy.map((r: any) => ({ ...r, base: null, squad: null }));
        dbHint =
          "The weekly_quality_scores table is missing the base + squad columns. Run Updates/v53__weekly-upload-and-team-assign/sql/01_weekly_add_base_squad.sql in Supabase.";
      } catch (e2: any) {
        dbHint = `Weekly Quality Scores query failed: ${e2?.message ?? String(e2)}`;
        rows = [];
      }
    } else {
      dbHint = `Weekly Quality Scores query failed: ${msg}`;
      rows = [];
    }
  }

  return (
    <div className="space-y-4">
      {dbHint && (
        <div className="rounded-lg bg-amber-50 text-amber-800 border border-amber-200 p-3 text-sm">
          {dbHint}
        </div>
      )}
      <WeeklyQualityScoreView
        role={role}
        viewerHrCode={profile?.hr_code ?? null}
        collectors={(collectors ?? []) as any}
        rows={rows as any}
      />
    </div>
  );
}
