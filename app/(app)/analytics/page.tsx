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

const numCounts = (r: any): Record<ModuleValue, number> => ({
  players: Number(r.players),
  event: Number(r.event),
  formation_tactical: Number(r.formation_tactical),
  location: Number(r.location),
  impact: Number(r.impact),
  extras: Number(r.extras),
  freeze_frame: Number(r.freeze_frame),
});

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
    .select("role, collector_id, hr_code, team")
    .eq("id", user!.id)
    .single();
  const role = (profile?.role ?? "Viewer") as "Admin" | "Uploader" | "Viewer";

  const from = isoOk(searchParams.from);
  const to = isoOk(searchParams.to);

  const { data: collectors } = await supabase
    .from("collectors")
    .select("id, name, hr_code, team, title")
    .order("name");
  const byHr = new Map<
    string,
    { name: string; team: string | null; title: string | null }
  >();
  (collectors ?? []).forEach((c: any) => {
    if (c.hr_code)
      byHr.set(c.hr_code, {
        name: c.name,
        team: c.team ?? null,
        title: c.title ?? null,
      });
  });

  // =================== COLLECTOR (Viewer) ===================
  if (role === "Viewer") {
    const isLinked = !!profile?.collector_id || !!profile?.hr_code;
    const meInfo = profile?.hr_code ? byHr.get(profile.hr_code) : undefined;
    let myName = meInfo?.name ?? null;
    if (!myName && profile?.collector_id)
      myName =
        (collectors ?? []).find((c: any) => c.id === profile.collector_id)?.name ??
        null;
    if (!myName) myName = profile?.hr_code ?? null;

    const { data: partRows } = await supabase.rpc("match_part_summary_fast", {
      p_from: from,
      p_to: to,
      p_collector: null,
      p_limit: 5000,
    });
    const parts: PartSummary[] = (partRows ?? []).map((r: any) => ({
      matchid: r.matchid,
      partid: r.partid,
      hr_code: r.hr_code,
      collector_name: r.hr_code ? byHr.get(r.hr_code)?.name ?? r.hr_code : "—",
      date: r.date,
      counts: numCounts(r),
      total: Number(r.total),
    }));

    // Compute module totals from parts data (already filtered to this collector via RLS)
    const moduleTotals = emptyCounts();
    const myParts = (partRows ?? []).filter((r: any) =>
      profile?.hr_code && r.hr_code &&
      r.hr_code.toLowerCase() === profile.hr_code.toLowerCase()
    );
    for (const r of myParts) {
      const c = numCounts(r);
      (Object.keys(c) as (keyof typeof c)[]).forEach((k) => {
        moduleTotals[k] = (moduleTotals[k] ?? 0) + c[k];
      });
    }

    // Find collector record to get their sessions
    const { data: collectorRow } = await supabase
      .from("collectors")
      .select("id")
      .eq("hr_code", profile?.hr_code ?? "")
      .single();

    let rq = supabase
      .from("match_sessions")
      .select("id, match_name, review_date, overall_notes")
      .eq("collector_id", collectorRow?.id ?? "00000000-0000-0000-0000-000000000000")
      .order("review_date", { ascending: false });
    if (from) rq = rq.gte("review_date", from);
    if (to) rq = rq.lte("review_date", to);
    const { data: reportRows } = await rq;

    let fq = supabase
      .from("feedback_meetings")
      .select("id, session_date, mode, notes")
      .order("session_date", { ascending: false });
    if (from) fq = fq.gte("session_date", from);
    if (to) fq = fq.lte("session_date", to);
    const { data: fsRows } = await fq;

    return (
      <CollectorDashboard
        myName={myName}
        myHr={profile?.hr_code ?? null}
        myTeam={meInfo?.team ?? profile?.team ?? null}
        isLinked={isLinked}
        from={from ?? ""}
        to={to ?? ""}
        parts={parts}
        moduleTotals={moduleTotals}
        reports={(reportRows ?? []).map((r: any) => ({
          id: r.id,
          title: r.match_name,
          body: r.overall_notes ?? null,
          url: null,
          report_date: r.review_date ?? null,
        }))}
        feedbackSessions={(fsRows ?? []) as FeedbackSession[]}
      />
    );
  }

  // =================== ADMIN / UPLOADER ===================
  const { data: ctRows } = await supabase.rpc("collector_module_totals", {
    p_from: from,
    p_to: to,
  });
  const rows: CollectorRow[] = (ctRows ?? []).map((r: any) => {
    const info = byHr.get(r.hr_code);
    return {
      hr_code: r.hr_code,
      name: info?.name ?? r.hr_code,
      team: info?.team ?? null,
      title: info?.title ?? null,
      counts: numCounts(r),
      total: Number(r.total),
      matches: Number(r.matches ?? 0),
    };
  });

  const { data: mc } = await supabase.rpc("match_count", {
    p_from: from,
    p_to: to,
  });
  const matchCount = typeof mc === "number" ? mc : Number(mc ?? 0);

  const teams = Array.from(
    new Set((collectors ?? []).map((c: any) => c.team).filter(Boolean) as string[])
  ).sort();
  const titles = Array.from(
    new Set((collectors ?? []).map((c: any) => c.title).filter(Boolean) as string[])
  ).sort();

  return (
    <CollectorsPerformance
      from={from ?? ""}
      to={to ?? ""}
      rows={rows}
      teams={teams}
      titles={titles}
      matchCount={matchCount}
      isAdmin={role === "Admin"}
    />
  );
}
