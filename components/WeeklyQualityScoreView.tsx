"use client";

import { useMemo, useState } from "react";

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
  squad: number | null;
  freeze_frame_score: number | null;
};

// Column order matches the CSV: base, players, formation_tactical, location, impact, extras, squad, THEN freeze_frame_score last.
const MODULE_COLS: { key: keyof Row; label: string }[] = [
  { key: "base", label: "Base" },
  { key: "players", label: "Players" },
  { key: "formation_tactical", label: "Formation / Tactical" },
  { key: "location", label: "Location" },
  { key: "impact", label: "Impact" },
  { key: "extras", label: "Extras" },
  { key: "squad", label: "Squad" },
  { key: "freeze_frame_score", label: "Freeze Frame" },
];

function fmt(v: number | null | undefined): string {
  if (v == null) return "-";
  return v.toFixed(2) + "%";
}

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

  const [weekFilter, setWeekFilter] = useState<string>("all");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [collectorFilter, setCollectorFilter] = useState<string>("all");
  // Score-range filter: which modules to constrain + min/max %.
  const [selectedModules, setSelectedModules] = useState<Set<string>>(new Set());
  const [minScore, setMinScore] = useState("");
  const [maxScore, setMaxScore] = useState("");

  function toggleModule(key: string) {
    setSelectedModules((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const filtered = useMemo(() => {
    const minV = minScore.trim() ? Number(minScore) : null;
    const maxV = maxScore.trim() ? Number(maxScore) : null;
    const modKeys = Array.from(selectedModules);

    return rows.filter((r) => {
      if (isViewer) {
        if (!viewerHrCode || r.hr_code !== viewerHrCode) return false;
      }
      if (weekFilter !== "all" && r.week_start_date !== weekFilter) return false;
      const c = collectorByHr.get(r.hr_code);
      if (teamFilter !== "all" && (c?.team ?? "") !== teamFilter) return false;
      if (collectorFilter !== "all" && r.hr_code !== collectorFilter) return false;

      // Score range: ALL selected modules must fall in [min, max]. A missing
      // (null) value in a selected module = row is EXCLUDED.
      if (modKeys.length > 0 && (minV != null || maxV != null)) {
        for (const k of modKeys) {
          const v = (r as any)[k] as number | null;
          if (v == null) return false;
          if (minV != null && v < minV) return false;
          if (maxV != null && v > maxV) return false;
        }
      }
      return true;
    });
  }, [
    rows, weekFilter, teamFilter, collectorFilter, isViewer, viewerHrCode,
    collectorByHr, selectedModules, minScore, maxScore,
  ]);

  function csvCell(v: any): string {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }
  function exportCsv() {
    const header = ["HR Code", "Name", "Team", "Week", ...MODULE_COLS.map((m) => m.label)];
    const lines = filtered.map((r) => {
      const c = collectorByHr.get(r.hr_code);
      return [
        r.hr_code,
        c?.name ?? "",
        c?.team ?? "",
        r.week_start_date,
        ...MODULE_COLS.map((m) => {
          const v = r[m.key] as number | null;
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

  const inputCls =
    "rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900 text-sm";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Weekly Quality Scores</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          One row per collector per week (Sunday - Saturday).
        </p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Week</label>
            <select value={weekFilter} onChange={(e) => setWeekFilter(e.target.value)} className={inputCls}>
              <option value="all">All weeks</option>
              {allWeeks.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          {!isViewer && (
            <>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Team</label>
                <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} className={inputCls}>
                  <option value="all">All teams</option>
                  {allTeams.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Collector</label>
                <select value={collectorFilter} onChange={(e) => setCollectorFilter(e.target.value)} className={inputCls}>
                  <option value="all">All collectors</option>
                  {collectors
                    .filter((c) => teamFilter === "all" || (c.team ?? "") === teamFilter)
                    .map((c) => (
                      <option key={c.hr_code} value={c.hr_code}>{c.hr_code} - {c.name}</option>
                    ))}
                </select>
              </div>
            </>
          )}
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Min score %</label>
            <input
              type="number" value={minScore} onChange={(e) => setMinScore(e.target.value)}
              placeholder="e.g. 80" className={`${inputCls} w-24`}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Max score %</label>
            <input
              type="number" value={maxScore} onChange={(e) => setMaxScore(e.target.value)}
              placeholder="e.g. 95" className={`${inputCls} w-24`}
            />
          </div>
          <div className="ml-auto">
            <button
              type="button" onClick={exportCsv}
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Export CSV
            </button>
          </div>
        </div>

        {/* Module multi-select for score-range filter */}
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
                      ? "bg-slate-900 text-white border-slate-900"
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
            A row is shown only if <b>all selected modules</b> fall within Min / Max. Leave
            modules empty to skip this filter.
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
              <th className="text-left px-4 py-3">Week</th>
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
              filtered.map((r, i) => {
                const c = collectorByHr.get(r.hr_code);
                return (
                  <tr key={`${r.hr_code}-${r.week_start_date}-${i}`} className="text-slate-700 dark:text-slate-200">
                    {!isViewer && <td className="px-4 py-2 font-medium">{r.hr_code}</td>}
                    {!isViewer && <td className="px-4 py-2">{c?.name ?? "-"}</td>}
                    {!isViewer && <td className="px-4 py-2">{c?.team ?? "-"}</td>}
                    <td className="px-4 py-2">{r.week_start_date}</td>
                    {MODULE_COLS.map((m) => (
                      <td key={m.key as string} className="px-4 py-2 text-right">
                        {fmt(r[m.key] as number | null)}
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
