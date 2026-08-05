"use client";

import { useEffect, useMemo, useState } from "react";
import MultiSelectCombobox, { type MSOption } from "@/components/MultiSelectCombobox";

type Collector = { hr_code: string; name: string; team: string | null };
type Row = {
  hr_code: string;
  week_start_date: string;
  base: number | null;
  players: number | null;
  formation_tactical: number | null;
  location: number | null;
  impact: number | null;
  extras: number | null;
  pressure: number | null;
  squad: number | null;
  freeze_frame_score: number | null;
};

// v59: Column order matches the CSV: base, players, formation_tactical,
// location, impact, extras, pressure, squad, then freeze_frame_score last.
const MODULE_COLS: { key: keyof Row; label: string }[] = [
  { key: "base", label: "Base" },
  { key: "players", label: "Players" },
  { key: "formation_tactical", label: "Formation / Tactical" },
  { key: "location", label: "Location" },
  { key: "impact", label: "Impact" },
  { key: "extras", label: "Extras" },
  { key: "pressure", label: "Pressure" },
  { key: "squad", label: "Squad" },
  { key: "freeze_frame_score", label: "Freeze Frame" },
];

function fmt(v: number | null | undefined): string {
  if (v == null) return "-";
  return v.toFixed(2) + "%";
}

// Type alias for one aggregated row (one collector, averaged across weeks).
type AggregatedRow = {
  hr_code: string;
  weeks: number;
  values: Record<keyof Row, number | null>;
};

