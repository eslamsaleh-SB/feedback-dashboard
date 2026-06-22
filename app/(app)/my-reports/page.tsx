import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MyReportsView from "@/components/MyReportsView";

export const dynamic = "force-dynamic";

export default async function MyReportsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, hr_code")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "Viewer") redirect("/admin-reports");

  const hrCode = profile?.hr_code ?? "";

  const { data: collector } = await supabase
    .from("collectors")
    .select("id")
    .eq("hr_code", hrCode)
    .single();

  if (!collector) {
    return <div className="p-8 text-slate-500">No collector record linked to your account yet.</div>;
  }

  const { data: sessions } = await supabase
    .from("match_sessions")
    .select("id, match_name, review_date, overall_notes")
    .eq("collector_id", collector.id)
    .order("review_date", { ascending: false });

  const sessionIds = (sessions ?? []).map((s: any) => s.id as string);

  const [{ data: ackRows }, { data: noteRows }, { data: videoRows }] = await Promise.all([
    sessionIds.length
      ? supabase.from("session_acknowledgments").select("session_id").in("session_id", sessionIds).eq("hr_code", hrCode)
      : Promise.resolve({ data: [] }),
    sessionIds.length
      ? supabase.from("session_notes").select("id, session_id, note_text, status, created_at").in("session_id", sessionIds).eq("hr_code", hrCode).order("created_at")
      : Promise.resolve({ data: [] }),
    sessionIds.length
      ? supabase.from("session_videos").select("id, session_id, drive_file_id, file_name").in("session_id", sessionIds)
      : Promise.resolve({ data: [] }),
  ]);

  const ackedIds = new Set((ackRows ?? []).map((a: any) => a.session_id as string));

  const notesBySession: Record<string, any[]> = {};
  for (const n of noteRows ?? []) {
    const k = n.session_id as string;
    if (!notesBySession[k]) notesBySession[k] = [];
    notesBySession[k].push({ id: n.id, note_text: n.note_text, status: n.status, created_at: n.created_at });
  }

  const videosBySession: Record<string, any[]> = {};
  for (const v of videoRows ?? []) {
    const k = v.session_id as string;
    if (!videosBySession[k]) videosBySession[k] = [];
    videosBySession[k].push({ id: v.id, drive_file_id: v.drive_file_id, file_name: v.file_name });
  }

  return (
    <MyReportsView
      hrCode={hrCode}
      sessions={(sessions ?? []).map((s: any) => ({
        id: s.id,
        match_name: s.match_name,
        review_date: s.review_date,
        overall_notes: s.overall_notes,
        acknowledged: ackedIds.has(s.id),
        notes: notesBySession[s.id] ?? [],
        videos: videosBySession[s.id] ?? [],
      }))}
    />
  );
}
