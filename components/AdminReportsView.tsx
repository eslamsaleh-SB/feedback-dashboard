"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

type ReportSummary = {
  id: string;
  title: string;
  report_date: string | null;
  hr_code: string | null;
  acked_by: string[];
};
type NoteItem = {
  id: string;
  report_id: string;
  hr_code: string;
  note_text: string;
  status: string;
  created_at: string;
};

const NOTE_STATUSES = ["Not Started", "In Progress", "Complete"] as const;
const statusBadge: Record<string, string> = {
  "Not Started": "bg-slate-100 text-slate-600",
  "In Progress": "bg-amber-100 text-amber-700",
  Complete: "bg-emerald-100 text-emerald-700",
};

export default function AdminReportsView({
  reports,
  notes: initialNotes,
}: {
  reports: ReportSummary[];
  notes: NoteItem[];
}) {
  const supabase = createClient();
  const [notes, setNotes] = useState(initialNotes);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [noteStatusFilter, setNoteStatusFilter] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  async function updateNoteStatus(id: string, status: string) {
    setSaving(id);
    await supabase
      .from("report_notes")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, status } : n)));
    setSaving(null);
  }

  const reportNotes = (reportId: string) => {
    let ns = notes.filter((n) => n.report_id === reportId);
    if (noteStatusFilter) ns = ns.filter((n) => n.status === noteStatusFilter);
    return ns;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Admin Reports</h1>
          <p className="text-slate-500 text-sm mt-1">Manage reports and collector notes.</p>
        </div>
        <Link
          href="/send-report"
          className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-700"
        >
          Send New Report →
        </Link>
      </div>

      {/* Note status filter */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Filter notes by status</label>
          <select
            value={noteStatusFilter}
            onChange={(e) => setNoteStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 bg-white text-sm"
          >
            <option value="">All statuses</option>
            {NOTE_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        {noteStatusFilter && (
          <button
            type="button"
            onClick={() => setNoteStatusFilter("")}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Clear
          </button>
        )}
      </div>

      <p className="text-sm text-slate-500">{reports.length} report(s)</p>

      {reports.length === 0 ? (
        <p className="text-slate-500">No reports yet. <Link href="/send-report" className="text-blue-600 underline">Send one now.</Link></p>
      ) : (
        <div className="space-y-2">
          {reports.map((r) => {
            const isExpanded = expandedId === r.id;
            const rNotes = reportNotes(r.id);
            return (
              <div key={r.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : r.id)}
                  className="w-full text-left px-5 py-4 flex items-center justify-between gap-4 hover:bg-slate-50"
                >
                  <div className="flex-1 min-w-0 flex flex-wrap items-center gap-3">
                    <span className="font-semibold text-slate-800">{r.title}</span>
                    {r.report_date && (
                      <span className="text-xs text-slate-400">{r.report_date}</span>
                    )}
                    <span className="text-xs text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">
                      {r.hr_code ?? "All Collectors"}
                    </span>
                    <span className="text-xs text-emerald-600 font-medium">
                      {r.acked_by.length} acknowledged
                    </span>
                    {notes.filter((n) => n.report_id === r.id).length > 0 && (
                      <span className="text-xs text-amber-600 font-medium">
                        {notes.filter((n) => n.report_id === r.id).length} note(s)
                      </span>
                    )}
                  </div>
                  <span className="text-slate-400 text-sm">{isExpanded ? "▲" : "▼"}</span>
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-100 px-5 pb-5 pt-4">
                    {rNotes.length === 0 ? (
                      <p className="text-slate-500 text-sm">
                        {noteStatusFilter ? "No notes matching this status filter." : "No notes for this report."}
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="text-left font-medium text-slate-500 px-3 py-2">Collector</th>
                              <th className="text-left font-medium text-slate-500 px-3 py-2">Note</th>
                              <th className="text-left font-medium text-slate-500 px-3 py-2">Status</th>
                              <th className="text-left font-medium text-slate-500 px-3 py-2">Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rNotes.map((n) => (
                              <tr key={n.id} className="border-t border-slate-100 align-top">
                                <td className="px-3 py-2.5 font-medium whitespace-nowrap">{n.hr_code}</td>
                                <td className="px-3 py-2.5 text-slate-700 max-w-xs">{n.note_text}</td>
                                <td className="px-3 py-2.5 whitespace-nowrap">
                                  <select
                                    value={n.status}
                                    disabled={saving === n.id}
                                    onChange={(e) => updateNoteStatus(n.id, e.target.value)}
                                    className={`rounded-full border-0 px-3 py-1 text-xs font-medium cursor-pointer ${statusBadge[n.status] ?? ""}`}
                                  >
                                    {NOTE_STATUSES.map((s) => (
                                      <option key={s} value={s}>{s}</option>
                                    ))}
                                  </select>
                                </td>
                                <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">{n.created_at.slice(0, 10)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
