"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Combobox, { type ComboOption } from "@/components/Combobox";

export default function ViewAsBar({
  accounts,
  viewingAs,
}: {
  accounts: { id: string; label: string }[];
  viewingAs: { id: string; label: string; role: string } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function set(profileId: string | null) {
    setBusy(true);
    await fetch("/api/view-as", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId }),
    }).catch(() => {});
    setBusy(false);
    router.refresh();
  }

  const options: ComboOption[] = [
    { value: "", label: "View as… (yourself)" },
    ...accounts.map((a) => ({ value: a.id, label: a.label })),
  ];

  if (viewingAs) {
    return (
      <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm">
        <span className="text-amber-800">
          👁 Viewing as <span className="font-semibold">{viewingAs.label}</span>{" "}
          <span className="text-amber-600">({viewingAs.role}) — read-only</span>
        </span>
        <button
          type="button"
          onClick={() => set(null)}
          disabled={busy}
          className="rounded-lg bg-amber-600 text-white px-3 py-1 font-medium disabled:opacity-50"
        >
          Exit
        </button>
      </div>
    );
  }

  return (
    <div className="mb-4 flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2">
      <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">Admin preview:</span>
      <div className="w-80 max-w-full">
        <Combobox
          options={options}
          value=""
          onChange={(v) => v && set(v)}
          placeholder="View as a user…"
        />
      </div>
    </div>
  );
}
