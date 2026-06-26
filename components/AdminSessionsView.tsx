"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type SessionItem = {
  id: string;
  hr_code: string;
  session_date: string;
  mode: string;
  status: string;
  meet_link: string | null;
  location: string | null;
  notes: string | null;
};

type StatusFilter = "All" | "Scheduled" | "Completed" | "Cancelled";
const SESSION_STATUSES = ["Scheduled", "Completed", "Cancelled"] as const;

const statusBadge: Record<string, string> = {
  Scheduled: "bg-sky-100 text-sky-800",
  Completed: "bg-emerald-100 text-emerald-800",
  Cancelled: "bg-slate-200 text-slate-600",
};
const modeBadge: Record<string, string> = {
  Online: "bg-blue-100 text-blue-700",
  Offline: "bg-slate-100 text-slate-600",
};

export default function AdminSessionsView({
  sessions: initialSessions,
}: {
  sessions: SessionItem[];
}) {
  const supabase = createClient();
  const [sessions, setSessions] = useState<SessionItem[]>(initialSessions);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const filtered = sessions.filter((s) => {
    if (statusFilter !== "All" && s.status !== statusFilter) return false;
    if (search && !s.hr_code.toLowerCase().includes(search.toLowerCase())) return false;
    if (from && s.session_date < from) return false;
    if (to && s.session_date > to) return false;
    return true;
  });

  async function updateStatus(id: string, status: string) {
    setUpdatingId(id);
    // Translate the simplified status into the canonical attendance value on
    // feedback_attendees (feedback_meetings was retired). Scheduled = null,
    // Completed = "Attended" (admin can refine on Feedback Progress),
    // Cancelled = "Cancelled".
    const attendance =
      status === "Scheduled"
        ? null
        : status === "Completed"
        ? "Attended"
        : "Cancelled";
    await supabase.from("feedback_attendees").update({ attendance }).eq("id", id);
    setSessions((prev) => prev.map((s) => s.id === id ? { ...s, status } : s));
    setUpdatingId(null);
  }

  const statusFilters: StatusFilter[] = ["All", "Scheduled", "Completed", "Cancelled"];
  const btnClass = (f: StatusFilter) =>
    `px-3 py-1.5 rounded-lg text-sm font-medium transition ${statusFilter === f ? "bg-slate-900 text-white" : "text-slate-600 border border-slate-300 hover:bg-slate-50"}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Feedback Sessions</h1>
        <p className="text-slate-500 text-sm mt-1">All feedback sessions. Update status inline.</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap gap-3 items-end">
        <div className="flex gap-2">
          {statusFilters.map((f) => (
            <button key={f} className={btnClass(f)} onClick={() => setStatusFilter(f)}>{f}</button>
          ))}
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Search HR Code</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="e.g. A-2074"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        {(from || to) && (
          <button onClick={() => { setFrom(""); setTo(""); }} className="text-sm text-slate-500 underline self-end pb-2">Clear dates</button>
        )}
      </div>

      <p className="text-sm text-slate-500">{filtered.length} session(s)</p>

      {filtered.length === 0 ? (
        <p className="text-slate-500">No sessions for this filter.</p>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left font-medium text-slate-500 px-4 py-3 whitespace-nowrap">HR Code</th>
                <th className="text-left font-medium text-slate-500 px-4 py-3 whitespace-nowrap">Date</th>
                <th className="text-left font-medium text-slate-500 px-4 py-3">Mode</th>
                <th className="text-left font-medium text-slate-500 px-4 py-3">Status</th>
                <th className="text-left font-medium text-slate-500 px-4 py-3">Link / Location</th>
                <th className="text-left font-medium text-slate-500 px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-3 font-medium whitespace-nowrap">{s.hr_code}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">{s.session_date}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${modeBadge[s.mode] ?? "bg-slate-100 text-slate-600"}`}>
                      {s.mode}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <select
                      value={s.status}
                      disabled={updatingId === s.id}
                      onChange={(e) => updateStatus(s.id, e.target.value)}
                      className={`rounded-full border-0 px-3 py-1 text-xs font-medium cursor-pointer ${statusBadge[s.status] ?? "bg-slate-100 text-slate-600"}`}
                    >
                      {SESSION_STATUSES.map((st) => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-slate-600 max-w-xs">
                    {s.mode === "Online" && s.meet_link ? (
                      <a href={s.meet_link} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline text-xs break-all">{s.meet_link}</a>
                    ) : s.location ? (
                      <span className="text-xs">{s.location}</span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-500 max-w-xs text-xs">{s.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
