"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Collector = { id: string; name: string };
export type ExistingSession = {
  id: string;
  match_name: string;
  review_date: string | null;
  collector_id: string;
};

type Mode = "new" | "existing";

export default function UploadForm({
  collectors,
  existingSessions,
}: {
  collectors: Collector[];
  existingSessions: ExistingSession[];
}) {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("new");

  // shared
  const [collectorId, setCollectorId] = useState("");
  const [folderUrl, setFolderUrl] = useState("");

  // new-session fields
  const [matchName, setMatchName] = useState("");
  const [reviewDate, setReviewDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [score, setScore] = useState(5);
  const [overallNotes, setOverallNotes] = useState("");

  // existing-session field
  const [sessionId, setSessionId] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const sessionsForCollector = useMemo(
    () => existingSessions.filter((s) => s.collector_id === collectorId),
    [existingSessions, collectorId]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!collectorId) return setMsg({ type: "err", text: "Pick a collector." });
    if (mode === "new" && !matchName.trim())
      return setMsg({ type: "err", text: "Enter a match name." });
    if (mode === "existing" && !sessionId)
      return setMsg({ type: "err", text: "Pick an existing match session." });
    if (!folderUrl.trim())
      return setMsg({ type: "err", text: "Paste the Google Drive folder link." });

    setLoading(true);
    const payload: Record<string, unknown> = {
      mode,
      folder_url: folderUrl.trim(),
    };
    if (mode === "new") {
      payload.collector_id = collectorId;
      payload.match_name = matchName;
      payload.review_date = reviewDate;
      payload.quality_score = score;
      payload.overall_notes = overallNotes;
    } else {
      payload.match_session_id = sessionId;
    }

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Import failed");

      setMsg({
        type: "ok",
        text: `Imported ${json.imported} video(s) from Drive. Redirecting…`,
      });
      setTimeout(() => router.push("/dashboard"), 1100);
    } catch (err: any) {
      setMsg({ type: "err", text: err.message });
      setLoading(false);
    }
  }

  const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 bg-white";

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">Add match videos from Google Drive</h1>
      <p className="text-sm text-slate-500 mb-6">
        Upload the videos to a Google Drive folder, set the folder’s sharing to
        <span className="font-medium"> “Anyone with the link”</span>, then paste the
        folder link below — we’ll pull in every video automatically.
      </p>

      {/* Mode switch */}
      <div className="inline-flex rounded-xl border border-slate-300 bg-white p-1 mb-6">
        {(["new", "existing"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              mode === m ? "bg-slate-900 text-white" : "text-slate-600"
            }`}
          >
            {m === "new" ? "Create new match session" : "Add to existing session"}
          </button>
        ))}
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5"
      >
        {/* Collector — always shown */}
        <div>
          <label className="block text-sm font-medium mb-1">Collector</label>
          <select
            value={collectorId}
            onChange={(e) => {
              setCollectorId(e.target.value);
              setSessionId("");
            }}
            className={inputCls}
            required
          >
            <option value="">Select a collector…</option>
            {collectors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {mode === "new" ? (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">Match name</label>
              <input
                className={inputCls}
                placeholder="e.g. Round 14 — Team A vs Team B"
                value={matchName}
                onChange={(e) => setMatchName(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Review date</label>
                <input
                  type="date"
                  className={inputCls}
                  value={reviewDate}
                  onChange={(e) => setReviewDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Quality score: <span className="font-bold">{score}/10</span>
                </label>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={score}
                  onChange={(e) => setScore(Number(e.target.value))}
                  className="w-full mt-3"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Overall notes</label>
              <textarea
                className={inputCls}
                rows={3}
                value={overallNotes}
                onChange={(e) => setOverallNotes(e.target.value)}
                placeholder="Summary feedback for the whole match…"
              />
            </div>
          </>
        ) : (
          <div>
            <label className="block text-sm font-medium mb-1">
              Existing match session
            </label>
            <select
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              className={inputCls}
              required
              disabled={!collectorId}
            >
              <option value="">
                {collectorId ? "Select a match…" : "Pick a collector first"}
              </option>
              {sessionsForCollector.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.match_name}
                  {s.review_date ? ` — ${s.review_date}` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Google Drive folder link */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Google Drive folder link
          </label>
          <input
            className={inputCls}
            placeholder="https://drive.google.com/drive/folders/…"
            value={folderUrl}
            onChange={(e) => setFolderUrl(e.target.value)}
            required
          />
          <p className="text-xs text-slate-400 mt-1">
            The folder must be shared as “Anyone with the link”.
          </p>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-slate-900 text-white py-2.5 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading && (
            <span className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          )}
          {loading
            ? "Importing…"
            : mode === "new"
            ? "Create session & import videos"
            : "Import videos to session"}
        </button>

        {msg && (
          <p
            className={`text-sm text-center ${
              msg.type === "ok" ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {msg.text}
          </p>
        )}
      </form>
    </div>
  );
}
