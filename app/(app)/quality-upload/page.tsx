"use client";

import { useMemo, useState } from "react";

type FileType = "module" | "freeze_frame";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function QualityUploadPage() {
  const now = new Date();
  const [type, setType] = useState<FileType>("module");
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1); // 1-12
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    ok?: boolean;
    upserted?: number;
    warnings?: string[];
    error?: string;
  } | null>(null);

  // Year list: this year + 4 previous, plus next year so admins can prep.
  const years = useMemo(() => {
    const y = now.getFullYear();
    const list: number[] = [];
    for (let i = y + 1; i >= y - 4; i--) list.push(i);
    return list;
  }, []);

  const monthValue = `${year}-${pad(month)}`;
  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setResult(null);

    const fd = new FormData();
    fd.append("type", type);
    fd.append("month", monthValue);
    fd.append("file", file);

    const res = await fetch("/api/quality-upload", { method: "POST", body: fd });
    const data = await res.json();
    setResult(data);
    setUploading(false);
    if (data.ok) setFile(null);
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3 py-2 bg-white";

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
            className={inputCls}
          >
            <option value="module">Collector Module Score</option>
            <option value="freeze_frame">Freeze Frame Score</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Year
            </label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className={inputCls}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Month
            </label>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className={inputCls}
            >
              {MONTH_NAMES.map((name, idx) => (
                <option key={name} value={idx + 1}>
                  {name}
                </option>
              ))}
            </select>
          </div>
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
          {uploading ? "Uploading..." : `Upload for ${monthLabel}`}
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
                  Uploaded {result.upserted} rows for {monthLabel}.
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
