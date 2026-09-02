import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffective } from "@/lib/effective";
import FeedbackAnalysisView from "@/components/FeedbackAnalysisView";

export const dynamic = "force-dynamic";

// v59: Admin/Reviewer weekly rollup of feedback session outcomes. Each cell
// links back to /feedback-progress with the corresponding week + status
// filter preloaded.
export default async function FeedbackAnalysisPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const eff = await getEffective(supabase);
  const profile = eff?.profile ?? null;
  if (!profile || !["Admin", "Reviewer", "Supervisor"].includes(profile.role)) {
    redirect("/dashboard");
  }

  const { data: reservations } = await supabase
    .from("feedback_reservations")
    .select("id, session_date, feedback_attendees(id, attendance)")
    .order("session_date", { ascending: false });

  type Row = {
    session_date: string | null;
    feedback_attendees: { id: string; attendance: string | null }[] | null;
  };

  const rows = ((reservations ?? []) as Row[])
    .filter((r) => !!r.session_date)
    .flatMap((r) =>
      (r.feedback_attendees ?? []).map((a) => ({
        session_date: r.session_date as string,
        attendance: a.attendance as string | null,
      }))
    );

  return <FeedbackAnalysisView rows={rows} />;
}
