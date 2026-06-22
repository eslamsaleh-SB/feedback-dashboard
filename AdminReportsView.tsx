"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type CollectorOpt = { hr_code: string; name: string | null };
type ReportSummary = {
  id: string;
  title: string;
  body: string | null;
  url: string | null;
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
  collectors,
  reports: initialReports,
  notes: initialNotes,
}: {
  collectors: CollectorOpt[];
  reports: ReportSummary[];
  notes: NoteItem[];
}) {
  const supabase = createClient();

  // ── send-form state ──────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [driveUrl, setDriveUrl] = useState("");
  const [reportDate, setReportDate] = useState("");
  const [hrCode, setHrCode] = useState("");
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // ── list state ───────────────────────────────────────────────────────────
  const [reports, setReports] = useState(initialReports);
  const [notes, setNotes] = useState(initialNotes);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [noteStatusFilter, setNoteStatusFilter] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  // ── send handler ─────────────────────────────────────────────────────────
  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setSendMsg(null);

    const { data, error } = await supabase
      .from("reports")
      .insert({
        title: title.trim(),
        body: body.trim() || null,
        url: driveUrl.trim() || null,
        report_date: reportDate || null,
        hr_code: hrCode || null,
      })
      .select("id, title, body, url, report_date, hr_code")
      .single();

    if (error) {
      setSending(false);
      setSendMsg({ type: "err", text: error.message });
      return;
    }

    // Fire-and-forget email
    fetch("/api/report-notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hr_code: hrCode || null,
        title: title.trim(),
        body: body.trim() || null,
        drive_url: driveUrl.trim() || null,
        report_date: reportDate || null,
      }),
    }).catch(() => {});

    setSending(false);
    setSendMsg({ type: "ok", text: "Report sent — collector(s) will be notified by email." });
    setTitle(""); setBody(""); setDriveUrl(""); setReportDate(""); setHrCode("");

    if (data) {
      setReports((prev) => [
        { id: data.id, title: data.title, body: data.body, url: data.url, report_date: data.report_date, hr_code: data.hr_code, acked_by: [] },
        ...prev,
      ]);
    }
  }

  // ── note status update ───────────────────────────────────────────────────
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
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-slate-500 text-sm mt-1">Send reports and manage collector notes.</p>
        </div>
        <button
          type="button"
          onClick={() => { setShowForm((v) => !v); setSendMsg(null); }}
          className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-700"
        >
          {showForm ? "✕ Cancel" : "+ New Report"}
        </button>
      </div>

      {/* ── Send form ── */}
      {showForm && (
        <form
          onSubmit={handleSend}
          className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 max-w-2xl"
        >
          <h2 className="text-lg font-semibold">Send New Report</h2>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
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
              className="w-full rounded-lg border border-slate-300 px-3 py-2 min-h-[90px]"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Report details (optional)"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Google Drive Report Link
              <span className="ml-1 text-xs text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              type="url"
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              value={driveUrl}
              onChange={(e) => setDriveUrl(e.target.value)}
              placeholder="https://docs.google.com/..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
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
                    {c.hr_code}{c.name ? ` — ${c.name}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={sending}
              className="rounded-lg bg-slate-900 text-white px-6 py-2 font-medium disabled:opacity-50"
            >
              {sending ? "Sending..." : "Send Report"}
            </button>
            {sendMsg && (
              <p className={`text-sm ${sendMsg.type === "ok" ? "text-emerald-600" : "text-red-600"}`}>
                {sendMsg.text}
              </p>
            )}
          </div>
        </form>
      )}

      {/* ── Notes filter ── */}
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

      {/* ── Reports list ── */}
      {reports.length === 0 ? (
        <p className="text-slate-500">No reports yet. Use "+ New Report" to send one.</p>
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
                    {r.url && (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-blue-600 underline hover:text-blue-800"
                      >
                        Drive ↗
                      </a>
                    )}
                  </div>
                  <span className="text-slate-400 text-sm">{isExpanded ? "▲" : "▼"}</span>
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-100 px-5 pb-5 pt-4 space-y-4">
                    {/* Report body */}
                    {r.body && (
                      <p className="text-sm text-slate-600 whitespace-pre-wrap">{r.body}</p>
                    )}
                    {r.url && (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-blue-600 underline hover:text-blue-800"
                      >
                        Open in Google Drive ↗
                      </a>
                    )}

                    {/* Notes table */}
                    <div>
                      <p className="text-sm font-medium text-slate-700 mb-2">Collector Notes</p>
                      {rNotes.length === 0 ? (
                        <p className="text-slate-500 text-sm">
                          {noteStatusFilter ? "No notes matching this status." : "No notes yet."}
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
