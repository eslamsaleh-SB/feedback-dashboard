"use client";

import { useMyEmail } from "@/components/VideoCopyControl";

// Plays a Drive video in the Drive player. Drive links are restricted to Hudl
// accounts, so we pass the viewer's dashboard email as `authuser` to make Drive
// pick the right Google account when several are signed in.
export default function DriveVideo({ driveId, height = 300 }: { driveId: string; height?: number }) {
  const email = useMyEmail();
  const src =
    `https://drive.google.com/file/d/${driveId}/preview` +
    (email ? `?authuser=${encodeURIComponent(email)}` : "");
  return (
    <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-black">
      <iframe
        key={`iframe-${driveId}-${email ?? ""}`}
        src={src}
        className="w-full"
        style={{ height: `${height}px` }}
        allow="autoplay; fullscreen"
        allowFullScreen
      />
    </div>
  );
}
