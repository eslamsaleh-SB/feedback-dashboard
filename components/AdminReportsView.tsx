"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

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
type SessionItem = {
  id: string;
  hr_code: string;
  session_date: string;
  mode: string;
  notes: string | null;
  status: string;
  meet_link: string | null;
  location: string | null;
};

const NOTE_STATUSES = ["Not Started", "In Progress", "Complete"] as const;
const statusBadge: Record<string, string> = {
  "Not Started": "bg-slate-100 text-slate-600",
  "In Progress": "bg-amber-100 text-amber-700",
  Complete: "bg-emerald-100 text-emerald-700",
  Scheduled: "bg-sky-100 text-sky-800",
  Completed: "bg-emerald-100 text-emerald-800",
  Cancelled: "bg-slate-200 text-slate-600",
};

export default function AdminReportsView({
  reports,
  notes: initialNotes,
  feedbackSessions,
}: {
  reports: ReportSummary[];
  notes: NoteItem[];
  feedbackSessions: SessionItem[];
}) {
  const supabase = createClient();
  const [notes, setNotes] = useState(initialNotes);
  const [statusFilter, setStatusFilter] = useState("");
  const [tab, setTab] = useState<"notes" | "sessions">("notes");
  const [saving, setSaving] = useState<string | null>(null);

  async function updateNoteStatus(id: string, status: string) {
    setSaving(id);
    await supabase
      .from("report_notes")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, status } : n))
    );
    setSaving(null);
  }

  const filteredNotes = statusFilter
    ? notes.filter((n) => n.status === statusFilter)
    : notes;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin: Reports & Sessions</h1>
        <p className="text-slate-500">
          Manage collector report notes and feedback sessions.
        </p>
      </div>

      {/* Tabs */}
      <div className="inline-flex rounded-xl border border-slate-300 bg-white p-1">
        {(["notes", "sessions"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize ${
              tab === t ? "bg-slate-900 text-white" : "text-slate-600"
            }`}
          >
            {t === "notes" ? `Collector Notes (${notes.length})` : `Feedback Sessions (${feedbackSessions.length})`}
          </button>
        ))}
      </div>

      {/* Notes tab */}
      {tab === "notes" && (
        <>
          {/* Filter by status */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex gap-3 items-end flex-wrap">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Filter by status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 bg-white text-sm"
              >
                <option value="">All statuses</option>
                {NOTE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            {statusFilter && (
              <button
                type="button"
                onClick={() => setStatusFilter("")}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                Clear
              </button>
            )}
          </div>

          <div className="text-sm text-slate-500">{filteredNotes.length} note(s)</div>

          {filteredNotes.length === 0 ? (
            <p className="text-slate-500">No notes for this filter.</p>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left font-medium text-slate-500 px-4 py-3">Collector</th>
                    <th className="text-left font-medium text-slate-500 px-4 py-3">Report</th>
                    <th className="text-left font-medium text-slate-500 px-4 py-3">Note</th>
                    <th className="text-left font-medium text-slate-500 px-4 py-3">Status</th>
                    <th className="text-left font-medium text-slate-500 px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredNotes.map((n) => {
                    const report = reports.find((r) => r.id === n.report_id);
                    return (
                      <tr key={n.id} className="border-t border-slate-100 align-top">
                        <td className="px-4 py-3 font-medium whitespace-nowrap">{n.hr_code}</td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                          {report?.title ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-700 max-w-xs">{n.note_text}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <select
                            value={n.status}
                            disabled={saving === n.id}
                            onChange={(e) => updateNoteStatus(n.id, e.target.value)}
                            className={`rounded-full border-0 px-3 py-1 text-xs font-medium cursor-pointer ${statusBadge[n.status] ?? ""}`}
                          >
                            {NOTE_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                          {n.created_at.slice(0, 10)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Sessions tab */}
      {tab === "sessions" && (
        <div className="space-y-3">
          {feedbackSessions.length === 0 ? (
            <p className="text-slate-500">No feedback sessions recorded.</p>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left font-medium text-slate-500 px-4 py-3">Collector</th>
                    <th className="text-left font-medium text-slate-500 px-4 py-3">Date</th>
                    <th className="text-left font-medium text-slate-500 px-4 py-3">Mode</th>
                    <th className="text-left font-medium text-slate-500 px-4 py-3">Status</th>
                    <th className="text-left font-medium text-slate-500 px-4 py-3">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {feedbackSessions.map((s) => (
                    <tr key={s.id} className="border-t border-slate-100 align-top">
                      <td className="px-4 py-3 font-medium whitespace-nowrap">{s.hr_code}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{s.session_date}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{s.mode}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            statusBadge[s.status] ?? "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {s.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 max-w-xs">{s.notes ?? "—"}</td>
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
}
