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

// Range-paginated fetch bypasses PostgREST's max-rows cap so every row lands.
async function fetchAllInMonthRange<T>(
  supabase: any,
  table: string,
  select: string,
  monthFrom: string,
  monthTo: string
): Promise<T[]> {
  const out: T[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .gte("upload_month", monthFrom)
      .lte("upload_month", monthTo)
      .order("upload_month", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...(data as T[]));
    if (data.length < PAGE) break;
  }
  return out;
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
  if (!["Admin", "Reviewer", "Supervisor"].includes(role)) redirect("/analytics");

  const from = isoOk(searchParams.from) ?? yearStart();
  const to = isoOk(searchParams.to) ?? todayIso();

  const monthFromIso = `${from.slice(0, 7)}-01`;
  const monthToIso = `${to.slice(0, 7)}-01`;

  const [{ data: usersDirRaw }, { data: moduleRows }, { data: partRows }, qualityRows, freezeFrameRows] =
    await Promise.all([
      supabase
        .from("users")
        .select("hr_code, first_name, last_name, squad")
        .not("hr_code", "is", null)
        .order("hr_code"),
      supabase.rpc("collector_module_totals", { p_from: from, p_to: to }),
      // v59: parts count per collector. `collector_module_totals` returns
      // distinct MATCHES but we also need PARTS (each match has multiple
      // parts). Pull them from the existing match_part_summary_fast RPC and
      // aggregate below.
      supabase.rpc("match_part_summary_fast", {
        p_from: from,
        p_to: to,
        p_collector: null,
        p_limit: 100000,
      }),
      fetchAllInMonthRange<any>(
        supabase,
        "quality_scores",
        "hr_code, module, score, match_count, upload_month",
        monthFromIso,
        monthToIso
      ),
      fetchAllInMonthRange<any>(
        supabase,
        "freeze_frame_scores",
        "hr_code, score, match_count, upload_month",
        monthFromIso,
        monthToIso
      ),
    ]);

  // Parts per hr_code: each row of match_part_summary_fast is one (matchid, partid) pair.
  const partsByHr: Record<string, number> = {};
  for (const r of partRows ?? []) {
    const hr = (r as any).hr_code as string | null;
    if (!hr) continue;
    partsByHr[hr] = (partsByHr[hr] ?? 0) + 1;
  }

  return (
    <PerformanceThresholdsView
      from={from}
      to={to}
      collectors={(usersDirRaw ?? []).map((u: any) => {
        const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
        return {
          hr_code: u.hr_code as string,
          name: (name || u.hr_code) as string,
          team: (u.squad ?? null) as string | null,
        };
      })}
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
        parts: partsByHr[r.hr_code as string] ?? 0,
      }))}
      qualityScores={qualityRows.map((r: any) => ({
        hr_code: r.hr_code as string,
        module: r.module as string,
        score: Number(r.score ?? 0),
        upload_month: r.upload_month as string,
      }))}
      freezeFrameScores={freezeFrameRows.map((r: any) => ({
        hr_code: r.hr_code as string,
        score: Number(r.score ?? 0),
        upload_month: r.upload_month as string,
      }))}
    />
  );
}
