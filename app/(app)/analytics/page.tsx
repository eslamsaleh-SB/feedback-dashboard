import { createClient } from "@/lib/supabase/server";
import CollectorDashboard from "@/components/CollectorDashboard";
import CollectorsPerformance from "@/components/CollectorsPerformance";
import {
  type ModuleValue,
  type PartSummary,
  type CollectorRow,
  type Report,
  type FeedbackSession,
} from "@/lib/modules";

export const dynamic = "force-dynamic";

const isoOk = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);

function emptyCounts(): Record<ModuleValue, number> {
  return {
    players: 0,
    event: 0,
    formation_tactical: 0,
    location: 0,
    impact: 0,
    extras: 0,
    freeze_frame: 0,
  };
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, collector_id, hr_code")
    .eq("id", user!.id)
    .single();
  const role = (profile?.role ?? "Viewer") as "Admin" | "Uploader" | "Viewer";

  const from = isoOk(searchParams.from);
  const to = isoOk(searchParams.to);

  // Collector names (for the admin table + viewer header).
  const { data: collectors } = await supabase
    .from("collectors")
    .select("id, name, hr_code")
    .order("name");
  const nameByHr = new Map<string, string>();
  (collectors ?? []).forEach((c: any) => {
    if (c.hr_code) nameByHr.set(c.hr_code, c.name);
  });

  // =================== COLLECTOR (Viewer) ===================
  if (role === "Viewer") {
    const isLinked = !!profile?.collector_id || !!profile?.hr_code;
    let myName: string | null = null;
    if (profile?.collector_id) {
      myName =
        (collectors ?? []).find((c: any) => c.id === profile.collector_id)?.name ?? null;
    }
    if (!myName) myName = profile?.hr_code ?? null;

    // Their own match parts (RLS-scoped inside the function).
    const { data: partRows } = await supabase.rpc("match_part_summary_fast", {
      p_from: from,
      p_to: to,
      p_collector: null,
      p_limit: 2000,
    });
    const parts: PartSummary[] = (partRows ?? []).map((r: any) => ({
      matchid: r.matchid,
      partid: r.partid,
      hr_code: r.hr_code,
      collector_name: r.hr_code ? nameByHr.get(r.hr_code) ?? r.hr_code : "—",
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

    // Exact per-module totals (not capped by the part limit).
    const { data: ctRows } = await supabase.rpc("collector_module_totals", {
      p_from: from,
      p_to: to,
    });
    const me = (ctRows ?? [])[0];
    const moduleTotals: Record<ModuleValue, number> = me
      ? {
          players: Number(me.players),
          event: Number(me.event),
          formation_tactical: Number(me.formation_tactical),
          location: Number(me.location),
          impact: Number(me.impact),
          extras: Number(me.extras),
          freeze_frame: Number(me.freeze_frame),
        }
      : emptyCounts();

    // Reports (RLS-scoped to this collector).
    let rq = supabase
      .from("reports")
      .select("id, title, body, url, report_date")
      .order("report_date", { ascending: false });
    if (from) rq = rq.gte("report_date", from);
    if (to) rq = rq.lte("report_date", to);
    const { data: reportRows } = await rq;
    const reports: Report[] = (reportRows ?? []) as any;

    // Feedback sessions (RLS-scoped to this collector).
    let fq = supabase
      .from("feedback_meetings")
      .select("id, session_date, mode, notes")
      .order("session_date", { ascending: false });
    if (from) fq = fq.gte("session_date", from);
    if (to) fq = fq.lte("session_date", to);
    const { data: fsRows } = await fq;
    const feedbackSessions: FeedbackSession[] = (fsRows ?? []) as any;

    return (
      <CollectorDashboard
        myName={myName}
        isLinked={isLinked}
        from={from ?? ""}
        to={to ?? ""}
        parts={parts}
        moduleTotals={moduleTotals}
        reports={reports}
        feedbackSessions={feedbackSessions}
      />
    );
  }

  // =================== ADMIN / UPLOADER ===================
  const { data: ctRows } = await supabase.rpc("collector_module_totals", {
    p_from: from,
    p_to: to,
  });
  const rows: CollectorRow[] = (ctRows ?? []).map((r: any) => ({
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

  return <CollectorsPerformance from={from ?? ""} to={to ?? ""} rows={rows} />;
}
