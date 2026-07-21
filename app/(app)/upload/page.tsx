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

  if (!profile || !["Admin", "Reviewer"].includes(profile.role)) {
    redirect("/dashboard");
  }

  const [{ data: usersDirRaw }, { data: sessions }] = await Promise.all([
    supabase.from("users").select("hr_code, first_name, last_name, squad").order("hr_code"),
    supabase
      .from("match_sessions")
      .select("id, match_name, review_date, collector_id")
      .order("review_date", { ascending: false }),
  ]);
  // v58 fix: `collectors` is stale/orphaned since v56 moved identity onto
  // `users`. Remap to the shape the rest of this file expects.
  const collectors = (usersDirRaw ?? []).map((u: any) => ({
    hr_code: u.hr_code,
    name: [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || null,
    team: u.squad ?? null,
  }));

  const existing: ExistingSession[] = (sessions ?? []).map((s: any) => ({
    id: s.id,
    match_name: s.match_name,
    review_date: s.review_date,
    collector_id: s.collector_id,
  }));

  return <UploadForm collectors={(collectors ?? []) as any} existingSessions={existing} />;
}
