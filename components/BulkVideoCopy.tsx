"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  driveDownloadUrl,
  fetchCopiedIds,
  uploadVideoCopy,
  useMyEmail,
} from "@/components/VideoCopyControl";

type Slide = { index: number; header: string; driveId: string };
type Row = { file: File; slideIdx: number | null; status: "ready" | "uploading" | "done" | "error"; err?: string };

const norm = (s: string) =>
  s.toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9؀-ۿ]+/g, " ").trim();

// Admin: copy ALL Drive videos of the open presentation in one go.
//  - "Download next" opens each missing video from Drive (one click each, so the
//    browser doesn't block pop-ups).
//  - "Choose downloaded files" takes many files at once, auto-matches each file to
//    a slide (by name, otherwise by order), lets you fix the match, then uploads all.
export default function BulkVideoCopy({
  slides,
  onDone,
}: {
  slides: Slide[];
  onDone?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const myEmail = useMyEmail();
  const [copied, setCopied] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [nextDl, setNextDl] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);

  const ids = useMemo(() => Array.from(new Set(slides.map((s) => s.driveId))), [slides]);
  const idsKey = ids.join(",");

  async function refresh() {
    const c = await fetchCopiedIds(ids).catch(() => []);
    setCopied(new Set(c));
    setLoaded(true);
  }
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const missing = slides.filter((s) => !copied.has(s.driveId));

  function downloadNext() {
    const s = missing[nextDl];
    if (!s) return;
    window.open(driveDownloadUrl(s.driveId, myEmail), "_blank", "noopener");
    setNextDl((n) => n + 1);
  }

  function pickFiles(files: FileList) {
    const list = Array.from(files).sort((a, b) => a.name.localeCompare(b.name));
    const targets = missing.length > 0 ? missing : slides;
    const used = new Set<number>();
    const assigned: (number | null)[] = list.map((f) => {
      const n = norm(f.name);
      const hit = targets.find(
        (s) => !used.has(s.index) && s.header && (n.includes(norm(s.header)) || norm(s.header).includes(n))
      );
      if (hit) {
        used.add(hit.index);
        return hit.index;
      }
      return null;
    });
    // Unmatched files take the remaining slides in order.
    const free = targets.filter((s) => !used.has(s.index));
    let k = 0;
    const final = assigned.map((a) => (a != null ? a : free[k] ? free[k++].index : null));
    setRows(list.map((file, i) => ({ file, slideIdx: final[i], status: "ready" })));
  }

  async function uploadAll() {
    setRunning(true);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const slide = slides.find((s) => s.index === r.slideIdx);
      if (!slide || r.status === "done") continue;
      setRows((p) => p.map((x, j) => (j === i ? { ...x, status: "uploading" } : x)));
      try {
        await uploadVideoCopy(slide.driveId, r.file);
        setRows((p) => p.map((x, j) => (j === i ? { ...x, status: "done" } : x)));
      } catch (e: any) {
        setRows((p) => p.map((x, j) => (j === i ? { ...x, status: "error", err: e?.message } : x)));
      }
    }
    setRunning(false);
    await refresh();
    onDone?.();
  }

  if (slides.length === 0) return null;

  const btn =
    "rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50";
  const visibleCount = slides.length - missing.length;
  const tooBig = (f: File) => f.size > 50 * 1024 * 1024;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Videos for collectors
        </h2>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            loaded && missing.length === 0
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
              : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
          }`}
        >
          {loaded ? `${visibleCount} of ${slides.length} visible to everyone` : "Checking..."}
        </span>
      </div>

      {loaded && missing.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={downloadNext} disabled={nextDl >= missing.length} className={btn}>
              {nextDl >= missing.length
                ? "All downloads opened"
                : `1. Download from Drive (${nextDl + 1} of ${missing.length})`}
            </button>
            <button type="button" onClick={() => inputRef.current?.click()} disabled={running} className={btn}>
              2. Choose downloaded files
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="video/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) pickFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Click "Download" once per video (it opens the next one each time), then pick all the downloaded files together.
          </p>
        </>
      )}

      {rows.length > 0 && (
        <div className="space-y-2">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 dark:text-slate-400">
                <th className="py-1 pr-3">File</th>
                <th className="py-1 pr-3">Goes to slide</th>
                <th className="py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-1.5 pr-3 truncate max-w-[260px]" title={r.file.name}>
                    {r.file.name}
                    <span className="text-xs text-slate-400"> · {(r.file.size / 1048576).toFixed(1)} MB</span>
                  </td>
                  <td className="py-1.5 pr-3">
                    <select
                      value={r.slideIdx ?? ""}
                      disabled={running || r.status === "done"}
                      onChange={(e) =>
                        setRows((p) =>
                          p.map((x, j) =>
                            j === i ? { ...x, slideIdx: e.target.value === "" ? null : Number(e.target.value) } : x
                          )
                        )
                      }
                      className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
                    >
                      <option value="">-- skip --</option>
                      {slides.map((s) => (
                        <option key={s.index} value={s.index}>
                          Page {s.index + 1}: {s.header || "(no header)"}
                          {copied.has(s.driveId) ? " ✓" : ""}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5 text-xs">
                    {tooBig(r.file) && r.status === "ready" ? (
                      <span className="text-red-600">Over 50 MB</span>
                    ) : r.status === "ready" ? (
                      <span className="text-slate-400">Ready</span>
                    ) : r.status === "uploading" ? (
                      <span className="text-sky-600">Uploading...</span>
                    ) : r.status === "done" ? (
                      <span className="text-emerald-600">Done</span>
                    ) : (
                      <span className="text-red-600" title={r.err}>Failed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={uploadAll}
              disabled={running || rows.every((r) => r.slideIdx == null || r.status === "done")}
              className="rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {running ? "Uploading..." : "Upload all"}
            </button>
            <button type="button" onClick={() => setRows([])} disabled={running} className={btn}>
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
