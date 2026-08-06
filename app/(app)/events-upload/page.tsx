"use client";

import { useState } from "react";
import UploadDeleteWidget from "@/components/UploadDeleteWidget";

// v59: upload page for the two Google-Sheet tabs. Admin-only; the API
// route enforces role. Wipes are available via UploadDeleteWidget below
// (target = base_events / extras_events).

type FileType = "base" | "extras";

export default function EventsUploadPage() {
  const [type, setType] = useState<FileType>("base");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    ok?: boolean;
    inserted?: number;
    skipped?: string[];
    error?: string;
  } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setResult(null);
    const fd = new FormData();
    fd.append("type", type);
    fd.append("file", file);
    const res = await fetch("/api/events-upload", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    setResult(data);
    setUploading(false);
    if (data.ok) setFile(null);
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900";

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Event Details Upload</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Upload per-event mistake rows from the Google Sheet. Pick Base or
          Extras — each has its own schema.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-5"
      >
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
            File type
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as FileType)}
            className={inputCls}
          >
            <option value="base">Base Final (Code / Error Type / Collector Event / Reviewer Event)</option>
            <option value="extras">Extras Final (Extra Field / Changed From/To)</option>
          </select>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            {type === "base"
              ? "Expected columns: Review Date, Match ID, Part ID, Code, Error Type, Event Name, Collector Event, Reviewer Event, Total Count."
              : "Expected columns: Review Date, Match ID, Reviewer/Collector, Part ID, Event Name, Extra Field, Changed From, Changed To, Total Count."}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">CSV / TSV file</label>
          <input
            type="file"
            accept=".csv,.tsv,.txt"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-slate-600 dark:text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:text-white file:px-4 file:py-2 file:text-sm cursor-pointer"
          />
          {file && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{file.name}</p>}
        </div>

        <button
          type="submit"
          disabled={!file || uploading}
          className="w-full rounded-lg bg-slate-900 text-white py-2 font-medium disabled:opacity-50"
        >
          {uploading ? "Uploading..." : `Upload ${type === "base" ? "Base" : "Extras"} events`}
        </button>

        {result && (
          <div
            className={`rounded-lg p-4 text-sm ${
              result.ok
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-700"
            }`}
          >
            {result.ok ? (
              <>
                <p className="font-semibold">Inserted {result.inserted} rows.</p>
                {result.skipped && result.skipped.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-amber-700">
                    {result.skipped.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p>{result.error}</p>
            )}
          </div>
        )}
      </form>

      <UploadDeleteWidget target="base_events" title="Base Events" />
      <UploadDeleteWidget target="extras_events" title="Extras Events" />
    </div>
  );
}
