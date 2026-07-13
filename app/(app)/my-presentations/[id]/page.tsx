import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffective } from "@/lib/effective";
import PresentationViewer from "@/components/PresentationViewer";

export const dynamic = "force-dynamic";

export default async function ViewPresentationPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const eff = await getEffective(supabase);
  const profile = eff?.profile ?? null;
  const isViewer = profile?.role === "Viewer";

  const [{ data: pres }, { data: pageRows }] = await Promise.all([
    supabase
      .from("presentations")
      .select("id, title, description")
      .eq("id", params.id)
      .single(),
    supabase
      .from("presentation_pages")
      .select("page_order, header, description, video_link, drive_file_id")
      .eq("presentation_id", params.id)
      .order("page_order"),
  ]);
  if (!pres) notFound();

  // Mark as viewed for this collector (best-effort).
  if (isViewer && profile?.hr_code) {
    await supabase
      .from("presentation_assignments")
      .update({ viewed_at: new Date().toISOString() })
      .eq("presentation_id", params.id)
      .eq("hr_code", profile.hr_code);
  }

  return (
    <PresentationViewer
      title={pres.title as string}
      description={(pres.description ?? null) as string | null}
      pages={(pageRows ?? []).map((p: any) => ({
        header: (p.header ?? "") as string,
        description: (p.description ?? null) as string | null,
        video_link: (p.video_link ?? null) as string | null,
        drive_file_id: (p.drive_file_id ?? null) as string | null,
      }))}
    />
  );
}
