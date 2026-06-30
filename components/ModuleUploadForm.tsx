"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";

type Collector = { id: string; name: string };

const MODULES = [
  { value: "players", label: "Players" },
  { value: "event", label: "Event" },
  { value: "formation_tactical", label: "Formation / Tactical" },
  { value: "location", label: "Location" },
  { value: "impact", label: "Impact" },
  { value: "extras", label: "Extras" },
  { value: "freeze_frame", label: "Freeze Frame" },
] as const;

// Decode bytes honouring a UTF-16 / UTF-8 BOM.
function decodeBytes(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf);
  let enc = "utf-8";
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) enc = "utf-16le";
  else if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) enc = "utf-16be";
  return new TextDecoder(enc).decode(b);
}

// Turn 2-D rows into objects keyed by the real header row (the row containing
// a "matchid" column), tolerating a junk row above the header.
function toRecords(rows: string[][]): Record<string, string>[] {
  const norm = (c: string) => String(c).trim().toLowerCase().replace(/\s+/g, "");
  const headerIdx = rows.findIndex((r) =>
    r.some((c) => ["matchid", "match_id"].includes(norm(c)))
  );
  if (headerIdx < 0) return [];
  const headers = rows[headerIdx].map((h) => String(h).trim());
  const out: Record<string, string>[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const cells = rows[i];
    if (!cells || cells.every((c) => String(c).trim() === "")) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, j) => {
      if (!h) return;
      if (obj[h] === undefined) obj[h] = String(cells[j] ?? "");
    });
    out.push(obj);
  }
  return out;
}

export default function ModuleUploadForm({
  collectors = [],
}: {
  collectors?: Collector[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [module, setModule] = useState<string>("players");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [records, setRecords] = useState<Record<string, string>[]>([]);
  const [parsing, setParsing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const inputCls = "w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900";

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setMsg(null);
    setHeaders([]);
    setRecords([]);
    if (!file) return;
    setFileName(file.name);
    setParsing(true);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = decodeBytes(reader.result as ArrayBuffer);
        // Auto-detect the delimiter (comma, tab, ;, …). No header so we can
        // locate the real header row ourselves.
        const parsed = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
        const recs = toRecords(parsed.data as string[][]);
        if (recs.length === 0) {
          setMsg({ type: "err", text: "Couldn't find a header row with a 'matchid' column." });
        } else {
          setHeaders(Object.keys(recs[0]));
          setRecords(recs);
        }
      } catch (err: any) {
        setMsg({ type: "err", text: `Could not read file: ${err.message}` });
      } finally {
        setParsing(false);
      }
    };
    reader.onerror = () => {
      setParsing(false);
      setMsg({ type: "err", text: "Could not read that file." });
    };
    reader.readAsArrayBuffer(file);
  }

  const preview = useMemo(() => records.slice(0, 5), [records]);
  const previewCols = useMemo(() => headers.slice(0, 8), [headers]);
  const selected = MODULES.find((m) => m.value === module);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (records.length === 0) return setMsg({ type: "err", text: "Choose a CSV file first." });

    setLoading(true);
    try {
      const res = await fetch("/api/modules/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module, rows: records }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed");

      const bits = [
        `${json.parts_upserted} match-part total(s) saved for ${json.module}`,
        `${json.mistakes_total} mistakes`,
        `${json.collectors_touched} collector(s)`,
      ];
      if (json.skipped > 0) bits.push(`${json.skipped} row(s) skipped`);
      setMsg({ type: "ok", text: bits.join(", ") + ". Redirecting…" });
      setTimeout(() => router.push("/analytics"), 1600);
    } catch (err: any) {
      setMsg({ type: "err", text: err.message });
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold mb-2">Upload module data (CSV)</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        Pick the module and choose its CSV file. Comma or tab delimiters and
        UTF-8/UTF-16 are detected automatically — upload Tableau exports
        directly. Each row is linked to a collector by{" "}
        <span className="font-medium">HR code</span> and to a match part by{" "}
        <span className="font-medium">matchid + partid</span>; totals upsert per
        part, so re-uploading replaces cleanly (no duplicates).
      </p>

      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-5"
      >
        <div>
          <label className="block text-sm font-medium mb-1">Module</label>
          <select
            value={module}
            onChange={(e) => setModule(e.target.value)}
            className={inputCls}
          >
            {MODULES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            Expected columns: <span className="font-mono">matchid, partid,
            collector (HR code), review_date</span> and either{" "}
            <span className="font-mono">total_mistakes</span> (pre-aggregated) or
            one row per mistake (counted automatically).
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">CSV file</label>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFile}
            className="block w-full text-sm text-slate-600 dark:text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-white"
          />
          {fileName && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              {fileName}
              {parsing
                ? " · parsing…"
                : records.length > 0
                ? ` · ${records.length} row(s) · ${headers.length} column(s)`
                : ""}
            </p>
          )}
          <p className="text-xs text-amber-600 mt-1">
            Keep files under ~4 MB (Vercel request limit). Aggregated exports are
            tiny; split larger raw files.
          </p>
        </div>

        {preview.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  {previewCols.map((h) => (
                    <th
                      key={h}
                      className="text-left font-medium text-slate-500 dark:text-slate-400 px-3 py-2 whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                  {headers.length > previewCols.length && (
                    <th className="px-3 py-2 text-slate-400 dark:text-slate-500">
                      +{headers.length - previewCols.length} more
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                    {previewCols.map((h) => (
                      <td
                        key={h}
                        className="px-3 py-1.5 text-slate-600 dark:text-slate-300 whitespace-nowrap max-w-[180px] truncate"
                      >
                        {r[h]}
                      </td>
                    ))}
                    {headers.length > previewCols.length && (
                      <td className="px-3 py-1.5 text-slate-300 dark:text-slate-600">…</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || parsing || records.length === 0}
          className="w-full rounded-lg bg-slate-900 text-white py-2.5 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading && (
            <span className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          )}
          {loading ? "Uploading…" : "Upload & save totals"}
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
