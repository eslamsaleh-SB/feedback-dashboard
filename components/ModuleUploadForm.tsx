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
  // v59: Pressure module now accepted by the upload API too.
  { value: "pressure", label: "Pressure" },
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
    r.some((c) => ["matchid", "match_id", "match_id_global"].includes(norm(c)))
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

// "key (reviewed_matches)" -> "key", "match_id_global" -> "match_id", ...
const canon = (h: string) =>
  h.trim().toLowerCase().replace(/\s*\(.*?\)\s*/g, "").replace(/_global$/, "").replace(/\s+/g, "_");

type DetailInfo = { rawRows: number; duplicates: number; noKey: number; module: string | null };

// Tableau "details" export = one row per mistake with a unique `key`.
// Collapse it in the browser to one total per match part, dropping duplicate
// keys, so even 50+ MB files upload (the server only receives the totals).
function aggregateDetails(
  recs: Record<string, string>[]
): { rows: Record<string, string>[]; info: DetailInfo } | null {
  if (recs.length === 0) return null;
  const col: Record<string, string> = {};
  for (const h of Object.keys(recs[0])) {
    const c = canon(h);
    if (!(c in col)) col[c] = h;
  }
  const keyCol = col["key"];
  const matchCol = col["match_id"] ?? col["matchid"];
  const partCol = col["part_id"] ?? col["partid"];
  const hrCol = col["hc_hr_code"] ?? col["collector_hr_code"] ?? col["hr_code"] ?? col["collector"];
  const dateCol = col["review_date"];
  if (!keyCol || !matchCol || !partCol) return null;

  const seen = new Set<string>();
  const parts = new Map<string, { matchid: string; partid: string; collector: string; review_date: string; n: number }>();
  const modules = new Set<string>();
  let duplicates = 0;
  let noKey = 0;
  for (const r of recs) {
    const key = (r[keyCol] ?? "").trim();
    if (!key) noKey++;
    else if (seen.has(key)) { duplicates++; continue; }
    else seen.add(key);
    const matchid = (r[matchCol] ?? "").trim();
    const partid = (r[partCol] ?? "").trim();
    if (!matchid || !partid) continue;
    if (col["module"] && r[col["module"]]) modules.add(r[col["module"]].trim().toLowerCase());
    const k = `${matchid}|${partid}`;
    const date = dateCol ? (r[dateCol] ?? "").trim() : "";
    const hr = hrCol ? (r[hrCol] ?? "").trim() : "";
    const cur = parts.get(k);
    if (cur) {
      cur.n++;
      if (!cur.collector && hr) cur.collector = hr;
      if (date && date > cur.review_date) cur.review_date = date;
    } else {
      parts.set(k, { matchid, partid, collector: hr, review_date: date, n: 1 });
    }
  }
  const rows = Array.from(parts.values()).map((p) => ({
    matchid: p.matchid,
    partid: p.partid,
    collector: p.collector,
    review_date: p.review_date,
    total_mistakes: String(p.n),
  }));
  return {
    rows,
    info: {
      rawRows: recs.length,
      duplicates,
      noKey,
      module: modules.size === 1 ? Array.from(modules)[0] : null,
    },
  };
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
  const [detail, setDetail] = useState<DetailInfo | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const inputCls = "w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900";

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setMsg(null);
    setHeaders([]);
    setRecords([]);
    setDetail(null);
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
          const agg = aggregateDetails(recs);
          if (agg) {
            setDetail(agg.info);
            if (agg.info.module && MODULES.some((m) => m.value === agg.info.module)) {
              setModule(agg.info.module);
            }
            setHeaders(Object.keys(agg.rows[0] ?? {}));
            setRecords(agg.rows);
          } else {
            setHeaders(Object.keys(recs[0]));
            setRecords(recs);
          }
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
      // Pre-aggregated totals are sent in batches to stay under Vercel's
      // ~4.5 MB request limit. Raw per-mistake files must go in one request
      // (the server counts them), so those still need to be small.
      const BATCH = detail ? 5000 : records.length;
      let parts = 0, mistakes = 0, skipped = 0;
      let touched = 0;
      for (let i = 0; i < records.length; i += BATCH) {
        if (records.length > BATCH) {
          setProgress(`Saving ${Math.min(i + BATCH, records.length).toLocaleString()} of ${records.length.toLocaleString()}…`);
        }
        const res = await fetch("/api/modules/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ module, rows: records.slice(i, i + BATCH) }),
        });
        const json = await res.json().catch(() => ({ error: `Server error (${res.status})` }));
        if (!res.ok) {
          throw new Error(
            (json.error || "Upload failed") +
              (i > 0 ? ` (first ${i.toLocaleString()} parts were saved)` : "")
          );
        }
        parts += json.parts_upserted ?? 0;
        mistakes += json.mistakes_total ?? 0;
        skipped += json.skipped ?? 0;
        touched = Math.max(touched, json.collectors_touched ?? 0);
      }
      setProgress(null);
      const hrSet = new Set(records.map((r) => r.collector || r.hr_code).filter(Boolean));

      const bits = [
        `${parts.toLocaleString()} match-part total(s) saved for ${module}`,
        `${mistakes.toLocaleString()} mistakes`,
        `${(detail ? hrSet.size : touched).toLocaleString()} collector(s)`,
      ];
      if (detail?.duplicates) bits.push(`${detail.duplicates.toLocaleString()} duplicate key(s) ignored`);
      if (skipped > 0) bits.push(`${skipped} row(s) skipped`);
      setMsg({ type: "ok", text: bits.join(", ") + ". Redirecting…" });
      setTimeout(() => router.push("/analytics"), 1600);
    } catch (err: any) {
      setProgress(null);
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
            one row per mistake (counted automatically). Tableau
            &quot;details&quot; exports with a <span className="font-mono">key</span> column
            are counted in the browser, duplicate keys are dropped, and the
            module is picked from <span className="font-mono">module_global</span>.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">CSV file</label>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,.txt,text/csv"
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
          {detail && (
            <p className="text-xs text-emerald-600 mt-1">
              Details file: {detail.rawRows.toLocaleString()} mistake rows →{" "}
              {records.length.toLocaleString()} match parts
              {detail.duplicates > 0 && ` · ${detail.duplicates.toLocaleString()} duplicate key(s) removed`}
              {detail.noKey > 0 && ` · ${detail.noKey.toLocaleString()} row(s) without a key`}
              {detail.module && ` · module: ${detail.module}`}
            </p>
          )}
          {!detail && (
            <p className="text-xs text-amber-600 mt-1">
              Files without a key column must stay under ~4 MB (Vercel request
              limit). Details exports with a key column can be any size.
            </p>
          )}
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
          {loading ? progress ?? "Uploading…" : "Upload & save totals"}
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
