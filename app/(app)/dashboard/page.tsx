import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/components/Sidebar";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, collector_id, hr_code")
    .eq("id", user!.id)
    .single();

  const role = (profile?.role ?? "Viewer") as AppRole;
  if (role === "Viewer") redirect("/analytics");

  const [
    { count: sessionCount },
    { count: collectorCount },
    { count: reportCount },
    { count: pendingNotes },
  ] = await Promise.all([
    supabase.from("match_sessions").select("id", { count: "exact", head: true }),
    supabase.from("collectors").select("id", { count: "exact", head: true }),
    supabase.from("reports").select("id", { count: "exact", head: true }),
    supabase.from("report_notes").select("id", { count: "exact", head: true }).eq("status", "Not Started"),
  ]);

  const cards = [
    { label: "Match sessions", value: sessionCount ?? 0, href: "/upload" },
    { label: "Collectors", value: collectorCount ?? 0, href: "/collectors" },
    { label: "Reports sent", value: reportCount ?? 0, href: "/admin-reports" },
    { label: "Open collector notes", value: pendingNotes ?? 0, href: "/admin-reports" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-slate-500">Overview of key metrics.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <a
            key={card.label}
            href={card.href}
            className="bg-white rounded-2xl border border-slate-200 p-5 hover:bg-slate-50 transition"
          >
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className="text-3xl font-bold mt-1">{card.value}</p>
          </a>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <a href="/analytics" className="bg-white rounded-2xl border border-slate-200 p-5 hover:bg-slate-50 transition">
          <p className="font-semibold text-slate-800">Collectors Performance &rarr;</p>
          <p className="text-sm text-slate-500 mt-1">View module errors, rankings, match data.</p>
        </a>
        <a href="/report-monitoring" className="bg-white rounded-2xl border border-slate-200 p-5 hover:bg-slate-50 transition">
          <p className="font-semibold text-slate-800">Unacknowledged Reports &rarr;</p>
          <p className="text-sm text-slate-500 mt-1">Track which collectors have not read their reports.</p>
        </a>
      </div>
    </div>
  );
}
