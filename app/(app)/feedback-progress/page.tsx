import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import FeedbackProgress, { type Session } from "@/components/FeedbackProgress";

export const dynamic = "force-dynamic";

export default async function FeedbackProgressPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const role = (profile?.role ?? "Viewer") as "Admin" | "Uploader" | "Viewer";
  if (role === "Viewer") redirect("/analytics");

  const { data: reservations } = await supabase
    .from("feedback_reservations")
    .select(
      "id, session_date, session_time, shift, mode, is_group, location, meet_link, feedback_attendees(id, hr_code, attendance, comment)"
    )
    .order("session_date", { ascending: false })
    .order("session_time", { ascending: true });

  // Collector directory for names/teams.
  const { data: collectors } = await supabase
    .from("collectors")
    .select("hr_code, name, team");
  const byHr = new Map<string, { name: string | null; team: string | null }>();
  (collectors ?? []).forEach((c: any) => {
    if (c.hr_code) byHr.set(c.hr_code, { name: c.name ?? null, team: c.team ?? null });
  });

  const sessions: Session[] = (reservations ?? []).map((r: any) => ({
    id: r.id,
    session_date: r.session_date,
    session_time: r.session_time,
    shift: r.shift,
    mode: r.mode,
    is_group: r.is_group,
    location: r.location,
    meet_link: r.meet_link,
    attendees: (r.feedback_attendees ?? []).map((a: any) => ({
      id: a.id,
      hr_code: a.hr_code,
      attendance: a.attendance,
      comment: a.comment,
      name: byHr.get(a.hr_code)?.name ?? null,
      team: byHr.get(a.hr_code)?.team ?? null,
    })),
  }));

  return <FeedbackProgress initial={sessions} />;
}
