import { createClient } from "@/lib/supabase/server";
import QualityScoreDashboard from "@/components/QualityScoreDashboard";
import type { AppRole } from "@/components/Sidebar";

export const dynamic = "force-dynamic";

const isoOk = (s?: string) =>
  s && /^\d{4}-\d{2}$/.test(s) ? `${s}-01` : null;

export default async function QualityScorePage({
  searchParams,
}: {
  searchParams: { month?: string; collector?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, hr_code, team")
    .eq("id", user!.id)
    .single();

  const role = (profile?.role ?? "Viewer") as AppRole;
  const myHr = profile?.hr_code ?? null;

  // Month filter (YYYY-MM → YYYY-MM-01)
  const monthParam = searchParams.month || null;
  const monthDate = isoOk(monthParam ?? "");

  // Collector filter: Viewers always see only themselves
  const collectorParam =
    role === "Viewer"
      ? myHr
      : searchParams.collector && searchParams.collector !== "all"
      ? searchParams.collector
      : null;

  // Fetch all collectors for the dropdown
  const { data: collectors } = await supabase
    .from("collectors")
    .select("hr_code, name, team")
    .order("name");

  // Fetch module quality scores
  let qsQuery = supabase
    .from("quality_scores")
    .select("hr_code, module, score, match_count, upload_month")
    .order("upload_month", { ascending: true });

  if (collectorParam) qsQuery = qsQuery.eq("hr_code", collectorParam);
  if (monthDate) qsQuery = qsQuery.eq("upload_month", monthDate);

  const { data: qsRows } = await qsQuery;

  // Fetch freeze frame scores
  let ffQuery = supabase
    .from("freeze_frame_scores")
    .select("hr_code, score, match_count, upload_month")
    .order("upload_month", { ascending: true });

  if (collectorParam) ffQuery = ffQuery.eq("hr_code", collectorParam);
  if (monthDate) ffQuery = ffQuery.eq("upload_month", monthDate);

  const { data: ffRows } = await ffQuery;

  // Available months (union of both tables)
  const { data: qsMonths } = await supabase
    .from("quality_scores")
    .select("upload_month")
    .order("upload_month", { ascending: false });
  const { data: ffMonths } = await supabase
    .from("freeze_frame_scores")
    .select("upload_month")
    .order("upload_month", { ascending: false });

  const allMonths = Array.from(
    new Set([
      ...(qsMonths ?? []).map((r: any) => r.upload_month as string),
      ...(ffMonths ?? []).map((r: any) => r.upload_month as string),
    ])
  ).sort((a, b) => b.localeCompare(a));

  return (
    <QualityScoreDashboard
      role={role}
      myHr={myHr}
      collectors={(collectors ?? []).map((c: any) => ({
        hr_code: c.hr_code as string,
        name: c.name as string,
        team: c.team as string | null,
      }))}
      moduleScores={(qsRows ?? []).map((r: any) => ({
        hr_code: r.hr_code as string,
        module: r.module as string,
        score: Number(r.score),
        match_count: r.match_count as number | null,
        upload_month: r.upload_month as string,
      }))}
      freezeFrameScores={(ffRows ?? []).map((r: any) => ({
        hr_code: r.hr_code as string,
        score: Number(r.score),
        match_count: r.match_count as number | null,
        upload_month: r.upload_month as string,
      }))}
      allMonths={allMonths}
      selectedMonth={monthParam ?? ""}
      selectedCollector={collectorParam ?? "all"}
    />
  );
}