export default function WeeklyQualityScoreView({
  role,
  viewerHrCode,
  collectors,
  rows,
}: {
  role: string;
  viewerHrCode: string | null;
  collectors: Collector[];
  rows: Row[];
}) {
  const isViewer = role === "Viewer";

  const collectorByHr = useMemo(() => {
    const m = new Map<string, Collector>();
    for (const c of collectors) m.set(c.hr_code, c);
    return m;
  }, [collectors]);

  const allWeeks = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) s.add(r.week_start_date);
    return Array.from(s).sort((a, b) => b.localeCompare(a));
  }, [rows]);

  const allTeams = useMemo(() => {
    const s = new Set<string>();
    for (const c of collectors) if (c.team) s.add(c.team);
    return Array.from(s).sort();
  }, [collectors]);

  // v59: every dropdown is multi-select. Empty array = "all". State holds
  // the currently APPLIED selection (Apply commits the MultiSelectCombobox
  // draft into these).
  const [weekFilter, setWeekFilter] = useState<string[]>([]);
  const [teamFilter, setTeamFilter] = useState<string[]>([]);
  const [collectorFilter, setCollectorFilter] = useState<string[]>([]);
  // Score-range filter: which modules to constrain + min/max %.
  const [selectedModules, setSelectedModules] = useState<Set<string>>(new Set());
  const [minScore, setMinScore] = useState("");
  const [maxScore, setMaxScore] = useState("");
  // v59: bottom-N filter — shows the N collectors with the lowest average on
  // a single chosen module. Empty = off.
  const [bottomNModule, setBottomNModule] = useState<string>("");
  const [bottomN, setBottomN] = useState<string>("");

  // v59: Reviewer's assigned-collectors toggle.
  const [myAssigned, setMyAssigned] = useState<string[]>([]);
  const [assignmentsLoaded, setAssignmentsLoaded] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
  useEffect(() => {
    fetch("/api/my-assigned", { cache: "no-store" })
      .then((r) => r.json())
      .then(({ hr_codes }: { hr_codes?: string[] }) => {
        if (Array.isArray(hr_codes)) setMyAssigned(hr_codes);
      })
      .catch(() => {})
      .finally(() => setAssignmentsLoaded(true));
  }, []);
  const mineSet = useMemo(() => new Set(myAssigned), [myAssigned]);

  function toggleModule(key: string) {
    setSelectedModules((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Apply Team → Collector cascade: when a team is applied, collector list
  // narrows. When applied team set changes, drop collector picks not on any
  // applied team.
  const collectorOptions = useMemo<MSOption[]>(() => {
    const teamSet = new Set(teamFilter);
    const list = teamSet.size === 0
      ? collectors
      : collectors.filter((c) => c.team && teamSet.has(c.team));
    return list.map((c) => ({ value: c.hr_code, label: `${c.hr_code} - ${c.name}` }));
  }, [collectors, teamFilter]);

  // Aggregate: 1 row per collector, averaged across applied weeks (or all
  // weeks if none applied). Preserves 1 row per collector regardless of how
  // many weeks were picked.
  const aggregated = useMemo<AggregatedRow[]>(() => {
    const weekSet = new Set(weekFilter);
    const teamSet = new Set(teamFilter);
    const collectorSet = new Set(collectorFilter);

    // Buckets keyed by hr_code, one sum + count per module.
    const buckets = new Map<
      string,
      { weeks: Set<string>; sums: Record<string, { s: number; n: number }> }
    >();

    for (const r of rows) {
      if (isViewer) {
        if (!viewerHrCode || r.hr_code !== viewerHrCode) continue;
      }
      if (weekSet.size > 0 && !weekSet.has(r.week_start_date)) continue;
      const c = collectorByHr.get(r.hr_code);
      if (teamSet.size > 0 && (!c?.team || !teamSet.has(c.team))) continue;
      if (collectorSet.size > 0 && !collectorSet.has(r.hr_code)) continue;
      // v59: reviewer's "only mine" toggle.
      if (onlyMine && mineSet.size > 0 && !mineSet.has(r.hr_code)) continue;

      let bucket = buckets.get(r.hr_code);
      if (!bucket) {
        bucket = { weeks: new Set<string>(), sums: {} };
        buckets.set(r.hr_code, bucket);
      }
      bucket.weeks.add(r.week_start_date);
      for (const m of MODULE_COLS) {
        const v = r[m.key] as number | null;
        if (v == null) continue;
        const cur = bucket.sums[m.key as string] ?? { s: 0, n: 0 };
        cur.s += v;
        cur.n += 1;
        bucket.sums[m.key as string] = cur;
      }
    }

    const out: AggregatedRow[] = [];
    for (const [hr, b] of buckets) {
      const values: Record<string, number | null> = {};
      for (const m of MODULE_COLS) {
        const cur = b.sums[m.key as string];
        values[m.key as string] = cur && cur.n > 0 ? cur.s / cur.n : null;
      }
      out.push({ hr_code: hr, weeks: b.weeks.size, values: values as any });
    }
    return out;
  }, [rows, weekFilter, teamFilter, collectorFilter, isViewer, viewerHrCode, collectorByHr, onlyMine, mineSet]);

  // Score-range filter applied AFTER aggregation. v59 fix: applies as soon
  // as at least one module pill is picked (previously required min OR max
  // to also be set, so clicking pills alone did nothing and the whole
  // filter looked broken).
  const scoreFiltered = useMemo(() => {
    const minV = minScore.trim() ? Number(minScore) : null;
    const maxV = maxScore.trim() ? Number(maxScore) : null;
    const modKeys = Array.from(selectedModules);
    if (modKeys.length === 0) return aggregated;
    return aggregated.filter((r) => {
      for (const k of modKeys) {
        const v = r.values[k as keyof Row];
        if (v == null) return false;
        if (minV != null && v < minV) return false;
        if (maxV != null && v > maxV) return false;
      }
      return true;
    });
  }, [aggregated, selectedModules, minScore, maxScore]);

  // v59: bottom-N filter — after score-range gating, if a module is chosen
  // and N is set, sort ascending by that module's value and keep the first N.
  // Rows with a null value for the chosen module are excluded from the ranking.
  const filtered = useMemo(() => {
    const n = parseInt(bottomN, 10);
    if (!bottomNModule || !Number.isFinite(n) || n <= 0) return scoreFiltered;
    const withValue = scoreFiltered.filter((r) => r.values[bottomNModule as keyof Row] != null);
    withValue.sort((a, b) => {
      const av = a.values[bottomNModule as keyof Row] as number;
      const bv = b.values[bottomNModule as keyof Row] as number;
      return av - bv;
    });
    return withValue.slice(0, n);
  }, [scoreFiltered, bottomNModule, bottomN]);

  function csvCell(v: any): string {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }
  function exportCsv() {
    const header = ["HR Code", "Name", "Team", "Weeks", ...MODULE_COLS.map((m) => m.label)];
    const lines = filtered.map((r) => {
      const c = collectorByHr.get(r.hr_code);
      return [
        r.hr_code,
        c?.name ?? "",
        c?.team ?? "",
        String(r.weeks),
        ...MODULE_COLS.map((m) => {
          const v = r.values[m.key];
          return v == null ? "" : v.toFixed(2);
        }),
      ];
    });
    const csv = [header, ...lines].map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `weekly-quality-scores.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const weekOptions: MSOption[] = allWeeks.map((w) => ({ value: w, label: w }));
  const teamOptions: MSOption[] = allTeams.map((t) => ({ value: t, label: t }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Weekly Quality Scores</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          One row per collector, averaged across the selected weeks.
        </p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-56">
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Weeks</label>
            <MultiSelectCombobox
              options={weekOptions}
              values={weekFilter}
              onApply={setWeekFilter}
              placeholder="All weeks"
            />
          </div>
          {!isViewer && (
            <>
              <div className="w-52">
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Teams</label>
                <MultiSelectCombobox
                  options={teamOptions}
                  values={teamFilter}
                  onApply={(next) => {
                    setTeamFilter(next);
                    // Drop collector picks no longer on any applied team.
                    if (next.length > 0 && collectorFilter.length > 0) {
                      const allowed = new Set(
                        collectors
                          .filter((c) => c.team && next.includes(c.team))
                          .map((c) => c.hr_code)
                      );
                      setCollectorFilter((prev) => prev.filter((v) => allowed.has(v)));
                    }
                  }}
                  placeholder="All teams"
                />
              </div>
              <div className="w-72">
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Collectors</label>
                <MultiSelectCombobox
                  options={collectorOptions}
                  values={collectorFilter}
                  onApply={setCollectorFilter}
                  placeholder="All collectors"
                />
              </div>
              {/* v59: reviewer's assigned filter, only visible when caller
                  has at least one active assignment. */}
              {assignmentsLoaded && (
                <div className="flex items-end">
                  <label
                    className={`flex items-center gap-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900 ${
                      myAssigned.length === 0
                        ? "text-slate-400 dark:text-slate-500 cursor-not-allowed"
                        : "text-slate-600 dark:text-slate-300 cursor-pointer"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={onlyMine}
                      disabled={myAssigned.length === 0}
                      onChange={(e) => setOnlyMine(e.target.checked)}
                      className="h-4 w-4"
                    />
                    <span>Only my assigned ({myAssigned.length})</span>
                  </label>
                </div>
              )}
            </>
          )}
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Min score %</label>
            <input
              type="number"
              value={minScore}
              onChange={(e) => setMinScore(e.target.value)}
              placeholder="e.g. 80"
              className="w-24 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Max score %</label>
            <input
              type="number"
              value={maxScore}
              onChange={(e) => setMaxScore(e.target.value)}
              placeholder="e.g. 95"
              className="w-24 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900 text-sm"
            />
          </div>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={() => {
                setWeekFilter([]);
                setTeamFilter([]);
                setCollectorFilter([]);
                setSelectedModules(new Set());
                setMinScore("");
                setMaxScore("");
                setBottomNModule("");
                setBottomN("");
              }}
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Reset filters
            </button>
            <button
              type="button"
              onClick={exportCsv}
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Export CSV
            </button>
          </div>
        </div>

        {/* Module multi-select pills for score-range filter */}
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
            Score-range applies to (pick one or more modules)
          </label>
          <div className="flex flex-wrap gap-2">
            {MODULE_COLS.map((m) => {
              const on = selectedModules.has(m.key as string);
              return (
                <button
                  key={m.key as string}
                  type="button"
                  onClick={() => toggleModule(m.key as string)}
                  className={`rounded-full px-3 py-1 text-xs border ${
                    on
                      ? "bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100"
                      : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700"
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
            {selectedModules.size > 0 && (
              <button
                type="button"
                onClick={() => setSelectedModules(new Set())}
                className="text-xs text-slate-500 dark:text-slate-400 underline ml-2"
              >
                Clear modules
              </button>
            )}
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
            Rows are dropped when a selected module has no value. Min / Max
            further trim to that band when set.
          </p>
        </div>

        {/* v59: bottom-N per module — the N collectors with the lowest score. */}
        <div className="flex flex-wrap items-end gap-3 pt-1 border-t border-slate-100 dark:border-slate-800">
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Bottom-N module
            </label>
            <select
              value={bottomNModule}
              onChange={(e) => setBottomNModule(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900 text-sm w-48"
            >
              <option value="">Off</option>
              {MODULE_COLS.map((m) => (
                <option key={m.key as string} value={m.key as string}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              How many
            </label>
            <input
              type="number"
              min={1}
              value={bottomN}
              onChange={(e) => setBottomN(e.target.value)}
              placeholder="e.g. 20"
              className="w-28 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900 text-sm"
            />
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 max-w-md">
            Shows the N collectors with the lowest average score in the picked
            module (after all other filters). Leave module = Off to disable.
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-slate-500 dark:text-slate-400">
            <tr>
              {!isViewer && <th className="text-left px-4 py-3">HR Code</th>}
              {!isViewer && <th className="text-left px-4 py-3">Name</th>}
              {!isViewer && <th className="text-left px-4 py-3">Team</th>}
              <th className="text-right px-4 py-3">Weeks</th>
              {MODULE_COLS.map((m) => (
                <th key={m.key as string} className="text-right px-4 py-3">{m.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4 + MODULE_COLS.length} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500">
                  No rows match the filters.
                </td>
              </tr>
            ) : (
              filtered
                .sort((a, b) => a.hr_code.localeCompare(b.hr_code))
                .map((r, i) => {
                  const c = collectorByHr.get(r.hr_code);
                  return (
                    <tr key={`${r.hr_code}-${i}`} className="text-slate-700 dark:text-slate-200">
                      {!isViewer && <td className="px-4 py-2 font-medium">{r.hr_code}</td>}
                      {!isViewer && <td className="px-4 py-2">{c?.name ?? "-"}</td>}
                      {!isViewer && <td className="px-4 py-2">{c?.team ?? "-"}</td>}
                      <td className="px-4 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">{r.weeks}</td>
                      {MODULE_COLS.map((m) => (
                        <td key={m.key as string} className="px-4 py-2 text-right tabular-nums">
                          {fmt(r.values[m.key])}
                        </td>
                      ))}
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
