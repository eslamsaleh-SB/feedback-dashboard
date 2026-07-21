import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffective } from "@/lib/effective";

export const dynamic = "force-dynamic";

export default async function ReportMonitoringPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const eff = await getEffective(supabase);
  const profile = eff?.profile ?? null;

  if (profile?.role !== "Admin") redirect("/analytics");

  // All reports
  const { data: reportRows } = await supabase
    .from("reports")
    .select("id, title, report_date, hr_code")
    .order("report_date", { ascending: false });

  // All acknowledgments
  const { data: ackRows } = await supabase
    .from("report_acknowledgments")
    .select("report_id, hr_code, acked_at");

  // All collectors
  const { data: usersDirRaw } = await supabase
    .from("users")
    .select("hr_code, first_name, last_name, squad")
    .not("hr_code", "is", null)
    .order("hr_code");
  const collectorRows = (usersDirRaw ?? []).map((u: any) => ({
    hr_code: u.hr_code,
    name: [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.hr_code,
    team: u.squad ?? null,
  }));

  const ackMap = new Map<string, Set<string>>();
  for (const a of ackRows ?? []) {
    const k = a.report_id as string;
    if (!ackMap.has(k)) ackMap.set(k, new Set());
    ackMap.get(k)!.add(a.hr_code as string);
  }

  // Build a list of (report, collector) pairs that haven't been acknowledged
  const unacked: {
    report_id: string;
    report_title: string;
    report_date: string | null;
    hr_code: string;
    collector_name: string;
    team: string | null;
  }[] = [];

  for (const r of reportRows ?? []) {
    // Determine which collectors this report is for
    const targeted = r.hr_code
      ? (collectorRows ?? []).filter((c: any) => c.hr_code === r.hr_code)
      : (collectorRows ?? []);

    for (const c of targeted) {
      const alreadyAcked = ackMap.get(r.id)?.has(c.hr_code) ?? false;
      if (!alreadyAcked) {
        unacked.push({
          report_id: r.id,
          report_title: r.title,
          report_date: r.report_date,
          hr_code: c.hr_code,
          collector_name: c.name,
          team: c.team ?? null,
        });
      }
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Unacknowledged Reports</h1>
        <p className="text-slate-500 dark:text-slate-400">
          Reports that have not yet been acknowledged by the assigned collector(s).
        </p>
      </div>

      <div className="text-sm text-slate-500 dark:text-slate-400">{unacked.length} unacknowledged</div>

      {unacked.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 text-center">
          <p className="text-emerald-600 font-medium">All reports have been acknowledged.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-3">Report</th>
                <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-3">Date</th>
                <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-3">Collector</th>
                <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-3">Team</th>
              </tr>
            </thead>
            <tbody>
              {unacked.map((row, i) => (
                <tr key={`${row.report_id}-${row.hr_code}`} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100">
                    {row.report_title}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {row.report_date ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className="font-medium">{row.hr_code}</span>{" "}
                    <span className="text-slate-400 dark:text-slate-500">{row.collector_name}</span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{row.team ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
