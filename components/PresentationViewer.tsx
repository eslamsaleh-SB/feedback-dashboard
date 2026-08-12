"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type Page = {
  header: string;
  description: string | null;
  video_link: string | null;
  drive_file_id: string | null;
  // v59: per-slide countdown in seconds. Null = no timer for this slide.
  duration_seconds?: number | null;
  // v59: video length in seconds — used to reload the Drive iframe to
  // simulate a loop.
  video_seconds?: number | null;
};

// v59: Presentation viewer with a per-slide timer + auto-loop workaround.
//
// - Timer starts on the first "Play video" click. It ticks 1s / real second
//   even while the video itself is paused, matching the requested behavior.
// - When the timer reaches 0 a "Time's up" overlay appears.
// - Loop: Google Drive's `/preview` iframe can't be JS-controlled cross-origin,
//   so the viewer offers a manual "Restart video" button that reloads the
//   iframe with autoplay=1. Every 60s while the timer is running, the iframe
//   is also refreshed automatically so the clip loops without user action.
// - Switching slides resets the timer for that slide.

export default function PresentationViewer({
  title,
  description,
  pages,
  backHref = "/my-presentations",
  backLabel = "Back to My Presentations",
}: {
  title: string;
  description: string | null;
  pages: Page[];
  backHref?: string;
  backLabel?: string;
}) {
  const [idx, setIdx] = useState(0);
  const total = pages.length;
  const page: Page | undefined = pages[idx];

  const duration =
    page && page.duration_seconds && page.duration_seconds > 0
      ? Math.floor(page.duration_seconds)
      : null;

  // Timer state per-slide. `startedAt` null = timer hasn't been started yet.
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  const [iframeNonce, setIframeNonce] = useState(0);
  // v59: try native <video loop> first (real seamless loop), fall back to
  // Drive iframe if the direct URL is blocked / not a playable file.
  const [videoMode, setVideoMode] = useState<"native" | "iframe">("native");
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Reset when the slide changes.
  useEffect(() => {
    setStartedAt(null);
    setIframeNonce(0);
    setVideoMode("native");
  }, [idx]);

  // Ticker while the timer is running.
  useEffect(() => {
    if (startedAt == null) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [startedAt]);

  // Auto-refresh the iframe every N seconds while running so the clip loops.
  // N = the admin-set video length (Video length field). Fallback: 60s.
  const loopRef = useRef<number | null>(null);
  const loopSeconds =
    page && page.video_seconds && page.video_seconds > 0
      ? Math.floor(page.video_seconds)
      : 60;
  useEffect(() => {
    if (startedAt == null) return;
    loopRef.current = window.setInterval(() => {
      setIframeNonce((n) => n + 1);
    }, loopSeconds * 1000);
    return () => {
      if (loopRef.current != null) window.clearInterval(loopRef.current);
      loopRef.current = null;
    };
  }, [startedAt, loopSeconds]);

  const elapsed = startedAt == null ? 0 : Math.floor((now - startedAt) / 1000);
  const remaining =
    duration != null ? Math.max(0, duration - elapsed) : null;
  const expired = duration != null && remaining === 0 && startedAt != null;

  const mmss = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const iframeSrc = useMemo(() => {
    if (!page?.drive_file_id) return null;
    const autoplay = startedAt != null ? "1" : "0";
    // nonce forces the iframe to reload (loop) on interval.
    return `https://drive.google.com/file/d/${page.drive_file_id}/preview?autoplay=${autoplay}&t=${iframeNonce}`;
  }, [page?.drive_file_id, startedAt, iframeNonce]);

  if (total === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-slate-500 dark:text-slate-400">This presentation has no pages.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link
            href={backHref}
            className="text-xs text-slate-500 dark:text-slate-400 hover:underline"
          >
            &larr; {backLabel}
          </Link>
          <h1 className="text-2xl font-bold mt-1">{title}</h1>
          {description && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{description}</p>
          )}
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Page {idx + 1} of {total}
        </span>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <h2 className="text-xl font-semibold">{page!.header}</h2>
          {duration != null && (
            <div className={`rounded-lg px-3 py-1.5 text-sm font-mono tabular-nums border ${
              expired
                ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900"
                : startedAt != null
                ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900"
                : "bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-700"
            }`}>
              {startedAt == null
                ? `Timer: ${mmss(duration)}`
                : expired
                ? "Time's up"
                : mmss(remaining ?? 0)}
            </div>
          )}
        </div>

        {page!.description && (
          <p className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
            {page!.description}
          </p>
        )}

        {page!.drive_file_id ? (
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 relative bg-black">
            {videoMode === "native" ? (
              <video
                ref={videoRef}
                key={`native-${iframeNonce}`}
                src={`https://drive.google.com/uc?export=download&id=${page!.drive_file_id}`}
                className="w-full block bg-black"
                style={{ height: "480px" }}
                loop
                autoPlay={startedAt != null}
                muted
                playsInline
                controls
                onError={() => setVideoMode("iframe")}
              />
            ) : (
              <iframe
                key={`iframe-${iframeNonce}`}
                src={iframeSrc ?? ""}
                className="w-full"
                style={{ height: "480px" }}
                allow="autoplay; fullscreen"
                allowFullScreen
              />
            )}
            {expired && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-white">
                <div className="text-center space-y-3">
                  <p className="text-2xl font-bold">Time's up</p>
                  <p className="text-sm text-slate-200">
                    The timer for this slide has finished.
                  </p>
                  <button
                    type="button"
                    onClick={() => { setStartedAt(Date.now()); setIframeNonce((n) => n + 1); }}
                    className="rounded-lg bg-white text-slate-900 px-4 py-2 text-sm font-medium"
                  >
                    Restart timer
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : page!.video_link ? (
          <a
            href={page!.video_link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 underline"
          >
            {page!.video_link}
          </a>
        ) : null}

        {page!.drive_file_id && (
          <div className="flex flex-wrap gap-2 items-center text-sm">
            {startedAt == null ? (
              <button
                type="button"
                onClick={() => {
                  setStartedAt(Date.now());
                  setNow(Date.now());
                  setIframeNonce((n) => n + 1);
                  // For native mode, trigger play imperatively (user gesture
                  // satisfies autoplay policy). Muted so browsers allow it.
                  setTimeout(() => {
                    const v = videoRef.current;
                    if (v) { v.muted = true; v.play().catch(() => {}); }
                  }, 50);
                }}
                className="rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-4 py-2 font-medium"
              >
                ▶ Play video {duration != null ? `(start timer)` : ""}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIframeNonce((n) => n + 1)}
                className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2"
              >
                ↻ Restart / loop video
              </button>
            )}
            {startedAt != null && duration != null && !expired && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Timer keeps running even if the video is paused.
              </span>
            )}
            {duration == null && (
              <span className="text-xs text-slate-400 dark:text-slate-500">
                No timer set for this slide.
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
          disabled={idx === 0}
          className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
        >
          Previous
        </button>

        <div className="flex flex-wrap gap-1 justify-center max-w-md">
          {pages.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIdx(i)}
              className={`w-8 h-8 text-xs font-medium rounded ${
                i === idx
                  ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
                  : "border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}
          disabled={idx === total - 1}
          className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
