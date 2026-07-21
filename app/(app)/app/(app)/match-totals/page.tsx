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
  const role = (profile?.role ?? "Viewer") as "Admin" | "Reviewer" | "Viewer";
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

  // v58 fix: was joining against the stale `collectors` table (orphaned
  // since v56 moved identity onto `users`). That's why names fell back to
  // the hr_code itself (rendering as "Code - Code") and team was blank.
  const { data: usersDir } = await supabase
    .from("users")
    .select("hr_code, first_name, last_name, squad")
    .order("hr_code");
  const byHr = new Map<string, { name: string | null; team: string | null }>();
  (usersDir ?? []).forEach((u: any) => {
    if (!u.hr_code) return;
    const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
    byHr.set(u.hr_code, { name: name || null, team: u.squad ?? null });
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
    name: r.hr_code ? (byHr.get(r.hr_code)?.name ?? "-") : "-",
    team: r.hr_code ? (byHr.get(r.hr_code)?.team ?? "-") : "-",
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

  const collectorOptions = (usersDir ?? [])
    .filter((u: any) => u.hr_code)
    .map((u: any) => {
      const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
      return {
        hr_code: u.hr_code as string,
        name: (name || "-") as string,
        team: (u.squad ?? "-") as string,
      };
    });

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
