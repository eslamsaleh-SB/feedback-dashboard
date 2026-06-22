import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/components/Sidebar";
import Link from "next/link";
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, hr_code")
    .eq("id", user.id)
    .single();

  const role = (profile?.role ?? "Viewer") as AppRole;
  if (role === "Viewer") redirect("/analytics");

  const today = new Date();
  const dateStr = today.toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;

  const [
    { count: sessionCount },
    { count: collectorCount },
    { count: reportCount },
    { count: openNotes },
    { count: scheduledSessions },
    { data: unackedRows },
  ] = await Promise.all([
    supabase.from("match_sessions").select("id", { count: "exact", head: true }),
    supabase.from("collectors").select("id", { count: "exact", head: true }),
    supabase.from("reports").select("id", { count: "exact", head: true }),
    supabase.from("report_notes").select("id", { count: "exact", head: true }).eq("status", "Not Started"),
    supabase.from("feedback_meetings").select("id", { count: "exact", head: true }).eq("status", "Scheduled"),
    supabase.from("reports").select("id, hr_code").is("hr_code", null),
  ]);

  // Count unacknowledged (reports sent to all + those with no ack)
  const { data: ackRows } = await supabase.from("report_acknowledgments").select("report_id");
  const ackedIds = new Set((ackRows ?? []).map((a: any) => a.report_id as string));
  const unackedCount = (unackedRows ?? []).filter((r: any) => !ackedIds.has(r.id)).length;

  const statsRow1 = [
    { label: "Match Sessions", value: sessionCount ?? 0, href: "/upload", color: "text-blue-600" },
    { label: "Collectors", value: collectorCount ?? 0, href: "/collectors", color: "text-slate-800" },
    { label: "Reports Sent", value: reportCount ?? 0, href: "/admin-reports", color: "text-slate-800" },
    { label: "Open Notes", value: openNotes ?? 0, href: "/admin-reports", color: openNotes ? "text-amber-600" : "text-slate-800" },
  ];

  const statsRow2 = [
    { label: "Scheduled Sessions", value: scheduledSessions ?? 0, href: "/admin-sessions", color: "text-sky-600" },
    { label: "Unacknowledged Reports", value: unackedCount, href: "/report-monitoring", color: unackedCount > 0 ? "text-red-500" : "text-slate-800" },
  ];

  const quickActions = [
    { href: "/send-report", title: "Send Report →", desc: "Create and send a report to one or all collectors." },
    { href: "/feedback-reservation", title: "Book Feedback →", desc: "Schedule an online or offline feedback session." },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">{dateStr}</p>
      </div>

      {/* Stats row 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statsRow1.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="bg-white rounded-2xl border border-slate-200 p-5 hover:bg-slate-50 transition"
          >
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className={`text-3xl font-bold mt-1 ${card.color}`}>{card.value}</p>
          </Link>
        ))}
      </div>

      {/* Stats row 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {statsRow2.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="bg-white rounded-2xl border border-slate-200 p-5 hover:bg-slate-50 transition"
          >
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className={`text-3xl font-bold mt-1 ${card.color}`}>{card.value}</p>
          </Link>
        ))}
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {quickActions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="bg-white rounded-2xl border border-slate-200 p-5 hover:bg-slate-50 transition"
            >
              <p className="font-semibold text-slate-800">{a.title}</p>
              <p className="text-sm text-slate-500 mt-1">{a.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
