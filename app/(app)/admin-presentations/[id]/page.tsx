import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffective } from "@/lib/effective";
import PresentationBuilder from "@/components/PresentationBuilder";

export const dynamic = "force-dynamic";

export default async function EditPresentationPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const eff = await getEffective(supabase);
  const role = eff?.profile?.role ?? "Viewer";
  if (!["Admin", "Reviewer", "Supervisor"].includes(role)) redirect("/my-presentations");

  const [{ data: pres }, { data: pageRows }, { data: assignRows }, { data: collectors }] =
    await Promise.all([
      supabase
        .from("presentations")
        .select("id, title, description, google_slides_url")
        .eq("id", params.id)
        .single(),
      supabase
        .from("presentation_pages")
        .select("id, page_order, header, description, video_link, drive_file_id")
        .eq("presentation_id", params.id)
        .order("page_order"),
      supabase
        .from("presentation_assignments")
        .select("hr_code")
        .eq("presentation_id", params.id),
      supabase
        .from("users")
        .select("hr_code, first_name, last_name, squad")
        .not("hr_code", "is", null)
        .order("hr_code"),
    ]);

  if (!pres) notFound();

  return (
    <PresentationBuilder
      mode="edit"
      collectors={(collectors ?? []).map((c: any) => ({
        hr_code: c.hr_code as string,
        name: ([c.first_name, c.last_name].filter(Boolean).join(" ").trim() || c.hr_code) as string,
        team: (c.squad ?? null) as string | null,
      }))}
      initial={{
        id: pres.id as string,
        title: pres.title as string,
        description: (pres.description ?? "") as string,
        google_slides_url: (pres.google_slides_url ?? null) as string | null,
        pages: (pageRows ?? []).map((p: any) => ({
          header: (p.header ?? "") as string,
          description: (p.description ?? "") as string,
          video_link: (p.video_link ?? "") as string,
          drive_file_id: (p.drive_file_id ?? null) as string | null,
        })),
        hr_codes: (assignRows ?? []).map((r: any) => r.hr_code as string),
      }}
    />
  );
}
