import { createClient } from "@/lib/supabase/server";
import { getEffective } from "@/lib/effective";
import QualityScoreDashboard from "@/components/QualityScoreDashboard";
import type { AppRole } from "@/components/Sidebar";

export const dynamic = "force-dynamic";

const isoOk = (s?: string) =>
  s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function todayIso(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function yearStartIso(d = new Date()) {
  return `${d.getFullYear()}-01-01`;
}

export default async function QualityScorePage({
  searchParams,
}: {
  searchParams: {
    from?: string;
    to?: string;
    collector?: string;
    team?: string;
  };
}) {
  const supabase = createClient();

  const eff = await getEffective(supabase);
  const profile = eff?.profile ?? null;

  const role = (profile?.role ?? "Viewer") as AppRole;
  const myHr = profile?.hr_code ?? null;

  // Default = this year so far.
  const from = isoOk(searchParams.from) ?? yearStartIso();
  const to = isoOk(searchParams.to) ?? todayIso();

  // upload_month is the first of each month; clamp range to month boundaries.
  const monthFrom = `${from.slice(0, 7)}-01`;
  const monthTo = `${to.slice(0, 7)}-01`;

  const teamParam = searchParams.team && searchParams.team !== "all" ? searchParams.team : null;

  const collectorParam =
    role === "Viewer"
      ? myHr
      : searchParams.collector && searchParams.collector !== "all"
      ? searchParams.collector
      : null;

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

  const effectiveCollector =
    collectorParam &&
    teamParam &&
    !(filteredCollectors ?? []).some((c: any) => c.hr_code === collectorParam)
      ? null
      : collectorParam;

  const teamHrCodes = teamParam
    ? (filteredCollectors ?? []).map((c: any) => c.hr_code as string)
    : null;

  let qsQuery = supabase
    .from("quality_scores")
    .select("hr_code, module, score, match_count, upload_month")
    .gte("upload_month", monthFrom)
    .lte("upload_month", monthTo)
    .order("upload_month", { ascending: true });
  if (effectiveCollector) qsQuery = qsQuery.eq("hr_code", effectiveCollector);
  else if (teamHrCodes && teamHrCodes.length > 0)
    qsQuery = qsQuery.in("hr_code", teamHrCodes);
  const { data: qsRows } = await qsQuery;

  let ffQuery = supabase
    .from("freeze_frame_scores")
    .select("hr_code, score, match_count, upload_month")
    .gte("upload_month", monthFrom)
    .lte("upload_month", monthTo)
    .order("upload_month", { ascending: true });
  if (effectiveCollector) ffQuery = ffQuery.eq("hr_code", effectiveCollector);
  else if (teamHrCodes && teamHrCodes.length > 0)
    ffQuery = ffQuery.in("hr_code", teamHrCodes);
  const { data: ffRows } = await ffQuery;

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
      from={from}
      to={to}
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
      selectedCollector={effectiveCollector ?? "all"}
      selectedTeam={teamParam ?? "all"}
    />
  );
}
