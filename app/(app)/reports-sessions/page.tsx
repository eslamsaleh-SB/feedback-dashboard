import { createClient } from "@/lib/supabase/server";
import { getEffective } from "@/lib/effective";
import ReportsSessionsView from "@/components/ReportsSessionsView";

export const dynamic = "force-dynamic";

export default async function ReportsSessionsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const eff = await getEffective(supabase);
  const profile = eff?.profile ?? null;

  const role = profile?.role ?? "Viewer";
  const myHr = profile?.hr_code ?? null;

  // Reports (RLS scopes to this collector's reports automatically)
  const { data: reportRows } = await supabase
    .from("reports")
    .select("id, title, body, url, report_date, hr_code")
    .order("report_date", { ascending: false });

  // Acknowledgments by this collector
  const { data: ackRows } = await supabase
    .from("report_acknowledgments")
    .select("report_id");
  const ackedIds = new Set((ackRows ?? []).map((r: any) => r.report_id as string));

  // Notes by this collector
  const { data: noteRows } = await supabase
    .from("report_notes")
    .select("id, report_id, note_text, status, created_at")
    .order("created_at", { ascending: false });

  // Feedback meetings (RLS scopes automatically)
  const { data: meetingRows } = await supabase
    .from("feedback_meetings")
    .select("id, session_date, mode, notes, status, meet_link, location")
    .order("session_date", { ascending: false });

  return (
    <ReportsSessionsView
      role={role}
      myHr={myHr}
      reports={(reportRows ?? []).map((r: any) => ({
        id: r.id as string,
        title: r.title as string,
        body: r.body as string | null,
        url: r.url as string | null,
        report_date: r.report_date as string | null,
        acknowledged: ackedIds.has(r.id),
      }))}
      notes={(noteRows ?? []).map((r: any) => ({
        id: r.id as string,
        report_id: r.report_id as string,
        note_text: r.note_text as string,
        status: r.status as string,
        created_at: r.created_at as string,
      }))}
      feedbackSessions={(meetingRows ?? []).map((r: any) => ({
        id: r.id as string,
        session_date: r.session_date as string,
        mode: r.mode as string,
        notes: r.notes as string | null,
        status: r.status as string,
        meet_link: r.meet_link as string | null,
        location: r.location as string | null,
      }))}
    />
  );
}
