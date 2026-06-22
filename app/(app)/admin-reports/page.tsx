import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminReportsView from "@/components/AdminReportsView";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "Admin") redirect("/analytics");

  const [
    { data: sessions },
    { data: noteRows },
    { data: ackRows },
    { data: videoRows },
  ] = await Promise.all([
    supabase
      .from("match_sessions")
      .select("id, match_name, review_date, overall_notes, collector_id, collectors(hr_code, name)")
      .order("review_date", { ascending: false }),
    supabase
      .from("session_notes")
      .select("id, session_id, hr_code, note_text, status, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("session_acknowledgments")
      .select("session_id"),
    supabase
      .from("session_videos")
      .select("id, session_id, drive_file_id, file_name"),
  ]);

  const ackedIds = new Set((ackRows ?? []).map((a: any) => a.session_id as string));

  const notesBySession: Record<string, any[]> = {};
  for (const n of noteRows ?? []) {
    const k = n.session_id as string;
    if (!notesBySession[k]) notesBySession[k] = [];
    notesBySession[k].push({ id: n.id, hr_code: n.hr_code, note_text: n.note_text, status: n.status, created_at: n.created_at });
  }

  const videosBySession: Record<string, any[]> = {};
  for (const v of videoRows ?? []) {
    const k = v.session_id as string;
    if (!videosBySession[k]) videosBySession[k] = [];
    videosBySession[k].push({ id: v.id, drive_file_id: v.drive_file_id, file_name: v.file_name });
  }

  return (
    <AdminReportsView
      sessions={(sessions ?? []).map((s: any) => {
        const c = Array.isArray(s.collectors) ? s.collectors[0] : s.collectors;
        return {
          id: s.id,
          match_name: s.match_name,
          review_date: s.review_date,
          overall_notes: s.overall_notes,
          hr_code: c?.hr_code ?? null,
          collector_name: c?.name ?? null,
          acknowledged: ackedIds.has(s.id),
          notes: notesBySession[s.id] ?? [],
          videos: videosBySession[s.id] ?? [],
        };
      })}
    />
  );
}
