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

  // v59: try full column set (with pressure). If the DB migration hasn't run
  // yet, fall back to the v53 shape without pressure, and finally to the pre-
  // v53 shape without base/squad. Each fallback surfaces a clear admin hint.
  const SEL_V59 =
    "hr_code, week_start_date, base, players, formation_tactical, location, impact, extras, pressure, squad, freeze_frame_score";
  const SEL_V53 =
    "hr_code, week_start_date, base, players, formation_tactical, location, impact, extras, squad, freeze_frame_score";
  const SEL_V52 =
    "hr_code, week_start_date, players, formation_tactical, location, impact, extras, freeze_frame_score";

  let rows: any[] = [];
  let dbHint: string | null = null;

  const isMissingColumnError = (e: any) => {
    const msg = e?.message ?? String(e);
    return /does not exist|column .* does not exist|schema cache/i.test(msg);
  };

  try {
    rows = await fetchAllRange(
      supabase.from("weekly_quality_scores").select(SEL_V59).order("week_start_date", { ascending: false })
    );
  } catch (e59: any) {
    if (!isMissingColumnError(e59)) {
      dbHint = `Weekly Quality Scores query failed: ${e59?.message ?? String(e59)}`;
    } else {
      try {
        const v53Rows = await fetchAllRange(
          supabase.from("weekly_quality_scores").select(SEL_V53).order("week_start_date", { ascending: false })
        );
        rows = v53Rows.map((r: any) => ({ ...r, pressure: null }));
        dbHint =
          "The weekly_quality_scores table is missing the `pressure` column. Run Updates/v59__pressure-charts-parts/sql/01_weekly_add_pressure.sql in Supabase.";
      } catch (e53: any) {
        if (!isMissingColumnError(e53)) {
          dbHint = `Weekly Quality Scores query failed: ${e53?.message ?? String(e53)}`;
        } else {
          try {
            const v52Rows = await fetchAllRange(
              supabase.from("weekly_quality_scores").select(SEL_V52).order("week_start_date", { ascending: false })
            );
            rows = v52Rows.map((r: any) => ({ ...r, base: null, squad: null, pressure: null }));
            dbHint =
              "The weekly_quality_scores table is missing the `base` + `squad` + `pressure` columns. Run Updates/v53__weekly-upload-and-team-assign/sql/01_weekly_add_base_squad.sql AND Updates/v59__pressure-charts-parts/sql/01_weekly_add_pressure.sql in Supabase.";
          } catch (e52: any) {
            dbHint = `Weekly Quality Scores query failed: ${e52?.message ?? String(e52)}`;
            rows = [];
          }
        }
      }
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
