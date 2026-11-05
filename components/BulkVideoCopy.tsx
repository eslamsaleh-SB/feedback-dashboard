"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchCopiedIds, uploadVideoCopy, useMyEmail } from "@/components/VideoCopyControl";
import { GOOGLE_CLIENT_ID, fetchDriveFile, getDriveToken } from "@/lib/googleDrive";
import { MAX_UPLOAD_BYTES, compressVideo } from "@/lib/compressVideo";

type Slide = { index: number; header: string; driveId: string };

// Admin-only: copy every Drive video of the open presentation into the
// dashboard's storage in one click (Drive -> browser -> Supabase, using the
// Admin's own Hudl Google account), so collectors can watch without Drive access.
export default function BulkVideoCopy({
  slides,
  onDone,
  itemLabel = "Page",
}: {
  slides: Slide[];
  onDone?: () => void;
  /** "Page" for presentations, "Question" for quizzes. */
  itemLabel?: string;
}) {
  const myEmail = useMyEmail();
  const [copied, setCopied] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [running, setRunning] = useState(false);
  const [auto, setAuto] = useState<{ done: number; total: number; current: string } | null>(null);
  const [step, setStep] = useState<string>("");
  const [errors, setErrors] = useState<string[]>([]);

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
  const missingUnique = missing.filter((s, i) => missing.findIndex((x) => x.driveId === s.driveId) === i);

  async function copyAll() {
    if (missingUnique.length === 0) return;
    setErrors([]);
    setRunning(true);
    try {
      const token = await getDriveToken(myEmail);
      const errs: string[] = [];
      for (let i = 0; i < missingUnique.length; i++) {
        const s = missingUnique[i];
        const label = `${itemLabel} ${s.index + 1}${s.header ? ` (${s.header})` : ""}`;
        setAuto({ done: i, total: missingUnique.length, current: label });
        try {
          setStep("downloading from Drive…");
          let file = await fetchDriveFile(s.driveId, token);
          if (file.size > MAX_UPLOAD_BYTES) {
            const mbIn = (file.size / 1048576).toFixed(0);
            setStep(`compressing ${mbIn} MB… 0%`);
            file = await compressVideo(file, MAX_UPLOAD_BYTES, (p) =>
              setStep(`compressing ${mbIn} MB… ${Math.round(p * 100)}%`)
            );
          }
          setStep("uploading…");
          await uploadVideoCopy(s.driveId, file);
          setCopied((prev) => new Set(prev).add(s.driveId));
        } catch (e: any) {
          errs.push(`${label}: ${e?.message ?? "failed"}`);
        }
      }
      setErrors(errs);
    } catch (e: any) {
      setErrors([e?.message ?? "Google sign-in failed"]);
    } finally {
      setRunning(false);
      setAuto(null);
      setStep("");
      await refresh();
      onDone?.();
    }
  }

  if (slides.length === 0) return null;
  const visibleCount = slides.length - missing.length;

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

      {loaded && missing.length > 0 && GOOGLE_CLIENT_ID && (
        <div className="space-y-1">
          <button
            type="button"
            onClick={copyAll}
            disabled={running}
            className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            {running && auto
              ? `Copying ${auto.done + 1} of ${auto.total}…`
              : `Copy all ${missingUnique.length} video(s) from Drive automatically`}
          </button>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Sign in with your Hudl Google account once; videos go straight from Drive to the dashboard, nothing is downloaded.
            {" "}Videos over 50 MB are compressed automatically first (keep this tab open).
            {running && auto?.current ? ` Now: ${auto.current} - ${step}` : ""}
          </p>
        </div>
      )}

      {errors.length > 0 && (
        <ul className="text-xs text-red-600 space-y-0.5">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
