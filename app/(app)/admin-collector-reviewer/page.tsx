import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffective } from "@/lib/effective";
import CollectorReviewerManager from "@/components/CollectorReviewerManager";

export const dynamic = "force-dynamic";

export default async function AdminCollectorReviewerPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const eff = await getEffective(supabase);
  if (eff?.profile?.role !== "Admin") redirect("/dashboard");

  const [{ data: usersRows }, currentAssignmentsRes] = await Promise.all([
    supabase
      .from("users")
      .select("id, hr_code, first_name, last_name, squad, role")
      .not("hr_code", "is", null)
      .order("hr_code"),
    // Only rows where end_date is null = active. Fall back cleanly if the
    // migration hasn't run yet.
    supabase
      .from("collector_reviewer_assignments")
      .select("id, collector_hr_code, reviewer_id, start_date")
      .is("end_date", null),
  ]);

  const missingTable = !!currentAssignmentsRes.error;
  const currentAssignments = (currentAssignmentsRes.data ?? []) as any[];

  const collectors = (usersRows ?? [])
    .filter((u: any) => u.role === "Viewer")
    .map((u: any) => ({
      hr_code: u.hr_code as string,
      name: [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || (u.hr_code as string),
      team: (u.squad ?? null) as string | null,
    }));

  const reviewers = (usersRows ?? [])
    .filter((u: any) => ["Reviewer", "Admin", "Supervisor"].includes(u.role))
    .map((u: any) => ({
      id: u.id as string,
      name: [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || (u.hr_code as string) || String(u.id).slice(0, 8),
      role: u.role as string,
    }));

  const activeByHr: Record<string, { reviewer_id: string; start_date: string }> = {};
  for (const a of currentAssignments) {
    activeByHr[a.collector_hr_code] = {
      reviewer_id: a.reviewer_id,
      start_date: a.start_date,
    };
  }

  return (
    <CollectorReviewerManager
      collectors={collectors}
      reviewers={reviewers}
      activeByHr={activeByHr}
      missingTable={missingTable}
    />
  );
}
