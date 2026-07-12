"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Collector = { hr_code: string; name: string; team: string | null };
type ModuleErrorsRow = {
  hr_code: string;
  players: number;
  event: number;
  formation_tactical: number;
  location: number;
  impact: number;
  extras: number;
  freeze_frame: number;
  total: number;
  matches: number;
};
type QualityScoreRow = {
  hr_code: string;
  module: string;
  score: number;
  upload_month: string;
};
type FreezeFrameRow = { hr_code: string; score: number; upload_month: string };

const MODULE_KEYS = [
  "players",
  "event",
  "formation_tactical",
  "location",
  "impact",
  "extras",
  "freeze_frame",
] as const;
type ModuleKey = (typeof MODULE_KEYS)[number];

const MODULE_LABEL: Record<ModuleKey, string> = {
  players: "Players",
  event: "Event",
  formation_tactical: "Formation / Tactical",
  location: "Location",
  impact: "Impact",
  extras: "Extras",
  freeze_frame: "Freeze Frame",
};

const SCORE_KEYS = [
  "base",
  "players",
  "event",
  "formation_tactical",
  "location",
  "impact",
  "extras",
  "freeze_frame_score",
] as const;
type ScoreKey = (typeof SCORE_KEYS)[number];
const SCORE_LABEL: Record<ScoreKey, string> = {
  base: "Base",
  players: "Players",
  event: "Event",
  formation_tactical: "Formation / Tactical",
  location: "Location",
  impact: "Impact",
  extras: "Extras",
  freeze_frame_score: "Freeze Frame",
};

type MatchLogic = "any" | "all";

