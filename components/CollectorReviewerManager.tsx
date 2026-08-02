"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import MultiSelectCombobox from "@/components/MultiSelectCombobox";

type Collector = { hr_code: string; name: string; team: string | null };
type Reviewer = { id: string; name: string; role: string };
type Active = { reviewer_id: string; start_date: string };

export default function CollectorReviewerManager({
  collectors,
  reviewers,
  activeByHr,
  missingTable,
}: {
  collectors: Collector[];
  reviewers: Reviewer[];
  activeByHr: Record<string, Active>;
  missingTable: boolean;
}) {
  const router = useRouter();
  const [busyHr, setBusyHr] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [teamFilter, setTeamFilter] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  const teams = useMemo(() => {
    const s = new Set<string>();
    for (const c of collectors) if (c.team) s.add(c.team);
    return Array.from(s).sort();
  }, [collectors]);

  const reviewerById = useMemo(() => {
    const m = new Map<string, Reviewer>();
    for (const r of reviewers) m.set(r.id, r);
    return m;
  }, [reviewers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const teamSet = new Set(teamFilter);
    return collectors.filter((c) => {
      if (teamSet.size > 0 && (!c.team || !teamSet.has(c.team))) return false;
      if (q && !`${c.hr_code} ${c.name} ${c.team ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [collectors, teamFilter, search]);

  async function assign(hr: string, reviewerId: string) {
    setBusyHr(hr);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/collector-reviewer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assign", hr_code: hr, reviewer_id: reviewerId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed to assign");
      setMsg({ type: "ok", text: `Assigned ${hr} to ${reviewerById.get(reviewerId)?.name ?? reviewerId}.` });
      router.refresh();
    } catch (e: any) {
      setMsg({ type: "err", text: e.message });
    } finally {
      setBusyHr(null);
    }
  }
  async function unassign(hr: string) {
    if (!confirm(`Remove the current reviewer for ${hr}?`)) return;
    setBusyHr(hr);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/collector-reviewer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unassign", hr_code: hr }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed to unassign");
      setMsg({ type: "ok", text: `Cleared assignment for ${hr}.` });
      router.refresh();
    } catch (e: any) {
      setMsg({ type: "err", text: e.message });
    } finally {
      setBusyHr(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Collector ↔ Reviewer</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Assign the reviewer responsible for each collector. Changes are
          recorded with today's date; the previous assignment is closed out.
        </p>
      </div>

      {missingTable && (
        <div className="rounded-lg bg-amber-50 text-amber-800 border border-amber-200 p-3 text-sm">
          The <code>collector_reviewer_assignments</code> table doesn't exist
          yet. Run <code>Updates/v59__pressure-charts-parts/sql/06_collector_reviewer_assignments.sql</code> in Supabase.
        </div>
      )}

      {msg && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            msg.type === "ok"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-red-50 text-red-800 border-red-200"
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-wrap gap-3 items-end">
        <div className="w-52">
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Teams</label>
          <MultiSelectCombobox
            options={teams.map((t) => ({ value: t, label: t }))}
            values={teamFilter}
            onApply={setTeamFilter}
            placeholder="All teams"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Search</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="hr_code, name, team..."
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900 text-sm w-64"
          />
        </div>
        <div className="ml-auto text-xs text-slate-400 dark:text-slate-500">
          {filtered.length} of {collectors.length} collectors
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-2.5">HR Code</th>
              <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-2.5">Name</th>
              <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-2.5">Team</th>
              <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-2.5">Current reviewer</th>
              <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-2.5">Since</th>
              <th className="text-right font-medium text-slate-500 dark:text-slate-400 px-4 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500">
                  No collectors match the filters.
                </td>
              </tr>
            ) : (
              filtered.map((c) => {
                const active = activeByHr[c.hr_code];
                const currentReviewerId = active?.reviewer_id ?? "";
                const currentName = active
                  ? reviewerById.get(active.reviewer_id)?.name ?? "-"
                  : "-";
                return (
                  <tr key={c.hr_code} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-2.5 font-medium whitespace-nowrap">{c.hr_code}</td>
                    <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200 whitespace-nowrap">{c.name}</td>
                    <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{c.team ?? "-"}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{currentName}</td>
                    <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {active?.start_date ?? "-"}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <div className="flex gap-2 justify-end">
                        <select
                          value={currentReviewerId}
                          disabled={busyHr === c.hr_code}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v && v !== currentReviewerId) assign(c.hr_code, v);
                          }}
                          className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
                        >
                          <option value="">— pick a reviewer —</option>
                          {reviewers.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}{r.role !== "Reviewer" ? ` (${r.role})` : ""}
                            </option>
                          ))}
                        </select>
                        {active && (
                          <button
                            type="button"
                            disabled={busyHr === c.hr_code}
                            onClick={() => unassign(c.hr_code)}
                            className="rounded-lg border border-red-300 dark:border-red-800 px-2 py-1 text-xs text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
