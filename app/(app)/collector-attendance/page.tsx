import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffective } from "@/lib/effective";
import CollectorAttendanceView from "@/components/CollectorAttendanceView";

export const dynamic = "force-dynamic";

// v59: per-collector session counts (Attended / Late / Absent / Cancelled /
// Not Marked / Total + Attendance %). Rows link to Feedback Progress with
// hr_code + status preloaded so admins can drill in.
export default async function CollectorAttendancePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const eff = await getEffective(supabase);
  const profile = eff?.profile ?? null;
  if (!profile || !["Admin", "Reviewer", "Supervisor"].includes(profile.role)) {
    redirect("/dashboard");
  }

  // Paginate feedback_attendees — PostgREST caps 1000 rows / request.
  async function fetchAll() {
    const PAGE = 1000;
    const out: any[] = [];
    let start = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await supabase
        .from("feedback_attendees")
        .select("hr_code, attendance, feedback_reservations(session_date)")
        .range(start, start + PAGE - 1);
      if (error) throw new Error(error.message);
      const batch = data ?? [];
      out.push(...batch);
      if (batch.length < PAGE) break;
      start += PAGE;
      if (start > 500000) break;
    }
    return out;
  }

  const attendees = await fetchAll();

  const { data: usersDir } = await supabase
    .from("users")
    .select("hr_code, first_name, last_name, squad")
    .not("hr_code", "is", null)
    .order("hr_code");
  const byHr = new Map<string, { name: string; team: string | null }>();
  for (const u of usersDir ?? []) {
    const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
    byHr.set(u.hr_code as string, { name: name || (u.hr_code as string), team: u.squad ?? null });
  }

  const rows = attendees.map((a: any) => ({
    hr_code: a.hr_code as string,
    attendance: a.attendance as string | null,
    session_date: (a.feedback_reservations?.session_date ?? null) as string | null,
    name: byHr.get(a.hr_code as string)?.name ?? a.hr_code,
    team: byHr.get(a.hr_code as string)?.team ?? null,
  }));

  return <CollectorAttendanceView rows={rows} />;
}
