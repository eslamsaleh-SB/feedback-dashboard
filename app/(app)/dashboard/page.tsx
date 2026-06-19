import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardClient, { type MatchSession } from "@/components/DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, collector_id")
    .eq("id", user!.id)
    .single();

  const role = (profile?.role ?? "Viewer") as "Admin" | "Uploader" | "Viewer";

  // Collectors have a dedicated dashboard at /analytics (Reports, Feedback
  // Sessions, Match Details + per-module totals). Send them there.
  if (role === "Viewer") redirect("/analytics");

  // RLS automatically scopes match_sessions to what this user may see.
  const [{ data: sessions }, { data: collectors }] = await Promise.all([
    supabase
      .from("match_sessions")
      .select(
        "id, match_name, review_date, quality_score, overall_notes, created_at, collector_id, collectors(name), session_videos(id, drive_file_id, file_name, mistake_description)"
      )
      .order("review_date", { ascending: false }),
    supabase.from("collectors").select("id, name").order("name"),
  ]);

  const rows: MatchSession[] = (sessions ?? []).map((s: any) => ({
    id: s.id,
    match_name: s.match_name,
    review_date: s.review_date,
    quality_score: s.quality_score,
    overall_notes: s.overall_notes,
    collector_id: s.collector_id,
    collector_name: s.collectors?.name ?? "Unknown",
    videos: (s.session_videos ?? []).map((v: any) => ({
      id: v.id,
      drive_file_id: v.drive_file_id,
      file_name: v.file_name,
      mistake_description: v.mistake_description,
    })),
  }));

  return (
    <DashboardClient
      role={role}
      myName={null}
      isLinked={true}
      sessions={rows}
      collectors={collectors ?? []}
    />
  );
}
