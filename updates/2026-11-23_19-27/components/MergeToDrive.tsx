"use client";

import { useState } from "react";
import { useMyEmail } from "@/components/VideoCopyControl";
import {
  GOOGLE_CLIENT_ID,
  fetchDriveFile,
  findOrCreateFolder,
  getDriveToken,
  uploadToDriveFolder,
} from "@/lib/googleDrive";
import { mergeVideos } from "@/lib/mergeVideos";

// Where every "All in One" folder is created.
const PARENT_FOLDER_ID = "1-tcGjv5xwNO3zR3gmCSskTxB2xaSDGlh";

type Item = { index: number; title: string; driveId: string };

// Admin-only: join all videos of a presentation into one MP4 (black title card
// with the page Description before each clip) and save it to Drive in
// "<presentation title> - All in One".
export default function MergeToDrive({ title, items }: { title: string; items: Item[] }) {
  const myEmail = useMyEmail();
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  if (!GOOGLE_CLIENT_ID || items.length === 0) return null;
  const name = `${(title || "Presentation").trim()} - All in One`;

  async function run() {
    setRunning(true);
    setError(null);
    setLink(null);
    try {
      const token = await getDriveToken(myEmail, true);

      // 1. Collect clips (dashboard route first, Drive as fallback).
      const clips: { title: string; file: Blob }[] = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        setStatus(`Getting video ${i + 1} of ${items.length}…`);
        let blob: Blob | null = null;
        const r = await fetch(`/api/presentation-video/${encodeURIComponent(it.driveId)}`);
        if (r.ok) blob = await r.blob();
        else blob = await fetchDriveFile(it.driveId, token);
        clips.push({ title: it.title || `Page ${it.index + 1}`, file: blob });
      }

      // 2. Merge.
      const merged = await mergeVideos(clips, ({ clip, total, fraction }) =>
        setStatus(`Joining video ${clip} of ${total}… ${Math.round(fraction * 100)}%`)
      );

      // 3. Save to Drive.
      setStatus("Creating the Drive folder…");
      const folderId = await findOrCreateFolder(token, PARENT_FOLDER_ID, name);
      const url = await uploadToDriveFolder(token, folderId, `${name}.mp4`, merged, (p) =>
        setStatus(`Uploading to Drive… ${Math.round(p * 100)}% (${(merged.size / 1048576).toFixed(0)} MB)`)
      );
      setLink(url);
      setStatus("");
    } catch (e: any) {
      setError(e?.message ?? "Failed");
      setStatus("");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        All in One video
      </h2>
      <button
        type="button"
        onClick={run}
        disabled={running}
        className="rounded-lg bg-sky-600 text-white px-4 py-2 text-sm font-medium hover:bg-sky-700 disabled:opacity-50"
      >
        {running ? "Working…" : `Join all ${items.length} videos into one and save to Drive`}
      </button>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Saved as <span className="font-mono">{name}/{name}.mp4</span>. Each page&apos;s Description is shown on a black
        screen for 2 seconds before its video. No sound. Keep this tab open until it finishes.
      </p>
      {status && <p className="text-xs text-sky-600">{status}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {link && (
        <p className="text-xs text-emerald-600">
          Done -{" "}
          <a href={link} target="_blank" rel="noreferrer" className="underline">
            open in Drive
          </a>
        </p>
      )}
    </div>
  );
}
