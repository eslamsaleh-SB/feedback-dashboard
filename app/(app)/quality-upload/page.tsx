"use client";

import { useState } from "react";

type FileType = "module" | "freeze_frame";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function monthOptions() {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    const label = d.toLocaleString("default", { month: "long", year: "numeric" });
    opts.push({ value: val, label });
  }
  return opts;
}

export default function QualityUploadPage() {
  const [type, setType] = useState<FileType>("module");
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  });
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    ok?: boolean;
    upserted?: number;
    warnings?: string[];
    error?: string;
  } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setResult(null);

    const fd = new FormData();
    fd.append("type", type);
    fd.append("month", month);
    fd.append("file", file);

    const res = await fetch("/api/quality-upload", { method: "POST", body: fd });
    const data = await res.json();
    setResult(data);
    setUploading(false);
    if (data.ok) setFile(null);
  }

  const months = monthOptions();

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold">Quality Score Upload</h1>
        <p className="text-slate-500 mt-1">
          Upload monthly quality score files (Module Score or Freeze Frame Score).
          Re-uploading the same month overwrites previous data.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5"
      >
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            File type
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as FileType)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
          >
            <option value="module">Collector Module Score</option>
            <option value="freeze_frame">Freeze Frame Score</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Month</label>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
          >
            {months.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">CSV file</label>
          <input
            type="file"
            accept=".csv,.tsv,.txt"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:text-white file:px-4 file:py-2 file:text-sm cursor-pointer"
          />
          {file && (
            <p className="text-xs text-slate-400 mt-1">{file.name}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={!file || uploading}
          className="w-full rounded-lg bg-slate-900 text-white py-2 font-medium disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "Upload"}
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
                <p className="font-semibold">
                  Uploaded {result.upserted} rows for{" "}
                  {months.find((m) => m.value === month)?.label}.
                </p>
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
