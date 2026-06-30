"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type AppRole = "Admin"|"Uploader"|"Viewer"|"TeamLeader"|"Supervisor"|"QualityLeader";
export type Account = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: AppRole;
  hr_code: string | null;
};

const ROLE_OPTIONS: { value: AppRole; label: string }[] = [
  { value: "Admin", label: "Admin" },
  { value: "Uploader", label: "Reviewer" },
  { value: "Viewer", label: "Collector" },
  { value: "TeamLeader", label: "Team Leader" },
  { value: "Supervisor", label: "Supervisor" },
  { value: "QualityLeader", label: "Quality Leader" },
];

export default function AccountsManager({ accounts }: { accounts: Account[] }) {
  const supabase = createClient();
  const [rows, setRows] = useState<Account[]>(accounts);
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.hr_code ?? "").toLowerCase().includes(q) ||
        (r.email ?? "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  function setRole(id: string, role: AppRole) {
    setRows((p) => p.map((r) => (r.id === id ? { ...r, role } : r)));
  }

  async function save(a: Account) {
    setSavingId(a.id);
    setSavedId(null);
    setMsg(null);
    const { error } = await supabase
      .from("profiles")
      .update({ role: a.role })
      .eq("id", a.id);
    setSavingId(null);
    if (error) {
      setMsg(error.message);
      return;
    }
    setSavedId(a.id);
    setTimeout(() => setSavedId((s) => (s === a.id ? null : s)), 1500);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Accounts</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Set each person&rsquo;s role. Name is managed on the Collectors page.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by code or email..."
          className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 flex-1 min-w-[240px]"
        />
        <span className="text-sm text-slate-500 dark:text-slate-400">{filtered.length} account(s)</span>
      </div>

      {msg && <p className="text-sm text-red-600">{msg}</p>}

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-3">Code</th>
              <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-3">Name</th>
              <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-3">Email</th>
              <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-3">Role</th>
              <th className="text-right font-medium text-slate-500 dark:text-slate-400 px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-slate-500 dark:text-slate-400">
                  No accounts.
                </td>
              </tr>
            )}
            {filtered.map((a) => (
              <tr key={a.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-4 py-2.5 whitespace-nowrap font-medium text-slate-800 dark:text-slate-100">
                  {a.hr_code ?? "-"}
                </td>
                <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200">{a.full_name ?? "-"}</td>
                <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                  {a.email ?? "(no email)"}
                </td>
                <td className="px-4 py-2.5">
                  <select
                    value={a.role}
                    onChange={(e) => setRole(a.id, e.target.value as AppRole)}
                    className="rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1.5 bg-white dark:bg-slate-900 text-sm"
                  >
                    {ROLE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    onClick={() => save(a)}
                    disabled={savingId === a.id}
                    className="rounded-lg bg-slate-900 text-white px-4 py-1.5 text-sm font-medium disabled:opacity-50"
                  >
                    {savingId === a.id ? "Saving..." : savedId === a.id ? "Saved" : "Save"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
