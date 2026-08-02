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
    supabase
      .from("users")
      .select("hr_code, first_name, last_name, squad")
      .not("hr_code", "is", null)
      .order("hr_code"),
    // v59 fix: match_sessions.collector_id (uuid) was dropped in v56 and
    // repointed onto hr_code (text). Select hr_code here.
    supabase
      .from("match_sessions")
      .select("id, match_name, review_date, hr_code")
      .order("review_date", { ascending: false }),
  ]);
  // v59 fix: build the Collector shape UploadForm expects. We now key on
  // hr_code end-to-end (no more legacy `collectors.id` uuid), so `id` here
  // is set to hr_code and the upload API treats `collector_id` as hr_code.
  // Without this, `idByHr.get(hr_code)` returned undefined and every send
  // failed with "No matching collector records for the selected hr_codes."
  const collectors = (usersDirRaw ?? []).map((u: any) => ({
    id: u.hr_code as string,
    hr_code: u.hr_code as string,
    name: [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || (u.hr_code as string),
    team: (u.squad ?? null) as string | null,
  }));

  const existing: ExistingSession[] = (sessions ?? []).map((s: any) => ({
    id: s.id,
    match_name: s.match_name,
    review_date: s.review_date,
    // Keep the field name UploadForm expects; underlying value is hr_code.
    collector_id: (s.hr_code ?? "") as string,
  }));

  return <UploadForm collectors={(collectors ?? []) as any} existingSessions={existing} />;
}
