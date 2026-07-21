import { createClient } from "@/lib/supabase/server";
import { getEffective } from "@/lib/effective";
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

  const eff = await getEffective(supabase);
  const profile = eff?.profile ?? null;
  const role = (profile?.role ?? "Viewer") as "Admin" | "Reviewer" | "Viewer";

  const from = isoOk(searchParams.from);
  const to = isoOk(searchParams.to);

  // v58 fix: this used to join against `collectors`, which is stale/orphaned
  // since the v56 users refactor (identity data now lives on `users` -
  // first_name/last_name/squad/job_title). That's why the team filter showed
  // null and names fell back to the hr_code itself.
  const { data: usersDir } = await supabase
    .from("users")
    .select("hr_code, first_name, last_name, squad, job_title")
    .order("hr_code");
  const byHr = new Map<
    string,
    { name: string | null; team: string | null; title: string | null }
  >();
  (usersDir ?? []).forEach((u: any) => {
    if (!u.hr_code) return;
    const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
    byHr.set(u.hr_code, {
      name: name || null,
      team: u.squad ?? null,
      title: u.job_title ?? null,
    });
  });

  // =================== COLLECTOR (Viewer) ===================
  if (role === "Viewer") {
    const isLinked = !!profile?.hr_code;
    const meInfo = profile?.hr_code ? byHr.get(profile.hr_code) : undefined;
    const myName = meInfo?.name ?? profile?.hr_code ?? null;

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
      collector_name: r.hr_code ? byHr.get(r.hr_code)?.name ?? r.hr_code : "-",
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

    // v56 repointed match_sessions off collector_id (uuid, dropped) onto
    // hr_code (text) - this used to look up collectors.id first and would
    // now error since that column is gone.
    let rq = supabase
      .from("match_sessions")
      .select("id, match_name, review_date, overall_notes")
      .eq("hr_code", profile?.hr_code ?? "")
      .order("review_date", { ascending: false });
    if (from) rq = rq.gte("review_date", from);
    if (to) rq = rq.lte("review_date", to);
    const { data: reportRows } = await rq;

    // Sessions for this collector: read attendees joined to reservations
    // (feedback_meetings was retired in v41).
    const { data: feRows } = await supabase
      .from("feedback_attendees")
      .select("id, comment, feedback_reservations(session_date, mode)")
      .eq("hr_code", profile?.hr_code ?? "");

    const fsRows = (feRows ?? [])
      .map((a: any) => ({
        id: a.id,
        session_date: a.feedback_reservations?.session_date ?? null,
        mode: a.feedback_reservations?.mode ?? null,
        notes: a.comment ?? null,
      }))
      .filter((r: any) => {
        if (from && (!r.session_date || r.session_date < from)) return false;
        if (to && (!r.session_date || r.session_date > to)) return false;
        return true;
      })
      .sort((a: any, b: any) => (b.session_date ?? "").localeCompare(a.session_date ?? ""));

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
      name: info?.name ?? "-",
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
    new Set((usersDir ?? []).map((u: any) => u.squad).filter(Boolean) as string[])
  ).sort();
  const titles = Array.from(
    new Set((usersDir ?? []).map((u: any) => u.job_title).filter(Boolean) as string[])
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
