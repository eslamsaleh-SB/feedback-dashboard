import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MatchTotals, { type EnrichedPart } from "@/components/MatchTotals";

export const dynamic = "force-dynamic";

const isoOk = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);

export default async function MatchTotalsPage({
  searchParams,
}: {
  searchParams: {
    from?: string;
    to?: string;
    collector?: string;
    match?: string;
    module?: string;
  };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single();
  const role = (profile?.role ?? "Viewer") as "Admin" | "Uploader" | "Viewer";
  // Collectors (Viewer) are not allowed on this page
  if (role === "Viewer") redirect("/analytics");

  const from = isoOk(searchParams.from);
  const to = isoOk(searchParams.to);
  const collector =
    searchParams.collector && searchParams.collector !== "all"
      ? searchParams.collector
      : null;
  const matchId = searchParams.match?.trim() || null;
  const moduleParam = searchParams.module?.trim() || null;

  const { data: collectors } = await supabase
    .from("collectors")
    .select("name, hr_code, team")
    .order("name");
  const byHr = new Map<string, { name: string; team: string | null }>();
  (collectors ?? []).forEach((c: any) => {
    if (c.hr_code) byHr.set(c.hr_code, { name: c.name, team: c.team ?? null });
  });

  // When a module is selected we remove the row limit so the full dataset is
  // searched — the module-level sort on the server returns only the relevant
  // rows anyway.  Without a module, cap at 8 000 rows for performance.
  const rowLimit = moduleParam ? 50000 : 8000;

  const { data: partRows } = await supabase.rpc("match_module_breakdown", {
    p_from: from,
    p_to: to,
    p_collector: collector,
    p_matchid: matchId,
    p_limit: rowLimit,
  });

  const rows: EnrichedPart[] = (partRows ?? []).map((r: any) => ({
    matchid: r.matchid,
    partid: r.partid,
    hr_code: r.hr_code,
    name: r.hr_code ? (byHr.get(r.hr_code)?.name ?? r.hr_code) : "—",
    team: r.hr_code ? (byHr.get(r.hr_code)?.team ?? null) : null,
    date: r.date,
    counts: {
      players: Number(r.players),
      event: Number(r.event),
      formation_tactical: Number(r.formation_tactical),
      location: Number(r.location),
      impact: Number(r.impact),
      extras: Number(r.extras),
      freeze_frame: Number(r.freeze_frame),
    },
    total: Number(r.total),
  }));

  const collectorOptions = (collectors ?? [])
    .filter((c: any) => c.hr_code)
    .map((c: any) => ({
      hr_code: c.hr_code as string,
      name: c.name as string,
      team: (c.team ?? null) as string | null,
    }));

  return (
    <MatchTotals
      from={from ?? ""}
      to={to ?? ""}
      collector={collector ?? "all"}
      matchId={matchId ?? ""}
      module={moduleParam ?? ""}
      rows={rows}
      collectors={collectorOptions}
      limited={!matchId && !moduleParam && (partRows?.length ?? 0) >= 8000}
    />
  );
}
