import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffective } from "@/lib/effective";
import type { AppRole } from "@/components/Sidebar";
import Link from "next/link";
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const eff = await getEffective(supabase);
  const profile = eff?.profile ?? null;

  const role = (profile?.role ?? "Viewer") as AppRole;
  if (role === "Viewer") redirect("/analytics");

  const today = new Date();
  const dateStr = today.toLocaleDateString("en-GB", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const [
    { count: reportCount },
    { count: collectorCount },
    { count: scheduledSessions },
    { count: openNotes },
  ] = await Promise.all([
    supabase.from("match_sessions").select("id", { count: "exact", head: true }),
    supabase.from("collectors").select("id", { count: "exact", head: true }),
    supabase.from("feedback_meetings").select("id", { count: "exact", head: true }).eq("status", "Scheduled"),
    supabase.from("session_notes").select("id", { count: "exact", head: true }).eq("status", "Not Started"),
  ]);

  const stats = [
    { label: "Send Report",         value: reportCount       ?? 0, href: "/upload",          color: "text-blue-600"  },
    { label: "Collectors",          value: collectorCount    ?? 0, href: "/collectors",       color: "text-slate-800" },
    { label: "Scheduled Sessions",  value: scheduledSessions ?? 0, href: "/admin-sessions",   color: "text-sky-600"   },
    { label: "Open Notes",          value: openNotes         ?? 0, href: "/admin-reports",    color: openNotes ? "text-amber-600" : "text-slate-800" },
  ];

  const quickActions = [
    { href: "/upload",               title: "Send Report →",   desc: "Upload a match session report for a collector."  },
    { href: "/feedback-reservation", title: "Book Feedback →", desc: "Schedule an online or offline feedback session." },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">{dateStr}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((card) => (
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
