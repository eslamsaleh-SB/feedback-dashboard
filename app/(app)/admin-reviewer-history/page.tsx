import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffective } from "@/lib/effective";
import ReviewerHistoryView from "@/components/ReviewerHistoryView";

export const dynamic = "force-dynamic";

const isoOk = (s?: string) =>
  s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;

export default async function AdminReviewerHistoryPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const eff = await getEffective(supabase);
  if (eff?.profile?.role !== "Admin") redirect("/dashboard");

  const [{ data: usersRows }, historyRes] = await Promise.all([
    supabase
      .from("users")
      .select("id, hr_code, first_name, last_name, squad, role")
      .not("hr_code", "is", null)
      .order("hr_code"),
    supabase
      .from("collector_reviewer_assignments")
      .select("id, collector_hr_code, reviewer_id, start_date, end_date")
      .order("start_date", { ascending: false }),
  ]);

  const missingTable = !!historyRes.error;
  const rows = (historyRes.data ?? []) as any[];

  const collectorByHr: Record<string, { name: string; team: string | null }> = {};
  const reviewerById: Record<string, string> = {};
  for (const u of usersRows ?? []) {
    const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.hr_code || String(u.id).slice(0, 8);
    if (u.hr_code) collectorByHr[u.hr_code] = { name, team: (u.squad ?? null) as string | null };
    reviewerById[u.id] = name;
  }

  return (
    <ReviewerHistoryView
      history={rows.map((r: any) => ({
        id: r.id as string,
        collector_hr_code: r.collector_hr_code as string,
        collector_name: (collectorByHr[r.collector_hr_code]?.name ?? r.collector_hr_code) as string,
        team: (collectorByHr[r.collector_hr_code]?.team ?? null) as string | null,
        reviewer_id: r.reviewer_id as string,
        reviewer_name: (reviewerById[r.reviewer_id] ?? String(r.reviewer_id).slice(0, 8)) as string,
        start_date: r.start_date as string,
        end_date: (r.end_date ?? null) as string | null,
      }))}
      missingTable={missingTable}
    />
  );
}
