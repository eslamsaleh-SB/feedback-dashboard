"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// v59: tiny reusable "delete row" button. Used for quiz + presentation
// list rows so Reviewer/Admin can remove one item without opening it.

export default function ItemDeleteButton({
  endpoint,
  label = "Delete",
  confirmText = "Delete this item? This cannot be undone.",
  className,
}: {
  endpoint: string;
  label?: string;
  confirmText?: string;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async (e) => {
        e.stopPropagation();
        if (!confirm(confirmText)) return;
        setBusy(true);
        try {
          const res = await fetch(endpoint, { method: "DELETE" });
          const j = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(j.error || "Delete failed");
          router.refresh();
        } catch (err: any) {
          alert(err.message);
        } finally {
          setBusy(false);
        }
      }}
      className={
        className ??
        "rounded-lg border border-red-300 dark:border-red-800 px-2 py-1 text-xs text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50"
      }
    >
      {busy ? "Deleting…" : label}
    </button>
  );
}
