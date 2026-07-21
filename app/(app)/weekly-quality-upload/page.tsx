"use client";

import { useEffect, useState } from "react";

type FileType = "module" | "freeze_frame";

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function sundayOf(d: Date): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() - copy.getDay());
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export default function WeeklyQualityUploadPage() {
  const [week, setWeek] = useState<string>("");
  const [type, setType] = useState<FileType>("module");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    ok?: boolean;
    upserted?: number;
    warnings?: string[];
    error?: string;
  } | null>(null);

  useEffect(() => {
    setWeek(toIsoDate(sundayOf(new Date())));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setResult(null);
    const snapped = toIsoDate(sundayOf(new Date(week)));

    const fd = new FormData();
    fd.append("type", type);
    fd.append("week", snapped);
    fd.append("file", file);

    const res = await fetch("/api/weekly-quality-upload", { method: "POST", body: fd });
    const data = await res.json();
    setResult(data);
    setUploading(false);
    if (data.ok) setFile(null);
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900";

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold">Weekly Quality Score Upload</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Upload the same two files as the monthly Quality Score, but per week
          (Sunday - Saturday). Upload each file separately - Module first, then
          Freeze Frame (or the reverse). Re-uploading the same week overwrites.
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
            <option value="module">Collector Module Score</option>
            <option value="freeze_frame">Freeze Frame Score</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
            Week start (Sunday)
          </label>
          <input
            type="date"
            value={week}
            onChange={(e) => setWeek(e.target.value)}
            className={inputCls}
            required
          />
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            Any date works - it will snap to the Sunday of that week.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
            CSV / TSV file
          </label>
          <input
            type="file"
            accept=".csv,.tsv,.txt"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-slate-600 dark:text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:text-white file:px-4 file:py-2 file:text-sm cursor-pointer"
          />
          {file && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{file.name}</p>
          )}
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
            {type === "module"
              ? "Module file - expected columns: hr_code, module, collector_score. Modules recognized: base, players, formation_tactical, location, impact, extras, squad."
              : "Freeze Frame file - expected columns: collector_hr_code, Avg. ff_score."}
          </p>
        </div>

        <button
          type="submit"
          disabled={!file || uploading}
          className="w-full rounded-lg bg-slate-900 text-white py-2 font-medium disabled:opacity-50"
        >
          {uploading ? "Uploading..." : `Upload ${type === "module" ? "Module" : "Freeze Frame"} for week of ${week}`}
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
                <p className="font-semibold">Uploaded {result.upserted} rows.</p>
                {result.warnings && result.warnings.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-amber-700">
                    {result.warnings.map((w, i) => (
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
    </div>
  );
}
