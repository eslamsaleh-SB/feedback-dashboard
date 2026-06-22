"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ReportItem = {
  id: string;
  title: string;
  body: string | null;
  url: string | null;
  report_date: string | null;
  acknowledged: boolean;
};

type FilterMode = "all" | "pending" | "acknowledged";

export default function MyReportsView({
  reports: initialReports,
  myHr,
}: {
  reports: ReportItem[];
  myHr: string | null;
}) {
  const supabase = createClient();
  const [reports, setReports] = useState<ReportItem[]>(initialReports);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [noteTexts, setNoteTexts] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [acking, setAcking] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, { type: "ok" | "err"; text: string }>>({});

  const filtered = reports.filter((r) => {
    if (filter === "pending" && r.acknowledged) return false;
    if (filter === "acknowledged" && !r.acknowledged) return false;
    if (from && r.report_date && r.report_date < from) return false;
    if (to && r.report_date && r.report_date > to) return false;
    return true;
  });

  async function acknowledge(id: string) {
    if (!myHr) return;
    setAcking(id);
    const { error } = await supabase
      .from("report_acknowledgments")
      .insert({ report_id: id, hr_code: myHr });
    setAcking(null);
    if (error) {
      setMsg((m) => ({ ...m, [id]: { type: "err", text: error.message } }));
      return;
    }
    setReports((prev) => prev.map((r) => r.id === id ? { ...r, acknowledged: true } : r));
  }

  async function submitNote(id: string) {
    if (!myHr) return;
    const text = (noteTexts[id] ?? "").trim();
    if (!text) return;
    setSubmitting(id);
    const { error } = await supabase.from("report_notes").insert({
      report_id: id,
      hr_code: myHr,
      note_text: text,
    });
    setSubmitting(null);
    if (error) {
      setMsg((m) => ({ ...m, [id]: { type: "err", text: error.message } }));
      return;
    }
    setNoteTexts((n) => ({ ...n, [id]: "" }));
    setMsg((m) => ({ ...m, [id]: { type: "ok", text: "Note sent." } }));
    setTimeout(() => setMsg((m) => { const next = { ...m }; delete next[id]; return next; }), 3000);
  }

  const filterBtnClass = (f: FilterMode) =>
    `px-3 py-1.5 rounded-lg text-sm font-medium transition ${filter === f ? "bg-slate-900 text-white" : "text-slate-600 border border-slate-300 hover:bg-slate-50"}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Reports</h1>
        <p className="text-slate-500 text-sm mt-1">Reports sent to you or all collectors.</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap gap-3 items-end">
        <div className="flex gap-2">
          <button className={filterBtnClass("all")} onClick={() => setFilter("all")}>All</button>
          <button className={filterBtnClass("pending")} onClick={() => setFilter("pending")}>Pending</button>
          <button className={filterBtnClass("acknowledged")} onClick={() => setFilter("acknowledged")}>Acknowledged</button>
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

      <p className="text-sm text-slate-500">{filtered.length} report(s)</p>

      {filtered.length === 0 ? (
        <p className="text-slate-500">No reports for this filter.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const isExpanded = expandedId === r.id;
            return (
              <div key={r.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : r.id)}
                  className="w-full text-left px-5 py-4 flex items-start justify-between gap-4 hover:bg-slate-50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-800">{r.title}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.acknowledged ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                        {r.acknowledged ? "Acknowledged" : "Pending"}
                      </span>
                    </div>
                    {r.report_date && (
                      <p className="text-xs text-slate-400 mt-0.5">{r.report_date}</p>
                    )}
                  </div>
                  <span className="text-slate-400 text-sm mt-1">{isExpanded ? "▲" : "▼"}</span>
                </button>

                {isExpanded && (
                  <div className="px-5 pb-5 space-y-3 border-t border-slate-100 pt-4">
                    {r.body && <p className="text-slate-700 text-sm whitespace-pre-wrap">{r.body}</p>}
                    {r.url && (
                      <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 underline break-all">
                        {r.url}
                      </a>
                    )}
                    {!r.acknowledged && (
                      <button
                        onClick={() => acknowledge(r.id)}
                        disabled={acking === r.id}
                        className="rounded-lg bg-emerald-600 text-white px-4 py-1.5 text-sm font-medium disabled:opacity-50"
                      >
                        {acking === r.id ? "Acknowledging..." : "Acknowledge"}
                      </button>
                    )}
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-slate-700">Add a note</p>
                      <textarea
                        value={noteTexts[r.id] ?? ""}
                        onChange={(e) => setNoteTexts((n) => ({ ...n, [r.id]: e.target.value }))}
                        placeholder="Write a note to your supervisor..."
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm min-h-[80px]"
                      />
                      <button
                        onClick={() => submitNote(r.id)}
                        disabled={submitting === r.id || !(noteTexts[r.id] ?? "").trim()}
                        className="rounded-lg bg-slate-900 text-white px-4 py-1.5 text-sm font-medium disabled:opacity-50"
                      >
                        {submitting === r.id ? "Sending..." : "Send Note"}
                      </button>
                      {msg[r.id] && (
                        <p className={`text-sm ${msg[r.id].type === "ok" ? "text-emerald-600" : "text-red-600"}`}>
                          {msg[r.id].text}
                        </p>
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
