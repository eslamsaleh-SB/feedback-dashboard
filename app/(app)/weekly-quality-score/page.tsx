import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffective } from "@/lib/effective";
import WeeklyQualityScoreView from "@/components/WeeklyQualityScoreView";

export const dynamic = "force-dynamic";

// Page-through PostgREST 1000-row cap.
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

  // Collector metadata (for name / team lookups)
  const { data: collectors } = await supabase
    .from("collectors")
    .select("hr_code, name, team")
    .not("hr_code", "is", null)
    .order("hr_code");

  // Fetch every weekly score row (paginated).
  const rows = await fetchAllRange(
    supabase
      .from("weekly_quality_scores")
      .select(
        "hr_code, week_start_date, players, event, formation_tactical, location, impact, extras, freeze_frame_score"
      )
      .order("week_start_date", { ascending: false })
  );

  return (
    <WeeklyQualityScoreView
      role={role}
      viewerHrCode={profile?.hr_code ?? null}
      collectors={(collectors ?? []) as any}
      rows={rows as any}
    />
  );
}
