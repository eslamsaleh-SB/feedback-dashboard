"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  MODULES,
  PERIODS,
  type ModuleValue,
  type PartSummary,
  type Period,
} from "@/lib/modules";

type CollectorOpt = { hr_code: string; name: string };
type Role = "Admin" | "Uploader" | "Viewer";

const MODULE_LABEL: Record<string, string> = Object.fromEntries(
  MODULES.map((m) => [m.value, m.label])
);

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  );
}

export default function AnalyticsDashboard({
  role,
  myName,
  isLinked,
  period,
  collector,
  parts,
  moduleTotals,
  collectors,
  limited,
}: {
  role: Role;
  myName: string | null;
  isLinked: boolean;
  period: Period;
  collector: string; // hr_code or "all"
  parts: PartSummary[];
  moduleTotals: Record<ModuleValue, number>;
  collectors: CollectorOpt[];
  limited: boolean;
}) {
  const router = useRouter();
  const isPersonal = role === "Viewer";
  const [tab, setTab] = useState<"matches" | "modules">("matches");
  const [expanded, setExpanded] = useState<string | null>(null);

  // Filters live in the URL; changing them re-runs the server query.
  function applyFilters(next: { period?: Period; collector?: string }) {
    const p = next.period ?? period;
    const c = next.collector ?? collector;
    const params = new URLSearchParams();
    if (p && p !== "all") params.set("period", p);
    if (c && c !== "all") params.set("collector", c);
    const qs = params.toString();
    router.push(`/analytics${qs ? `?${qs}` : ""}`);
  }

  const totalMistakes = Object.values(moduleTotals).reduce((a, b) => a + b, 0);
  const maxCount = Math.max(1, ...Object.values(moduleTotals));
  const modulesWith = Object.values(moduleTotals).filter((c) => c > 0).length;
  const partKey = (p: PartSummary) => `${p.matchid}|${p.partid}`;

  if (isPersonal && !isLinked) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
        <h1 className="text-xl font-bold mb-2">My Analytics</h1>
        <p className="text-slate-600">
          Your account isn’t linked to a collector profile yet. Please ask an
          Admin to assign you (and set your HR code) on the Accounts page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + global filters */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {isPersonal ? "My Analytics" : "Analytics"}
          </h1>
          {isPersonal && myName && <p className="text-slate-500">{myName}</p>}
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          {!isPersonal && (
            <div>
              <label className="block text-xs text-slate-500 mb-1">
                Collector
              </label>
              <select
                value={collector}
                onChange={(e) => applyFilters({ collector: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 bg-white"
              >
                <option value="all">All collectors</option>
                {collectors.map((c) => (
                  <option key={c.hr_code} value={c.hr_code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs text-slate-500 mb-1">Period</label>
            <select
              value={period}
              onChange={(e) =>
                applyFilters({ period: e.target.value as Period })
              }
              className="rounded-lg border border-slate-300 px-3 py-2 bg-white"
            >
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Summary cards (totals are exact across all filtered data) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Match parts"
          value={limited ? `${parts.length}+` : parts.length}
        />
        <StatCard label="Total mistakes" value={totalMistakes} />
        <StatCard label="Modules with mistakes" value={modulesWith} />
      </div>

      {/* Tabs */}
      <div className="inline-flex rounded-xl border border-slate-300 bg-white p-1">
        {(
          [
            { id: "matches", label: "Match View" },
            { id: "modules", label: "Module View" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              tab === t.id ? "bg-slate-900 text-white" : "text-slate-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ---- View 1: Match View (grouped by matchid + partid) ---- */}
      {tab === "matches" &&
        (parts.length === 0 ? (
          <p className="text-slate-500">No match parts in this period.</p>
        ) : (
          <>
            {limited && (
              <p className="text-xs text-amber-600">
                Showing the {parts.length} most recent match parts. Narrow the
                period or pick a collector to see a specific set.
              </p>
            )}
            <div className="space-y-3">
              {parts.map((p) => {
                const k = partKey(p);
                const open = expanded === k;
                const present = MODULES.filter((m) => p.counts[m.value] > 0);
                return (
                  <div
                    key={k}
                    className="bg-white rounded-2xl border border-slate-200 overflow-hidden"
                  >
                    <button
                      onClick={() => setExpanded(open ? null : k)}
                      className="w-full text-left p-5 flex items-center justify-between gap-4 hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold truncate">
                          Match {p.matchid} · Part {p.partid}
                        </p>
                        <p className="text-sm text-slate-500">
                          {!isPersonal && <>{p.collector_name} · </>}
                          {p.date ?? "—"} · {p.total} mistake(s)
                        </p>
                      </div>
                      <span className="text-slate-400 text-sm shrink-0">
                        {open ? "▲" : "▼"}
                      </span>
                    </button>

                    {open && (
                      <div className="border-t border-slate-100 p-5">
                        {present.length === 0 ? (
                          <p className="text-sm text-slate-400">
                            No mistakes recorded for this part.
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {present.map((m) => (
                              <span
                                key={m.value}
                                className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-1.5 text-sm text-slate-700"
                              >
                                {m.label}:{" "}
                                <span className="font-semibold">
                                  {p.counts[m.value]}
                                </span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ))}

      {/* ---- View 2: Module View ---- */}
      {tab === "modules" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="font-semibold mb-4">
            Mistakes by module
            <span className="text-slate-400 font-normal">
              {" "}
              · {PERIODS.find((p) => p.value === period)?.label}
            </span>
          </h2>
          {totalMistakes === 0 ? (
            <p className="text-slate-500">No mistakes in this period.</p>
          ) : (
            <div className="space-y-3">
              {MODULES.map((mod) => {
                const c = moduleTotals[mod.value] ?? 0;
                const pct = Math.round((c / maxCount) * 100);
                return (
                  <div key={mod.value} className="flex items-center gap-3">
                    <span className="w-44 shrink-0 text-sm text-slate-600">
                      {mod.label}
                    </span>
                    <div className="flex-1 bg-slate-100 rounded-full h-6 overflow-hidden">
                      <div
                        className="h-6 bg-slate-900 rounded-full transition-all"
                        style={{ width: `${c === 0 ? 0 : Math.max(pct, 4)}%` }}
                      />
                    </div>
                    <span className="w-12 text-right text-sm font-semibold tabular-nums">
                      {c}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
