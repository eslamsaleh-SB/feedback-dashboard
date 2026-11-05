"use client";

import { useState } from "react";

// Plays a Drive video for anyone logged in: first from the dashboard's own copy
// (/api/presentation-video, filled by the Admin "Copy all from Drive" button),
// and falls back to the Drive player if that video hasn't been copied yet.
export default function DriveVideo({ driveId, height = 300 }: { driveId: string; height?: number }) {
  const [mode, setMode] = useState<"native" | "iframe">("native");
  return (
    <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-black">
      {mode === "native" ? (
        <video
          key={`native-${driveId}`}
          src={`/api/presentation-video/${encodeURIComponent(driveId)}`}
          className="w-full block bg-black"
          style={{ height: `${height}px` }}
          controls
          playsInline
          preload="metadata"
          onError={() => setMode("iframe")}
        />
      ) : (
        <iframe
          key={`iframe-${driveId}`}
          src={`https://drive.google.com/file/d/${driveId}/preview`}
          className="w-full"
          style={{ height: `${height}px` }}
          allow="autoplay; fullscreen"
          allowFullScreen
        />
      )}
    </div>
  );
}
