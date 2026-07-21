import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffective } from "@/lib/effective";
import AdminInquiriesView from "@/components/AdminInquiriesView";

export const dynamic = "force-dynamic";

export default async function AdminInquiriesPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const eff = await getEffective(supabase);
  const profile = eff?.profile ?? null;
  const role = profile?.role ?? "Viewer";
  if (!["Admin", "Reviewer", "Supervisor"].includes(role)) redirect("/my-inquiries");

  const [{ data: rows }, { data: usersDirRaw }] = await Promise.all([
    supabase
      .from("match_inquiries")
      .select(
        "id, hr_code, match_id, created_at, completed_at, match_inquiry_videos(id, drive_file_id, file_name, reply_text, replied_at)"
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("users")
      .select("hr_code, first_name, last_name, squad")
      .not("hr_code", "is", null)
      .order("hr_code"),
  ]);

  const collectorByHr = new Map<string, { name: string; team: string | null }>();
  for (const u of usersDirRaw ?? []) {
    if ((u as any).hr_code) {
      const name = [(u as any).first_name, (u as any).last_name].filter(Boolean).join(" ").trim();
      collectorByHr.set((u as any).hr_code, {
        name: (name || (u as any).hr_code) as string,
        team: ((u as any).squad ?? null) as string | null,
      });
    }
  }

  const inquiries = (rows ?? []).map((r: any) => {
    const meta = collectorByHr.get(r.hr_code) ?? { name: r.hr_code, team: null };
    return {
      id: r.id as string,
      hr_code: r.hr_code as string,
      collector_name: meta.name,
      team: meta.team,
      match_id: r.match_id as string,
      created_at: r.created_at as string,
      completed_at: (r.completed_at ?? null) as string | null,
      videos: (r.match_inquiry_videos ?? []).map((v: any) => ({
        id: v.id as string,
        drive_file_id: v.drive_file_id as string,
        file_name: v.file_name as string,
        reply_text: (v.reply_text ?? null) as string | null,
        replied_at: (v.replied_at ?? null) as string | null,
      })),
    };
  });

  return (
    <AdminInquiriesView
      inquiries={inquiries}
      collectors={(usersDirRaw ?? []).map((u: any) => {
        const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
        return {
          hr_code: u.hr_code as string,
          name: (name || u.hr_code) as string,
        };
      })}
    />
  );
}
