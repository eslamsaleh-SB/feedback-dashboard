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
  if (!["Admin", "Reviewer", "Supervisor"].includes(profile?.role ?? "")) {
    redirect("/analytics");
  }

  const [{ data: rows }, { data: usersDirRaw }] = await Promise.all([
    supabase
      .from("feedback_attendees")
      .select(
        "id, hr_code, attendance, comment, feedback_reservations(session_date, mode, meet_link, location)"
      )
      .order("hr_code", { ascending: true }),
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
    new Set((usersDirRaw ?? []).map((u: any) => u.squad).filter(Boolean) as string[])
  ).sort();

  return (
    <AdminSessionsView
      sessions={sessions}
      collectors={(usersDirRaw ?? []).map((u: any) => {
        const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
        return {
          hr_code: u.hr_code as string,
          name: (name || u.hr_code) as string,
          team: (u.squad ?? null) as string | null,
        };
      })}
      teams={teams}
    />
  );
}
