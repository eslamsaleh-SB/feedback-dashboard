import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffective } from "@/lib/effective";
import MyInquiriesView from "@/components/MyInquiriesView";

export const dynamic = "force-dynamic";

export default async function MyInquiriesPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const eff = await getEffective(supabase);
  const profile = eff?.profile ?? null;
  if (profile?.role !== "Viewer") redirect("/admin-inquiries");

  const hrCode = profile?.hr_code ?? "";

  const { data: rows } = await supabase
    .from("match_inquiries")
    .select(
      "id, match_id, created_at, completed_at, match_inquiry_videos(id, drive_file_id, file_name, reply_text, replied_at)"
    )
    .eq("hr_code", hrCode)
    .order("created_at", { ascending: false });

  const inquiries = (rows ?? []).map((r: any) => ({
    id: r.id as string,
    match_id: r.match_id as string,
    created_at: r.created_at as string,
    completed_at: r.completed_at as string | null,
    videos: (r.match_inquiry_videos ?? []).map((v: any) => ({
      id: v.id as string,
      drive_file_id: v.drive_file_id as string,
      file_name: v.file_name as string,
      reply_text: (v.reply_text ?? null) as string | null,
      replied_at: (v.replied_at ?? null) as string | null,
    })),
  }));

  return <MyInquiriesView inquiries={inquiries} />;
}
