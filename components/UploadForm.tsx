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

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 20;

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
  const [files, setFiles] = useState<File[]>([]);
  const [descriptions, setDescriptions] = useState<string[]>([]);

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

  // Match sessions filtered to the selected collector (for "existing" mode).
  const sessionsForCollector = useMemo(
    () => existingSessions.filter((s) => s.collector_id === collectorId),
    [existingSessions, collectorId]
  );

  function onFilesChosen(list: FileList | null) {
    const arr = list ? Array.from(list).slice(0, MAX_FILES) : [];
    setFiles(arr);
    setDescriptions(arr.map(() => ""));
    setMsg(null);
  }

  function setDescription(i: number, value: string) {
    setDescriptions((prev) => prev.map((d, idx) => (idx === i ? value : d)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!collectorId) return setMsg({ type: "err", text: "Pick a collector." });
    if (mode === "new" && !matchName.trim())
      return setMsg({ type: "err", text: "Enter a match name." });
    if (mode === "existing" && !sessionId)
      return setMsg({ type: "err", text: "Pick an existing match session." });
    if (files.length === 0)
      return setMsg({ type: "err", text: "Choose at least one video." });
    if (files.some((f) => f.size > MAX_BYTES))
      return setMsg({ type: "err", text: "Each video must be under 20MB." });

    setLoading(true);
    const fd = new FormData();
    fd.append("mode", mode);
    files.forEach((f) => fd.append("files", f));
    descriptions.forEach((d) => fd.append("descriptions", d));

    if (mode === "new") {
      fd.append("collector_id", collectorId);
      fd.append("match_name", matchName);
      fd.append("review_date", reviewDate);
      fd.append("quality_score", String(score));
      fd.append("overall_notes", overallNotes);
    } else {
      fd.append("match_session_id", sessionId);
    }

    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed");

      const failedNote =
        json.failed > 0 ? ` (${json.failed} failed to send)` : "";
      setMsg({
        type: "ok",
        text: `Uploaded ${json.uploaded} video(s)${failedNote}. Redirecting…`,
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
      <h1 className="text-2xl font-bold mb-6">Upload match videos</h1>

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
            {collectorId && sessionsForCollector.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">
                No sessions yet for this collector — create a new one instead.
              </p>
            )}
          </div>
        )}

        {/* Videos + per-file mistake descriptions */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Videos (up to {MAX_FILES}, each under 20MB)
          </label>
          <input
            type="file"
            accept="video/*"
            multiple
            onChange={(e) => onFilesChosen(e.target.files)}
            className="w-full text-sm"
          />
        </div>

        {files.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              {files.length} video(s) selected — add a mistake description for each:
            </p>
            {files.map((f, i) => (
              <div
                key={i}
                className="rounded-lg border border-slate-200 p-3 space-y-2"
              >
                <p className="text-xs text-slate-500 truncate">
                  🎬 {f.name} ({(f.size / 1024 / 1024).toFixed(1)} MB)
                </p>
                <input
                  className={inputCls}
                  placeholder="Mistake description (e.g. wrong offside call)"
                  value={descriptions[i] ?? ""}
                  onChange={(e) => setDescription(i, e.target.value)}
                />
              </div>
            ))}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-slate-900 text-white py-2.5 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading && (
            <span className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          )}
          {loading
            ? "Uploading…"
            : mode === "new"
            ? "Create session & upload"
            : "Upload to session"}
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
