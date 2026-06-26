import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffective } from "@/lib/effective";
import type { AppRole } from "@/components/Sidebar";
import DashboardView from "@/components/DashboardView";

export const dynamic = "force-dynamic";

type Period = "month" | "quarter" | "year";

function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getPeriodRange(period: Period, now: Date = new Date()) {
  if (period === "month") {
    const y = now.getFullYear();
    const m = now.getMonth();
    const curFrom = new Date(y, m, 1);
    const curTo = new Date(y, m + 1, 0);
    const prevFrom = new Date(y, m - 1, 1);
    const prevTo = new Date(y, m, 0);
    const fmt = (d: Date) =>
      d.toLocaleString("default", { month: "long", year: "numeric" });
    return { curFrom, curTo, prevFrom, prevTo, curLabel: fmt(curFrom), prevLabel: fmt(prevFrom) };
  }
  if (period === "quarter") {
    const y = now.getFullYear();
    const q = Math.floor(now.getMonth() / 3); // 0..3
    const curFrom = new Date(y, q * 3, 1);
    const curTo = new Date(y, q * 3 + 3, 0);
    const prevYear = q === 0 ? y - 1 : y;
    const prevQ = q === 0 ? 3 : q - 1;
    const prevFrom = new Date(prevYear, prevQ * 3, 1);
    const prevTo = new Date(prevYear, prevQ * 3 + 3, 0);
    return {
      curFrom,
      curTo,
      prevFrom,
      prevTo,
      curLabel: `Q${q + 1} ${y}`,
      prevLabel: `Q${prevQ + 1} ${prevYear}`,
    };
  }
  // year
  const y = now.getFullYear();
  const curFrom = new Date(y, 0, 1);
  const curTo = new Date(y, 11, 31);
  const prevFrom = new Date(y - 1, 0, 1);
  const prevTo = new Date(y - 1, 11, 31);
  return { curFrom, curTo, prevFrom, prevTo, curLabel: String(y), prevLabel: String(y - 1) };
}

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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { period?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const eff = await getEffective(supabase);
  const profile = eff?.profile ?? null;
  const role = (profile?.role ?? "Viewer") as AppRole;
  if (role === "Viewer") redirect("/analytics");

  // Default = Year so the page surfaces all data unless the admin narrows it.
  const period: Period =
    searchParams.period === "month"
      ? "month"
      : searchParams.period === "quarter"
      ? "quarter"
      : "year";
  const { curFrom, curTo, prevFrom, prevTo, curLabel, prevLabel } = getPeriodRange(period);
  const curFromIso = isoDate(curFrom);
  const curToIso = isoDate(curTo);
  const prevFromIso = isoDate(prevFrom);
  const prevToIso = isoDate(prevTo);

  // ---- Feedback attendance stats for the CURRENT period ----------------------
  const { data: attendeeRows } = await supabase
    .from("feedback_attendees")
    .select("attendance, feedback_reservations(session_date)");

  function attendInPeriod(rows: any[], from: string, to: string) {
    let total = 0;
    let completed = 0;
    let cancelled = 0;
    let absent = 0;
    for (const r of rows ?? []) {
      const d = r?.feedback_reservations?.session_date ?? null;
      if (!d || d < from || d > to) continue;
      total++;
      if (r.attendance === "Attended" || r.attendance === "Attended Late") completed++;
      else if (r.attendance === "Cancelled") cancelled++;
      else if (r.attendance === "Absent") absent++;
    }
    return { total, completed, cancelled, absent, incomplete: total - completed };
  }
  const feedback = attendInPeriod(attendeeRows ?? [], curFromIso, curToIso);

  // ---- Submitted Reports (current period) ------------------------------------
  const { count: submittedReports } = await supabase
    .from("match_sessions")
    .select("id", { count: "exact", head: true })
    .gte("review_date", curFromIso)
    .lte("review_date", curToIso);

  // ---- Open notes ------------------------------------------------------------
  const { count: openNotes } = await supabase
    .from("session_notes")
    .select("id", { count: "exact", head: true })
    .neq("status", "Complete");

  // ---- Module errors per module: current vs previous period ------------------
  const [{ data: curMt }, { data: prevMt }] = await Promise.all([
    supabase.rpc("collector_module_totals", { p_from: curFromIso, p_to: curToIso }),
    supabase.rpc("collector_module_totals", { p_from: prevFromIso, p_to: prevToIso }),
  ]);
  const modulesCur = sumByModule(curMt);
  const modulesPrev = sumByModule(prevMt);
  const moduleErrorsCur = MODULE_KEYS.reduce((acc, m) => acc + modulesCur[m], 0);
  const moduleErrorsPrev = MODULE_KEYS.reduce((acc, m) => acc + modulesPrev[m], 0);

  // ---- Quality scores per module: current vs previous (month boundaries)
  const monthFirstIso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  const [{ data: qsRows }, { data: qsPrevRows }] = await Promise.all([
    supabase
      .from("quality_scores")
      .select("module, score, upload_month")
      .gte("upload_month", monthFirstIso(curFrom))
      .lte("upload_month", monthFirstIso(curTo)),
    supabase
      .from("quality_scores")
      .select("module, score, upload_month")
      .gte("upload_month", monthFirstIso(prevFrom))
      .lte("upload_month", monthFirstIso(prevTo)),
  ]);
  const qualityCurByModule = avgByModule(qsRows);
  const qualityPrevByModule = avgByModule(qsPrevRows);

  // Freeze frame quality score (separate table).
  const [{ data: ffRows }, { data: ffPrevRows }] = await Promise.all([
    supabase
      .from("freeze_frame_scores")
      .select("score, upload_month")
      .gte("upload_month", monthFirstIso(curFrom))
      .lte("upload_month", monthFirstIso(curTo)),
    supabase
      .from("freeze_frame_scores")
      .select("score, upload_month")
      .gte("upload_month", monthFirstIso(prevFrom))
      .lte("upload_month", monthFirstIso(prevTo)),
  ]);
  const freezeFrameQualityCur = avgScores(ffRows);
  const freezeFrameQualityPrev = avgScores(ffPrevRows);

  // ---- Collector count -------------------------------------------------------
  const { count: collectorCount } = await supabase
    .from("collectors")
    .select("id", { count: "exact", head: true });

  return (
    <DashboardView
      period={period}
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
