import { createClient } from "@/lib/supabase/server";
import AnalyticsDashboard from "@/components/AnalyticsDashboard";
import {
  MODULES,
  type ModuleValue,
  type PartSummary,
  type CollectorRow,
} from "@/lib/modules";

export const dynamic = "force-dynamic";

const PART_LIMIT = 500;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; collector?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, collector_id")
    .eq("id", user!.id)
    .single();
  const role = (profile?.role ?? "Viewer") as "Admin" | "Uploader" | "Viewer";

  // Filters from the URL.
  const from = searchParams.from && ISO.test(searchParams.from) ? searchParams.from : null;
  const to = searchParams.to && ISO.test(searchParams.to) ? searchParams.to : null;
  const collector =
    searchParams.collector && searchParams.collector !== "all"
      ? searchParams.collector
      : null; // hr_code

  const { data: collectors } = await supabase
    .from("collectors")
    .select("id, name, hr_code")
    .order("name");
  const nameByHr = new Map<string, string>();
  (collectors ?? []).forEach((c: any) => {
    if (c.hr_code) nameByHr.set(c.hr_code, c.name);
  });

  // ---- Match View: per-part summary (RLS-scoped), filtered, most recent ----
  let sq = supabase
    .from("match_part_summary")
    .select(
      "matchid, partid, hr_code, date, players, event, formation_tactical, location, impact, extras, freeze_frame, total"
    )
    .order("date", { ascending: false })
    .limit(PART_LIMIT);
  if (from) sq = sq.gte("date", from);
  if (to) sq = sq.lte("date", to);
  if (collector) sq = sq.eq("hr_code", collector);
  const { data: sumRows } = await sq;

  const parts: PartSummary[] = (sumRows ?? []).map((r: any) => ({
    matchid: r.matchid,
    partid: r.partid,
    hr_code: r.hr_code,
    collector_name: r.hr_code
      ? nameByHr.get(r.hr_code) ?? r.hr_code
      : "Unassigned",
    date: r.date,
    counts: {
      players: r.players,
      event: r.event,
      formation_tactical: r.formation_tactical,
      location: r.location,
      impact: r.impact,
      extras: r.extras,
      freeze_frame: r.freeze_frame,
    },
    total: r.total,
  }));

  // ---- Module View: exact totals across ALL filtered data (no row cap) ----
  const totalsArr = await Promise.all(
    MODULES.map(async (m) => {
      let q = supabase.from(m.value).select("*", { count: "exact", head: true });
      if (from) q = q.gte("review_date", from);
      if (to) q = q.lte("review_date", to);
      if (collector) q = q.eq("hr_code", collector);
      const { count } = await q;
      return [m.value, count ?? 0] as const;
    })
  );
  const moduleTotals = Object.fromEntries(totalsArr) as Record<
    ModuleValue,
    number
  >;

  // ---- Collectors View: per-collector per-module counts (RPC, RLS-aware) ----
  const { data: rpcRows } = await supabase.rpc("collector_module_totals", {
    p_from: from,
    p_to: to,
  });
  let collectorRows: CollectorRow[] = (rpcRows ?? []).map((r: any) => ({
    hr_code: r.hr_code,
    name: nameByHr.get(r.hr_code) ?? r.hr_code,
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
  if (collector) collectorRows = collectorRows.filter((c) => c.hr_code === collector);

  let myName: string | null = null;
  if (role === "Viewer" && profile?.collector_id) {
    myName =
      (collectors ?? []).find((c: any) => c.id === profile.collector_id)?.name ??
      null;
  }

  const collectorOptions = (collectors ?? [])
    .filter((c: any) => c.hr_code)
    .map((c: any) => ({ hr_code: c.hr_code as string, name: c.name as string }));

  return (
    <AnalyticsDashboard
      role={role}
      myName={myName}
      isLinked={role !== "Viewer" || !!profile?.collector_id}
      from={from ?? ""}
      to={to ?? ""}
      collector={collector ?? "all"}
      parts={parts}
      moduleTotals={moduleTotals}
      collectorRows={collectorRows}
      collectors={collectorOptions}
      limited={(sumRows?.length ?? 0) >= PART_LIMIT}
    />
  );
}
