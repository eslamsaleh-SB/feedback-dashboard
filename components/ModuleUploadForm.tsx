"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Collector = { id: string; name: string };

// Must match the allowlist in /api/modules/upload/route.ts
const MODULES = [
  { value: "players", label: "Players" },
  { value: "event", label: "Event" },
  { value: "formation_tactical", label: "Formation / Tactical" },
  { value: "location", label: "Location" },
  { value: "impact", label: "Impact" },
  { value: "extras", label: "Extras" },
  { value: "freeze_frame", label: "Freeze Frame" },
] as const;

// Target columns the CSV headers get mapped into.
// `collector` and `match_id` + `key` drive how rows are assigned & deduped.
const TARGETS = [
  { field: "match_id", label: "Match ID", required: true },
  { field: "key", label: "Key (dedup)", required: true },
  { field: "collector", label: "Collector", required: false },
  { field: "review_date", label: "Match date", required: false },
  { field: "description", label: "Description", required: false },
  { field: "category", label: "Category", required: false },
  { field: "severity", label: "Severity", required: false },
  { field: "video_timestamp", label: "Video timestamp", required: false },
  { field: "notes", label: "Notes", required: false },
] as const;

type Field = (typeof TARGETS)[number]["field"];

// ---- Tiny dependency-free CSV parser (handles quotes, commas, newlines) ----
function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  // Strip a leading UTF-8 BOM if present.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((v) => v.trim() !== "")) out.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((v) => v.trim() !== "")) out.push(row);
  }

  const headers = (out.shift() ?? []).map((h) => h.trim());
  return { headers, rows: out };
}

// Best-effort auto-mapping based on header names.
function guessMapping(headers: string[]): Record<Field, string> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const find = (...needles: string[]) =>
    headers.find((h) => needles.some((n) => norm(h).includes(n))) ?? "";

  return {
    match_id: find("matchid", "match", "fixture", "game"),
    key: find("key", "uniqueid", "uid", "hash"),
    collector: find("collector", "analyst", "scout", "operator", "reviewer"),
    review_date: find("reviewdate", "matchdate", "date"),
    description: find("description", "mistake", "issue", "desc"),
    category: find("category", "type", "module"),
    severity: find("severity", "priority", "level"),
    video_timestamp: find("timestamp", "time", "clip", "video"),
    notes: find("notes", "comment", "remark"),
  };
}

