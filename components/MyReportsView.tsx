"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type VideoItem = { id: string; drive_file_id: string; file_name: string };
type NoteItem = {
  id: string;
  note_text: string;
  status: string;
  created_at: string;
  reply_text: string | null;
  replied_at: string | null;
};
type SessionReport = {
  id: string;
  match_name: string;
  review_date: string | null;
  overall_notes: string | null;
  acknowledged: boolean;
  notes: NoteItem[];
  videos: VideoItem[];
};

const statusBadge: Record<string, string> = {
  "Not Started": "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300",
  "In Progress": "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  Complete: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
};

export default function MyReportsView({
  sessions,
  hrCode,
}: {
  sessions: SessionReport[];
  hrCode: string;
}) {
  const supabase = createClient();
  const [items, setItems] = useState(sessions);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showVideos, setShowVideos] = useState<Record<string, boolean>>({});
  const [noteText, setNoteText] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [filter, setFilter] = useState<"All" | "Acknowledged" | "Pending">("All");

  const filtered = items.filter((s) => {
    if (filter === "Acknowledged") return s.acknowledged;
    if (filter === "Pending") return !s.acknowledged;
    return true;
  });

  async function acknowledge(sessionId: string) {
    setSaving(sessionId);
    const { error } = await supabase
      .from("session_acknowledgments")
      .insert({ session_id: sessionId, hr_code: hrCode });
    if (!error)
      setItems((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, acknowledged: true } : s))
      );
    setSaving(null);
  }

  async function addNote(sessionId: string) {
    const text = (noteText[sessionId] ?? "").trim();
    if (!text) return;
    setSaving("note-" + sessionId);
    const { data, error } = await supabase
      .from("session_notes")
      .insert({ session_id: sessionId, hr_code: hrCode, note_text: text })
      .select("id, note_text, status, created_at, reply_text, replied_at")
      .single();
    if (!error && data) {
      setItems((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? { ...s, notes: [...s.notes, data as NoteItem] }
            : s
        )
      );
      setNoteText((prev) => ({ ...prev, [sessionId]: "" }));
    }
    setSaving(null);
  }

  const btnCls = (f: typeof filter) =>
    `px-3 py-1.5 rounded-lg text-sm font-medium transition ${
      filter === f
        ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
        : "border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
    }`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Reports</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Your match session reports. Acknowledge each one and add notes if needed.
        </p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex gap-2">
        {(["All", "Acknowledged", "Pending"] as const).map((f) => (
          <button key={f} className={btnCls(f)} onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400">{filtered.length} report(s)</p>

      {filtered.length === 0 ? (
        <p className="text-slate-500 dark:text-slate-400">No reports yet.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => {
            const isExp = expandedId === s.id;
            const videosOpen = showVideos[s.id] ?? false;
            return (
              <div
                key={s.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(isExp ? null : s.id)}
                  className="w-full text-left px-5 py-4 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
                    <span className="font-semibold text-slate-800 dark:text-slate-100">
                      {s.match_name}
                    </span>
                    {s.review_date && (
                      <span className="text-xs text-slate-400 dark:text-slate-500">{s.review_date}</span>
                    )}
                    {s.acknowledged ? (
                      <span className="text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 rounded-full px-2 py-0.5 font-medium">
                        Acknowledged
                      </span>
                    ) : (
                      <span className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 rounded-full px-2 py-0.5 font-medium">
                        Pending
                      </span>
                    )}
                    {s.videos.length > 0 && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {s.videos.length} video(s)
                      </span>
                    )}
                    {s.notes.length > 0 && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {s.notes.length} note(s)
                      </span>
                    )}
                  </div>
                  <span className="text-slate-400 dark:text-slate-500 text-sm">{isExp ? "▲" : "▼"}</span>
                </button>

                {isExp && (
                  <div className="border-t border-slate-100 dark:border-slate-800 px-5 pb-5 pt-4 space-y-5">
                    {s.overall_notes && (
                      <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                        {s.overall_notes}
                      </p>
                    )}

                    {/* Collapsible Videos */}
                    {s.videos.length > 0 && (
                      <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                        <button
                          type="button"
                          onClick={() =>
                            setShowVideos((prev) => ({
                              ...prev,
                              [s.id]: !videosOpen,
                            }))
                          }
                          className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200"
                        >
                          <span>Videos ({s.videos.length})</span>
                          <span className="text-slate-500 dark:text-slate-400 text-xs">
                            {videosOpen ? "Hide ▲" : "Show ▼"}
                          </span>
                        </button>
                        {videosOpen && (
                          <div className="p-4 space-y-4 bg-white dark:bg-slate-900">
                            {s.videos.map((v) => (
                              <div
                                key={v.id}
                                className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-black"
                              >
                                <p className="text-xs text-slate-400 dark:text-slate-500 px-3 py-1.5 bg-slate-900 truncate">
                                  {v.file_name}
                                </p>
                                <iframe
                                  src={`https://drive.google.com/file/d/${v.drive_file_id}/preview`}
                                  className="w-full"
                                  style={{ height: "360px" }}
                                  allow="autoplay; fullscreen"
                                  allowFullScreen
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Acknowledge */}
                    {!s.acknowledged && (
                      <button
                        type="button"
                        disabled={saving === s.id}
                        onClick={() => acknowledge(s.id)}
                        className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {saving === s.id ? "Saving..." : "Acknowledge Report"}
                      </button>
                    )}

                    {/* Existing notes (with reviewer replies) */}
                    {s.notes.length > 0 && (
                      <div className="space-y-3">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Your Notes</p>
                        {s.notes.map((n) => (
                          <div
                            key={n.id}
                            className="border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-2"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap flex-1">
                                {n.note_text}
                              </p>
                              <span
                                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                                  statusBadge[n.status] ?? ""
                                }`}
                              >
                                {n.status}
                              </span>
                            </div>
                            {n.reply_text && (
                              <div className="rounded-lg bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 px-3 py-2">
                                <p className="text-xs text-sky-700 dark:text-sky-200 font-medium">
                                  Reviewer reply
                                  {n.replied_at
                                    ? ` · ${n.replied_at.slice(0, 10)}`
                                    : ""}
                                </p>
                                <p className="text-sm text-slate-700 dark:text-slate-100 mt-1 whitespace-pre-wrap">
                                  {n.reply_text}
                                </p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add note */}
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Add a Note</p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={noteText[s.id] ?? ""}
                          onChange={(e) =>
                            setNoteText((prev) => ({ ...prev, [s.id]: e.target.value }))
                          }
                          placeholder="Ask a question or leave a comment..."
                          className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") addNote(s.id);
                          }}
                        />
                        <button
                          type="button"
                          disabled={
                            saving === "note-" + s.id ||
                            !(noteText[s.id] ?? "").trim()
                          }
                          onClick={() => addNote(s.id)}
                          className="rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-4 py-2 text-sm font-medium disabled:opacity-50"
                        >
                          {saving === "note-" + s.id ? "..." : "Send"}
                        </button>
                      </div>
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
