"use client";

import { useMemo, useState } from "react";
import { MODULES, type AssignmentRow, type Mistake } from "@/lib/modules";

// Re-export so existing imports from this component keep working.
export { MODULES };
export type { AssignmentRow, Mistake };

const MODULE_LABEL: Record<string, string> = Object.fromEntries(
  MODULES.map((m) => [m.value, m.label])
);

type CollectorOpt = { hr_code: string; name: string };
type Role = "Admin" | "Uploader" | "Viewer";
type Period = "this_week" | "last_week" | "this_month" | "all";

const PERIODS: { value: Period; label: string }[] = [
  { value: "this_week", label: "This Week" },
  { value: "last_week", label: "Last Week" },
  { value: "this_month", label: "This Month" },
  { value: "all", label: "All Time" },
];

// ---- Date range helpers (week starts Monday) ----
function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function rangeFor(period: Period): { from: Date; to: Date } | null {
  if (period === "all") return null;
  const now = new Date();
  const today = startOfDay(now);
  const dow = (today.getDay() + 6) % 7; // 0 = Monday
  const monday = new Date(today);
  monday.setDate(today.getDate() - dow);

  if (period === "this_week") {
    const to = new Date(monday);
    to.setDate(monday.getDate() + 7);
    return { from: monday, to };
  }
  if (period === "last_week") {
    const from = new Date(monday);
    from.setDate(monday.getDate() - 7);
    return { from, to: monday };
  }
  const from = new Date(today.getFullYear(), today.getMonth(), 1);
  const to = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  return { from, to };
}
function inRange(dateStr: string | null, r: { from: Date; to: Date } | null) {
  if (!r) return true;
  if (!dateStr) return false;
  const d = startOfDay(new Date(dateStr));
  if (isNaN(d.getTime())) return false;
  return d >= r.from && d < r.to;
}

const partKey = (matchid: string, partid: number) => `${matchid}|${partid}`;

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
  assignments,
  mistakes,
  collectors,
}: {
  role: Role;
  myName: string | null;
  isLinked: boolean;
  assignments: AssignmentRow[];
  mistakes: Mistake[];
  collectors: CollectorOpt[];
}) {
  const isPersonal = role === "Viewer";
  const [tab, setTab] = useState<"matches" | "modules">("matches");
  const [period, setPeriod] = useState<Period>("all");
  const [collectorFilter, setCollectorFilter] = useState("all"); // hr_code
  const [expanded, setExpanded] = useState<string | null>(null);

  const range = useMemo(() => rangeFor(period), [period]);

  // Collector filter (Admin/Uploader only — Viewers scoped by RLS).
  const scoped = useMemo(
    () =>
      isPersonal || collectorFilter === "all"
        ? assignments
        : assignments.filter((a) => a.hr_code === collectorFilter),
    [isPersonal, collectorFilter, assignments]
  );

  // Global date filter drives BOTH views, based on the assignment date.
  const visibleParts = useMemo(
    () => scoped.filter((a) => inRange(a.date, range)),
    [scoped, range]
  );

  // (matchid|partid) -> assignment, for the parts passing the filters.
  const partById = useMemo(() => {
    const m = new Map<string, AssignmentRow>();
    visibleParts.forEach((a) => m.set(partKey(a.matchid, a.partid), a));
    return m;
  }, [visibleParts]);

  const visibleMistakes = useMemo(
    () => mistakes.filter((mk) => partById.has(partKey(mk.matchid, mk.partid))),
    [mistakes, partById]
  );

  // View 1: mistakes grouped by match part.
  const mistakesByPart = useMemo(() => {
    const m = new Map<string, Mistake[]>();
    visibleMistakes.forEach((mk) => {
      const k = partKey(mk.matchid, mk.partid);
      const arr = m.get(k) ?? [];
      arr.push(mk);
      m.set(k, arr);
    });
    return m;
  }, [visibleMistakes]);

  // View 2: totals per module.
  const countsByModule = useMemo(() => {
    const counts: Record<string, number> = {};
    MODULES.forEach((m) => (counts[m.value] = 0));
    visibleMistakes.forEach((mk) => {
      counts[mk.module] = (counts[mk.module] ?? 0) + 1;
    });
    return counts;
  }, [visibleMistakes]);

  const maxCount = Math.max(1, ...Object.values(countsByModule));
  const totalMistakes = visibleMistakes.length;

  // Sort parts by date desc then matchid/partid.
  const sortedParts = useMemo(
    () =>
      [...visibleParts].sort((a, b) => {
        const d = (b.date ?? "").localeCompare(a.date ?? "");
        if (d !== 0) return d;
        if (a.matchid !== b.matchid) return a.matchid.localeCompare(b.matchid);
        return a.partid - b.partid;
      }),
    [visibleParts]
  );

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
                value={collectorFilter}
                onChange={(e) => setCollectorFilter(e.target.value)}
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
              onChange={(e) => setPeriod(e.target.value as Period)}
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

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Match parts" value={visibleParts.length} />
        <StatCard label="Total mistakes" value={totalMistakes} />
        <StatCard
          label="Modules with mistakes"
          value={Object.values(countsByModule).filter((c) => c > 0).length}
        />
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
        (sortedParts.length === 0 ? (
          <p className="text-slate-500">No match parts in this period.</p>
        ) : (
          <div className="space-y-3">
            {sortedParts.map((a) => {
              const k = partKey(a.matchid, a.partid);
              const open = expanded === k;
              const ms = mistakesByPart.get(k) ?? [];
              const byModule = new Map<string, Mistake[]>();
              ms.forEach((mk) => {
                const arr = byModule.get(mk.module) ?? [];
                arr.push(mk);
                byModule.set(mk.module, arr);
              });
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
                        Match {a.matchid} · Part {a.partid}
                      </p>
                      <p className="text-sm text-slate-500">
                        {!isPersonal && <>{a.collector_name} · </>}
                        {a.date ?? "—"} · {ms.length} mistake(s)
                      </p>
                    </div>
                    <span className="text-slate-400 text-sm shrink-0">
                      {open ? "▲" : "▼"}
                    </span>
                  </button>

                  {open && (
                    <div className="border-t border-slate-100 p-5 space-y-5">
                      {ms.length === 0 ? (
                        <p className="text-sm text-slate-400">
                          No mistakes recorded for this part.
                        </p>
                      ) : (
                        MODULES.filter((mod) => byModule.has(mod.value)).map(
                          (mod) => (
                            <div key={mod.value}>
                              <p className="text-sm font-semibold text-slate-700 mb-2">
                                {mod.label}{" "}
                                <span className="text-slate-400 font-normal">
                                  ({byModule.get(mod.value)!.length})
                                </span>
                              </p>
                              <ul className="space-y-2">
                                {byModule.get(mod.value)!.map((mk) => (
                                  <li
                                    key={mk.id}
                                    className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2"
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <p className="text-sm text-slate-700">
                                        {mk.error_type || "mistake"}
                                        {mk.collector_event
                                          ? ` · ${mk.collector_event}`
                                          : ""}
                                      </p>
                                      {mk.defect_type && (
                                        <span className="shrink-0 rounded-full bg-amber-100 text-amber-700 text-xs font-medium px-2 py-0.5">
                                          {mk.defect_type}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs text-slate-400 mt-0.5">
                                      key: {mk.key}
                                      {mk.video_timestamp
                                        ? ` · @${mk.video_timestamp}`
                                        : ""}
                                    </p>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )
                        )
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
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
                const c = countsByModule[mod.value] ?? 0;
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
                    <span className="w-10 text-right text-sm font-semibold tabular-nums">
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
