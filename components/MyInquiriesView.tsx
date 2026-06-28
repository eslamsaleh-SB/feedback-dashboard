"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Video = {
  id: string;
  drive_file_id: string;
  file_name: string;
  reply_text: string | null;
  replied_at: string | null;
};
type Inquiry = {
  id: string;
  match_id: string;
  created_at: string;
  completed_at: string | null;
  videos: Video[];
};

export default function MyInquiriesView({
  inquiries: initial,
}: {
  inquiries: Inquiry[];
}) {
  const router = useRouter();
  const [inquiries] = useState<Inquiry[]>(initial);
  const [matchId, setMatchId] = useState("");
  const [folderUrl, setFolderUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showVideos, setShowVideos] = useState<Record<string, boolean>>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!matchId.trim()) return setMsg({ type: "err", text: "Enter the Match ID." });
    if (!folderUrl.trim()) return setMsg({ type: "err", text: "Paste the Google Drive folder link." });
    setBusy(true);
    try {
      const res = await fetch("/api/inquiries/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          match_id: matchId.trim(),
          folder_url: folderUrl.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Submit failed");

      const parts: string[] = [];
      if (json.merged) {
        parts.push(
          "You already had an inquiry for this Match ID - the new videos were added to it."
        );
      }
      parts.push(`Imported ${json.imported ?? 0} new video(s).`);
      if (json.skipped > 0) parts.push(`Skipped ${json.skipped} duplicate(s).`);
      setMsg({ type: "ok", text: parts.join(" ") });
      setMatchId("");
      setFolderUrl("");
      router.refresh();
    } catch (err: any) {
      setMsg({ type: "err", text: err?.message ?? "Submit failed" });
    } finally {
      setBusy(false);
    }
  }

  const stats = {
    total: inquiries.length,
    pending: inquiries.filter((q) => !q.completed_at).length,
    completed: inquiries.filter((q) => q.completed_at).length,
  };

  const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 bg-white";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Ask a Question</h1>
        <p className="text-slate-500 text-sm mt-1">
          Submit a Match ID and a Google Drive folder of clips you need clarification
          on. Your reviewer will reply per video.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">Total matches</p>
          <p className="text-2xl font-bold mt-1 text-slate-800">{stats.total}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">Pending</p>
          <p className={`text-2xl font-bold mt-1 ${stats.pending ? "text-amber-600" : "text-slate-800"}`}>
            {stats.pending}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">Completed</p>
          <p className="text-2xl font-bold mt-1 text-emerald-600">{stats.completed}</p>
        </div>
      </div>

      {/* Submit form */}
      <form
        onSubmit={submit}
        className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5"
      >
        <div>
          <label className="block text-sm font-medium mb-1">Match ID</label>
          <input
            value={matchId}
            onChange={(e) => setMatchId(e.target.value)}
            placeholder="e.g. 2453817"
            className={inputCls}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            Google Drive folder link
          </label>
          <input
            value={folderUrl}
            onChange={(e) => setFolderUrl(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/..."
            className={inputCls}
            required
          />
          <p className="text-xs text-slate-400 mt-1">
            The folder must be shared as "Anyone with the link". Re-submitting the
            same Match ID appends to your existing inquiry.
          </p>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-slate-900 text-white px-6 py-2.5 text-sm font-medium disabled:opacity-50"
        >
          {busy ? "Submitting..." : "Submit inquiry"}
        </button>
        {msg && (
          <p
            className={`text-sm ${
              msg.type === "ok" ? "text-emerald-700" : "text-red-600"
            }`}
          >
            {msg.text}
          </p>
        )}
      </form>

      {/* History */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
          My inquiries
        </h2>
        {inquiries.length === 0 ? (
          <p className="text-slate-500 text-sm">No inquiries submitted yet.</p>
        ) : (
          inquiries.map((q) => {
            const isExp = expandedId === q.id;
            const videosOpen = showVideos[q.id] ?? false;
            const replied = q.videos.filter((v) => v.reply_text).length;
            return (
              <div
                key={q.id}
                className="bg-white rounded-2xl border border-slate-200 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(isExp ? null : q.id)}
                  className="w-full text-left px-5 py-4 flex items-center justify-between gap-4 hover:bg-slate-50"
                >
                  <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
                    <span className="font-semibold text-slate-800">
                      Match {q.match_id}
                    </span>
                    <span className="text-xs text-slate-400">
                      {q.created_at.slice(0, 10)}
                    </span>
                    {q.completed_at ? (
                      <span className="text-xs bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5 font-medium">
                        Completed
                      </span>
                    ) : (
                      <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-medium">
                        Pending
                      </span>
                    )}
                    <span className="text-xs text-slate-500">
                      {replied} / {q.videos.length} replied
                    </span>
                  </div>
                  <span className="text-slate-400 text-sm">{isExp ? "▲" : "▼"}</span>
                </button>

                {isExp && (
                  <div className="border-t border-slate-100 px-5 pb-5 pt-4 space-y-4">
                    {/* Collapsible videos */}
                    {q.videos.length > 0 && (
                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <button
                          type="button"
                          onClick={() =>
                            setShowVideos((p) => ({
                              ...p,
                              [q.id]: !videosOpen,
                            }))
                          }
                          className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 text-sm font-medium text-slate-700"
                        >
                          <span>Videos ({q.videos.length})</span>
                          <span className="text-slate-500 text-xs">
                            {videosOpen ? "Hide ▲" : "Show ▼"}
                          </span>
                        </button>
                        {videosOpen && (
                          <div className="p-4 space-y-4 bg-white">
                            {q.videos.map((v) => (
                              <div
                                key={v.id}
                                className="rounded-xl border border-slate-200 overflow-hidden"
                              >
                                <p className="text-xs text-slate-400 px-3 py-1.5 bg-slate-900 text-slate-100 truncate">
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
                                      Reviewer reply
                                      {v.replied_at
                                        ? ` - ${v.replied_at.slice(0, 10)}`
                                        : ""}
                                    </p>
                                    <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">
                                      {v.reply_text}
                                    </p>
                                  </div>
                                ) : (
                                  <div className="bg-slate-50 border-t border-slate-200 px-3 py-2">
                                    <p className="text-xs text-slate-500">
                                      Waiting for reviewer reply...
                                    </p>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
