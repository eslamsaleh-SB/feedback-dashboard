import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffective } from "@/lib/effective";
import UploadForm, { type ExistingSession } from "@/components/UploadForm";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const eff = await getEffective(supabase);
  const profile = eff?.profile ?? null;

  if (!profile || !["Admin", "Uploader"].includes(profile.role)) {
    redirect("/dashboard");
  }

  const [{ data: collectors }, { data: sessions }] = await Promise.all([
    supabase.from("collectors").select("id, name, hr_code, team").order("hr_code"),
    supabase
      .from("match_sessions")
      .select("id, match_name, review_date, collector_id")
      .order("review_date", { ascending: false }),
  ]);

  const existing: ExistingSession[] = (sessions ?? []).map((s: any) => ({
    id: s.id,
    match_name: s.match_name,
    review_date: s.review_date,
    collector_id: s.collector_id,
  }));

  return <UploadForm collectors={(collectors ?? []) as any} existingSessions={existing} />;
}
