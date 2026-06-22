import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminReportsView from "@/components/AdminReportsView";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single();

  if (profile?.role !== "Admin") redirect("/analytics");

  // All reports with their notes
  const { data: reportRows } = await supabase
    .from("reports")
    .select("id, title, report_date, hr_code, created_at")
    .order("report_date", { ascending: false });

  // All notes with collector info
  const { data: noteRows } = await supabase
    .from("report_notes")
    .select("id, report_id, hr_code, note_text, status, created_at")
    .order("created_at", { ascending: false });

  // Acknowledgment counts per report
  const { data: ackRows } = await supabase
    .from("report_acknowledgments")
    .select("report_id, hr_code");

  // Feedback meetings
  const { data: meetingRows } = await supabase
    .from("feedback_meetings")
    .select("id, hr_code, session_date, mode, notes, status, meet_link, location, created_at")
    .order("session_date", { ascending: false });

  const ackByReport: Record<string, string[]> = {};
  for (const a of ackRows ?? []) {
    const k = a.report_id as string;
    if (!ackByReport[k]) ackByReport[k] = [];
    ackByReport[k].push(a.hr_code as string);
  }

  return (
    <AdminReportsView
      reports={(reportRows ?? []).map((r: any) => ({
        id: r.id as string,
        title: r.title as string,
        report_date: r.report_date as string | null,
        hr_code: r.hr_code as string | null,
        acked_by: ackByReport[r.id] ?? [],
      }))}
      notes={(noteRows ?? []).map((r: any) => ({
        id: r.id as string,
        report_id: r.report_id as string,
        hr_code: r.hr_code as string,
        note_text: r.note_text as string,
        status: r.status as string,
        created_at: r.created_at as string,
      }))}
      feedbackSessions={(meetingRows ?? []).map((r: any) => ({
        id: r.id as string,
        hr_code: r.hr_code as string,
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
