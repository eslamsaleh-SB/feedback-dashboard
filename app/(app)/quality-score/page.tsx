import { createClient } from "@/lib/supabase/server";
import { getEffective } from "@/lib/effective";
import QualityScoreDashboard from "@/components/QualityScoreDashboard";
import type { AppRole } from "@/components/Sidebar";

export const dynamic = "force-dynamic";

type Period = "month" | "quarter" | "year";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// Returns the inclusive [from, to] range (YYYY-MM-DD strings) of the first
// upload_month value to include based on the period filter.
function rangeForFilter(
  period: Period,
  year: number,
  month: number, // 1-12
  quarter: number // 1-4
): { from: string; to: string } {
  if (period === "year") {
    return { from: `${year}-01-01`, to: `${year}-12-01` };
  }
  if (period === "quarter") {
    const startMonth = (quarter - 1) * 3 + 1; // 1,4,7,10
    return {
      from: `${year}-${pad(startMonth)}-01`,
      to: `${year}-${pad(startMonth + 2)}-01`,
    };
  }
  // month
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-01` };
}

export default async function QualityScorePage({
  searchParams,
}: {
  searchParams: {
    period?: string;
    year?: string;
    month?: string;
    quarter?: string;
    collector?: string;
    team?: string;
  };
}) {
  const supabase = createClient();

  const eff = await getEffective(supabase);
  const profile = eff?.profile ?? null;

  const role = (profile?.role ?? "Viewer") as AppRole;
  const myHr = profile?.hr_code ?? null;

  // Period defaults to month + current year/month.
  const now = new Date();
  const period: Period =
    searchParams.period === "quarter"
      ? "quarter"
      : searchParams.period === "year"
      ? "year"
      : "month";
  const year = Number(searchParams.year) || now.getFullYear();
  const month = Math.min(12, Math.max(1, Number(searchParams.month) || now.getMonth() + 1));
  const quarter = Math.min(
    4,
    Math.max(1, Number(searchParams.quarter) || Math.floor(now.getMonth() / 3) + 1)
  );

  const { from, to } = rangeForFilter(period, year, month, quarter);

  // Team filter
  const teamParam = searchParams.team && searchParams.team !== "all" ? searchParams.team : null;

  // Collector filter (Viewers always see only themselves)
  const collectorParam =
    role === "Viewer"
      ? myHr
      : searchParams.collector && searchParams.collector !== "all"
      ? searchParams.collector
      : null;

  // Roster + teams
  const { data: collectors } = await supabase
    .from("collectors")
    .select("hr_code, name, team")
    .order("name");
  const teams = Array.from(
    new Set((collectors ?? []).map((c: any) => c.team).filter(Boolean) as string[])
  ).sort();
  const filteredCollectors = teamParam
    ? (collectors ?? []).filter((c: any) => c.team === teamParam)
    : (collectors ?? []);

  // If a team is selected and the chosen collector isn't on that team, clear it.
  const effectiveCollector =
    collectorParam &&
    teamParam &&
    !(filteredCollectors ?? []).some((c: any) => c.hr_code === collectorParam)
      ? null
      : collectorParam;

  // Build the hr_code list (used to scope the score queries when a team is set
  // but no specific collector is chosen).
  const teamHrCodes = teamParam
    ? (filteredCollectors ?? []).map((c: any) => c.hr_code as string)
    : null;

  // ---- Module quality scores -----------------------------------------------
  let qsQuery = supabase
    .from("quality_scores")
    .select("hr_code, module, score, match_count, upload_month")
    .gte("upload_month", from)
    .lte("upload_month", to)
    .order("upload_month", { ascending: true });
  if (effectiveCollector) qsQuery = qsQuery.eq("hr_code", effectiveCollector);
  else if (teamHrCodes && teamHrCodes.length > 0)
    qsQuery = qsQuery.in("hr_code", teamHrCodes);
  const { data: qsRows } = await qsQuery;

  // ---- Freeze frame scores --------------------------------------------------
  let ffQuery = supabase
    .from("freeze_frame_scores")
    .select("hr_code, score, match_count, upload_month")
    .gte("upload_month", from)
    .lte("upload_month", to)
    .order("upload_month", { ascending: true });
  if (effectiveCollector) ffQuery = ffQuery.eq("hr_code", effectiveCollector);
  else if (teamHrCodes && teamHrCodes.length > 0)
    ffQuery = ffQuery.in("hr_code", teamHrCodes);
  const { data: ffRows } = await ffQuery;

  // ---- Available months (for the legacy dropdown / charts) ------------------
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
      teams={teams}
      period={period}
      year={year}
      month={month}
      quarter={quarter}
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
      selectedCollector={effectiveCollector ?? "all"}
      selectedTeam={teamParam ?? "all"}
    />
  );
}
