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
type NoteItem = {
  id: string;
  report_id: string;
  note_text: string;
  status: string;
  created_at: string;
};
type SessionItem = {
  id: string;
  session_date: string;
  mode: string;
  notes: string | null;
  status: string;
  meet_link: string | null;
  location: string | null;
};

const statusStyle: Record<string, string> = {
  Scheduled: "bg-sky-100 text-sky-800",
  Completed: "bg-emerald-100 text-emerald-800",
  Cancelled: "bg-slate-200 text-slate-600 dark:text-slate-300",
};

export default function ReportsSessionsView({
  role,
  myHr,
  reports: initialReports,
  notes: initialNotes,
  feedbackSessions,
}: {
  role: string;
  myHr: string | null;
  reports: ReportItem[];
  notes: NoteItem[];
  feedbackSessions: SessionItem[];
}) {
  const supabase = createClient();
  const [reports, setReports] = useState(initialReports);
  const [notes, setNotes] = useState(initialNotes);
  const [newNote, setNewNote] = useState<Record<string, string>>({}); // reportId → text
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [acking, setAcking] = useState<string | null>(null);
  const [tab, setTab] = useState<"reports" | "sessions">("reports");

  async function acknowledge(reportId: string) {
    if (!myHr) return;
    setAcking(reportId);
    const { error } = await supabase.from("report_acknowledgments").insert({
      report_id: reportId,
      hr_code: myHr,
    });
    if (!error) {
      setReports((prev) =>
        prev.map((r) => (r.id === reportId ? { ...r, acknowledged: true } : r))
      );
    }
    setAcking(null);
  }

  async function submitNote(reportId: string) {
    const text = (newNote[reportId] ?? "").trim();
    if (!text || !myHr) return;
    setSubmitting(reportId);
    const { data, error } = await supabase
      .from("report_notes")
      .insert({ report_id: reportId, hr_code: myHr, note_text: text })
      .select()
      .single();
    if (!error && data) {
      setNotes((prev) => [
        { id: data.id, report_id: data.report_id, note_text: data.note_text, status: data.status, created_at: data.created_at },
        ...prev,
      ]);
      setNewNote((prev) => ({ ...prev, [reportId]: "" }));
    }
    setSubmitting(null);
  }

  const notesForReport = (reportId: string) =>
    notes.filter((n) => n.report_id === reportId);

  // Sorted newest first (already from server)
  const sortedItems: ({ type: "report"; data: ReportItem } | { type: "session"; data: SessionItem })[] = [
    ...reports.map((r) => ({ type: "report" as const, data: r })),
    ...feedbackSessions.map((s) => ({ type: "session" as const, data: s })),
  ].sort((a, b) => {
    const da = a.type === "report" ? (a.data.report_date ?? "") : a.data.session_date;
    const db = b.type === "report" ? (b.data.report_date ?? "") : b.data.session_date;
    return db.localeCompare(da);
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reports & Sessions</h1>
        <p className="text-slate-500 dark:text-slate-400">Your reports and scheduled feedback sessions.</p>
      </div>

      {/* Tabs */}
      <div className="inline-flex rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-1">
        {(["reports", "sessions"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize ${
              tab === t ? "bg-slate-900 text-white" : "text-slate-600 dark:text-slate-300"
            }`}
          >
            {t === "reports" ? `Reports (${reports.length})` : `Sessions (${feedbackSessions.length})`}
          </button>
        ))}
      </div>

      {/* Reports tab */}
      {tab === "reports" && (
        <div className="space-y-4">
          {reports.length === 0 ? (
            <p className="text-slate-500 dark:text-slate-400">No reports yet.</p>
          ) : (
            reports.map((r) => {
              const rNotes = notesForReport(r.id);
              return (
                <div
                  key={r.id}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-800 dark:text-slate-100">{r.title}</h3>
                      {r.report_date && (
                        <p className="text-xs text-slate-400 dark:text-slate-500">{r.report_date}</p>
                      )}
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      {r.acknowledged ? (
                        <span className="text-xs text-emerald-600 font-medium">
                          ✓ Acknowledged
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={acking === r.id}
                          onClick={() => acknowledge(r.id)}
                          className="rounded-lg bg-emerald-600 text-white px-3 py-1 text-xs font-medium disabled:opacity-50"
                        >
                          {acking === r.id ? "…" : "Acknowledge"}
                        </button>
                      )}
                    </div>
                  </div>

                  {r.body && (
                    <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line">{r.body}</p>
                  )}
                  {r.url && (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block text-sm text-sky-700 hover:underline"
                    >
                      Open report →
                    </a>
                  )}

                  {/* Existing notes */}
                  {rNotes.length > 0 && (
                    <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-2">
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        Your notes
                      </p>
                      {rNotes.map((n) => (
                        <div
                          key={n.id}
                          className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 text-sm text-slate-700 dark:text-slate-200"
                        >
                          <p>{n.note_text}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                            {n.status} · {n.created_at.slice(0, 10)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add note */}
                  <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                      Ask a question / request clarification
                    </p>
                    <div className="flex gap-2">
                      <input
                        value={newNote[r.id] ?? ""}
                        onChange={(e) =>
                          setNewNote((prev) => ({ ...prev, [r.id]: e.target.value }))
                        }
                        placeholder="Type your question…"
                        className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm"
                      />
                      <button
                        type="button"
                        disabled={!(newNote[r.id] ?? "").trim() || submitting === r.id}
                        onClick={() => submitNote(r.id)}
                        className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
                      >
                        {submitting === r.id ? "…" : "Send"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Sessions tab */}
      {tab === "sessions" && (
        <div className="space-y-4">
          {feedbackSessions.length === 0 ? (
            <p className="text-slate-500 dark:text-slate-400">No feedback sessions scheduled yet.</p>
          ) : (
            feedbackSessions.map((s) => (
              <div
                key={s.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5"
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="font-semibold text-slate-800 dark:text-slate-100">{s.session_date}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                      {s.mode}
                      {s.location ? ` · ${s.location}` : ""}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      statusStyle[s.status] ?? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    {s.status}
                  </span>
                </div>
                {s.meet_link && (
                  <a
                    href={s.meet_link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block mt-2 text-sm text-sky-700 hover:underline"
                  >
                    Join meeting →
                  </a>
                )}
                {s.notes && (
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line">
                    {s.notes}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
