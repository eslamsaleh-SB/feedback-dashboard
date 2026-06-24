import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffective } from "@/lib/effective";
import MatchTotals, { type EnrichedPart } from "@/components/MatchTotals";

export const dynamic = "force-dynamic";

const isoOk = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
const OPS = new Set(["gte", "eq", "lte"]);

export default async function MatchTotalsPage({
  searchParams,
}: {
  searchParams: {
    from?: string;
    to?: string;
    collector?: string;
    match?: string;
    module?: string;
    errop?: string;
    errval?: string;
  };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const eff = await getEffective(supabase);
  const profile = eff?.profile ?? null;
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

  // Error filter is now applied SERVER-SIDE (across the whole dataset).
  const errOp =
    searchParams.errop && OPS.has(searchParams.errop) ? searchParams.errop : "gte";
  const errRaw = searchParams.errval?.trim();
  const errVal = errRaw && /^\d+$/.test(errRaw) ? parseInt(errRaw, 10) : null;

  const { data: collectors } = await supabase
    .from("collectors")
    .select("name, hr_code, team")
    .order("name");
  const byHr = new Map<string, { name: string; team: string | null }>();
  (collectors ?? []).forEach((c: any) => {
    if (c.hr_code) byHr.set(c.hr_code, { name: c.name, team: c.team ?? null });
  });

  // The DB function ranks/filters across ALL data and returns the top 250
  // MATCHES (every part row for those matches).
  const { data: partRows } = await supabase.rpc("match_module_breakdown_v2", {
    p_from: from,
    p_to: to,
    p_collector: collector,
    p_matchid: matchId,
    p_module: moduleParam,
    p_err_op: errOp,
    p_err_val: errVal,
    p_limit: 250,
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
      errOp={errOp as "gte" | "eq" | "lte"}
      errVal={errVal != null ? String(errVal) : ""}
      rows={rows}
      collectors={collectorOptions}
      canDelete={role === "Admin"}
      capped={(partRows?.length ?? 0) > 0 && new Set((partRows ?? []).map((r: any) => r.matchid)).size >= 250}
    />
  );
}