export default function ModuleUploadForm({
  collectors,
}: {
  collectors: Collector[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [module, setModule] = useState<string>("players");
  // Optional fallback collector — only used for rows that lack one in the CSV.
  const [defaultCollectorId, setDefaultCollectorId] = useState("");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<Field, string>>(
    {} as Record<Field, string>
  );

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null
  );

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3 py-2 bg-white";

  // Known collector names (normalised) for a quick client-side preview check.
  const knownNames = useMemo(() => {
    const s = new Set<string>();
    collectors.forEach((c) =>
      s.add(c.name.trim().toLowerCase().replace(/\s+/g, " "))
    );
    return s;
  }, [collectors]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setMsg(null);
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const { headers, rows } = parseCSV(String(reader.result ?? ""));
      if (headers.length === 0) {
        setMsg({ type: "err", text: "That CSV has no header row." });
        return;
      }
      setHeaders(headers);
      setRows(rows);
      setMapping(guessMapping(headers));
    };
    reader.readAsText(file);
  }

  const preview = useMemo(() => rows.slice(0, 5), [rows]);

  function buildRows() {
    const idx = (field: Field) => headers.indexOf(mapping[field]);
    return rows.map((cells) => {
      const obj: Record<string, string | null> = {};
      for (const t of TARGETS) {
        const i = idx(t.field);
        obj[t.field] = i >= 0 ? cells[i] ?? null : null;
      }
      return obj;
    });
  }

  // How many CSV rows reference a collector name we don't recognise.
  const unknownCollectorCount = useMemo(() => {
    if (!mapping.collector) return 0;
    const i = headers.indexOf(mapping.collector);
    if (i < 0) return 0;
    let n = 0;
    rows.forEach((cells) => {
      const name = String(cells[i] ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
      if (name && !knownNames.has(name)) n++;
    });
    return n;
  }, [mapping.collector, headers, rows, knownNames]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!headers.length)
      return setMsg({ type: "err", text: "Choose a CSV file first." });
    if (!mapping.match_id)
      return setMsg({ type: "err", text: "Map the Match ID column." });
    if (!mapping.key)
      return setMsg({ type: "err", text: "Map the Key column." });
    if (!mapping.collector && !defaultCollectorId)
      return setMsg({
        type: "err",
        text: "Map a Collector column, or pick a default collector for rows without one.",
      });

    setLoading(true);
    try {
      const res = await fetch("/api/modules/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module,
          default_collector_id: defaultCollectorId || null,
          rows: buildRows(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        const unknown =
          json.unknown_collectors?.length
            ? ` Unknown collectors: ${json.unknown_collectors.join(", ")}.`
            : "";
        throw new Error((json.error || "Upload failed") + unknown);
      }

      const bits = [
        `Imported ${json.rows_upserted} row(s) into ${json.module}`,
        `across ${json.matches_upserted} match(es) for ${json.collectors_matched} collector(s)`,
      ];
      if (json.duplicates_collapsed > 0)
        bits.push(`${json.duplicates_collapsed} duplicate key(s) collapsed`);
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
      <p className="text-sm text-slate-500 mb-6">
        Pick the module, then map the CSV columns. Each row is assigned to a
        collector via the mapped <span className="font-medium">Collector</span>{" "}
        column (matched by name), so one CSV can cover all collectors. Rows are
        upserted on their <span className="font-medium">key</span> — re-uploading
        a duplicate key overwrites the existing row instead of creating a copy.
      </p>

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Default collector{" "}
              <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <select
              value={defaultCollectorId}
              onChange={(e) => setDefaultCollectorId(e.target.value)}
              className={inputCls}
            >
              <option value="">None — use the Collector column</option>
              {collectors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-400 mt-1">
              Only applied to rows that have no collector in the CSV.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">CSV file</label>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFile}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-white"
          />
          {fileName && (
            <p className="text-xs text-slate-400 mt-1">
              {fileName} · {rows.length} data row(s) · {headers.length} column(s)
            </p>
          )}
        </div>

        {/* Column mapping — key/collector/date can differ per CSV */}
        {headers.length > 0 && (
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-medium mb-3">
              Map CSV columns → fields
              <span className="text-slate-400 font-normal">
                {" "}
                (collector & key columns differ per CSV, so confirm them here)
              </span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {TARGETS.map((t) => (
                <div key={t.field}>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    {t.label}
                    {t.required && <span className="text-red-500"> *</span>}
                    {t.field === "collector" && (
                      <span className="text-slate-400"> (matched by name)</span>
                    )}
                  </label>
                  <select
                    value={mapping[t.field] ?? ""}
                    onChange={(e) =>
                      setMapping((m) => ({ ...m, [t.field]: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white"
                  >
                    <option value="">— not mapped —</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {mapping.collector && unknownCollectorCount > 0 && (
              <p className="text-xs text-amber-600 mt-3">
                ⚠ {unknownCollectorCount} row(s) reference a collector name that
                doesn’t match any existing collector — those rows will be
                skipped. Add the collectors first, or fix the names.
              </p>
            )}
          </div>
        )}

        {/* Preview */}
        {preview.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  {headers.map((h) => (
                    <th
                      key={h}
                      className="text-left font-medium text-slate-500 px-3 py-2 whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    {headers.map((_, j) => (
                      <td
                        key={j}
                        className="px-3 py-1.5 text-slate-600 whitespace-nowrap"
                      >
                        {r[j]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
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
          {loading ? "Uploading…" : "Upload & upsert"}
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
