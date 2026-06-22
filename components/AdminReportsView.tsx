"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

type SessionReport = {
  id: string;
  collector_name: string | null;
  hr_code: string | null;
  match_name: string;
  review_date: string | null;
  overall_notes: string | null;
  acknowledged: boolean;
  notes: NoteItem[];
};
type NoteItem = {
  id: string;
  hr_code: string;
  note_text: string;
  status: string;
  created_at: string;
};

const NOTE_STATUSES = ["Not Started", "In Progress", "Complete"] as const;
const statusBadge: Record<string, string> = {
  "Not Started": "bg-slate-100 text-slate-600",
  "In Progress": "bg-amber-100 text-amber-700",
  Complete:      "bg-emerald-100 text-emerald-700",
};

export default function AdminReportsView({
  sessions: initialSessions,
}: {
  sessions: SessionReport[];
}) {
  const supabase = createClient();
  const [sessions, setSessions] = useState(initialSessions);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [noteFilter, setNoteFilter] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  async function updateNoteStatus(id: string, status: string, sessionId: string) {
    setSaving(id);
    await supabase
      .from("session_notes")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId
          ? { ...s, notes: s.notes.map((n) => (n.id === id ? { ...n, status } : n)) }
          : s
      )
    );
    setSaving(null);
  }

  const visible = sessions.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.match_name.toLowerCase().includes(q) ||
      (s.hr_code ?? "").toLowerCase().includes(q) ||
      (s.collector_name ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-slate-500 text-sm mt-1">Match session reports — collector notes and acknowledgements.</p>
        </div>
        <Link
          href="/upload"
          className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-700"
        >
          Upload New Report →
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs text-slate-500 mb-1">Search collector / match</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="HR code, name, match…"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Filter notes by status</label>
          <select
            value={noteFilter}
            onChange={(e) => setNoteFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 bg-white text-sm"
          >
            <option value="">All statuses</option>
            {NOTE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {(search || noteFilter) && (
          <button
            type="button"
            onClick={() => { setSearch(""); setNoteFilter(""); }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 self-end"
          >
            Clear
          </button>
        )}
      </div>

      <p className="text-sm text-slate-500">{visible.length} report(s)</p>

      {visible.length === 0 ? (
        <p className="text-slate-500">
          No reports yet.{" "}
          <Link href="/upload" className="text-blue-600 underline">Upload one now.</Link>
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map((s) => {
            const isExp = expandedId === s.id;
            const visibleNotes = s.notes.filter((n) =>
              noteFilter ? n.status === noteFilter : true
            );
            return (
              <div key={s.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedId(isExp ? null : s.id)}
                  className="w-full text-left px-5 py-4 flex items-center justify-between gap-4 hover:bg-slate-50"
                >
                  <div className="flex-1 min-w-0 flex flex-wrap items-center gap-3">
                    <span className="font-semibold text-slate-800">{s.match_name}</span>
                    {s.review_date && (
                      <span className="text-xs text-slate-400">{s.review_date}</span>
                    )}
                    <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">
                      {s.hr_code ?? "—"}{s.collector_name ? ` · ${s.collector_name}` : ""}
                    </span>
                    {s.acknowledged ? (
                      <span className="text-xs bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5 font-medium">Acknowledged</span>
                    ) : (
                      <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-medium">Pending</span>
                    )}
                    {s.notes.length > 0 && (
                      <span className="text-xs text-amber-600 font-medium">{s.notes.length} note(s)</span>
                    )}
                  </div>
                  <span className="text-slate-400 text-sm">{isExp ? "▲" : "▼"}</span>
                </button>

                {isExp && (
                  <div className="border-t border-slate-100 px-5 pb-5 pt-4 space-y-4">
                    {s.overall_notes && (
                      <p className="text-sm text-slate-600 whitespace-pre-wrap">{s.overall_notes}</p>
                    )}
                    <div>
                      <p className="text-sm font-medium text-slate-700 mb-2">Collector Notes</p>
                      {visibleNotes.length === 0 ? (
                        <p className="text-slate-500 text-sm">
                          {noteFilter ? "No notes matching this status." : "No notes yet."}
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
                              {visibleNotes.map((n) => (
                                <tr key={n.id} className="border-t border-slate-100 align-top">
                                  <td className="px-3 py-2.5 font-medium whitespace-nowrap">{n.hr_code}</td>
                                  <td className="px-3 py-2.5 text-slate-700 max-w-xs">{n.note_text}</td>
                                  <td className="px-3 py-2.5 whitespace-nowrap">
                                    <select
                                      value={n.status}
                                      disabled={saving === n.id}
                                      onChange={(e) => updateNoteStatus(n.id, e.target.value, s.id)}
                                      className={`rounded-full border-0 px-3 py-1 text-xs font-medium cursor-pointer ${statusBadge[n.status] ?? ""}`}
                                    >
                                      {NOTE_STATUSES.map((st) => (
                                        <option key={st} value={st}>{st}</option>
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
