import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffective } from "@/lib/effective";
import type { AppRole } from "@/components/Sidebar";
import DashboardView from "@/components/DashboardView";

export const dynamic = "force-dynamic";

function pad(n: number) { return String(n).padStart(2, "0"); }
function isoDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const isoOk = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);

const MODULE_KEYS = [
  "players",
  "event",
  "formation_tactical",
  "location",
  "impact",
  "extras",
  "freeze_frame",
] as const;

function sumByModule(rows: any[] | null | undefined) {
  const out: Record<string, number> = {};
  for (const m of MODULE_KEYS) out[m] = 0;
  for (const r of rows ?? []) {
    for (const m of MODULE_KEYS) out[m] += Number((r as any)[m] ?? 0);
  }
  return out;
}
function avgByModule(rows: any[] | null | undefined) {
  const groups: Record<string, number[]> = {};
  for (const r of rows ?? []) {
    const mod = (r as any).module as string;
    if (!groups[mod]) groups[mod] = [];
    groups[mod].push(Number((r as any).score ?? 0));
  }
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(groups)) {
    out[k] = v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  }
  return out;
}
function avgScores(rows: any[] | null | undefined): number | null {
  if (!rows || rows.length === 0) return null;
  return rows.reduce((a, r: any) => a + Number(r.score ?? 0), 0) / rows.length;
}

// Default range = this year so far.
function defaultRange() {
  const now = new Date();
  return {
    from: `${now.getFullYear()}-01-01`,
    to: isoDate(now),
  };
}

// Previous range = same length window immediately before "from".
function previousRange(fromIso: string, toIso: string) {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000) + 1);
  const prevTo = new Date(from);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - (days - 1));
  return { prevFromIso: isoDate(prevFrom), prevToIso: isoDate(prevTo) };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string };
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const eff = await getEffective(supabase);
  const profile = eff?.profile ?? null;
  const role = (profile?.role ?? "Viewer") as AppRole;
  if (role === "Viewer") redirect("/analytics");

  const def = defaultRange();
  const from = isoOk(searchParams.from) ?? def.from;
  const to = isoOk(searchParams.to) ?? def.to;
  const { prevFromIso, prevToIso } = previousRange(from, to);

  const curLabel = `${from} to ${to}`;
  const prevLabel = `${prevFromIso} to ${prevToIso}`;

  // Feedback attendance stats for the current window.
  const { data: attendeeRows } = await supabase
    .from("feedback_attendees")
    .select("attendance, feedback_reservations(session_date)");
  function attendInPeriod(rows: any[], fromStr: string, toStr: string) {
    let total = 0, completed = 0, cancelled = 0, absent = 0;
    for (const r of rows ?? []) {
      const d = r?.feedback_reservations?.session_date ?? null;
      if (!d || d < fromStr || d > toStr) continue;
      total++;
      if (r.attendance === "Attended" || r.attendance === "Attended Late") completed++;
      else if (r.attendance === "Cancelled") cancelled++;
      else if (r.attendance === "Absent") absent++;
    }
    return { total, completed, cancelled, absent, incomplete: total - completed };
  }
  const feedback = attendInPeriod(attendeeRows ?? [], from, to);

  const { count: submittedReports } = await supabase
    .from("match_sessions")
    .select("id", { count: "exact", head: true })
    .gte("review_date", from)
    .lte("review_date", to);

  const { count: openNotes } = await supabase
    .from("session_notes")
    .select("id", { count: "exact", head: true })
    .neq("status", "Complete");

  const [{ data: curMt }, { data: prevMt }] = await Promise.all([
    supabase.rpc("collector_module_totals", { p_from: from, p_to: to }),
    supabase.rpc("collector_module_totals", { p_from: prevFromIso, p_to: prevToIso }),
  ]);
  const modulesCur = sumByModule(curMt);
  const modulesPrev = sumByModule(prevMt);
  const moduleErrorsCur = MODULE_KEYS.reduce((acc, m) => acc + modulesCur[m], 0);
  const moduleErrorsPrev = MODULE_KEYS.reduce((acc, m) => acc + modulesPrev[m], 0);

  // Quality scores by upload_month overlapping the window.
  const monthFirstIso = (d: string) => `${d.slice(0, 7)}-01`;
  const [{ data: qsRows }, { data: qsPrevRows }] = await Promise.all([
    supabase
      .from("quality_scores")
      .select("module, score, upload_month")
      .gte("upload_month", monthFirstIso(from))
      .lte("upload_month", monthFirstIso(to)),
    supabase
      .from("quality_scores")
      .select("module, score, upload_month")
      .gte("upload_month", monthFirstIso(prevFromIso))
      .lte("upload_month", monthFirstIso(prevToIso)),
  ]);
  const qualityCurByModule = avgByModule(qsRows);
  const qualityPrevByModule = avgByModule(qsPrevRows);

  const [{ data: ffRows }, { data: ffPrevRows }] = await Promise.all([
    supabase
      .from("freeze_frame_scores")
      .select("score, upload_month")
      .gte("upload_month", monthFirstIso(from))
      .lte("upload_month", monthFirstIso(to)),
    supabase
      .from("freeze_frame_scores")
      .select("score, upload_month")
      .gte("upload_month", monthFirstIso(prevFromIso))
      .lte("upload_month", monthFirstIso(prevToIso)),
  ]);
  const freezeFrameQualityCur = avgScores(ffRows);
  const freezeFrameQualityPrev = avgScores(ffPrevRows);

  const { count: collectorCount } = await supabase
    .from("collectors")
    .select("id", { count: "exact", head: true });

  return (
    <DashboardView
      from={from}
      to={to}
      curLabel={curLabel}
      prevLabel={prevLabel}
      submittedReports={submittedReports ?? 0}
      collectorCount={collectorCount ?? 0}
      openNotes={openNotes ?? 0}
      feedback={feedback}
      moduleErrorsCur={moduleErrorsCur}
      moduleErrorsPrev={moduleErrorsPrev}
      modulesCur={modulesCur}
      modulesPrev={modulesPrev}
      qualityCurByModule={qualityCurByModule}
      qualityPrevByModule={qualityPrevByModule}
      freezeFrameQualityCur={freezeFrameQualityCur}
      freezeFrameQualityPrev={freezeFrameQualityPrev}
    />
  );
}
