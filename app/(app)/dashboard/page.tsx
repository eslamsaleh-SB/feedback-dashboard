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

  const period: Period =
    searchParams.period === "quarter"
      ? "quarter"
      : searchParams.period === "year"
      ? "year"
      : "month";
  const { curFrom, curTo, prevFrom, prevTo, curLabel, prevLabel } = getPeriodRange(period);
  const curFromIso = isoDate(curFrom);
  const curToIso = isoDate(curTo);
  const prevFromIso = isoDate(prevFrom);
  const prevToIso = isoDate(prevTo);

  // ---- Feedback attendance stats for the CURRENT period ----------------------
  // We pull rows joined to reservations so we can filter by session_date.
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

  // ---- Open notes (still global - not period-scoped, same as before) --------
  const { count: openNotes } = await supabase
    .from("session_notes")
    .select("id", { count: "exact", head: true })
    .neq("status", "Complete");

  // ---- Module errors: current vs previous period -----------------------------
  // We use the existing RPC collector_module_totals(p_from, p_to) which returns
  // one row per collector with .total of all errors. Summing gives the period
  // total.
  const [{ data: curMt }, { data: prevMt }] = await Promise.all([
    supabase.rpc("collector_module_totals", { p_from: curFromIso, p_to: curToIso }),
    supabase.rpc("collector_module_totals", { p_from: prevFromIso, p_to: prevToIso }),
  ]);
  const sumTotal = (rows: any[] | null) =>
    (rows ?? []).reduce((acc, r: any) => acc + Number(r.total ?? 0), 0);
  const moduleErrorsCur = sumTotal(curMt);
  const moduleErrorsPrev = sumTotal(prevMt);

  // ---- Quality scores: current vs previous month (we use month boundaries
  // for upload_month directly).
  const monthFirstIso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  const { data: qsRows } = await supabase
    .from("quality_scores")
    .select("score, upload_month")
    .gte("upload_month", monthFirstIso(curFrom))
    .lte("upload_month", monthFirstIso(curTo));
  const { data: qsPrevRows } = await supabase
    .from("quality_scores")
    .select("score, upload_month")
    .gte("upload_month", monthFirstIso(prevFrom))
    .lte("upload_month", monthFirstIso(prevTo));
  const avg = (rows: any[] | null) =>
    rows && rows.length > 0
      ? rows.reduce((acc, r: any) => acc + Number(r.score ?? 0), 0) / rows.length
      : null;
  const qualityCur = avg(qsRows ?? []);
  const qualityPrev = avg(qsPrevRows ?? []);

  // ---- Collector + Open Notes counts shown alongside ------------------------
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
      qualityCur={qualityCur}
      qualityPrev={qualityPrev}
    />
  );
}
