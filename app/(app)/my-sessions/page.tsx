import { createClient } from "@/lib/supabase/server";
import { getEffective, getTeamHrCodes } from "@/lib/effective";
import { redirect } from "next/navigation";
import MySessionsView from "@/components/MySessionsView";

export const dynamic = "force-dynamic";

export default async function MySessionsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const eff = await getEffective(supabase);
  const profile = eff?.profile ?? null;
  if (profile?.role !== "Viewer" && profile?.role !== "OCTeamLeader") redirect("/admin-sessions");

  const hr = profile?.hr_code ?? "";
  const teamHrs = await getTeamHrCodes(supabase, profile);
  const scopeHrs = profile.role === "OCTeamLeader" ? (teamHrs ?? []) : (hr ? [hr] : []);
  if (scopeHrs.length === 0) return <MySessionsView sessions={[]} />;

  const { data: rows } = await supabase
    .from("feedback_attendees")
    .select(
      "id, attendance, comment, feedback_reservations(session_date, session_time, mode, location, meet_link)"
    )
    .in("hr_code", scopeHrs);

  const sessions = (rows ?? [])
    .map((a: any) => {
      const r = a.feedback_reservations ?? {};
      const status =
        a.attendance == null
          ? "Scheduled"
          : a.attendance === "Attended" || a.attendance === "Attended Late"
          ? "Completed"
          : a.attendance; // "Absent" | "Cancelled"
      return {
        id: String(a.id),
        session_date: r.session_date ?? null,
        session_time: r.session_time ?? null,
        mode: r.mode ?? null,
        status,
        meet_link: r.meet_link ?? null,
        location: r.location ?? null,
        notes: a.comment ?? null,
      };
    })
    .sort((a: any, b: any) => (b.session_date ?? "").localeCompare(a.session_date ?? ""));

  return <MySessionsView sessions={sessions} />;
}
