import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminReportsView from "@/components/AdminReportsView";
export const dynamic = "force-dynamic";
export default async function AdminReportsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "Admin") redirect("/analytics");
  const [{ data: reportRows }, { data: noteRows }, { data: ackRows }] = await Promise.all([
    supabase.from("reports").select("id, title, report_date, hr_code").order("created_at", { ascending: false }),
    supabase.from("report_notes").select("id, report_id, hr_code, note_text, status, created_at").order("created_at", { ascending: false }),
    supabase.from("report_acknowledgments").select("report_id, hr_code"),
  ]);
  const ackByReport: Record<string, string[]> = {};
  for (const a of ackRows ?? []) { const k = a.report_id as string; if (!ackByReport[k]) ackByReport[k]=[]; ackByReport[k].push(a.hr_code as string); }
  return <AdminReportsView
    reports={(reportRows ?? []).map((r: any) => ({ id: r.id, title: r.title, report_date: r.report_date, hr_code: r.hr_code, acked_by: ackByReport[r.id] ?? [] }))}
    notes={(noteRows ?? []).map((r: any) => ({ id: r.id, report_id: r.report_id, hr_code: r.hr_code, note_text: r.note_text, status: r.status, created_at: r.created_at }))}
  />;
}
