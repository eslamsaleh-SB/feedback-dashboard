"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Role = "Admin" | "Uploader" | "Viewer";
type Collector = { id: string; name: string };
export type Account = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: Role;
  collector_id: string | null;
};

export default function AccountsManager({
  accounts,
  collectors,
}: {
  accounts: Account[];
  collectors: Collector[];
}) {
  const supabase = createClient();
  const [rows, setRows] = useState<Account[]>(accounts);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  function update(id: string, patch: Partial<Account>) {
    setRows((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function save(acc: Account) {
    setSavingId(acc.id);
    setSavedId(null);
    const { error } = await supabase
      .from("profiles")
      .update({ role: acc.role, collector_id: acc.collector_id })
      .eq("id", acc.id);
    setSavingId(null);
    if (error) {
      alert(error.message);
      return;
    }
    setSavedId(acc.id);
    setTimeout(() => setSavedId((s) => (s === acc.id ? null : s)), 1500);
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Accounts</h1>
        <p className="text-slate-500 text-sm mt-1">
          Set each person’s role and link Viewers to the collector profile they
          should see.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 divide-y">
        {rows.length === 0 && (
          <p className="p-4 text-sm text-slate-500">No accounts yet.</p>
        )}
        {rows.map((a) => (
          <div
            key={a.id}
            className="p-4 flex flex-col sm:flex-row sm:items-end gap-3"
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{a.email ?? "(no email)"}</p>
              {a.full_name && (
                <p className="text-xs text-slate-500 truncate">{a.full_name}</p>
              )}
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Role</label>
              <select
                value={a.role}
                onChange={(e) => update(a.id, { role: e.target.value as Role })}
                className="rounded-lg border border-slate-300 px-2 py-1.5 bg-white text-sm"
              >
                <option value="Admin">Admin</option>
                <option value="Uploader">Uploader</option>
                <option value="Viewer">Viewer</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">
                Collector (for Viewers)
              </label>
              <select
                value={a.collector_id ?? ""}
                onChange={(e) =>
                  update(a.id, { collector_id: e.target.value || null })
                }
                className="rounded-lg border border-slate-300 px-2 py-1.5 bg-white text-sm"
              >
                <option value="">— none —</option>
                {collectors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => save(a)}
              disabled={savingId === a.id}
              className="rounded-lg bg-slate-900 text-white px-4 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              {savingId === a.id ? "Saving…" : savedId === a.id ? "Saved ✓" : "Save"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
