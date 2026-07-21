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
  color,
}: {
  data: { label: string; value: number }[];
  color?: string;
}) {
  if (data.length === 0)
    return <p className="text-xs text-slate-400 dark:text-slate-500">No data</p>;
  const W = 340;
  const H = 140;
  const PAD = { top: 14, right: 14, bottom: 32, left: 40 };
  const minV = Math.max(0, Math.min(...data.map((d) => d.value)) - 5);
  const maxV = Math.min(100, Math.max(...data.map((d) => d.value)) + 5);
  const xScale = (i: number) =>
    PAD.left + (i / Math.max(data.length - 1, 1)) * (W - PAD.left - PAD.right);
  const yScale = (v: number) =>
    PAD.top + ((maxV - v) / (maxV - minV || 1)) * (H - PAD.top - PAD.bottom);
  const area =
    `M ${xScale(0)},${yScale(minV)} ` +
    data.map((d, i) => `L ${xScale(i)},${yScale(d.value)}`).join(" ") +
    ` L ${xScale(data.length - 1)},${yScale(minV)} Z`;
  const stroke = color ?? "currentColor";
  const UP = "#10b981";   // emerald-500
  const DOWN = "#ef4444"; // red-500

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full text-slate-800 dark:text-slate-100">
      <path d={area} fill={stroke} fillOpacity={0.08} />

      {/* Per-segment colored lines: green = up vs previous, red = down, neutral = same. */}
      {data.slice(1).map((d, idx) => {
        const prev = data[idx];
        const c = d.value > prev.value ? UP : d.value < prev.value ? DOWN : stroke;
        return (
          <line
            key={`seg-${idx}`}
            x1={xScale(idx)}
            y1={yScale(prev.value)}
            x2={xScale(idx + 1)}
            y2={yScale(d.value)}
            stroke={c}
            strokeWidth={2}
          />
        );
      })}

      {/* Points + tiny up/down triangle per month (skips first month = no baseline). */}
      {data.map((d, i) => {
        const prev = i > 0 ? data[i - 1] : null;
        const trend =
          prev == null
            ? "flat"
            : d.value > prev.value
            ? "up"
            : d.value < prev.value
            ? "down"
            : "flat";
        const dotColor = trend === "up" ? UP : trend === "down" ? DOWN : stroke;
        const cx = xScale(i);
        const cy = yScale(d.value);
        return (
          <g key={`pt-${i}`}>
            <circle cx={cx} cy={cy} r={3.6} fill={dotColor} />
            {trend === "up" && (
              <polygon
                points={`${cx - 4},${cy - 9} ${cx + 4},${cy - 9} ${cx},${cy - 15}`}
                fill={UP}
              />
            )}
            {trend === "down" && (
              <polygon
                points={`${cx - 4},${cy - 9} ${cx + 4},${cy - 9} ${cx},${cy - 3}`}
                fill={DOWN}
              />
            )}
            <title>
              {d.label}: {d.value.toFixed(2)}%
              {prev ? ` (${d.value >= prev.value ? "+" : ""}${(d.value - prev.value).toFixed(2)} vs ${prev.label})` : ""}
            </title>
          </g>
        );
      })}

      {/* X labels */}
      {data.map((d, i) => (
        <text
          key={`x-${i}`}
          x={xScale(i)}
          y={H - 6}
          textAnchor="middle"
          fontSize={9}
          className="fill-slate-600 dark:fill-slate-300"
        >
          {d.label}
        </text>
      ))}

      {/* Y labels */}
      {[minV, (minV + maxV) / 2, maxV].map((v, i) => (
        <text
          key={`y-${i}`}
          x={PAD.left - 6}
          y={yScale(v) + 3}
          textAnchor="end"
          fontSize={9}
          className="fill-slate-600 dark:fill-slate-300"
        >
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
    // Key by YYYY-MM so June never collapses onto May, and average by
    // proper sum/count. Sort ASCENDING by ISO key (oldest -> newest, left -> right).
    const acc: Record<string, Record<string, { sum: number; count: number }>> = {};
    for (const r of moduleScores) {
      if (!acc[r.module]) acc[r.module] = {};
      const key = (r.upload_month || "").slice(0, 7);
      if (!key) continue;
      if (!acc[r.module][key]) acc[r.module][key] = { sum: 0, count: 0 };
      acc[r.module][key].sum += r.score;
      acc[r.module][key].count += 1;
    }
    const map: Record<string, { iso: string; label: string; value: number }[]> = {};
    for (const [mod, byMonth] of Object.entries(acc)) {
      map[mod] = Object.entries(byMonth)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, v]) => ({
          iso: key,
          label: fmtMonth(`${key}-01`),
          value: v.sum / v.count,
        }));
    }
    return map;
  }, [moduleScores]);

  const ffChart = useMemo(() => {
    // Aggregate by ISO YYYY-MM, then sort by ISO ASC (oldest -> newest).
    const agg: Record<string, { sum: number; count: number }> = {};
    for (const r of freezeFrameScores) {
      const iso = (r.upload_month || "").slice(0, 7);
      if (!iso) continue;
      if (!agg[iso]) agg[iso] = { sum: 0, count: 0 };
      agg[iso].sum += r.score;
      agg[iso].count += 1;
    }
    return Object.entries(agg)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([iso, v]) => ({
        iso,
        label: fmtMonth(`${iso}-01`),
        value: v.sum / v.count,
      }));
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

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">From</label>
          <input type="date" value={fromInput} onChange={(e) => setFromInput(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">To</label>
          <input type="date" value={toInput} onChange={(e) => setToInput(e.target.value)} className={inputCls} />
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
                  label: selectedTeam !== "all" ? `All on ${selectedTeam}` : "All collectors",
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
              // Data is already ISO-sorted ascending (oldest -> newest) by moduleCharts.
              const data = moduleCharts[mod] ?? [];
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
            <LineChart data={ffChart} />
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
