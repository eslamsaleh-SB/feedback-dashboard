import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffective } from "@/lib/effective";
import PerformanceThresholdsView from "@/components/PerformanceThresholdsView";

export const dynamic = "force-dynamic";

const isoOk = (s?: string) =>
  s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function yearStart(d = new Date()) {
  return `${d.getFullYear()}-01-01`;
}
function todayIso(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default async function PerformanceThresholdsPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string };
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const eff = await getEffective(supabase);
  const profile = eff?.profile ?? null;
  const role = profile?.role ?? "Viewer";
  if (!["Admin", "Uploader", "Supervisor"].includes(role)) redirect("/analytics");

  // Default date range: this year to today.
  const from = isoOk(searchParams.from) ?? yearStart();
  const to = isoOk(searchParams.to) ?? todayIso();

  // Same-month boundaries for the score tables (upload_month is the first day
  // of the month).
  const monthFromIso = `${from.slice(0, 7)}-01`;
  const monthToIso = `${to.slice(0, 7)}-01`;

  const [
    { data: collectorRows },
    { data: moduleRows },
    { data: qualityRows },
    { data: freezeFrameRows },
  ] = await Promise.all([
    supabase
      .from("collectors")
      .select("hr_code, name, team")
      .not("hr_code", "is", null)
      .order("name"),
    supabase.rpc("collector_module_totals", { p_from: from, p_to: to }),
    supabase
      .from("quality_scores")
      .select("hr_code, module, score, match_count, upload_month")
      .gte("upload_month", monthFromIso)
      .lte("upload_month", monthToIso),
    supabase
      .from("freeze_frame_scores")
      .select("hr_code, score, match_count, upload_month")
      .gte("upload_month", monthFromIso)
      .lte("upload_month", monthToIso),
  ]);

  return (
    <PerformanceThresholdsView
      from={from}
      to={to}
      collectors={(collectorRows ?? []).map((c: any) => ({
        hr_code: c.hr_code as string,
        name: (c.name ?? c.hr_code) as string,
        team: (c.team ?? null) as string | null,
      }))}
      moduleErrors={(moduleRows ?? []).map((r: any) => ({
        hr_code: r.hr_code as string,
        players: Number(r.players ?? 0),
        event: Number(r.event ?? 0),
        formation_tactical: Number(r.formation_tactical ?? 0),
        location: Number(r.location ?? 0),
        impact: Number(r.impact ?? 0),
        extras: Number(r.extras ?? 0),
        freeze_frame: Number(r.freeze_frame ?? 0),
        total: Number(r.total ?? 0),
        matches: Number(r.matches ?? 0),
      }))}
      qualityScores={(qualityRows ?? []).map((r: any) => ({
        hr_code: r.hr_code as string,
        module: r.module as string,
        score: Number(r.score ?? 0),
        upload_month: r.upload_month as string,
      }))}
      freezeFrameScores={(freezeFrameRows ?? []).map((r: any) => ({
        hr_code: r.hr_code as string,
        score: Number(r.score ?? 0),
        upload_month: r.upload_month as string,
      }))}
    />
  );
}
