import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AdminSessionsView from "@/components/AdminSessionsView";
export const dynamic = "force-dynamic";
export default async function AdminSessionsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!["Admin","Uploader","Supervisor"].includes(profile?.role ?? "")) redirect("/analytics");
  const { data: sessions } = await supabase.from("feedback_meetings").select("id, hr_code, session_date, mode, status, meet_link, location, notes").order("session_date", { ascending: false });
  return <AdminSessionsView sessions={(sessions ?? []).map((s: any) => ({ id: s.id, hr_code: s.hr_code, session_date: s.session_date, mode: s.mode, status: s.status, meet_link: s.meet_link, location: s.location, notes: s.notes }))} />;
}
