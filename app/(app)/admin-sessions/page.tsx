import { createClient } from "@/lib/supabase/server";
import { getEffective } from "@/lib/effective";
import { redirect } from "next/navigation";
import AdminSessionsView from "@/components/AdminSessionsView";

export const dynamic = "force-dynamic";

export default async function AdminSessionsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const eff = await getEffective(supabase);
  const profile = eff?.profile ?? null;
  if (!["Admin", "Uploader", "Supervisor"].includes(profile?.role ?? "")) {
    redirect("/analytics");
  }

  // Read from the canonical source: feedback_attendees joined to
  // feedback_reservations (feedback_meetings was retired).
  const { data: rows } = await supabase
    .from("feedback_attendees")
    .select(
      "id, hr_code, attendance, comment, feedback_reservations(session_date, mode, meet_link, location)"
    )
    .order("hr_code", { ascending: true });

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
        hr_code: a.hr_code,
        session_date: r.session_date ?? "",
        mode: r.mode ?? "",
        status,
        meet_link: r.meet_link ?? null,
        location: r.location ?? null,
        notes: a.comment ?? null,
      };
    })
    .sort((a: any, b: any) => (b.session_date ?? "").localeCompare(a.session_date ?? ""));

  return <AdminSessionsView sessions={sessions} />;
}
