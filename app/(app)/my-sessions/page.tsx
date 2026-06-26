import { createClient } from "@/lib/supabase/server";
import { getEffective } from "@/lib/effective";
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
  if (profile?.role !== "Viewer") redirect("/admin-sessions");

  const hr = profile?.hr_code ?? "";

  // Read the real source (attendees + reservations) instead of feedback_meetings,
  // so status always matches what the admin set on Feedback Progress.
  const { data: rows } = await supabase
    .from("feedback_attendees")
    .select(
      "id, attendance, comment, feedback_reservations(session_date, mode, location, meet_link)"
    )
    .eq("hr_code", hr);

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
