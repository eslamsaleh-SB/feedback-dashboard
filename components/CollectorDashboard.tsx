"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MODULES, type ModuleValue, type PartSummary, type Report, type FeedbackSession } from "@/lib/modules";

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  );
}

export default function CollectorDashboard({
  myName,
  myHr,
  myTeam,
  isLinked,
  from,
  to,
  parts,
  moduleTotals,
  reports,
  feedbackSessions,
}: {
  myName: string | null;
  myHr: string | null;
  myTeam: string | null;
  isLinked: boolean;
  from: string;
  to: string;
  parts: PartSummary[];
  moduleTotals: Record<ModuleValue, number>;
  reports: Report[];
  feedbackSessions: FeedbackSession[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const totalMistakes = Object.values(moduleTotals).reduce((a, b) => a + b, 0);
  const modulesWith = Object.values(moduleTotals).filter((c) => c > 0).length;

  const inputCls = "rounded-lg border border-slate-300 px-3 py-2 bg-white";

  function applyFilters(next: { from?: string; to?: string }) {
    const f = next.from ?? from;
    const t = next.to ?? to;
    const params = new URLSearchParams();
    if (f) params.set("from", f);
    if (t) params.set("to", t);
    const qs = params.toString();
    router.push(`/analytics${qs ? `?${qs}` : ""}`);
  }

  if (!isLinked) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
        <h1 className="text-xl font-bold mb-2">My Dashboard</h1>
        <p className="text-slate-600">
          Your account isn't linked to a collector profile yet. Please ask an
          Admin to assign you on the Accounts page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">My Dashboard</h1>
          {myName && <p className="text-slate-500">{myName}</p>}
          {myTeam && <p className="text-xs text-slate-400">{myTeam}</p>}
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-xs text-slate-500 mb-1">From</label>
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => applyFilters({ from: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">To</label>
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => applyFilters({ to: e.target.value })}
              className={inputCls}
            />
          </div>
          {(from || to) && (
            <button
              type="button"
              onClick={() => router.push("/analytics")}
              className={`${inputCls} text-slate-600 hover:bg-slate-50`}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Match parts" value={parts.length} />
        <StatCard label="Total mistakes" value={totalMistakes} />
        <StatCard label="Modules with mistakes" value={modulesWith} />
      </div>

      {/* Quick counters — reports + sessions (clicking goes to dedicated page) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => router.push("/my-reports")}
          className="bg-white rounded-2xl border border-slate-200 p-5 text-left hover:bg-slate-50 transition"
        >
          <p className="text-sm text-slate-500">Reports</p>
          <p className="text-3xl font-bold mt-1">{reports.length}</p>
          <p className="text-xs text-slate-400 mt-1">View all →</p>
        </button>
        <button
          type="button"
          onClick={() => router.push("/my-sessions")}
          className="bg-white rounded-2xl border border-slate-200 p-5 text-left hover:bg-slate-50 transition"
        >
          <p className="text-sm text-slate-500">Feedback sessions</p>
          <p className="text-3xl font-bold mt-1">{feedbackSessions.length}</p>
          <p className="text-xs text-slate-400 mt-1">View all →</p>
        </button>
      </div>

      {/* Module bar chart */}
      {totalMistakes > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="font-semibold mb-4">Mistakes by module</h2>
          <div className="space-y-3">
            {MODULES.map((mod) => {
              const c = moduleTotals[mod.value] ?? 0;
              const pct = Math.round(
                (c / Math.max(1, ...Object.values(moduleTotals))) * 100
              );
              return (
                <div key={mod.value} className="flex items-center gap-3">
                  <span className="w-44 shrink-0 text-sm text-slate-600">
                    {mod.label}
                  </span>
                  <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                    <div
                      className="h-5 bg-slate-900 rounded-full transition-all"
                      style={{ width: `${c === 0 ? 0 : Math.max(pct, 4)}%` }}
                    />
                  </div>
                  <span className="w-10 text-right text-sm font-semibold tabular-nums">
                    {c}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
