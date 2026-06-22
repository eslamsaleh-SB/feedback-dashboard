"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type CollectorOpt = { hr_code: string; name: string | null };
type RecentReport = {
  id: string;
  title: string;
  report_date: string | null;
  hr_code: string | null;
  acked_count: number;
};

export default function SendReportForm({
  collectors,
  recentReports,
}: {
  collectors: CollectorOpt[];
  recentReports: RecentReport[];
}) {
  const supabase = createClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [reportDate, setReportDate] = useState("");
  const [hrCode, setHrCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [reports, setReports] = useState<RecentReport[]>(recentReports);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const { data, error } = await supabase.from("reports").insert({
      title: title.trim(),
      body: body.trim() || null,
      url: url.trim() || null,
      report_date: reportDate || null,
      hr_code: hrCode || null,
    }).select("id, title, report_date, hr_code").single();
    setLoading(false);
    if (error) {
      setMessage({ type: "err", text: error.message });
      return;
    }
    setMessage({ type: "ok", text: "Report sent successfully." });
    setTitle(""); setBody(""); setUrl(""); setReportDate(""); setHrCode("");
    if (data) {
      setReports((prev) => [{ id: data.id, title: data.title, report_date: data.report_date, hr_code: data.hr_code, acked_count: 0 }, ...prev].slice(0, 20));
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Send Report</h1>
        <p className="text-slate-500 text-sm mt-1">Create and send a report to a collector or all collectors.</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 max-w-2xl">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Title <span className="text-red-500">*</span></label>
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Report title"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Body</label>
          <textarea
            className="w-full rounded-lg border border-slate-300 px-3 py-2 min-h-[100px]"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Report details (optional)"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">URL (optional)</label>
          <input
            type="url"
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Report Date</label>
          <input
            type="date"
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            value={reportDate}
            onChange={(e) => setReportDate(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Target Collector</label>
          <select
            value={hrCode}
            onChange={(e) => setHrCode(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
          >
            <option value="">All Collectors</option>
            {collectors.map((c) => (
              <option key={c.hr_code} value={c.hr_code}>
                {c.hr_code}{c.name ? ` - ${c.name}` : ""}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-slate-900 text-white px-6 py-2 font-medium disabled:opacity-50"
        >
          {loading ? "Sending..." : "Send Report"}
        </button>
        {message && (
          <p className={`text-sm ${message.type === "ok" ? "text-emerald-600" : "text-red-600"}`}>
            {message.text}
          </p>
        )}
      </form>

      {/* Recent reports */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Recent Reports</h2>
        {reports.length === 0 ? (
          <p className="text-slate-500">No reports yet.</p>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left font-medium text-slate-500 px-4 py-3">Title</th>
                  <th className="text-left font-medium text-slate-500 px-4 py-3">Date</th>
                  <th className="text-left font-medium text-slate-500 px-4 py-3">Target</th>
                  <th className="text-right font-medium text-slate-500 px-4 py-3">Acknowledged</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{r.title}</td>
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{r.report_date ?? "—"}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.hr_code ?? "All Collectors"}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{r.acked_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