export default function PerformanceThresholdsView({
  from,
  to,
  collectors,
  moduleErrors,
  qualityScores,
  freezeFrameScores,
}: {
  from: string;
  to: string;
  collectors: Collector[];
  moduleErrors: ModuleErrorsRow[];
  qualityScores: QualityScoreRow[];
  freezeFrameScores: FreezeFrameRow[];
}) {
  const router = useRouter();

  const [moduleFilterOn, setModuleFilterOn] = useState(true);
  const [scoreFilterOn, setScoreFilterOn] = useState(false);
  const [matchLogic, setMatchLogic] = useState<MatchLogic>("any");

  const [errChecked, setErrChecked] = useState<Record<ModuleKey, boolean>>(() =>
    Object.fromEntries(MODULE_KEYS.map((m) => [m, false])) as Record<ModuleKey, boolean>
  );
  const [errThresh, setErrThresh] = useState<Record<ModuleKey, string>>(() =>
    Object.fromEntries(MODULE_KEYS.map((m) => [m, ""])) as Record<ModuleKey, string>
  );

  const [scoreChecked, setScoreChecked] = useState<Record<ScoreKey, boolean>>(() =>
    Object.fromEntries(SCORE_KEYS.map((m) => [m, false])) as Record<ScoreKey, boolean>
  );
  const [scoreThresh, setScoreThresh] = useState<Record<ScoreKey, string>>(() =>
    Object.fromEntries(SCORE_KEYS.map((m) => [m, ""])) as Record<ScoreKey, string>
  );

  const [fromInput, setFromInput] = useState(from);
  const [toInput, setToInput] = useState(to);
  const [topN, setTopN] = useState<string>("");
  function applyDateRange() {
    const params = new URLSearchParams();
    params.set("from", fromInput);
    params.set("to", toInput);
    router.push(`/performance-thresholds?${params.toString()}`);
  }

  const avgScoreByHrAndKey = useMemo(() => {
    const acc: Record<string, Record<string, number[]>> = {};
    for (const r of qualityScores) {
      if (!acc[r.hr_code]) acc[r.hr_code] = {};
      if (!acc[r.hr_code][r.module]) acc[r.hr_code][r.module] = [];
      acc[r.hr_code][r.module].push(r.score);
    }
    for (const r of freezeFrameScores) {
      if (!acc[r.hr_code]) acc[r.hr_code] = {};
      if (!acc[r.hr_code]["freeze_frame_score"])
        acc[r.hr_code]["freeze_frame_score"] = [];
      acc[r.hr_code]["freeze_frame_score"].push(r.score);
    }
    const out: Record<string, Record<string, number>> = {};
    for (const [hr, mods] of Object.entries(acc)) {
      out[hr] = {};
      for (const [mod, vals] of Object.entries(mods)) {
        out[hr][mod] = vals.reduce((a, b) => a + b, 0) / vals.length;
      }
    }
    return out;
  }, [qualityScores, freezeFrameScores]);

  const moduleErrorsByHr = useMemo(() => {
    const m = new Map<string, ModuleErrorsRow>();
    for (const r of moduleErrors) m.set(r.hr_code, r);
    return m;
  }, [moduleErrors]);

  const activeErrCriteria = MODULE_KEYS.filter(
    (k) => moduleFilterOn && errChecked[k] && errThresh[k] !== ""
  );
  const activeScoreCriteria = SCORE_KEYS.filter(
    (k) => scoreFilterOn && scoreChecked[k] && scoreThresh[k] !== ""
  );

  const matchedCollectors = useMemo(() => {
    if (activeErrCriteria.length === 0 && activeScoreCriteria.length === 0) {
      return [] as Collector[];
    }
    return collectors.filter((c) => {
      const errRow = moduleErrorsByHr.get(c.hr_code);
      const scoreRow = avgScoreByHrAndKey[c.hr_code];

      const errResults = activeErrCriteria.map((k) => {
        const value = errRow ? Number(errRow[k] ?? 0) : 0;
        const limit = Number(errThresh[k]);
        return value >= limit;
      });
      const scoreResults = activeScoreCriteria.map((k) => {
        const value = scoreRow?.[k];
        if (value == null) return false;
        const limit = Number(scoreThresh[k]);
        return value <= limit;
      });

      const checks = [...errResults, ...scoreResults];
      if (checks.length === 0) return false;
      return matchLogic === "any" ? checks.some(Boolean) : checks.every(Boolean);
    });
  }, [
    collectors,
    moduleErrorsByHr,
    avgScoreByHrAndKey,
    activeErrCriteria,
    activeScoreCriteria,
    errThresh,
    scoreThresh,
    matchLogic,
  ]);

  const errorColumns = activeErrCriteria;
  const scoreColumns = activeScoreCriteria;

  // Top N: sort by sum of selected module errors (DESC = highest offenders)
  // and by avg of selected module scores (ASC = lowest performers). Slice
  // to the requested count. Empty topN = show all matched collectors.
  const topNNum = topN.trim() ? Math.max(0, Number(topN)) : null;
  const errorsRanked = useMemo(() => {
    const list = matchedCollectors.map((c) => {
      const row = moduleErrorsByHr.get(c.hr_code);
      const total = errorColumns.reduce(
        (acc, k) => acc + (row ? Number(row[k] ?? 0) : 0),
        0
      );
      return { c, total };
    });
    list.sort((a, b) => b.total - a.total);
    const capped = topNNum != null ? list.slice(0, topNNum) : list;
    return capped.map((x) => x.c);
  }, [matchedCollectors, moduleErrorsByHr, errorColumns, topNNum]);

  const scoresRanked = useMemo(() => {
    const list = matchedCollectors.map((c) => {
      const scores = avgScoreByHrAndKey[c.hr_code] ?? {};
      const values = scoreColumns
        .map((k) => scores[k])
        .filter((v): v is number => v != null);
      const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : Number.POSITIVE_INFINITY;
      return { c, avg };
    });
    list.sort((a, b) => a.avg - b.avg);
    const capped = topNNum != null ? list.slice(0, topNNum) : list;
    return capped.map((x) => x.c);
  }, [matchedCollectors, avgScoreByHrAndKey, scoreColumns, topNNum]);

  const inputCls = "rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900 text-sm";
  const cardCls = "bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4";

  function csvCell(value: string | number | null | undefined): string {
    const s = value == null ? "" : String(value);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }
  function downloadCsv(filename: string, rows: string[][]) {
    const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");
    const bom = "﻿";
    const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  function exportErrorsCsv() {
    const header = [
      "HR Code",
      "Name",
      "Team",
      ...errorColumns.map((k) => `${MODULE_LABEL[k]} (>= ${errThresh[k] || 0})`),
    ];
    const rows = errorsRanked.map((c) => {
      const row = moduleErrorsByHr.get(c.hr_code);
      return [
        c.hr_code,
        c.name,
        c.team ?? "",
        ...errorColumns.map((k) => String(row ? Number(row[k] ?? 0) : 0)),
      ];
    });
    downloadCsv(`module-errors_${from}_to_${to}.csv`, [header, ...rows]);
  }
  function exportScoresCsv() {
    const header = [
      "HR Code",
      "Name",
      "Team",
      ...scoreColumns.map((k) => `${SCORE_LABEL[k]} (<= ${scoreThresh[k] || 0}%)`),
    ];
    const rows = scoresRanked.map((c) => {
      const scores = avgScoreByHrAndKey[c.hr_code] ?? {};
      return [
        c.hr_code,
        c.name,
        c.team ?? "",
        ...scoreColumns.map((k) => {
          const value = scores[k];
          return value == null ? "" : value.toFixed(2);
        }),
      ];
    });
    downloadCsv(`quality-scores_${from}_to_${to}.csv`, [header, ...rows]);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Performance Thresholds</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Pick a date range, choose which module errors / quality scores to evaluate,
          set a threshold per module, and see who matches.
        </p>
      </div>

      {/* Date range */}
      <div className={`${cardCls} flex flex-wrap items-end gap-3`}>
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">From</label>
          <input
            type="date"
            value={fromInput}
            onChange={(e) => setFromInput(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">To</label>
          <input
            type="date"
            value={toInput}
            onChange={(e) => setToInput(e.target.value)}
            className={inputCls}
          />
        </div>
        <button
          type="button"
          onClick={applyDateRange}
          className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800"
        >
          Apply date range
        </button>
        <div className="ml-auto flex items-end gap-3">
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Top N (leave empty = all)
            </label>
            <input
              type="number"
              min={1}
              value={topN}
              onChange={(e) => setTopN(e.target.value)}
              placeholder="e.g. 40"
              className={`${inputCls} w-28`}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Match logic</label>
            <select
              value={matchLogic}
              onChange={(e) => setMatchLogic(e.target.value as MatchLogic)}
              className={inputCls}
            >
              <option value="any">Any selected criterion</option>
              <option value="all">All selected criteria</option>
            </select>
          </div>
        </div>
      </div>

      {/* Criteria toggles */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={cardCls}>
          <label className="flex items-center gap-2 mb-3 cursor-pointer">
            <input
              type="checkbox"
              checked={moduleFilterOn}
              onChange={(e) => setModuleFilterOn(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Apply Module Errors filter
            </span>
          </label>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            Check a module and enter a minimum error count. Collectors with errors
            at or above the threshold will appear in the Module Errors table.
          </p>
          <div className={`space-y-2 ${moduleFilterOn ? "" : "opacity-50 pointer-events-none"}`}>
            {MODULE_KEYS.map((k) => (
              <div key={k} className="flex items-center gap-3">
                <label className="flex items-center gap-2 flex-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={errChecked[k]}
                    onChange={(e) =>
                      setErrChecked((p) => ({ ...p, [k]: e.target.checked }))
                    }
                    className="h-4 w-4"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-200">{MODULE_LABEL[k]}</span>
                </label>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-400 dark:text-slate-500">errors &ge;</span>
                  <input
                    type="number"
                    min={0}
                    value={errThresh[k]}
                    onChange={(e) =>
                      setErrThresh((p) => ({ ...p, [k]: e.target.value }))
                    }
                    className="w-24 rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1 text-sm"
                    placeholder="0"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={cardCls}>
          <label className="flex items-center gap-2 mb-3 cursor-pointer">
            <input
              type="checkbox"
              checked={scoreFilterOn}
              onChange={(e) => setScoreFilterOn(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Apply Quality Scores filter
            </span>
          </label>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            Check a module and enter a quality score floor. Collectors whose average
            score is at or below the threshold will appear in the Quality Scores table.
          </p>
          <div className={`space-y-2 ${scoreFilterOn ? "" : "opacity-50 pointer-events-none"}`}>
            {SCORE_KEYS.map((k) => (
              <div key={k} className="flex items-center gap-3">
                <label className="flex items-center gap-2 flex-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scoreChecked[k]}
                    onChange={(e) =>
                      setScoreChecked((p) => ({ ...p, [k]: e.target.checked }))
                    }
                    className="h-4 w-4"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-200">{SCORE_LABEL[k]}</span>
                </label>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-400 dark:text-slate-500">score &le;</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    value={scoreThresh[k]}
                    onChange={(e) =>
                      setScoreThresh((p) => ({ ...p, [k]: e.target.value }))
                    }
                    className="w-24 rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1 text-sm"
                    placeholder="0"
                  />
                  <span className="text-xs text-slate-400 dark:text-slate-500">%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {activeErrCriteria.length === 0 && activeScoreCriteria.length === 0 ? (
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          Pick at least one module and enter a threshold to see results.
        </p>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {matchedCollectors.length} collector(s) match {matchLogic === "any" ? "any" : "all"} selected criteria ({from} to {to}
          {topNNum != null ? `, showing top ${topNNum}` : ""})
        </p>
      )}

      {errorColumns.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
          <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Module Errors ({errorColumns.length} module{errorColumns.length === 1 ? "" : "s"})
            </h2>
            <button
              type="button"
              onClick={exportErrorsCsv}
              disabled={errorsRanked.length === 0}
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              Export CSV
            </button>
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-2.5">HR Code</th>
                <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-2.5">Name</th>
                <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-2.5">Team</th>
                {errorColumns.map((k) => (
                  <th key={k} className="text-right font-medium text-slate-500 dark:text-slate-400 px-4 py-2.5 whitespace-nowrap">
                    {MODULE_LABEL[k]} <span className="text-slate-300 dark:text-slate-600">(&ge; {errThresh[k] || 0})</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {errorsRanked.length === 0 ? (
                <tr>
                  <td colSpan={3 + errorColumns.length} className="px-4 py-6 text-center text-slate-500 dark:text-slate-400">
                    No collectors match.
                  </td>
                </tr>
              ) : (
                errorsRanked.map((c) => {
                  const row = moduleErrorsByHr.get(c.hr_code);
                  return (
                    <tr key={c.hr_code} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-4 py-2.5 font-medium whitespace-nowrap">{c.hr_code}</td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200 whitespace-nowrap">{c.name}</td>
                      <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{c.team ?? "-"}</td>
                      {errorColumns.map((k) => {
                        const value = row ? Number(row[k] ?? 0) : 0;
                        const limit = Number(errThresh[k] || 0);
                        const hot = value >= limit;
                        return (
                          <td
                            key={k}
                            className={`px-4 py-2.5 text-right tabular-nums ${
                              hot ? "text-red-600 font-semibold" : "text-slate-700 dark:text-slate-200"
                            }`}
                          >
                            {value.toLocaleString()}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {scoreColumns.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
          <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Quality Scores ({scoreColumns.length} module{scoreColumns.length === 1 ? "" : "s"})
            </h2>
            <button
              type="button"
              onClick={exportScoresCsv}
              disabled={scoresRanked.length === 0}
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              Export CSV
            </button>
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-2.5">HR Code</th>
                <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-2.5">Name</th>
                <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-2.5">Team</th>
                {scoreColumns.map((k) => (
                  <th key={k} className="text-right font-medium text-slate-500 dark:text-slate-400 px-4 py-2.5 whitespace-nowrap">
                    {SCORE_LABEL[k]} <span className="text-slate-300 dark:text-slate-600">(&le; {scoreThresh[k] || 0}%)</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scoresRanked.length === 0 ? (
                <tr>
                  <td colSpan={3 + scoreColumns.length} className="px-4 py-6 text-center text-slate-500 dark:text-slate-400">
                    No collectors match.
                  </td>
                </tr>
              ) : (
                scoresRanked.map((c) => {
                  const scores = avgScoreByHrAndKey[c.hr_code] ?? {};
                  return (
                    <tr key={c.hr_code} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-4 py-2.5 font-medium whitespace-nowrap">{c.hr_code}</td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200 whitespace-nowrap">{c.name}</td>
                      <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{c.team ?? "-"}</td>
                      {scoreColumns.map((k) => {
                        const value = scores[k];
                        const limit = Number(scoreThresh[k] || 0);
                        const cold = value != null && value <= limit;
                        return (
                          <td
                            key={k}
                            className={`px-4 py-2.5 text-right tabular-nums ${
                              cold ? "text-red-600 font-semibold" : "text-slate-700 dark:text-slate-200"
                            }`}
                          >
                            {value == null ? "-" : `${value.toFixed(1)}%`}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
