"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { MODULES, type ModuleValue } from "@/lib/modules";
import type { AppRole } from "@/components/Sidebar";

type CollectorOpt = { hr_code: string; name: string; team: string | null };
type ModuleScore = {
  hr_code: string;
  module: string;
  score: number;
  match_count: number | null;
  upload_month: string; // YYYY-MM-DD
};
type FfScore = {
  hr_code: string;
  score: number;
  match_count: number | null;
  upload_month: string;
};

// Map module names from the CSV to MODULES values
const MODULE_ALIASES: Record<string, ModuleValue | "base"> = {
  base: "base" as any,
  players: "players",
  event: "event",
  formation_tactical: "formation_tactical",
  location: "location",
  impact: "impact",
  extras: "extras",
  freeze_frame: "freeze_frame",
};

function fmtMonth(iso: string) {
  const [y, m] = iso.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString("default", {
    month: "short",
    year: "numeric",
  });
}

function TrendArrow({ prev, curr }: { prev: number | null; curr: number }) {
  if (prev === null) return null;
  const diff = curr - prev;
  if (Math.abs(diff) < 0.01) return <span className="text-slate-400 text-xs">→</span>;
  return diff > 0 ? (
    <span className="text-emerald-600 text-xs font-semibold">↑ +{diff.toFixed(2)}%</span>
  ) : (
    <span className="text-red-500 text-xs font-semibold">↓ {diff.toFixed(2)}%</span>
  );
}

