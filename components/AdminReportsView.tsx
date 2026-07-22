"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import Combobox from "@/components/Combobox";

type VideoItem = { id: string; drive_file_id: string; file_name: string };
type NoteItem = {
  id: string;
  hr_code: string;
  note_text: string;
  status: string;
  created_at: string;
  reply_text: string | null;
  replied_at: string | null;
};
type SessionReport = {
  id: string;
  collector_name: string | null;
  hr_code: string | null;
  match_name: string;
  review_date: string | null;
  overall_notes: string | null;
  acknowledged: boolean;
  notes: NoteItem[];
  videos: VideoItem[];
};
type CollectorOpt = { hr_code: string; name: string; team: string | null };

const NOTE_STATUSES = ["Not Started", "In Progress", "Complete"] as const;
const statusBadge: Record<string, string> = {
  "Not Started": "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300",
  "In Progress": "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  Complete: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
};

type AckFilter = "all" | "acknowledged" | "not_acknowledged";

export default function AdminReportsView({
  sessions: initialSessions,
  collectors,
}: {
  sessions: SessionReport[];
  collectors: CollectorOpt[];
}) {
  const supabase = createClient();
  const [sessions, setSessions] = useState(initialSessions);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showVideos, setShowVideos] = useState<Record<string, boolean>>({});
  const [noteFilter, setNoteFilter] = useState("");
  const [ackFilter, setAckFilter] = useState<AckFilter>("all");
  const [collectorFilter, setCollectorFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyMsg, setReplyMsg] = useState<{ id: string; type: "ok" | "err"; text: string } | null>(null);

  const stats = useMemo(() => {
    let total = 0;
    let acknowledged = 0;
    let notAcknowledged = 0;
    let incompleteNotes = 0;
    let completed = 0;
    for (const s of sessions) {
      total++;
      if (s.acknowledged) acknowledged++;
      else notAcknowledged++;
      const hasOpenNote = s.notes.some((n) => n.status !== "Complete");
      if (hasOpenNote) incompleteNotes++;
      if (s.acknowledged && !hasOpenNote) completed++;
    }
    return { total, acknowledged, notAcknowledged, incompleteNotes, completed };
  }, [sessions]);

  async function updateNoteStatus(id: string, status: string, sessionId: string) {
    setSavingNoteId(id);
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
    setSavingNoteId(null);
  }

  async function sendReply(noteId: string, sessionId: string) {
    const text = (replyText[noteId] ?? "").trim();
    if (!text) return;
    setReplyingId(noteId);
    setReplyMsg(null);
    try {
      const res = await fetch("/api/admin/note-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ note_id: noteId, reply_text: text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not send reply");
      const now = new Date().toISOString();
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                notes: s.notes.map((n) =>
                  n.id === noteId
                    ? { ...n, reply_text: text, replied_at: now, status: "Complete" }
                    : n
                ),
              }
            : s
        )
      );
      setReplyText((prev) => ({ ...prev, [noteId]: "" }));
      setReplyMsg({
        id: noteId,
        type: "ok",
        text: json.email_sent
          ? "Reply sent and the collector was emailed. Note marked Complete."
          : "Reply saved and note marked Complete. (Email could not be sent - check Gmail config.)",
      });
    } catch (e: any) {
      setReplyMsg({ id: noteId, type: "err", text: e?.message ?? "Failed to send" });
    } finally {
      setReplyingId(null);
    }
  }

  const visible = useMemo(() => {
    return sessions.filter((s) => {
      if (collectorFilter !== "all" && s.hr_code !== collectorFilter) return false;
      if (ackFilter === "acknowledged" && !s.acknowledged) return false;
      if (ackFilter === "not_acknowledged" && s.acknowledged) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay =
          s.match_name.toLowerCase() +
          " " +
          (s.hr_code ?? "").toLowerCase() +
          " " +
          (s.collector_name ?? "").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [sessions, collectorFilter, ackFilter, search]);

  const cards = [
    { label: "Total reports", value: stats.total, color: "text-slate-800 dark:text-slate-100" },
    { label: "Not acknowledged", value: stats.notAcknowledged, color: stats.notAcknowledged ? "text-amber-600" : "text-slate-800 dark:text-slate-100" },
    { label: "Acknowledged", value: stats.acknowledged, color: "text-emerald-600" },
    { label: "Incomplete notes", value: stats.incompleteNotes, color: stats.incompleteNotes ? "text-amber-600" : "text-slate-800 dark:text-slate-100" },
    { label: "Completed reports", value: stats.completed, color: "text-emerald-600" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Match session reports - videos, collector notes and acknowledgements.
          </p>
        </div>
        <Link
          href="/upload"
          className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-700"
        >
          Upload New Report
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">{c.label}</p>
            <p className={`text-2xl font-bold mt-1 ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Search collector / match</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="HR code, name, match..."
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm"
          />
        </div>
        <div className="w-64">
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Collector</label>
          <Combobox
            options={[
              { value: "all", label: "All collectors" },
              ...collectors.map((c) => ({
                value: c.hr_code,
                label: `${c.hr_code} - ${c.name}`,
              })),
            ]}
            value={collectorFilter}
            onChange={(v) => setCollectorFilter(v || "all")}
            placeholder="All collectors"
            searchPlaceholder="Search by code or name..."
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Acknowledgement</label>
          <select
            value={ackFilter}
            onChange={(e) => setAckFilter(e.target.value as AckFilter)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900 text-sm"
          >
            <option value="all">All</option>
            <option value="not_acknowledged">Not acknowledged</option>
            <option value="acknowledged">Acknowledged</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Filter notes by status</label>
          <select
            value={noteFilter}
            onChange={(e) => setNoteFilter(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900 text-sm"
          >
            <option value="">All statuses</option>
            {NOTE_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        {(search || noteFilter || collectorFilter !== "all" || ackFilter !== "all") && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setNoteFilter("");
              setCollectorFilter("all");
              setAckFilter("all");
            }}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 self-end"
          >
            Clear
          </button>
        )}
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400">{visible.length} report(s)</p>

      {visible.length === 0 ? (
        <p className="text-slate-500 dark:text-slate-400">
          No reports match these filters.{" "}
          <Link href="/upload" className="text-blue-600 underline">Upload one.</Link>
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map((s) => {
            const isExp = expandedId === s.id;
            const videosOpen = showVideos[s.id] ?? false;
            const visibleNotes = s.notes.filter((n) =>
              noteFilter ? n.status === noteFilter : true
            );
            return (
              <div key={s.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedId(isExp ? null : s.id)}
                  className="w-full text-left px-5 py-4 flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <div className="flex-1 min-w-0 flex flex-wrap items-center gap-3">
                    <span className="font-semibold text-slate-800 dark:text-slate-100">{s.match_name}</span>
                    {s.review_date && (
                      <span className="text-xs text-slate-400 dark:text-slate-500">{s.review_date}</span>
                    )}
                    <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full px-2 py-0.5">
                      {s.hr_code ?? "-"}
                      {s.collector_name ? ` - ${s.collector_name}` : ""}
                    </span>
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
                      <span className="text-xs text-slate-500 dark:text-slate-400">{s.videos.length} video(s)</span>
                    )}
                    {s.notes.length > 0 && (
                      <span className="text-xs text-amber-600 font-medium">{s.notes.length} note(s)</span>
                    )}
                  </div>
                  <span className="text-slate-400 dark:text-slate-500 text-sm">{isExp ? "▲" : "▼"}</span>
                </button>

                {isExp && (
                  <div className="border-t border-slate-100 dark:border-slate-800 px-5 pb-5 pt-4 space-y-5">
                    {s.overall_notes && (
                      <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{s.overall_notes}</p>
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
                              <div key={v.id} className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-black">
                                <p className="text-xs text-slate-400 dark:text-slate-500 px-3 py-1.5 bg-slate-900 truncate">{v.file_name}</p>
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

                    {/* Notes + reply UI */}
                    <div>
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Collector Notes</p>
                      {visibleNotes.length === 0 ? (
                        <p className="text-slate-500 dark:text-slate-400 text-sm">
                          {noteFilter ? "No notes matching this status." : "No notes yet."}
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {visibleNotes.map((n) => (
                            <div key={n.id} className="border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-2">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs text-slate-500 dark:text-slate-400">
                                    {n.hr_code}{" "}
                                    <span className="text-slate-300 dark:text-slate-600">.</span>{" "}
                                    {n.created_at.slice(0, 10)}
                                  </p>
                                  <p className="text-sm text-slate-700 dark:text-slate-200 mt-1 whitespace-pre-wrap">{n.note_text}</p>
                                </div>
                                <select
                                  value={n.status}
                                  disabled={savingNoteId === n.id}
                                  onChange={(e) => updateNoteStatus(n.id, e.target.value, s.id)}
                                  className={`rounded-full border-0 px-3 py-1 text-xs font-medium cursor-pointer ${statusBadge[n.status] ?? ""}`}
                                >
                                  {NOTE_STATUSES.map((st) => (
                                    <option key={st} value={st}>{st}</option>
                                  ))}
                                </select>
                              </div>

                              {n.reply_text && (
                                <div className="rounded-lg bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 px-3 py-2">
                                  <p className="text-xs text-sky-700 dark:text-sky-200 font-medium">
                                    Your reply
                                    {n.replied_at ? ` - ${n.replied_at.slice(0, 10)}` : ""}
                                  </p>
                                  <p className="text-sm text-slate-700 dark:text-slate-100 mt-1 whitespace-pre-wrap">{n.reply_text}</p>
                                </div>
                              )}

                              {!n.reply_text && (
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    value={replyText[n.id] ?? ""}
                                    onChange={(e) =>
                                      setReplyText((prev) => ({
                                        ...prev,
                                        [n.id]: e.target.value,
                                      }))
                                    }
                                    placeholder="Reply (collector will be emailed)..."
                                    className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm"
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") sendReply(n.id, s.id);
                                    }}
                                  />
                                  <button
                                    type="button"
                                    disabled={
                                      replyingId === n.id ||
                                      !(replyText[n.id] ?? "").trim()
                                    }
                                    onClick={() => sendReply(n.id, s.id)}
                                    className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
                                  >
                                    {replyingId === n.id ? "Sending..." : "Reply"}
                                  </button>
                                </div>
                              )}

                              {replyMsg?.id === n.id && (
                                <p
                                  className={`text-xs ${
                                    replyMsg.type === "ok"
                                      ? "text-emerald-600"
                                      : "text-red-600"
                                  }`}
                                >
                                  {replyMsg.text}
                                </p>
                              )}
                            </div>
                          ))}
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
