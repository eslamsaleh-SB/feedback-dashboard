import { createClient } from "@/lib/supabase/server";
import { getEffective } from "@/lib/effective";
import { redirect } from "next/navigation";
import CollectorMatchDetails from "@/components/CollectorMatchDetails";
import type { EnrichedPart } from "@/components/MatchTotals";
import { MODULES, type ModuleValue } from "@/lib/modules";
export const dynamic = "force-dynamic";

const isoOk = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);

export default async function MyMatchesPage({ searchParams }: { searchParams: { from?: string; to?: string; match?: string; module?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const eff = await getEffective(supabase);
  const profile = eff?.profile ?? null;
  if (profile?.role !== "Viewer") redirect("/match-totals");
  const from = isoOk(searchParams.from) ?? "";
  const to = isoOk(searchParams.to) ?? "";
  const matchId = searchParams.match ?? "";
  const moduleParam = searchParams.module ?? "";

  const { data: rows } = await supabase.rpc("match_part_summary_fast", {
    p_from: from || null, p_to: to || null, p_collector: null, p_limit: 5000,
  });

  const numCounts = (r: any): Record<ModuleValue, number> => ({
    players: Number(r.players), event: Number(r.event), formation_tactical: Number(r.formation_tactical),
    location: Number(r.location), impact: Number(r.impact), extras: Number(r.extras), freeze_frame: Number(r.freeze_frame),
  });

  const { data: collectors } = await supabase.from("collectors").select("hr_code, name, team");
  const byHr = new Map<string, { name: string; team: string | null }>();
  (collectors ?? []).forEach((c: any) => { if (c.hr_code) byHr.set(c.hr_code, { name: c.name, team: c.team }); });

  const enriched: EnrichedPart[] = (rows ?? [])
    .filter((r: any) => !matchId || String(r.matchid).includes(matchId))
    .map((r: any) => {
      const info = r.hr_code ? byHr.get(r.hr_code) : undefined;
      return { matchid: r.matchid, partid: r.partid, hr_code: r.hr_code, name: info?.name ?? r.hr_code ?? "—", team: info?.team ?? null, date: r.date, counts: numCounts(r), total: Number(r.total) };
    });

  return <CollectorMatchDetails rows={enriched} from={from} to={to} matchId={matchId} module={moduleParam || undefined} />;
}
