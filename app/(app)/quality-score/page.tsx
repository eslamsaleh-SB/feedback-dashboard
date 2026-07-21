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

/**
 * Fetch every row matching the filter by paginating with `.range()`.
 * `.limit()` alone is capped by PostgREST's max-rows setting; range-based
 * pagination bypasses that so all months land in the payload.
 */
async function fetchAll<T>(
  build: (q: any) => any,
  supabase: any,
  table: string,
  select: string
): Promise<T[]> {
  const out: T[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    let q = supabase.from(table).select(select);
    q = build(q).range(offset, offset + PAGE - 1);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...(data as T[]));
    if (data.length < PAGE) break;
  }
  return out;
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

  const from = isoOk(searchParams.from) ?? yearStartIso();
  const to = isoOk(searchParams.to) ?? todayIso();

  const monthFrom = `${from.slice(0, 7)}-01`;
  const monthTo = `${to.slice(0, 7)}-01`;

  const teamParam = searchParams.team && searchParams.team !== "all" ? searchParams.team : null;

  const collectorParam =
    role === "Viewer"
      ? myHr
      : searchParams.collector && searchParams.collector !== "all"
      ? searchParams.collector
      : null;

  const { data: usersDirRaw } = await supabase
    .from("users")
    .select("hr_code, first_name, last_name, squad")
    .order("hr_code");
  const collectors = (usersDirRaw ?? []).map((u: any) => ({
    hr_code: u.hr_code,
    name: [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.hr_code,
    team: u.squad ?? null,
  }));
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

  const applyFilters = (q: any) => {
    q = q.gte("upload_month", monthFrom).lte("upload_month", monthTo).order("upload_month", { ascending: true });
    if (effectiveCollector) q = q.eq("hr_code", effectiveCollector);
    else if (teamHrCodes && teamHrCodes.length > 0) q = q.in("hr_code", teamHrCodes);
    return q;
  };

  const qsRows = await fetchAll<any>(
    applyFilters,
    supabase,
    "quality_scores",
    "hr_code, module, score, match_count, upload_month"
  );
  const ffRows = await fetchAll<any>(
    applyFilters,
    supabase,
    "freeze_frame_scores",
    "hr_code, score, match_count, upload_month"
  );

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
      moduleScores={qsRows.map((r: any) => ({
        hr_code: r.hr_code as string,
        module: r.module as string,
        score: Number(r.score),
        match_count: r.match_count as number | null,
        upload_month: r.upload_month as string,
      }))}
      freezeFrameScores={ffRows.map((r: any) => ({
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
