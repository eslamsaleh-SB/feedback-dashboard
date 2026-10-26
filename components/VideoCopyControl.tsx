"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const BUCKET = "presentation-videos";

/** Upload a local file as the Supabase copy of a Drive video. Throws on error. */
export async function uploadVideoCopy(driveId: string, file: File) {
  const supabase = createClient();
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "mp4";
  const res = await fetch("/api/admin/presentation-video-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ drive_id: driveId, ext }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error ?? "Could not start upload");
  const { error } = await supabase.storage
    .from(BUCKET)
    .uploadToSignedUrl(j.path, j.token, file, { contentType: file.type || "video/mp4" });
  if (error) throw new Error(error.message);
}

/** Which of these Drive ids already have a Supabase copy. */
export async function fetchCopiedIds(driveIds: string[]): Promise<string[]> {
  if (driveIds.length === 0) return [];
  const r = await fetch(
    `/api/admin/presentation-video-upload?drive_ids=${encodeURIComponent(driveIds.join(","))}`,
    { cache: "no-store" }
  );
  const j = await r.json().catch(() => ({}));
  return Array.isArray(j.copied) ? j.copied : [];
}

// Admin helper shown under each slide's Drive link.
// 1) "Download from Drive" opens the file with the admin's own Hudl access.
// 2) "Upload copy" stores that file in the private Supabase bucket, so every
//    logged-in collector can play it without Drive permissions.
export default function VideoCopyControl({
  driveId,
  refreshKey = 0,
}: {
  driveId: string;
  refreshKey?: number;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [copied, setCopied] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchCopiedIds([driveId])
      .then((ids) => alive && setCopied(ids.includes(driveId)))
      .catch(() => alive && setCopied(false));
    return () => {
      alive = false;
    };
  }, [driveId, refreshKey]);

  async function upload(file: File) {
    setBusy(true);
    setMsg(null);
    try {
      await uploadVideoCopy(driveId, file);
      setCopied(true);
      setMsg("Uploaded - collectors can watch this video now.");
    } catch (e: any) {
      setMsg(e?.message ?? "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const btn =
    "rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50";

  return (
    <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            copied
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
              : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
          }`}
        >
          {copied == null ? "Checking..." : copied ? "Visible to everyone" : "Drive only - collectors can't see it"}
        </span>
        <a
          href={`https://drive.google.com/uc?export=download&id=${driveId}`}
          target="_blank"
          rel="noreferrer"
          className={btn}
        >
          1. Download from Drive
        </a>
        <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className={btn}>
          {busy ? "Uploading..." : copied ? "2. Replace copy" : "2. Upload copy"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
          }}
        />
      </div>
      {msg && <p className="text-[11px] text-slate-500 dark:text-slate-400">{msg}</p>}
    </div>
  );
}