// Simple SVG line chart
function LineChart({
  data,
  color = "#0f172a",
}: {
  data: { label: string; value: number }[];
  color?: string;
}) {
  if (data.length === 0) return <p className="text-xs text-slate-400">No data</p>;

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
      {/* Area fill */}
      <path d={area} fill={color} fillOpacity={0.08} />
      {/* Line */}
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.8} />
      {/* Dots + tooltips */}
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={xScale(i)} cy={yScale(d.value)} r={3} fill={color} />
          <title>
            {d.label}: {d.value.toFixed(2)}%
          </title>
        </g>
      ))}
      {/* X labels */}
      {data.map((d, i) => (
        <text
          key={i}
          x={xScale(i)}
          y={H - 4}
          textAnchor="middle"
          fontSize={8}
          fill="#94a3b8"
        >
          {d.label}
        </text>
      ))}
      {/* Y axis labels */}
      {[minV, (minV + maxV) / 2, maxV].map((v, i) => (
        <text
          key={i}
          x={PAD.left - 4}
          y={yScale(v) + 3}
          textAnchor="end"
          fontSize={7}
          fill="#94a3b8"
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
  moduleScores,
  freezeFrameScores,
  allMonths,
  selectedMonth,
  selectedCollector,
}: {
  role: AppRole;
  myHr: string | null;
  collectors: CollectorOpt[];
  moduleScores: ModuleScore[];
  freezeFrameScores: FfScore[];
  allMonths: string[];
  selectedMonth: string;
  selectedCollector: string;
}) {
  const router = useRouter();
  const isViewer = role === "Viewer";

  function applyFilters(next: { month?: string; collector?: string }) {
    const m = next.month ?? selectedMonth;
    const c = next.collector ?? selectedCollector;
    const params = new URLSearchParams();
    if (m) params.set("month", m);
    if (c && c !== "all") params.set("collector", c);
    const qs = params.toString();
    router.push(`/quality-score${qs ? `?${qs}` : ""}`);
  }

  // Convert YYYY-MM-DD → YYYY-MM for grouping
  const toYM = (d: string) => d.slice(0, 7);

  // Group module scores by module → { YYYY-MM: score }
  const moduleCharts = useMemo(() => {
    const map: Record<string, { label: string; value: number }[]> = {};
    for (const r of moduleScores) {
      const ym = toYM(r.upload_month);
      if (!map[r.module]) map[r.module] = [];
      // average if multiple collectors
      const existing = map[r.module].find((e) => e.label === fmtMonth(r.upload_month));
      if (existing) {
        existing.value = (existing.value + r.score) / 2;
      } else {
        map[r.module].push({ label: fmtMonth(r.upload_month), value: r.score });
      }
    }
    return map;
  }, [moduleScores]);

  // Freeze frame chart data
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

  // Summary cards for the selected month (or latest month if none)
  const effectiveMonth = selectedMonth
    ? selectedMonth
    : allMonths.length > 0
    ? toYM(allMonths[0])
    : null;

  const summaryScores = useMemo(() => {
    if (!effectiveMonth) return null;
    const monthFilter = `${effectiveMonth}-01`;
    const mods: Record<string, number[]> = {};
    for (const r of moduleScores) {
      if (toYM(r.upload_month) !== effectiveMonth) continue;
      if (!mods[r.module]) mods[r.module] = [];
      mods[r.module].push(r.score);
    }
    const ffForMonth = freezeFrameScores.filter(
      (r) => toYM(r.upload_month) === effectiveMonth
    );
    const ffAvg =
      ffForMonth.length > 0
        ? ffForMonth.reduce((a, r) => a + r.score, 0) / ffForMonth.length
        : null;
    const modSummary = Object.entries(mods).map(([mod, scores]) => ({
      module: mod,
      avg: scores.reduce((a, b) => a + b, 0) / scores.length,
    }));
    // Previous month
    const prevIdx = allMonths.findIndex((m) => toYM(m) === effectiveMonth);
    const prevMonth =
      prevIdx >= 0 && prevIdx + 1 < allMonths.length
        ? toYM(allMonths[prevIdx + 1])
        : null;
    const prevMods: Record<string, number[]> = {};
    for (const r of moduleScores) {
      if (!prevMonth || toYM(r.upload_month) !== prevMonth) continue;
      if (!prevMods[r.module]) prevMods[r.module] = [];
      prevMods[r.module].push(r.score);
    }
    const prevFf = prevMonth
      ? freezeFrameScores.filter((r) => toYM(r.upload_month) === prevMonth)
      : [];
    const prevFfAvg =
      prevFf.length > 0
        ? prevFf.reduce((a, r) => a + r.score, 0) / prevFf.length
        : null;
    const prevModSummary = Object.fromEntries(
      Object.entries(prevMods).map(([mod, scores]) => [
        mod,
        scores.reduce((a, b) => a + b, 0) / scores.length,
      ])
    );
    return { modSummary, ffAvg, prevModSummary, prevFfAvg };
  }, [moduleScores, freezeFrameScores, effectiveMonth, allMonths]);

  const inputCls = "rounded-lg border border-slate-300 px-3 py-2 bg-white text-sm";

  const allModules = Array.from(
    new Set(moduleScores.map((r) => r.module))
  ).sort();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Quality Score</h1>
        <p className="text-slate-500">Monthly quality scores by module and freeze frame.</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap gap-3">
        {!isViewer && (
          <div className="w-56">
            <label className="block text-xs text-slate-500 mb-1">Collector</label>
            <select
              value={selectedCollector}
              onChange={(e) => applyFilters({ collector: e.target.value })}
              className={`${inputCls} w-full`}
            >
              <option value="all">All collectors</option>
              {collectors.map((c) => (
                <option key={c.hr_code} value={c.hr_code}>
                  {c.hr_code} — {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="w-44">
          <label className="block text-xs text-slate-500 mb-1">Month</label>
          <select
            value={selectedMonth}
            onChange={(e) => applyFilters({ month: e.target.value })}
            className={`${inputCls} w-full`}
          >
            <option value="">All months</option>
            {allMonths.map((m) => (
              <option key={m} value={toYM(m)}>
                {fmtMonth(m)}
              </option>
            ))}
          </select>
        </div>
        {(selectedMonth || selectedCollector !== "all") && (
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => router.push("/quality-score")}
              className={`${inputCls} text-slate-600 hover:bg-slate-50`}
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Summary cards */}
      {summaryScores && (
        <div>
          <h2 className="text-sm font-semibold text-slate-500 mb-3">
            {effectiveMonth
              ? `Scores for ${fmtMonth(effectiveMonth + "-01")}`
              : "Latest scores"}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {summaryScores.modSummary.map(({ module, avg }) => {
              const prev = summaryScores.prevModSummary[module] ?? null;
              return (
                <div
                  key={module}
                  className="bg-white rounded-2xl border border-slate-200 p-4"
                >
                  <p className="text-xs text-slate-500 truncate capitalize">
                    {module.replace(/_/g, " ")}
                  </p>
                  <p className="text-2xl font-bold mt-1">{avg.toFixed(1)}%</p>
                  <TrendArrow prev={prev} curr={avg} />
                </div>
              );
            })}
            {summaryScores.ffAvg !== null && (
              <div className="bg-white rounded-2xl border border-slate-200 p-4">
                <p className="text-xs text-slate-500">Freeze Frame</p>
                <p className="text-2xl font-bold mt-1">
                  {summaryScores.ffAvg.toFixed(1)}%
                </p>
                <TrendArrow
                  prev={summaryScores.prevFfAvg}
                  curr={summaryScores.ffAvg}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Module line charts */}
      {allModules.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Module scores over time</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {allModules.map((mod) => {
              const data = (moduleCharts[mod] ?? []).sort((a, b) =>
                a.label.localeCompare(b.label)
              );
              return (
                <div
                  key={mod}
                  className="bg-white rounded-2xl border border-slate-200 p-4"
                >
                  <h3 className="text-sm font-semibold text-slate-700 mb-2 capitalize">
                    {mod.replace(/_/g, " ")}
                  </h3>
                  <LineChart data={data} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Freeze frame line chart */}
      {ffChart.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Freeze Frame score over time</h2>
          <div className="bg-white rounded-2xl border border-slate-200 p-4 max-w-lg">
            <LineChart data={ffChart} color="#0284c7" />
          </div>
        </div>
      )}

      {allModules.length === 0 && ffChart.length === 0 && (
        <p className="text-slate-500">
          No quality scores uploaded yet.{" "}
          {(role === "Admin" || role === "QualityLeader") && (
            <a href="/quality-upload" className="text-slate-900 underline">
              Upload scores →
            </a>
          )}
        </p>
      )}
    </div>
  );
}
