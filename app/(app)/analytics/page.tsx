import { createClient } from "@/lib/supabase/server";
import AnalyticsDashboard from "@/components/AnalyticsDashboard";
import { MODULES, type AssignmentRow, type Mistake } from "@/lib/modules";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
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

  // RLS scopes every query to what this user may see:
  //   Admin -> all, Uploader -> own uploads, Viewer -> own hr_code.
  const [{ data: assignments }, { data: collectors }] = await Promise.all([
    supabase
      .from("match_assignments")
      .select("matchid, partid, hr_code, date")
      .order("date", { ascending: false }),
    supabase.from("collectors").select("id, name, hr_code").order("name"),
  ]);

  // Map hr_code -> collector name for display.
  const nameByHr = new Map<string, string>();
  (collectors ?? []).forEach((c: any) => {
    if (c.hr_code) nameByHr.set(c.hr_code, c.name);
  });

  // Pull every module's rows in parallel (only key fields needed for counts +
  // the per-mistake detail shown when expanding a match part).
  // Select * because columns differ per module (e.g. freeze_frame has no
  // error_type/defect_type); we read whichever detail fields exist.
  const moduleResults = await Promise.all(
    MODULES.map((m) => supabase.from(m.value).select("*"))
  );

  const assignmentRows: AssignmentRow[] = (assignments ?? []).map((a: any) => ({
    matchid: a.matchid,
    partid: a.partid,
    hr_code: a.hr_code,
    collector_name: a.hr_code
      ? nameByHr.get(a.hr_code) ?? a.hr_code
      : "Unassigned",
    date: a.date,
  }));

  const mistakes: Mistake[] = [];
  moduleResults.forEach((res, i) => {
    const moduleValue = MODULES[i].value;
    (res.data ?? []).forEach((r: any) => {
      mistakes.push({
        id: r.id,
        module: moduleValue,
        matchid: r.matchid,
        partid: r.partid,
        key: r.key,
        hr_code: r.hr_code,
        error_type: r.error_type,
        defect_type: r.defect_type,
        collector_event: r.collector_event,
        video_timestamp: r.video_timestamp,
      });
    })