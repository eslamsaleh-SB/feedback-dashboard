"use client";

import { useMemo, useState } from "react";
import MultiSelectCombobox from "@/components/MultiSelectCombobox";

type Row = {
  id: string;
  collector_hr_code: string;
  collector_name: string;
  team: string | null;
  reviewer_id: string;
  reviewer_name: string;
  start_date: string;
  end_date: string | null;
};

// v59: inclusive day count. Active rows count to today; end < start
// (legacy broken data from the v59.0 same-day close bug) is clamped to 0.
function totalDays(startIso: string, endIso: string | null): number {
  const start = new Date(startIso + "T00:00:00Z").getTime();
  const endBase = endIso ? new Date(endIso + "T00:00:00Z").getTime() : Date.now();
  const days = Math.floor((endBase - start) / 86_400_000) + 1;
  return Math.max(0, days);
}

export default function ReviewerHistoryView({
  history,
  missingTable,
}: {
  history: Row[];
  missingTable: boolean;
}) {
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [collectorFilter, setCollectorFilter] = useState<string[]>([]);
  const [reviewerFilter, setReviewerFilter] = useState<string[]>([]);
  const [teamFilter, setTeamFilter] = useState<string[]>([]);

  const teams = useMemo(() => {
    const s = new Set<string>();
    for (const r of history) if (r.team) s.add(r.team);
    return Array.from(s).sort();
  }, [history]);

  const collectors = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of history) m.set(r.collector_hr_code, r.collector_name);
    return Array.from(m.entries()).map(([hr, name]) => ({
      value: hr,
      label: `${hr} - ${name}`,
    }));
  }, [history]);

  const reviewers = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of history) m.set(r.reviewer_id, r.reviewer_name);
    return Array.from(m.entries()).map(([id, name]) => ({ value: id, label: name }));
  }, [history]);

  // "Was active on any day between from and to." A row is a match if its
  // [start, end || +inf] overlaps the requested [from, to].
  const filtered = useMemo(() => {
    const teamSet = new Set(teamFilter);
    const collectorSet = new Set(collectorFilter);
    const reviewerSet = new Set(reviewerFilter);
    return history.filter((r) => {
      if (teamSet.size > 0 && (!r.team || !teamSet.has(r.team))) return false;
      if (collectorSet.size > 0 && !collectorSet.has(r.collector_hr_code)) return false;
      if (reviewerSet.size > 0 && !reviewerSet.has(r.reviewer_id)) return false;
      if (from && r.end_date && r.end_date < from) return false;
      if (to && r.start_date > to) return false;
      return true;
    });
  }, [history, teamFilter, collectorFilter, reviewerFilter, from, to]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reviewer Assignment History</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Every collector-reviewer pairing, past and current. Filter by date
          range to see who was responsible during that window.
        </p>
      </div>

      {missingTable && (
        <div className="rounded-lg bg-amber-50 text-amber-800 border border-amber-200 p-3 text-sm">
          The <code>collector_reviewer_assignments</code> table doesn't exist
          yet. Run <code>Updates/v59__pressure-charts-parts/sql/06_collector_reviewer_assignments.sql</code> in Supabase.
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900 text-sm"
          />
        </div>
        <div className="w-52">
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Teams</label>
          <MultiSelectCombobox
            options={teams.map((t) => ({ value: t, label: t }))}
            values={teamFilter}
            onApply={setTeamFilter}
            placeholder="All teams"
          />
        </div>
        <div className="w-72">
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Collectors</label>
          <MultiSelectCombobox
            options={collectors}
            values={collectorFilter}
            onApply={setCollectorFilter}
            placeholder="All collectors"
          />
        </div>
        <div className="w-64">
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Reviewers</label>
          <MultiSelectCombobox
            options={reviewers}
            values={reviewerFilter}
            onApply={setReviewerFilter}
            placeholder="All reviewers"
          />
        </div>
        {(from || to || teamFilter.length || collectorFilter.length || reviewerFilter.length) ? (
          <button
            type="button"
            onClick={() => {
              setFrom("");
              setTo("");
              setTeamFilter([]);
              setCollectorFilter([]);
              setReviewerFilter([]);
            }}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Clear
          </button>
        ) : null}
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400">
        {filtered.length} record(s)
      </p>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-2.5">Collector</th>
              <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-2.5">Team</th>
              <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-2.5">Reviewer</th>
              <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-2.5">Start</th>
              <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-2.5">End</th>
              <th className="text-right font-medium text-slate-500 dark:text-slate-400 px-4 py-2.5">Total days</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500">
                  No records match the filters.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className="font-medium">{r.collector_hr_code}</span>
                    <span className="text-slate-500 dark:text-slate-400"> - {r.collector_name}</span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{r.team ?? "-"}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{r.reviewer_name}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{r.start_date}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {r.end_date ? (
                      r.end_date
                    ) : (
                      <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-xs">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                    {totalDays(r.start_date, r.end_date)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
