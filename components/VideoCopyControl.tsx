"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const BUCKET = "presentation-videos";

/** The logged-in dashboard user's email (their Hudl account). */
export function useMyEmail() {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setEmail(data.user?.email ?? null))
      .catch(() => {});
  }, []);
  return email;
}

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
  const [copied, setCopied] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    fetchCopiedIds([driveId])
      .then((ids) => alive && setCopied(ids.includes(driveId)))
      .catch(() => alive && setCopied(false));
    return () => {
      alive = false;
    };
  }, [driveId, refreshKey]);

  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
        copied
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
          : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
      }`}
    >
      {copied == null ? "Checking..." : copied ? "Visible to everyone" : "Drive only - collectors can't see it yet"}
    </span>
  );
}
