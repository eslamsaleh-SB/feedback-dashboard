"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Combobox, { type ComboOption } from "@/components/Combobox";
import AssignmentPicker, { type CollectorOpt } from "@/components/AssignmentPicker";

type Collector = { id: string; name: string; hr_code: string | null; team?: string | null };
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
  const [collectorId, setCollectorId] = useState("");   // for existing-session mode
  const [folderUrl, setFolderUrl] = useState("");

  // new-session fields
  const [matchId, setMatchId] = useState("");
  const [reviewDate, setReviewDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [overallNotes, setOverallNotes] = useState("");

  // multi-target assignment (new-session mode only)
  const [assigned, setAssigned] = useState<Set<string>>(new Set());
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  // existing-session field
  const [sessionId, setSessionId] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const sessionsForCollector = useMemo(
    () => existingSessions.filter((s) => s.collector_id === collectorId),
    [existingSessions, collectorId]
  );

  const collectorOptions: ComboOption[] = collectors.map((c) => ({
    value: c.id,
    label: c.hr_code
      ? c.name && c.name !== c.hr_code
        ? `${c.hr_code} - ${c.name}`
        : c.hr_code
      : c.name,
  }));
  const sessionOptions: ComboOption[] = sessionsForCollector.map((s) => ({
    value: s.id,
    label: `${s.match_name}${s.review_date ? ` - ${s.review_date}` : ""}`,
  }));

  // Map for hr_code -> collector.id (needed to iterate the assigned set).
  const idByHr = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of collectors) if (c.hr_code) m.set(c.hr_code, c.id);
    return m;
  }, [collectors]);

  // AssignmentPicker expects CollectorOpt with hr_code + name + team.
  const pickerCollectors: CollectorOpt[] = useMemo(
    () =>
      collectors
        .filter((c) => c.hr_code)
        .map((c) => ({
          hr_code: c.hr_code as string,
          name: c.name || (c.hr_code as string),
          team: (c.team ?? null) as string | null,
        })),
    [collectors]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (mode === "existing") {
      if (!collectorId) return setMsg({ type: "err", text: "Pick a collector." });
      if (!sessionId) return setMsg({ type: "err", text: "Pick an existing match session." });
      if (!folderUrl.trim())
        return setMsg({ type: "err", text: "Paste the Google Drive folder link." });

      setLoading(true);
      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "existing",
            match_session_id: sessionId,
            folder_url: folderUrl.trim(),
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Import failed");
        setMsg({ type: "ok", text: `Imported ${json.imported ?? 0} video(s). Redirecting...` });
        setTimeout(() => router.push("/dashboard"), 1100);
      } catch (err: any) {
        setMsg({ type: "err", text: err.message });
        setLoading(false);
      }
      return;
    }

    // new-session mode: assign to the union of All/Teams/Individuals from the picker.
    if (assigned.size === 0)
      return setMsg({ type: "err", text: "Pick at least one collector via the picker." });
    if (!matchId.trim()) return setMsg({ type: "err", text: "Enter a Match ID." });
    if (!folderUrl.trim())
      return setMsg({ type: "err", text: "Paste the Google Drive folder link." });

    const targets = Array.from(assigned)
      .map((hr) => ({ hr, id: idByHr.get(hr) }))
      .filter((t): t is { hr: string; id: string } => !!t.id);
    if (targets.length === 0)
      return setMsg({ type: "err", text: "No matching collector records for the selected hr_codes." });

    setLoading(true);
    setBulkProgress({ done: 0, total: targets.length });
    let ok = 0;
    let failed = 0;
    const errors: string[] = [];
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "new",
            folder_url: folderUrl.trim(),
            collector_id: t.id,
            match_name: matchId,
            review_date: reviewDate,
            overall_notes: overallNotes,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "failed");
        ok++;
      } catch (err: any) {
        failed++;
        errors.push(`${t.hr}: ${err?.message ?? "failed"}`);
      }
      setBulkProgress({ done: i + 1, total: targets.length });
    }
    setBulkProgress(null);
    if (failed === 0) {
      setMsg({ type: "ok", text: `Sent to ${ok} collectors. Redirecting...` });
      setTimeout(() => router.push("/dashboard"), 1500);
    } else {
      setMsg({
        type: "err",
        text: `Sent to ${ok} collectors, ${failed} failed. First error: ${errors[0]}`,
      });
      setLoading(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900";

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">Report</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        Upload the videos to a Google Drive folder, set the folder sharing to{" "}
        <span className="font-medium">"Anyone with the link"</span>, then paste the
        folder link below - we will pull in every video automatically.
      </p>

      <div className="inline-flex rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-1 mb-6">
        {(["new", "existing"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              mode === m ? "bg-slate-900 text-white" : "text-slate-600 dark:text-slate-300"
            }`}
          >
            {m === "new" ? "Create new match session" : "Add to existing session"}
          </button>
        ))}
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-5"
      >
        {mode === "existing" ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-5">
            <div>
              <label className="block text-sm font-medium mb-1">Collector</label>
              <Combobox
                options={collectorOptions}
                value={collectorId}
                onChange={(v) => { setCollectorId(v); setSessionId(""); }}
                placeholder="Select a collector (code)..."
                searchPlaceholder="Search by code or name..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Existing match session</label>
              <Combobox
                options={sessionOptions}
                value={sessionId}
                onChange={setSessionId}
                disabled={!collectorId}
                placeholder={collectorId ? "Select a match..." : "Pick a collector first"}
                searchPlaceholder="Search matches..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Google Drive folder link</label>
              <input
                className={inputCls}
                placeholder="https://drive.google.com/drive/folders/..."
                value={folderUrl}
                onChange={(e) => setFolderUrl(e.target.value)}
                required
              />
            </div>
          </div>
        ) : (
          <>
            <AssignmentPicker
              collectors={pickerCollectors}
              value={assigned}
              onChange={setAssigned}
              title="Assign report to collectors"
            />
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium mb-1">Match ID</label>
                <input
                  className={inputCls}
                  placeholder="e.g. 2453817"
                  value={matchId}
                  onChange={(e) => setMatchId(e.target.value)}
                  required
                />
              </div>
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
                <label className="block text-sm font-medium mb-1">Overall notes</label>
                <textarea
                  className={inputCls}
                  rows={3}
                  value={overallNotes}
                  onChange={(e) => setOverallNotes(e.target.value)}
                  placeholder="Summary feedback for the whole match..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Google Drive folder link</label>
                <input
                  className={inputCls}
                  placeholder="https://drive.google.com/drive/folders/..."
                  value={folderUrl}
                  onChange={(e) => setFolderUrl(e.target.value)}
                  required
                />
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  The folder must be shared as "Anyone with the link".
                </p>
              </div>
            </div>
          </>
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
            ? bulkProgress
              ? `Sending... (${bulkProgress.done}/${bulkProgress.total})`
              : "Importing..."
            : mode === "existing"
            ? "Import videos to session"
            : `Send report to ${assigned.size} collector${assigned.size === 1 ? "" : "s"}`}
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
