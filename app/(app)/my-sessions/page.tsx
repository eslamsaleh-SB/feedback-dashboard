import { createClient } from "@/lib/supabase/server";
import { getEffective } from "@/lib/effective";
import { redirect } from "next/navigation";
import MySessionsView from "@/components/MySessionsView";
export const dynamic = "force-dynamic";
export default async function MySessionsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const eff = await getEffective(supabase);
  const profile = eff?.profile ?? null;
  if (profile?.role !== "Viewer") redirect("/admin-sessions");
  const { data: sessions } = await supabase.from("feedback_meetings").select("id, session_date, mode, status, meet_link, location, notes").order("session_date", { ascending: false });
  return <MySessionsView sessions={(sessions ?? []).map((s: any) => ({ id: s.id, session_date: s.session_date, mode: s.mode, status: s.status, meet_link: s.meet_link, location: s.location, notes: s.notes }))} />;
}
