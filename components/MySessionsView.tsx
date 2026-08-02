"use client";

import { useState } from "react";

// v59: added session_time so the collector can see WHEN the session is.
type SessionItem = {
  id: string;
  session_date: string;
  session_time: string | null;
  mode: string;
  status: string;
  meet_link: string | null;
  location: string | null;
  notes: string | null;
};

function fmtTime(t: string | null): string {
  if (!t) return "";
  // Accept "HH:MM" or "HH:MM:SS" strings and turn into "H:MM AM/PM".
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(t.trim());
  if (!m) return t.trim();
  let h = Number(m[1]);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 === 0 ? 12 : h % 12;
  return `${h}:${m[2]} ${ampm}`;
}

type StatusFilter = "All" | "Scheduled" | "Completed" | "Cancelled";

const statusBadge: Record<string, string> = {
  Scheduled: "bg-sky-100 text-sky-800",
  Completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  Cancelled: "bg-slate-200 text-slate-600 dark:text-slate-300",
};
const modeBadge: Record<string, string> = {
  Online: "bg-blue-100 text-blue-700",
  Offline: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300",
};

export default function MySessionsView({
  sessions,
}: {
  sessions: SessionItem[];
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filtered = sessions.filter((s) => {
    if (statusFilter !== "All" && s.status !== statusFilter) return false;
    if (from && s.session_date < from) return false;
    if (to && s.session_date > to) return false;
    return true;
  });

  const statusFilters: StatusFilter[] = ["All", "Scheduled", "Completed", "Cancelled"];
  const btnClass = (f: StatusFilter) =>
    `px-3 py-1.5 rounded-lg text-sm font-medium transition ${statusFilter === f ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900" : "text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Feedback Sessions</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Your scheduled and completed feedback meetings.</p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-wrap gap-3 items-end">
        <div className="flex gap-2">
          {statusFilters.map((f) => (
            <button key={f} className={btnClass(f)} onClick={() => setStatusFilter(f)}>{f}</button>
          ))}
        </div>
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm" />
        </div>
        {(from || to) && (
          <button onClick={() => { setFrom(""); setTo(""); }} className="text-sm text-slate-500 dark:text-slate-400 underline self-end pb-2">Clear dates</button>
        )}
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400">{filtered.length} session(s)</p>

      {filtered.length === 0 ? (
        <p className="text-slate-500 dark:text-slate-400">No sessions for this filter.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => (
            <div key={s.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{s.session_date}</span>
                  {s.session_time && (
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      {fmtTime(s.session_time)}
                    </span>
                  )}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${modeBadge[s.mode] ?? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"}`}>
                    {s.mode}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge[s.status] ?? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"}`}>
                    {s.status}
                  </span>
                </div>
                {s.mode === "Online" && s.status === "Scheduled" && s.meet_link && (
                  <a
                    href={s.meet_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg bg-blue-600 text-white px-4 py-1.5 text-sm font-medium hover:bg-blue-700"
                  >
                    Join Meeting
                  </a>
                )}
              </div>
              {s.mode === "Offline" && s.location && (
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  <span className="font-medium">Location:</span> {s.location}
                </p>
              )}
              {s.notes && (
                <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{s.notes}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
