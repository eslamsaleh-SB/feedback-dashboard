import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffective } from "@/lib/effective";
import type { AppRole } from "@/components/Sidebar";
import DashboardView, { type CompareTo } from "@/components/DashboardView";

export const dynamic = "force-dynamic";

function pad(n: number) { return String(n).padStart(2, "0"); }
function isoDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const isoOk = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);

const MODULE_KEYS = [
  "players","event","formation_tactical","location","impact","extras","freeze_frame",
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
  const out: Record<string, number | null> = {};
  for (const [k, v] of Object.entries(groups)) {
    out[k] = v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  }
  return out;
}
function avgScores(rows: any[] | null | undefined): number | null {
  if (!rows || rows.length === 0) return null;
  return rows.reduce((a, r: any) => a + Number(r.score ?? 0), 0) / rows.length;
}

function defaultRange() {
  const now = new Date();
  return { from: `${now.getFullYear()}-01-01`, to: isoDate(now) };
}

function shiftBack(fromIso: string, toIso: string, mode: CompareTo) {
  const f = new Date(fromIso);
  const t = new Date(toIso);
  function shift(d: Date) {
    const out = new Date(d);
    if (mode === "last_year") {
      out.setFullYear(out.getFullYear() - 1);
    } else {
      const months = mode === "last_quarter" ? 3 : 1;
      out.setMonth(out.getMonth() - months);
    }
    return out;
  }
  return { prevFrom: isoDate(shift(f)), prevTo: isoDate(shift(t)) };
}

function prevLabelFor(mode: CompareTo): string {
  if (mode === "last_quarter") return "previous quarter (same dates, -3 months)";
  if (mode === "last_year")    return "previous year (same dates, -1 year)";
  return "previous month (same dates, -1 month)";
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; compare?: string };
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
  const compareTo: CompareTo =
    searchParams.compare === "last_quarter"
      ? "last_quarter"
      : searchParams.compare === "last_year"
      ? "last_year"
      : "last_month";
  const { prevFrom, prevTo } = shiftBack(from, to, compareTo);

  const curLabel = `${from} to ${to}`;
  const prevLabel = `${prevFrom} to ${prevTo}`;

  // v55 P2.4 - parallelize the 3 independent queries + the 2 module-totals RPCs.
  function attend(rows: any[], fromStr: string, toStr: string) {
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
  const [
    { data: attendeeRows },
    { count: submittedReports },
    { count: openNotes },
    { data: curMt },
    { data: prevMt },
  ] = await Promise.all([
    supabase.from("feedback_attendees").select("attendance, feedback_reservations(session_date)"),
    supabase
      .from("match_sessions")
      .select("id", { count: "exact", head: true })
      .gte("review_date", from)
      .lte("review_date", to),
    supabase
      .from("session_notes")
      .select("id", { count: "exact", head: true })
      .neq("status", "Complete"),
    supabase.rpc("collector_module_totals", { p_from: from, p_to: to }),
    supabase.rpc("collector_module_totals", { p_from: prevFrom, p_to: prevTo }),
  ]);
  const feedback = attend(attendeeRows ?? [], from, to);
  const modulesCur = sumByModule(curMt);
  const modulesPrev = sumByModule(prevMt);
  const moduleErrorsCur = MODULE_KEYS.reduce((a, m) => a + modulesCur[m], 0);
  const moduleErrorsPrev = MODULE_KEYS.reduce((a, m) => a + modulesPrev[m], 0);

  const monthFirst = (d: string) => `${d.slice(0, 7)}-01`;

  // Range-paginated fetch bypasses PostgREST's max-rows cap.
  async function fetchAllInRange(
    table: string,
    select: string,
    fromMonth: string,
    toMonth: string
  ): Promise<any[]> {
    const out: any[] = [];
    const PAGE = 1000;
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await supabase
        .from(table)
        .select(select)
        .gte("upload_month", fromMonth)
        .lte("upload_month", toMonth)
        .order("upload_month", { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      out.push(...data);
      if (data.length < PAGE) break;
    }
    return out;
  }

  const [qsRows, qsPrevRows, ffRows, ffPrevRows] = await Promise.all([
    fetchAllInRange("quality_scores", "module, score, upload_month", monthFirst(from), monthFirst(to)),
    fetchAllInRange("quality_scores", "module, score, upload_month", monthFirst(prevFrom), monthFirst(prevTo)),
    fetchAllInRange("freeze_frame_scores", "score, upload_month", monthFirst(from), monthFirst(to)),
    fetchAllInRange("freeze_frame_scores", "score, upload_month", monthFirst(prevFrom), monthFirst(prevTo)),
  ]);
  const qualityCurByModule = avgByModule(qsRows);
  const qualityPrevByModule = avgByModule(qsPrevRows);
  const freezeFrameQualityCur = avgScores(ffRows);
  const freezeFrameQualityPrev = avgScores(ffPrevRows);

  // v59: `collectors` is stale/orphaned since v56. Count active collectors
  // straight from `users` (Viewer role, with an hr_code).
  const { count: collectorCount } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("role", "Viewer")
    .not("hr_code", "is", null);

  return (
    <DashboardView
      from={from}
      to={to}
      compareTo={compareTo}
      curLabel={curLabel}
      prevLabel={prevLabel}
      compareLabel={prevLabelFor(compareTo)}
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
