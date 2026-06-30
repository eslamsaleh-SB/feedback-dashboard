import { createClient } from "@/lib/supabase/server";
import { getEffective } from "@/lib/effective";
import { redirect } from "next/navigation";
import AdminSessionsView from "@/components/AdminSessionsView";

export const dynamic = "force-dynamic";

export default async function AdminSessionsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const eff = await getEffective(supabase);
  const profile = eff?.profile ?? null;
  if (!["Admin", "Uploader", "Supervisor"].includes(profile?.role ?? "")) {
    redirect("/analytics");
  }

  const [{ data: rows }, { data: collectorRows }] = await Promise.all([
    supabase
      .from("feedback_attendees")
      .select(
        "id, hr_code, attendance, comment, feedback_reservations(session_date, mode, meet_link, location)"
      )
      .order("hr_code", { ascending: true }),
    supabase
      .from("collectors")
      .select("hr_code, name, team")
      .not("hr_code", "is", null)
      .order("name"),
  ]);

  const collectorByHr = new Map<string, { name: string; team: string | null }>();
  for (const c of collectorRows ?? []) {
    if ((c as any).hr_code) {
      collectorByHr.set((c as any).hr_code, {
        name: ((c as any).name ?? (c as any).hr_code) as string,
        team: ((c as any).team ?? null) as string | null,
      });
    }
  }

  const sessions = (rows ?? [])
    .map((a: any) => {
      const r = a.feedback_reservations ?? {};
      const status =
        a.attendance == null
          ? "Scheduled"
          : a.attendance === "Attended" || a.attendance === "Attended Late"
          ? "Completed"
          : a.attendance;
      const meta = collectorByHr.get(a.hr_code) ?? { name: a.hr_code, team: null };
      return {
        id: String(a.id),
        hr_code: a.hr_code,
        collector_name: meta.name,
        team: meta.team,
        session_date: r.session_date ?? "",
        mode: r.mode ?? "",
        status,
        meet_link: r.meet_link ?? null,
        location: r.location ?? null,
        notes: a.comment ?? null,
      };
    })
    .sort((a: any, b: any) => (b.session_date ?? "").localeCompare(a.session_date ?? ""));

  const teams = Array.from(
    new Set((collectorRows ?? []).map((c: any) => c.team).filter(Boolean) as string[])
  ).sort();

  return (
    <AdminSessionsView
      sessions={sessions}
      collectors={(collectorRows ?? []).map((c: any) => ({
        hr_code: c.hr_code as string,
        name: (c.name ?? c.hr_code) as string,
        team: (c.team ?? null) as string | null,
      }))}
      teams={teams}
    />
  );
}
