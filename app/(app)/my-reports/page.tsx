import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import MyReportsView from "@/components/MyReportsView";
export const dynamic = "force-dynamic";
export default async function MyReportsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role, hr_code").eq("id", user.id).single();
  if (profile?.role !== "Viewer") redirect("/admin-reports");
  const { data: reportRows } = await supabase.from("reports").select("id, title, body, url, report_date").order("report_date", { ascending: false });
  const { data: ackRows } = await supabase.from("report_acknowledgments").select("report_id");
  const ackedIds = new Set((ackRows ?? []).map((r: any) => r.report_id as string));
  return <MyReportsView
    myHr={profile?.hr_code ?? null}
    reports={(reportRows ?? []).map((r: any) => ({ id: r.id, title: r.title, body: r.body, url: r.url, report_date: r.report_date, acknowledged: ackedIds.has(r.id) }))}
  />;
}
