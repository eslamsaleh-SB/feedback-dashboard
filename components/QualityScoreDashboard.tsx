"use client";

import { useMemo } from "react";
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
type Period = "month" | "quarter" | "year";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

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
      <path d={area} fill={color} fillOpacity={0.08} />
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.8} />
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={xScale(i)} cy={yScale(d.value)} r={3} fill={color} />
          <title>
            {d.label}: {d.value.toFixed(2)}%
          </title>
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
  period,
  year,
  month,
  quarter,
  moduleScores,
  freezeFrameScores,
  allMonths,
  selectedCollector,
  selectedTeam,
}: {
  role: AppRole;
  myHr: string | null;
  collectors: CollectorOpt[];
  teams: string[];
  period: Period;
  year: number;
  month: number;
  quarter: number;
  moduleScores: ModuleScore[];
  freezeFrameScores: FfScore[];
  allMonths: string[];
  selectedCollector: string;
  selectedTeam: string;
}) {
  const router = useRouter();
  const isViewer = role === "Viewer";

  function applyFilters(next: Partial<{
    period: Period;
    year: number;
    month: number;
    quarter: number;
    collector: string;
    team: string;
  }>) {
    const p = next.period ?? period;
    const y = next.year ?? year;
    const m = next.month ?? month;
    const q = next.quarter ?? quarter;
    const c = next.collector ?? selectedCollector;
    const t = next.team ?? selectedTeam;
    const params = new URLSearchParams();
    if (p !== "year") params.set("period", p);
    params.set("year", String(y));
    if (p === "month") params.set("month", String(m));
    if (p === "quarter") params.set("quarter", String(q));
    if (c && c !== "all") params.set("collector", c);
    if (t && t !== "all") params.set("team", t);
    const qs = params.toString();
    router.push(`/quality-score${qs ? `?${qs}` : ""}`);
  }

  const yearOptions = useMemo(() => {
    const now = new Date().getFullYear();
    const list: number[] = [];
    for (let i = now + 1; i >= now - 4; i--) list.push(i);
    return list;
  }, []);

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

  const inputCls = "rounded-lg border border-slate-300 px-3 py-2 bg-white text-sm";
  const allModules = Array.from(new Set(moduleScores.map((r) => r.module))).sort();

  const collectorOptions =
    selectedTeam !== "all"
      ? collectors.filter((c) => c.team === selectedTeam)
      : collectors;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Quality Score</h1>
        <p className="text-slate-500">Monthly quality scores by module and freeze frame.</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap gap-3 items-end">
        <div className="w-40">
          <label className="block text-xs text-slate-500 mb-1">Period</label>
          <select
            value={period}
            onChange={(e) => applyFilters({ period: e.target.value as Period })}
            className={`${inputCls} w-full`}
          >
            <option value="month">Month</option>
            <option value="quarter">Quarter</option>
            <option value="year">Year</option>
          </select>
        </div>
        <div className="w-28">
          <label className="block text-xs text-slate-500 mb-1">Year</label>
          <select
            value={year}
            onChange={(e) => applyFilters({ year: Number(e.target.value) })}
            className={`${inputCls} w-full`}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        {period === "month" && (
          <div className="w-40">
            <label className="block text-xs text-slate-500 mb-1">Month</label>
            <select
              value={month}
              onChange={(e) => applyFilters({ month: Number(e.target.value) })}
              className={`${inputCls} w-full`}
            >
              {MONTH_NAMES.map((name, idx) => (
                <option key={name} value={idx + 1}>{name}</option>
              ))}
            </select>
          </div>
        )}
        {period === "quarter" && (
          <div className="w-32">
            <label className="block text-xs text-slate-500 mb-1">Quarter</label>
            <select
              value={quarter}
              onChange={(e) => applyFilters({ quarter: Number(e.target.value) })}
              className={`${inputCls} w-full`}
            >
              {[1, 2, 3, 4].map((q) => (
                <option key={q} value={q}>Q{q}</option>
              ))}
            </select>
          </div>
        )}

        {!isViewer && (
          <div className="w-44">
            <label className="block text-xs text-slate-500 mb-1">Team</label>
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
            <label className="block text-xs text-slate-500 mb-1">Collector</label>
            <Combobox
              options={[
                {
                  value: "all",
                  label:
                    selectedTeam !== "all"
                      ? `All on ${selectedTeam}`
                      : "All collectors",
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

        {(selectedCollector !== "all" || selectedTeam !== "all" || period !== "year") && (
          <button
            type="button"
            onClick={() => router.push("/quality-score")}
            className={`${inputCls} text-slate-600 hover:bg-slate-50`}
          >
            Reset
          </button>
        )}
      </div>

      {summaryScores && (
        <div>
          <h2 className="text-sm font-semibold text-slate-500 mb-3">
            Average for the selected period
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {summaryScores.modSummary.map(({ module, avg }) => (
              <div key={module} className="bg-white rounded-2xl border border-slate-200 p-4">
                <p className="text-xs text-slate-500 truncate capitalize">
                  {module.replace(/_/g, " ")}
                </p>
                <p className="text-2xl font-bold mt-1">{avg.toFixed(1)}%</p>
              </div>
            ))}
            {summaryScores.ffAvg !== null && (
              <div className="bg-white rounded-2xl border border-slate-200 p-4">
                <p className="text-xs text-slate-500">Freeze Frame</p>
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
                <div key={mod} className="bg-white rounded-2xl border border-slate-200 p-4">
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
          No quality scores uploaded for this filter.{" "}
          {(role === "Admin" || role === "QualityLeader") && (
            <a href="/quality-upload" className="text-slate-900 underline">
              Upload scores
            </a>
          )}
        </p>
      )}
    </div>
  );
}
