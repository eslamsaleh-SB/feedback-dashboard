import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffective } from "@/lib/effective";
import AdminReportsView from "@/components/AdminReportsView";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const eff = await getEffective(supabase);
  const profile = eff?.profile ?? null;
  // v59: Reviewers can view admin-reports too (to see notes + reply).
  if (!profile || !["Admin", "Reviewer"].includes(profile.role)) redirect("/analytics");

  const [
    { data: sessions },
    { data: noteRows },
    { data: ackRows },
    { data: videoRows },
    { data: collectorRows },
  ] = await Promise.all([
    // v58 fix: this embedded a `collectors(hr_code, name)` relation via
    // match_sessions.collector_id - that FK was dropped and the table
    // repointed onto hr_code back in v56. The embed silently broke.
    supabase
      .from("match_sessions")
      // v59: also grab uploader_id so we can label reports with the reviewer
      // who sent them.
      .select("id, match_name, review_date, overall_notes, hr_code, uploader_id")
      .order("review_date", { ascending: false }),
    supabase
      .from("session_notes")
      .select(
        "id, session_id, hr_code, note_text, status, created_at, reply_text, replied_at"
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("session_acknowledgments")
      .select("session_id"),
    supabase
      .from("session_videos")
      .select("id, match_session_id, drive_file_id, file_name"),
    supabase
      .from("users")
      // v59: pull id too so we can look up uploader by uploader_id (uuid).
      .select("id, hr_code, first_name, last_name, squad")
      .order("hr_code"),
  ]);

  const ackedIds = new Set((ackRows ?? []).map((a: any) => a.session_id as string));

  const notesBySession: Record<string, any[]> = {};
  for (const n of noteRows ?? []) {
    const k = n.session_id as string;
    if (!notesBySession[k]) notesBySession[k] = [];
    notesBySession[k].push({
      id: n.id,
      hr_code: n.hr_code,
      note_text: n.note_text,
      status: n.status,
      created_at: n.created_at,
      reply_text: n.reply_text ?? null,
      replied_at: n.replied_at ?? null,
    });
  }

  const videosBySession: Record<string, any[]> = {};
  for (const v of videoRows ?? []) {
    const k = v.match_session_id as string;
    if (!videosBySession[k]) videosBySession[k] = [];
    videosBySession[k].push({
      id: v.id,
      drive_file_id: v.drive_file_id,
      file_name: v.file_name,
    });
  }

  const collectorByHr = new Map<string, { name: string; team: string | null }>();
  const userById = new Map<string, { hr_code: string | null; name: string }>();
  for (const c of collectorRows ?? []) {
    const cAny = c as any;
    const name = [cAny.first_name, cAny.last_name].filter(Boolean).join(" ").trim();
    if (cAny.hr_code) {
      collectorByHr.set(cAny.hr_code, {
        name: name || cAny.hr_code,
        team: cAny.squad ?? null,
      });
    }
    if (cAny.id) {
      userById.set(cAny.id, {
        hr_code: (cAny.hr_code ?? null) as string | null,
        name: name || (cAny.hr_code as string) || String(cAny.id).slice(0, 8),
      });
    }
  }

  return (
    <AdminReportsView
      role={profile.role as "Admin" | "Reviewer"}
      collectors={(collectorRows ?? []).filter((c: any) => c.hr_code).map((c: any) => {
        const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
        return {
          hr_code: c.hr_code as string,
          name: (name || c.hr_code) as string,
          team: (c.squad ?? null) as string | null,
        };
      })}
      sessions={(sessions ?? []).map((s: any) => {
        const c = s.hr_code ? collectorByHr.get(s.hr_code) : undefined;
        const uploader = s.uploader_id ? userById.get(s.uploader_id) : undefined;
        return {
          id: s.id,
          match_name: s.match_name,
          review_date: s.review_date,
          overall_notes: s.overall_notes,
          hr_code: s.hr_code ?? null,
          collector_name: c?.name ?? null,
          acknowledged: ackedIds.has(s.id),
          notes: notesBySession[s.id] ?? [],
          videos: videosBySession[s.id] ?? [],
          created_by_hr: uploader?.hr_code ?? null,
          created_by_name: uploader?.name ?? null,
        };
      })}
    />
  );
}
