import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SendReportForm from "@/components/SendReportForm";
export const dynamic = "force-dynamic";
export default async function SendReportPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "Admin") redirect("/dashboard");
  const { data: collectors } = await supabase.from("collectors").select("hr_code, name").order("name");
  const { data: reports } = await supabase.from("reports").select("id, title, report_date, hr_code").order("created_at", { ascending: false }).limit(20);
  const { data: acks } = await supabase.from("report_acknowledgments").select("report_id");
  const ackCounts: Record<string, number> = {};
  for (const a of acks ?? []) {
    const k = a.report_id as string;
    ackCounts[k] = (ackCounts[k] ?? 0) + 1;
  }
  return <SendReportForm
    collectors={(collectors ?? []).map((c: any) => ({ hr_code: c.hr_code, name: c.name }))}
    recentReports={(reports ?? []).map((r: any) => ({ id: r.id, title: r.title, report_date: r.report_date, hr_code: r.hr_code, acked_count: ackCounts[r.id] ?? 0 }))}
  />;
}
