"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MODULES, type ModuleValue, type CollectorRow } from "@/lib/modules";
import MultiSelectCombobox, { type MSOption } from "@/components/MultiSelectCombobox";

const NO_TITLE = "__none__";
const NO_TEAM = "__noteam__";

const first3 = (s: string | null) => (s ? s.trim().split(/\s+/).slice(0, 3).join(" ") : "");

// v58 fix: always render "Code - Name - Squad" with "-" for whatever's
// missing, instead of conditionally hiding fields (which produced
// "Code - Code" when name fell back to the hr_code itself).
function clabel(hr: string | null, name: string | null, team: string | null) {
  const displayName = name && name !== hr ? first3(name) : "-";
  return `${hr || "-"} - ${displayName} - ${team || "-"}`;
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const lastDayOfMonth = (y: number, m1to12: number) => new Date(y, m1to12, 0).getDate();

export default function CollectorsPerformance({
  from,
  to,
  rows,
  teams,
  titles,
  matchCount,
}: {
  from: string;
  to: string;
  rows: CollectorRow[];
  teams: string[];
  titles: string[];
  matchCount: number;
  isAdmin?: boolean;
}) {
  const router = useRouter();

  // v59: every filter is now multi-select. Empty array = "all".
  const [collectorFilter, setCollectorFilter] = useState<string[]>([]);
  const [teamFilter, setTeamFilter] = useState<string[]>([]);
  const [titleFilter, setTitleFilter] = useState<string[]>([]);
  const [moduleFilter, setModuleFilter] = useState<ModuleValue[]>([]);
  const [topN, setTopN] = useState("");

  // v59: reviewer's own assigned collectors. Loaded on mount; if empty the
  // toggle stays hidden. When ON, table is restricted to those hr_codes.
  // v59: `assignmentsLoaded` gates first render so the toggle only paints
  // once we know for sure whether the caller has any assignments.
  const [myAssigned, setMyAssigned] = useState<string[]>([]);
  const [assignmentsLoaded, setAssignmentsLoaded] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
  useEffect(() => {
    fetch("/api/my-assigned", { cache: "no-store" })
      .then((r) => r.json())
      .then(({ hr_codes }: { hr_codes?: string[] }) => {
        if (Array.isArray(hr_codes)) setMyAssigned(hr_codes);
      })
      .catch(() => {})
      .finally(() => setAssignmentsLoaded(true));
  }, []);
  const mineSet = useMemo(() => new Set(myAssigned), [myAssigned]);

  function pushDates(f: string, t: string) {
    const params = new URLSearchParams();
    if (f) params.set("from", f);
    if (t) params.set("to", t);
    const qs = params.toString();
    router.push(`/analytics${qs ? `?${qs}` : ""}`);
  }
  const applyDates = (next: { from?: string; to?: string }) =>
    pushDates(next.from ?? from, next.to ?? to);

  const monthValue = useMemo(() => {
    if (!from || !to) return "";
    const [y, m, d] = from.split("-").map(Number);
    if (d !== 1) return "";
    if (to === `${from.slice(0, 7)}-${pad(lastDayOfMonth(y, m))}`) return from.slice(0, 7);
    return "";
  }, [from, to]);
  function onMonth(val: string) {
    if (!val) return pushDates("", "");
    const [y, m] = val.split("-").map(Number);
    pushDates(`${val}-01`, `${val}-${pad(lastDayOfMonth(y, m))}`);
  }

  const weekValue = useMemo(() => {
    if (!from || !to) return "";
    const f = new Date(from + "T00:00:00");
    const t = new Date(to + "T00:00:00");
    const diff = Math.round((t.getTime() - f.getTime()) / 86400000);
    return diff === 6 && f.getDay() === 0 ? from : "";
  }, [from, to]);
  function onWeek(val: string) {
    if (!val) return pushDates("", "");
    const d = new Date(val + "T00:00:00");
    const sun = new Date(d);
    sun.setDate(d.getDate() - d.getDay());
    const sat = new Date(sun);
    sat.setDate(sun.getDate() + 6);
    pushDates(iso(sun), iso(sat));
  }

  // v59: multi-module metric = sum of selected modules per collector.
  // 0 modules picked = the row's total across ALL modules (previous behavior).
  // 1 module = just that module's count.
  // 2+ modules = sum across the picked ones.
  const metric = (r: CollectorRow) => {
    if (moduleFilter.length === 0) return r.total;
    return moduleFilter.reduce((acc, m) => acc + (r.counts[m] ?? 0), 0);
  };

  const collectorSet = useMemo(() => new Set(collectorFilter), [collectorFilter]);
  const teamSet = useMemo(() => new Set(teamFilter), [teamFilter]);
  const titleSet = useMemo(() => new Set(titleFilter), [titleFilter]);

  const filtered = useMemo(() => {
    let arr = rows.filter((r) => {
      if (onlyMine && mineSet.size > 0 && !mineSet.has(r.hr_code)) return false;
      if (collectorSet.size > 0 && !collectorSet.has(r.hr_code)) return false;
      if (teamSet.size > 0) {
        const tv = r.team ? r.team : NO_TEAM;
        if (!teamSet.has(tv)) return false;
      }
      if (titleSet.size > 0) {
        const tv = r.title ? r.title : NO_TITLE;
        if (!titleSet.has(tv)) return false;
      }
      return true;
    });
    arr = arr.sort((a, b) => metric(b) - metric(a));
    const n = parseInt(topN, 10);
    return Number.isFinite(n) && n > 0 ? arr.slice(0, n) : arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, collectorSet, teamSet, titleSet, moduleFilter, topN, onlyMine, mineSet]);

  const totalMistakes = filtered.reduce((s, r) => s + metric(r), 0);

  // Match Count reflects the selected collector when exactly one is chosen.
  const selectedCollector =
    collectorFilter.length === 1
      ? rows.find((r) => r.hr_code === collectorFilter[0])
      : null;
  const displayMatchCount = selectedCollector
    ? selectedCollector.matches ?? 0
    : matchCount;
  const matchHint = selectedCollector
    ? "matches for this collector"
    : "distinct matches in range";

  const collectorOptions: MSOption[] = useMemo(
    () =>
      [...rows]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((r) => ({ value: r.hr_code, label: clabel(r.hr_code, r.name, r.team) })),
    [rows]
  );
  const teamOptions: MSOption[] = useMemo(
    () => [
      { value: NO_TEAM, label: "(No team)" },
      ...teams.map((t) => ({ value: t, label: t })),
    ],
    [teams]
  );
  const titleOptions: MSOption[] = useMemo(
    () => [
      { value: NO_TITLE, label: "(No title)" },
      ...titles.map((t) => ({ value: t, label: t })),
    ],
    [titles]
  );
  const moduleOptions: MSOption[] = useMemo(
    () => MODULES.map((m) => ({ value: m.value, label: m.label })),
    []
  );

  const inputCls = "w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900";
  const activeModuleLabel =
    moduleFilter.length === 1
      ? MODULES.find((m) => m.value === moduleFilter[0])?.label
      : moduleFilter.length > 1
      ? `${moduleFilter.length} modules`
      : null;
  const anyFilter =
    from ||
    to ||
    collectorFilter.length > 0 ||
    teamFilter.length > 0 ||
    titleFilter.length > 0 ||
    moduleFilter.length > 0 ||
    topN;

  function clearAll() {
    setCollectorFilter([]);
    setTeamFilter([]);
    setTitleFilter([]);
    setModuleFilter([]);
    setTopN("");
    router.push("/analytics");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Collectors Performance</h1>
        <p className="text-slate-500 dark:text-slate-400">
          Ranked by highest errors{" "}
          {activeModuleLabel ? `in ${activeModuleLabel}` : "across all modules"}
        </p>
      </div>

      {/* Filters (at the top) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-4">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Review date</p>
          <div className="flex flex-wrap gap-3">
            <div className="w-44">
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Month</label>
              <input type="month" value={monthValue} onChange={(e) => onMonth(e.target.value)} className={inputCls} />
            </div>
            <div className="w-44">
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Week (Sun–Sat)</label>
              <input type="date" value={weekValue} onChange={(e) => onWeek(e.target.value)} className={inputCls} />
            </div>
            <div className="w-40">
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">From</label>
              <input type="date" value={from} max={to || undefined} onChange={(e) => applyDates({ from: e.target.value })} className={inputCls} />
            </div>
            <div className="w-40">
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">To</label>
              <input type="date" value={to} min={from || undefined} onChange={(e) => applyDates({ to: e.target.value })} className={inputCls} />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="w-72">
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Collectors</label>
            <MultiSelectCombobox options={collectorOptions} values={collectorFilter} onApply={setCollectorFilter} placeholder="All collectors" />
          </div>
          <div className="w-52">
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Teams</label>
            <MultiSelectCombobox options={teamOptions} values={teamFilter} onApply={setTeamFilter} placeholder="All teams" />
          </div>
          <div className="w-52">
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Titles</label>
            <MultiSelectCombobox options={titleOptions} values={titleFilter} onApply={setTitleFilter} placeholder="All titles" />
          </div>
          <div className="w-52">
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Modules</label>
            <MultiSelectCombobox
              options={moduleOptions}
              values={moduleFilter}
              onApply={(v) => setModuleFilter(v as ModuleValue[])}
              placeholder="All modules"
            />
          </div>
          <div className="w-28">
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Top N</label>
            <input type="number" min={1} value={topN} onChange={(e) => setTopN(e.target.value)} placeholder="All" className={inputCls} />
          </div>
          {/* v59: Reviewer-only assigned filter. Hidden when the caller has
              no active assignments (Admin, Viewer, or unassigned reviewers). */}
          {assignmentsLoaded && (
            <div className="flex items-end">
              <label
                className={`flex items-center gap-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900 ${
                  myAssigned.length === 0
                    ? "text-slate-400 dark:text-slate-500 cursor-not-allowed"
                    : "text-slate-600 dark:text-slate-300 cursor-pointer"
                }`}
              >
                <input
                  type="checkbox"
                  checked={onlyMine}
                  disabled={myAssigned.length === 0}
                  onChange={(e) => setOnlyMine(e.target.checked)}
                  className="h-4 w-4"
                />
                <span>Only my assigned ({myAssigned.length})</span>
              </label>
            </div>
          )}
          {anyFilter && (
            <div className="flex items-end">
              <button type="button" onClick={clearAll} className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                Clear all
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Match Count" value={displayMatchCount} hint={matchHint} />
        <StatCard label="Filtered Collectors" value={filtered.length} />
        <StatCard label={activeModuleLabel ? `Total ${activeModuleLabel}` : "Total mistakes"} value={totalMistakes} />
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 text-sm text-slate-500 dark:text-slate-400">
          Sorted by{" "}
          <span className="font-medium text-slate-700 dark:text-slate-200">{activeModuleLabel ?? "Total"}</span>{" "}
          (highest first).{" "}
          {moduleFilter.length === 0 && "Click a module header to show only that module."}
        </div>
        {filtered.length === 0 ? (
          <p className="text-slate-500 dark:text-slate-400 p-5">No collectors for this filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-3">#</th>
                  <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-3 whitespace-nowrap">Collector</th>
                  {moduleFilter.length === 1 ? (
                    <th className="text-right font-semibold text-slate-900 dark:text-slate-100 px-4 py-3 whitespace-nowrap">
                      {activeModuleLabel}
                    </th>
                  ) : moduleFilter.length > 1 ? (
                    <>
                      {moduleFilter.map((mv) => {
                        const m = MODULES.find((x) => x.value === mv);
                        if (!m) return null;
                        return (
                          <th key={m.value} className="text-right font-medium text-slate-500 dark:text-slate-400 px-3 py-3 whitespace-nowrap">
                            {m.label}
                          </th>
                        );
                      })}
                      <th className="text-right font-semibold text-slate-600 dark:text-slate-300 px-4 py-3">Total ↓</th>
                    </>
                  ) : (
                    <>
                      {MODULES.map((m) => (
                        <th
                          key={m.value}
                          onClick={() => setModuleFilter([m.value])}
                          className="text-right font-medium text-slate-500 dark:text-slate-400 px-3 py-3 whitespace-nowrap cursor-pointer hover:text-slate-900"
                          title={`Show only ${m.label}`}
                        >
                          {m.label}
                        </th>
                      ))}
                      <th className="text-right font-semibold text-slate-600 dark:text-slate-300 px-4 py-3">Total ↓</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => (
                  <tr key={c.hr_code} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800">
                    <td className="px-4 py-2.5 text-slate-400 dark:text-slate-500 tabular-nums">{i + 1}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className="font-medium text-slate-800 dark:text-slate-100">{c.hr_code ?? "—"}</span>
                      {c.name && c.name !== c.hr_code && <span className="text-slate-500 dark:text-slate-400"> - {first3(c.name)}</span>}
                      {c.team && <span className="text-slate-500 dark:text-slate-400"> - {c.team}</span>}
                    </td>
                    {moduleFilter.length === 1 ? (
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                        {c.counts[moduleFilter[0]]}
                      </td>
                    ) : moduleFilter.length > 1 ? (
                      <>
                        {moduleFilter.map((mv) => (
                          <td key={mv} className="px-3 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">
                            {c.counts[mv] ?? 0}
                          </td>
                        ))}
                        <td className="px-4 py-2.5 text-right font-bold tabular-nums">{metric(c)}</td>
                      </>
                    ) : (
                      <>
                        {MODULES.map((m) => (
                          <td key={m.value} className="px-3 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">
                            {c.counts[m.value]}
                          </td>
                        ))}
                        <td className="px-4 py-2.5 text-right font-bold tabular-nums">{c.total}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-3xl font-bold mt-1 tabular-nums">{value}</p>
      {hint && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}
