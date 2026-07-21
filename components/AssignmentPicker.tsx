"use client";

// AssignmentPicker
//
// Reusable picker that produces a Set<hr_code> from a UNION of three inputs:
//   1. "All collectors" checkbox
//   2. Multi-select of team names (each team adds its members)
//   3. Individual collector checkboxes (with search)
//
// Used by both the Quiz builder and the Send Report page.

import { useEffect, useMemo, useState } from "react";

export type CollectorOpt = { hr_code: string; name: string; team: string | null };

export default function AssignmentPicker({
  collectors,
  value,
  onChange,
  title = "Assign to collectors",
}: {
  collectors: CollectorOpt[];
  value: Set<string>;                     // fully-resolved hr_code set
  onChange: (next: Set<string>) => void;
  title?: string;
}) {
  const allTeams = useMemo(() => {
    const s = new Set<string>();
    for (const c of collectors) if (c.team) s.add(c.team);
    return Array.from(s).sort();
  }, [collectors]);

  const [teamSel, setTeamSel] = useState<Set<string>>(new Set());
  const [sendAll, setSendAll] = useState<boolean>(false);
  const [search, setSearch] = useState("");

  // Individual-collector picks are anything in `value` that isn't already
  // resolved from teams/all. We keep them in a separate state so unchecking
  // a team doesn't wipe someone the user hand-picked.
  const [individuals, setIndividuals] = useState<Set<string>>(new Set(value));

  // Re-compute the resolved set whenever any input changes.
  useEffect(() => {
    const next = new Set<string>();
    if (sendAll) {
      for (const c of collectors) next.add(c.hr_code);
    } else {
      for (const c of collectors) {
        if (c.team && teamSel.has(c.team)) next.add(c.hr_code);
      }
      for (const hr of individuals) next.add(hr);
    }
    onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendAll, teamSel, individuals, collectors]);

  function toggleTeam(t: string) {
    setTeamSel((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }
  function toggleIndividual(hr: string) {
    setIndividuals((prev) => {
      const next = new Set(prev);
      if (next.has(hr)) next.delete(hr);
      else next.add(hr);
      return next;
    });
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return collectors;
    return collectors.filter((c) => `${c.hr_code} ${c.name} ${c.team ?? ""}`.toLowerCase().includes(q));
  }, [collectors, search]);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {title} ({value.size})
        </h2>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={sendAll}
          onChange={(e) => setSendAll(e.target.checked)}
          className="h-4 w-4"
        />
        <span className="font-medium">All collectors</span>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          ({collectors.length} total)
        </span>
      </label>

      {/* Teams */}
      {!sendAll && (
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Teams (select one or more)</p>
          {allTeams.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500">No teams defined.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {allTeams.map((t) => {
                const on = teamSel.has(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTeam(t)}
                    className={`rounded-full px-3 py-1 text-xs border ${
                      on
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Individuals */}
      {!sendAll && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-slate-500 dark:text-slate-400">Individual collectors</p>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-56 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs"
            />
          </div>
          <div className="max-h-72 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.length === 0 ? (
              <p className="p-3 text-sm text-slate-500 dark:text-slate-400">
                No collectors match "{search}".
              </p>
            ) : (
              filtered.map((c) => {
                const byTeam = c.team && teamSel.has(c.team);
                const byIndiv = individuals.has(c.hr_code);
                const included = byTeam || byIndiv;
                return (
                  <label
                    key={c.hr_code}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={!!included}
                      disabled={!!byTeam}
                      onChange={() => toggleIndividual(c.hr_code)}
                      className="h-4 w-4"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                        {c.hr_code} <span className="text-slate-400 dark:text-slate-500">-</span> {c.name}
                      </p>
                      {c.team && (
                        <p className="text-[11px] text-slate-400 dark:text-slate-500">
                          {c.team}{byTeam ? " (via team)" : ""}
                        </p>
                      )}
                    </div>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}

      {sendAll && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Every collector ({collectors.length}) will be assigned. Uncheck "All collectors" to pick teams / individuals.
        </p>
      )}
    </div>
  );
}
