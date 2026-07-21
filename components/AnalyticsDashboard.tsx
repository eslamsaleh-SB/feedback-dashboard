"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  MODULES,
  type ModuleValue,
  type PartSummary,
  type CollectorRow,
} from "@/lib/modules";

type CollectorOpt = { hr_code: string; name: string };
type Role = "Admin" | "Uploader" | "Viewer";
type Tab = "matches" | "modules" | "collectors";
type SortKey = ModuleValue | "total";

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  );
}

export default function AnalyticsDashboard({
  role,
  myName,
  isLinked,
  from,
  to,
  collector,
  parts,
  moduleTotals,
  collectorRows,
  collectors,
  limited,
}: {
  role: Role;
  myName: string | null;
  isLinked: boolean;
  from: string; // YYYY-MM-DD or ""
  to: string;
  collector: string; // hr_code or "all"
  parts: PartSummary[];
  moduleTotals: Record<ModuleValue, number>;
  collectorRows: CollectorRow[];
  collectors: CollectorOpt[];
  limited: boolean;
}) {
  const router = useRouter();
  const isPersonal = role === "Viewer";
  const [tab, setTab] = useState<Tab>("matches");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("total");

  // Filters live in the URL; changing them re-runs the server query.
  function applyFilters(next: { from?: string; to?: string; collector?: string }) {
    const f = next.from ?? from;
    const t = next.to ?? to;
    const c = next.collector ?? collector;
    const params = new URLSearchParams();
    if (f) params.set("from", f);
    if (t) params.set("to", t);
    if (c && c !== "all") params.set("collector", c);
    const qs = params.toString();
    router.push(`/analytics${qs ? `?${qs}` : ""}`);
  }

  const totalMistakes = Object.values(moduleTotals).reduce((a, b) => a + b, 0);
  const maxCount = Math.max(1, ...Object.values(moduleTotals));
  const modulesWith = Object.values(moduleTotals).filter((c) => c > 0).length;
  const partKey = (p: PartSummary) => `${p.matchid}|${p.partid}`;

  const sortedCollectors = [...collectorRows].sort((a, b) => {
    const av = sortKey === "total" ? a.total : a.counts[sortKey];
    const bv = sortKey === "total" ? b.total : b.counts[sortKey];
    return bv - av;
  });

  const inputCls = "rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900";

  if (isPersonal && !isLinked) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 text-center">
        <h1 className="text-xl font-bold mb-2">My Analytics</h1>
        <p className="text-slate-600 dark:text-slate-300">
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
          {isPersonal && myName && <p className="text-slate-500 dark:text-slate-400">{myName}</p>}
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          {!isPersonal && (
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                Collector
              </label>
              <select
                value={collector}
                onChange={(e) => applyFilters({ collector: e.target.value })}
                className={inputCls}
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
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">From</label>
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => applyFilters({ from: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">To</label>
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => applyFilters({ to: e.target.value })}
              className={inputCls}
            />
          </div>
          {(from || to || collector !== "all") && (
            <button
              type="button"
              onClick={() => router.push("/analytics")}
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Clear
            </button>
          )}
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
      <div className="inline-flex rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-1">
        {(
          [
            { id: "matches", label: "Match View" },
            { id: "modules", label: "Module View" },
            { id: "collectors", label: "Collectors" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              tab === t.id ? "bg-slate-900 text-white" : "text-slate-600 dark:text-slate-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ---- View 1: Match View (grouped by matchid + partid) ---- */}
      {tab === "matches" &&
        (parts.length === 0 ? (
          <p className="text-slate-500 dark:text-slate-400">No match parts for this filter.</p>
        ) : (
          <>
            {limited && (
              <p className="text-xs text-amber-600">
                Showing the {parts.length} most recent match parts. Narrow the
                dates or pick a collector to see a specific set.
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
                    className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
                  >
                    <button
                      onClick={() => setExpanded(open ? null : k)}
                      className="w-full text-left p-5 flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold truncate">
                          Match {p.matchid} · Part {p.partid}
                        </p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          {!isPersonal && <>{p.collector_name} · </>}
                          {p.date ?? "—"} · {p.total} mistake(s)
                        </p>
                      </div>
                      <span className="text-slate-400 dark:text-slate-500 text-sm shrink-0">
                        {open ? "▲" : "▼"}
                      </span>
                    </button>

                    {open && (
                      <div className="border-t border-slate-100 dark:border-slate-800 p-5">
                        {present.length === 0 ? (
                          <p className="text-sm text-slate-400 dark:text-slate-500">
                            No mistakes recorded for this part.
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {present.map((m) => (
                              <span
                                key={m.value}
                                className="rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200"
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
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
          <h2 className="font-semibold mb-4">Mistakes by module</h2>
          {totalMistakes === 0 ? (
            <p className="text-slate-500 dark:text-slate-400">No mistakes for this filter.</p>
          ) : (
            <div className="space-y-3">
              {MODULES.map((mod) => {
                const c = moduleTotals[mod.value] ?? 0;
                const pct = Math.round((c / maxCount) * 100);
                return (
                  <div key={mod.value} className="flex items-center gap-3">
                    <span className="w-44 shrink-0 text-sm text-slate-600 dark:text-slate-300">
                      {mod.label}
                    </span>
                    <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-6 overflow-hidden">
                      <div
                        className="h-6 bg-slate-900 dark:bg-emerald-500 rounded-full transition-all"
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

      {/* ---- View 3: Collectors (ranked; click a column to sort) ---- */}
      {tab === "collectors" && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 text-sm text-slate-500 dark:text-slate-400">
            Ranked by{" "}
            <span className="font-medium text-slate-700 dark:text-slate-200">
              {sortKey === "total"
                ? "total"
                : MODULES.find((m) => m.value === sortKey)?.label}
            </span>{" "}
            — click a column to rank by that module.
          </div>
          {sortedCollectors.length === 0 ? (
            <p className="text-slate-500 dark:text-slate-400 p-5">No collectors for this filter.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-3 whitespace-nowrap">
                      Collector
                    </th>
                    {MODULES.map((m) => (
                      <th
                        key={m.value}
                        onClick={() => setSortKey(m.value)}
                        className={`text-right font-medium px-3 py-3 whitespace-nowrap cursor-pointer hover:text-slate-900 ${
                          sortKey === m.value
                            ? "text-slate-900 dark:text-slate-100"
                            : "text-slate-500 dark:text-slate-400"
                        }`}
                        title={`Sort by ${m.label}`}
                      >
                        {m.label}
                        {sortKey === m.value ? " ↓" : ""}
                      </th>
                    ))}
                    <th
                      onClick={() => setSortKey("total")}
                      className={`text-right font-semibold px-4 py-3 cursor-pointer hover:text-slate-900 ${
                        sortKey === "total" ? "text-slate-900 dark:text-slate-100" : "text-slate-600 dark:text-slate-300"
                      }`}
                      title="Sort by total"
                    >
                      Total{sortKey === "total" ? " ↓" : ""}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCollectors.map((c) => (
                    <tr
                      key={c.hr_code}
                      className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="font-medium text-slate-800 dark:text-slate-100">
                          {c.name}
                        </span>
                        {c.name !== c.hr_code && (
                          <span className="text-slate-400 dark:text-slate-500"> · {c.hr_code}</span>
                        )}
                      </td>
                      {MODULES.map((m) => (
                        <td
                          key={m.value}
                          className={`px-3 py-2.5 text-right tabular-nums ${
                            sortKey === m.value
                              ? "text-slate-900 dark:text-slate-100 font-semibold"
                              : "text-slate-600 dark:text-slate-300"
                          }`}
                        >
                          {c.counts[m.value]}
                        </td>
                      ))}
                      <td className="px-4 py-2.5 text-right font-bold tabular-nums">
                        {c.total}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
