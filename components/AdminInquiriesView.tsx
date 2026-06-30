"use client";

import { useMemo, useState } from "react";
import Combobox from "@/components/Combobox";

type Video = {
  id: string;
  drive_file_id: string;
  file_name: string;
  reply_text: string | null;
  replied_at: string | null;
};
type Inquiry = {
  id: string;
  hr_code: string;
  collector_name: string;
  team: string | null;
  match_id: string;
  created_at: string;
  completed_at: string | null;
  videos: Video[];
};
type CollectorOpt = { hr_code: string; name: string };

type StatusFilter = "all" | "pending" | "completed";

export default function AdminInquiriesView({
  inquiries: initial,
  collectors,
}: {
  inquiries: Inquiry[];
  collectors: CollectorOpt[];
}) {
  const [inquiries, setInquiries] = useState<Inquiry[]>(initial);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showVideos, setShowVideos] = useState<Record<string, boolean>>({});
  const [collectorFilter, setCollectorFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [savingVideoId, setSavingVideoId] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ inquiryId: string; type: "ok" | "err"; text: string } | null>(null);

  // Summary stats: Total / Completed / Pending videos
  const stats = useMemo(() => {
    let total = 0;
    let completed = 0;
    let pendingVideos = 0;
    for (const q of inquiries) {
      total++;
      if (q.completed_at) completed++;
      for (const v of q.videos) if (!v.reply_text) pendingVideos++;
    }
    return { total, completed, pendingVideos };
  }, [inquiries]);

  const cards = [
    { label: "Total matches submitted", value: stats.total, color: "text-slate-800 dark:text-slate-100" },
    { label: "Completed matches", value: stats.completed, color: "text-emerald-600" },
    {
      label: "Pending videos",
      value: stats.pendingVideos,
      color: stats.pendingVideos ? "text-amber-600" : "text-slate-800 dark:text-slate-100",
    },
  ];

  const visible = useMemo(() => {
    return inquiries.filter((q) => {
      if (collectorFilter !== "all" && q.hr_code !== collectorFilter) return false;
      if (statusFilter === "pending" && q.completed_at) return false;
      if (statusFilter === "completed" && !q.completed_at) return false;
      if (search) {
        const s = search.toLowerCase();
        const hay = `${q.match_id} ${q.hr_code} ${q.collector_name} ${q.team ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [inquiries, collectorFilter, statusFilter, search]);

  async function sendReply(videoId: string, inquiryId: string) {
    const text = (replyText[videoId] ?? "").trim();
    if (!text) return;
    setSavingVideoId(videoId);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/inquiries/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ video_id: videoId, reply_text: text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Reply failed");
      const now = new Date().toISOString();
      setInquiries((prev) =>
        prev.map((q) =>
          q.id !== inquiryId
            ? q
            : {
                ...q,
                videos: q.videos.map((v) =>
                  v.id === videoId
                    ? { ...v, reply_text: text, replied_at: now }
                    : v
                ),
              }
        )
      );
      setReplyText((p) => ({ ...p, [videoId]: "" }));
    } catch (e: any) {
      setMsg({ inquiryId, type: "err", text: e?.message ?? "Reply failed" });
    } finally {
      setSavingVideoId(null);
    }
  }

  async function completeInquiry(inquiryId: string) {
    setCompletingId(inquiryId);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/inquiries/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ inquiry_id: inquiryId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not complete");
      const now = new Date().toISOString();
      setInquiries((prev) =>
        prev.map((q) => (q.id === inquiryId ? { ...q, completed_at: now } : q))
      );
      setMsg({
        inquiryId,
        type: "ok",
        text: json.email_sent
          ? "Inquiry marked complete and the collector was emailed."
          : "Inquiry marked complete. (Email could not be sent - check Gmail config.)",
      });
    } catch (e: any) {
      setMsg({ inquiryId, type: "err", text: e?.message ?? "Failed" });
    } finally {
      setCompletingId(null);
    }
  }

  const inputCls = "rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900 text-sm";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Inquiries</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Match questions submitted by collectors - reply per video and notify the
          collector once every inquiry on a match has been answered.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">{c.label}</p>
            <p className={`text-2xl font-bold mt-1 ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Search collector / match</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Match ID, HR code, name, team..."
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
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className={inputCls}
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        {(collectorFilter !== "all" || statusFilter !== "all" || search) && (
          <button
            type="button"
            onClick={() => {
              setCollectorFilter("all");
              setStatusFilter("all");
              setSearch("");
            }}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Clear
          </button>
        )}
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400">{visible.length} match(es)</p>

      {visible.length === 0 ? (
        <p className="text-slate-500 dark:text-slate-400">No inquiries match these filters.</p>
      ) : (
        <div className="space-y-2">
          {visible.map((q) => {
            const isExp = expandedId === q.id;
            const videosOpen = showVideos[q.id] ?? false;
            const repliedCount = q.videos.filter((v) => v.reply_text).length;
            const allReplied =
              q.videos.length > 0 && repliedCount === q.videos.length;
            const localMsg = msg?.inquiryId === q.id ? msg : null;

            return (
              <div
                key={q.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(isExp ? null : q.id)}
                  className="w-full text-left px-5 py-4 flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <div className="flex-1 min-w-0 flex flex-wrap items-center gap-3">
                    <span className="font-semibold text-slate-800 dark:text-slate-100">
                      Match {q.match_id}
                    </span>
                    <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full px-2 py-0.5">
                      {q.hr_code} - {q.collector_name}
                      {q.team ? ` - ${q.team}` : ""}
                    </span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                      {q.created_at.slice(0, 10)}
                    </span>
                    {q.completed_at ? (
                      <span className="text-xs bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5 font-medium">
                        Completed
                      </span>
                    ) : allReplied ? (
                      <span className="text-xs bg-sky-100 text-sky-700 rounded-full px-2 py-0.5 font-medium">
                        Ready to complete
                      </span>
                    ) : (
                      <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-medium">
                        Pending
                      </span>
                    )}
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {repliedCount} / {q.videos.length} replied
                    </span>
                  </div>
                  <span className="text-slate-400 dark:text-slate-500 text-sm">{isExp ? "▲" : "▼"}</span>
                </button>

                {isExp && (
                  <div className="border-t border-slate-100 dark:border-slate-800 px-5 pb-5 pt-4 space-y-4">
                    {/* Collapsible Videos */}
                    {q.videos.length > 0 && (
                      <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                        <button
                          type="button"
                          onClick={() =>
                            setShowVideos((p) => ({
                              ...p,
                              [q.id]: !videosOpen,
                            }))
                          }
                          className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200"
                        >
                          <span>Videos ({q.videos.length})</span>
                          <span className="text-slate-500 dark:text-slate-400 text-xs">
                            {videosOpen ? "Hide ▲" : "Show ▼"}
                          </span>
                        </button>

                        {videosOpen && (
                          <div className="p-4 space-y-5 bg-white dark:bg-slate-900">
                            {q.videos.map((v) => (
                              <div
                                key={v.id}
                                className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden"
                              >
                                <p className="text-xs text-slate-400 dark:text-slate-500 px-3 py-1.5 bg-slate-900 text-slate-100 truncate">
                                  {v.file_name}
                                </p>
                                <iframe
                                  src={`https://drive.google.com/file/d/${v.drive_file_id}/preview`}
                                  className="w-full"
                                  style={{ height: "320px" }}
                                  allow="autoplay; fullscreen"
                                  allowFullScreen
                                />
                                {v.reply_text ? (
                                  <div className="bg-sky-50 border-t border-sky-200 px-3 py-2">
                                    <p className="text-xs text-sky-700 font-medium">
                                      Your reply
                                      {v.replied_at
                                        ? ` - ${v.replied_at.slice(0, 10)}`
                                        : ""}
                                    </p>
                                    <p className="text-sm text-slate-700 dark:text-slate-200 mt-1 whitespace-pre-wrap">
                                      {v.reply_text}
                                    </p>
                                  </div>
                                ) : (
                                  <div className="border-t border-slate-200 dark:border-slate-800 px-3 py-3 space-y-2 bg-slate-50 dark:bg-slate-800">
                                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                                      Reply to the collector
                                    </p>
                                    <div className="flex gap-2">
                                      <input
                                        type="text"
                                        value={replyText[v.id] ?? ""}
                                        onChange={(e) =>
                                          setReplyText((p) => ({
                                            ...p,
                                            [v.id]: e.target.value,
                                          }))
                                        }
                                        placeholder="Type your reply..."
                                        className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-900"
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") sendReply(v.id, q.id);
                                        }}
                                      />
                                      <button
                                        type="button"
                                        disabled={
                                          savingVideoId === v.id ||
                                          !(replyText[v.id] ?? "").trim()
                                        }
                                        onClick={() => sendReply(v.id, q.id)}
                                        className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
                                      >
                                        {savingVideoId === v.id ? "..." : "Reply"}
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Complete + email */}
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        disabled={
                          !allReplied || !!q.completed_at || completingId === q.id
                        }
                        onClick={() => completeInquiry(q.id)}
                        className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {q.completed_at
                          ? "Already completed"
                          : completingId === q.id
                          ? "Sending..."
                          : `Mark complete & email collector (Match ${q.match_id})`}
                      </button>
                      {!allReplied && !q.completed_at && (
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          Reply to every video before marking complete.
                        </span>
                      )}
                      {localMsg && (
                        <p
                          className={`text-xs ${
                            localMsg.type === "ok"
                              ? "text-emerald-600"
                              : "text-red-600"
                          }`}
                        >
                          {localMsg.text}
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
