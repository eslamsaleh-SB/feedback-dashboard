"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AppRole } from "@/components/Sidebar";
import Combobox from "@/components/Combobox";

type CollectorOpt = { hr_code: string; name: string; team: string | null };
type ModuleScore = {
  hr_code: string;
  module: string;
  score: number;
  match_count: number | null;
  upload_month: string;
};
type FfScore = {
  hr_code: string;
  score: number;
  match_count: number | null;
  upload_month: string;
};

function fmtMonth(iso: string) {
  const [y, m] = iso.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString("default", {
    month: "short",
    year: "numeric",
  });
}

function LineChart({
  data,
  color = "#0f172a",
}: {
  data: { label: string; value: number }[];
  color?: string;
}) {
  if (data.length === 0) return <p className="text-xs text-slate-400 dark:text-slate-500">No data</p>;
  const W = 340;
  const H = 120;
  const PAD = { top: 12, right: 12, bottom: 28, left: 36 };
  const minV = Math.max(0, Math.min(...data.map((d) => d.value)) - 5);
  const maxV = Math.min(100, Math.max(...data.map((d) => d.value)) + 5);
  const xScale = (i: number) =>
    PAD.left + (i / Math.max(data.length - 1, 1)) * (W - PAD.left - PAD.right);
  const yScale = (v: number) =>
    PAD.top + ((maxV - v) / (maxV - minV || 1)) * (H - PAD.top - PAD.bottom);
  const points = data.map((d, i) => `${xScale(i)},${yScale(d.value)}`).join(" ");
  const area =
    `M ${xScale(0)},${yScale(minV)} ` +
    data.map((d, i) => `L ${xScale(i)},${yScale(d.value)}`).join(" ") +
    ` L ${xScale(data.length - 1)},${yScale(minV)} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <path d={area} fill={color} fillOpacity={0.08} />
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.8} />
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={xScale(i)} cy={yScale(d.value)} r={3} fill={color} />
          <title>{d.label}: {d.value.toFixed(2)}%</title>
        </g>
      ))}
      {data.map((d, i) => (
        <text key={i} x={xScale(i)} y={H - 4} textAnchor="middle" fontSize={8} fill="#94a3b8">
          {d.label}
        </text>
      ))}
      {[minV, (minV + maxV) / 2, maxV].map((v, i) => (
        <text key={i} x={PAD.left - 4} y={yScale(v) + 3} textAnchor="end" fontSize={7} fill="#94a3b8">
          {Math.round(v)}%
        </text>
      ))}
    </svg>
  );
}

export default function QualityScoreDashboard({
  role,
  myHr,
  collectors,
  teams,
  from,
  to,
  moduleScores,
  freezeFrameScores,
  selectedCollector,
  selectedTeam,
}: {
  role: AppRole;
  myHr: string | null;
  collectors: CollectorOpt[];
  teams: string[];
  from: string;
  to: string;
  moduleScores: ModuleScore[];
  freezeFrameScores: FfScore[];
  selectedCollector: string;
  selectedTeam: string;
}) {
  const router = useRouter();
  const isViewer = role === "Viewer";

  const [fromInput, setFromInput] = useState(from);
  const [toInput, setToInput] = useState(to);

  function applyFilters(next: { from?: string; to?: string; collector?: string; team?: string }) {
    const f = next.from ?? fromInput;
    const t = next.to ?? toInput;
    const c = next.collector ?? selectedCollector;
    const tm = next.team ?? selectedTeam;
    const params = new URLSearchParams();
    params.set("from", f);
    params.set("to", t);
    if (c && c !== "all") params.set("collector", c);
    if (tm && tm !== "all") params.set("team", tm);
    router.push(`/quality-score?${params.toString()}`);
  }

  const moduleCharts = useMemo(() => {
    const map: Record<string, { label: string; value: number }[]> = {};
    for (const r of moduleScores) {
      if (!map[r.module]) map[r.module] = [];
      const existing = map[r.module].find((e) => e.label === fmtMonth(r.upload_month));
      if (existing) existing.value = (existing.value + r.score) / 2;
      else map[r.module].push({ label: fmtMonth(r.upload_month), value: r.score });
    }
    return map;
  }, [moduleScores]);

  const ffChart = useMemo(() => {
    const agg: Record<string, { sum: number; count: number }> = {};
    for (const r of freezeFrameScores) {
      const k = fmtMonth(r.upload_month);
      if (!agg[k]) agg[k] = { sum: 0, count: 0 };
      agg[k].sum += r.score;
      agg[k].count += 1;
    }
    return Object.entries(agg)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, v]) => ({ label, value: v.sum / v.count }));
  }, [freezeFrameScores]);

  const summaryScores = useMemo(() => {
    if (moduleScores.length === 0 && freezeFrameScores.length === 0) return null;
    const mods: Record<string, number[]> = {};
    for (const r of moduleScores) {
      if (!mods[r.module]) mods[r.module] = [];
      mods[r.module].push(r.score);
    }
    const ffAvg =
      freezeFrameScores.length > 0
        ? freezeFrameScores.reduce((a, r) => a + r.score, 0) / freezeFrameScores.length
        : null;
    const modSummary = Object.entries(mods).map(([mod, scores]) => ({
      module: mod,
      avg: scores.reduce((a, b) => a + b, 0) / scores.length,
    }));
    return { modSummary, ffAvg };
  }, [moduleScores, freezeFrameScores]);

  const inputCls = "rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900 text-sm";
  const allModules = Array.from(new Set(moduleScores.map((r) => r.module))).sort();

  const collectorOptions =
    selectedTeam !== "all"
      ? collectors.filter((c) => c.team === selectedTeam)
      : collectors;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Quality Score</h1>
        <p className="text-slate-500 dark:text-slate-400">Monthly quality scores by module and freeze frame.</p>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-wrap gap-3 items-end">
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
          onClick={() => applyFilters({})}
          className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800"
        >
          Apply
        </button>

        {!isViewer && (
          <div className="w-44">
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Team</label>
            <Combobox
              options={[
                { value: "all", label: "All teams" },
                ...teams.map((t) => ({ value: t, label: t })),
              ]}
              value={selectedTeam}
              onChange={(v) => applyFilters({ team: v || "all", collector: "all" })}
              placeholder="All teams"
              searchPlaceholder="Search teams..."
            />
          </div>
        )}

        {!isViewer && (
          <div className="w-64">
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Collector</label>
            <Combobox
              options={[
                {
                  value: "all",
                  label:
                    selectedTeam !== "all" ? `All on ${selectedTeam}` : "All collectors",
                },
                ...collectorOptions.map((c) => ({
                  value: c.hr_code,
                  label: `${c.hr_code} - ${c.name}`,
                })),
              ]}
              value={selectedCollector}
              onChange={(v) => applyFilters({ collector: v || "all" })}
              placeholder="All collectors"
              searchPlaceholder="Search by code or name..."
            />
          </div>
        )}

        {(selectedCollector !== "all" || selectedTeam !== "all") && (
          <button
            type="button"
            onClick={() => router.push("/quality-score")}
            className={`${inputCls} text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800`}
          >
            Reset
          </button>
        )}
      </div>

      {summaryScores && (
        <div>
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-3">
            Average for {from} to {to}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {summaryScores.modSummary.map(({ module, avg }) => (
              <div key={module} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate capitalize">
                  {module.replace(/_/g, " ")}
                </p>
                <p className="text-2xl font-bold mt-1">{avg.toFixed(1)}%</p>
              </div>
            ))}
            {summaryScores.ffAvg !== null && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">Freeze Frame</p>
                <p className="text-2xl font-bold mt-1">{summaryScores.ffAvg.toFixed(1)}%</p>
              </div>
            )}
          </div>
        </div>
      )}

      {allModules.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Module scores over time</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {allModules.map((mod) => {
              const data = (moduleCharts[mod] ?? []).sort((a, b) => a.label.localeCompare(b.label));
              return (
                <div key={mod} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2 capitalize">
                    {mod.replace(/_/g, " ")}
                  </h3>
                  <LineChart data={data} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {ffChart.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Freeze Frame score over time</h2>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 max-w-lg">
            <LineChart data={ffChart} color="#0284c7" />
          </div>
        </div>
      )}

      {allModules.length === 0 && ffChart.length === 0 && (
        <p className="text-slate-500 dark:text-slate-400">
          No quality scores uploaded for this filter.{" "}
          {(role === "Admin" || role === "QualityLeader") && (
            <a href="/quality-upload" className="text-slate-900 dark:text-slate-100 underline">
              Upload scores
            </a>
          )}
        </p>
      )}
    </div>
  );
}
