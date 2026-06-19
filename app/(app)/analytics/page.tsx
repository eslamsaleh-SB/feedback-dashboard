import { createClient } from "@/lib/supabase/server";
import AnalyticsDashboard from "@/components/AnalyticsDashboard";
import { MODULES, type ModuleValue, type PartSummary, type Period } from "@/lib/modules";

export const dynamic = "force-dynamic";

// Date range for a period, as YYYY-MM-DD strings (week starts Monday).
function rangeFor(period: Period): { from: string; to: string } | null {
  if (period === "all") return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const dow = (today.getDay() + 6) % 7; // 0 = Monday
  const monday = new Date(today);
  monday.setDate(today.getDate() - dow);

  if (period === "this_week") {
    const to = new Date(monday);
    to.setDate(monday.getDate() + 7);
    return { from: iso(monday), to: iso(to) };
  }
  if (period === "last_week") {
    const from = new Date(monday);
    from.setDate(monday.getDate() - 7);
    return { from: iso(from), to: iso(monday) };
  }
  const from = new Date(today.getFullYear(), today.getMonth(), 1);
  const to = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  return { from: iso(from), to: iso(to) };
}

const PART_LIMIT = 500;

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: { period?: string; collector?: string };
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

  const period = (["this_week", "last_week", "this_month", "all"].includes(
    searchParams.period || ""
  )
    ? searchParams.period
    : "all") as Period;
  const collector =
    searchParams.collector && searchParams.collector !== "all"
      ? searchParams.collector
      : null; // hr_code
  const range = rangeFor(period);

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
  if (range) sq = sq.gte("date", range.from).lt("date", range.to);
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
      if (range) q = q.gte("review_date", range.from).lt("review_date", range.to);
      if (collector) q = q.eq("hr_code", collector);
      const { count } = await q;
      return [m.value, count ?? 0] as const;
    })
  );
  const moduleTotals = Object.fromEntries(totalsArr) as Record<
    ModuleValue,
    number
  >;

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
      period={period}
      collector={collector ?? "all"}
      parts={parts}
      moduleTotals={moduleTotals}
      collectors={collectorOptions}
      limited={(sumRows?.length ?? 0) >= PART_LIMIT}
    />
  );
}
