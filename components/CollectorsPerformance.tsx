"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MODULES, type ModuleValue, type CollectorRow } from "@/lib/modules";
import Combobox, { type ComboOption } from "@/components/Combobox";

const NO_TITLE = "__none__";
const NO_TEAM = "__noteam__";

const first3 = (s: string | null) => (s ? s.trim().split(/\s+/).slice(0, 3).join(" ") : "");

function clabel(hr: string | null, name: string | null, team: string | null) {
  const parts = [hr || "—"];
  if (name && name !== hr) parts.push(first3(name));
  if (team) parts.push(team);
  return parts.join(" - ");
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

  const [collectorFilter, setCollectorFilter] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [titleFilter, setTitleFilter] = useState("");
  const [moduleFilter, setModuleFilter] = useState<"" | ModuleValue>("");
  const [topN, setTopN] = useState("");

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

  const metric = (r: CollectorRow) => (moduleFilter ? r.counts[moduleFilter] : r.total);

  const filtered = useMemo(() => {
    let arr = rows.filter((r) => {
      if (collectorFilter && r.hr_code !== collectorFilter) return false;
      if (teamFilter) {
        if (teamFilter === NO_TEAM) {
          if (r.team) return false;
        } else if ((r.team ?? "") !== teamFilter) return false;
      }
      if (titleFilter) {
        if (titleFilter === NO_TITLE) {
          if (r.title) return false;
        } else if (r.title !== titleFilter) return false;
      }
      return true;
    });
    arr = arr.sort((a, b) => metric(b) - metric(a));
    const n = parseInt(topN, 10);
    return Number.isFinite(n) && n > 0 ? arr.slice(0, n) : arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, collectorFilter, teamFilter, titleFilter, moduleFilter, topN]);

  const totalMistakes = filtered.reduce((s, r) => s + metric(r), 0);

  // Match Count reflects the selected collector when one is chosen.
  const selectedCollector = collectorFilter
    ? rows.find((r) => r.hr_code === collectorFilter)
    : null;
  const displayMatchCount = selectedCollector
    ? selectedCollector.matches ?? 0
    : matchCount;
  const matchHint = selectedCollector
    ? "matches for this collector"
    : "distinct matches in range";

  const collectorOptions: ComboOption[] = [
    { value: "", label: "All collectors" },
    ...[...rows]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((r) => ({ value: r.hr_code, label: clabel(r.hr_code, r.name, r.team) })),
  ];
  const teamOptions: ComboOption[] = [
    { value: "", label: "All teams" },
    { value: NO_TEAM, label: "(No team)" },
    ...teams.map((t) => ({ value: t, label: t })),
  ];
  const titleOptions: ComboOption[] = [
    { value: "", label: "All titles" },
    { value: NO_TITLE, label: "(No title)" },
    ...titles.map((t) => ({ value: t, label: t })),
  ];
  const moduleOptions: ComboOption[] = [
    { value: "", label: "All modules" },
    ...MODULES.map((m) => ({ value: m.value, label: m.label })),
  ];

  const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 bg-white";
  const activeModuleLabel = moduleFilter
    ? MODULES.find((m) => m.value === moduleFilter)?.label
    : null;
  const anyFilter =
    from || to || collectorFilter || teamFilter || titleFilter || moduleFilter || topN;

  function clearAll() {
    setCollectorFilter("");
    setTeamFilter("");
    setTitleFilter("");
    setModuleFilter("");
    setTopN("");
    router.push("/analytics");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Collectors Performance</h1>
        <p className="text-slate-500">
          Ranked by highest errors{" "}
          {activeModuleLabel ? `in ${activeModuleLabel}` : "across all modules"}
        </p>
      </div>

      {/* Filters (at the top) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-4">
        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">Review date</p>
          <div className="flex flex-wrap gap-3">
            <div className="w-44">
              <label className="block text-xs text-slate-500 mb-1">Month</label>
              <input type="month" value={monthValue} onChange={(e) => onMonth(e.target.value)} className={inputCls} />
            </div>
            <div className="w-44">
              <label className="block text-xs text-slate-500 mb-1">Week (Sun–Sat)</label>
              <input type="date" value={weekValue} onChange={(e) => onWeek(e.target.value)} className={inputCls} />
            </div>
            <div className="w-40">
              <label className="block text-xs text-slate-500 mb-1">From</label>
              <input type="date" value={from} max={to || undefined} onChange={(e) => applyDates({ from: e.target.value })} className={inputCls} />
            </div>
            <div className="w-40">
              <label className="block text-xs text-slate-500 mb-1">To</label>
              <input type="date" value={to} min={from || undefined} onChange={(e) => applyDates({ to: e.target.value })} className={inputCls} />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="w-64">
            <label className="block text-xs text-slate-500 mb-1">Collector</label>
            <Combobox options={collectorOptions} value={collectorFilter} onChange={setCollectorFilter} placeholder="All collectors" />
          </div>
          <div className="w-44">
            <label className="block text-xs text-slate-500 mb-1">Team</label>
            <Combobox options={teamOptions} value={teamFilter} onChange={setTeamFilter} placeholder="All teams" />
          </div>
          <div className="w-44">
            <label className="block text-xs text-slate-500 mb-1">Title</label>
            <Combobox options={titleOptions} value={titleFilter} onChange={setTitleFilter} placeholder="All titles" />
          </div>
          <div className="w-44">
            <label className="block text-xs text-slate-500 mb-1">Module</label>
            <Combobox options={moduleOptions} value={moduleFilter} onChange={(v) => setModuleFilter(v as "" | ModuleValue)} placeholder="All modules" />
          </div>
          <div className="w-28">
            <label className="block text-xs text-slate-500 mb-1">Top N</label>
            <input type="number" min={1} value={topN} onChange={(e) => setTopN(e.target.value)} placeholder="All" className={inputCls} />
          </div>
          {anyFilter && (
            <div className="flex items-end">
              <button type="button" onClick={clearAll} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
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
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 text-sm text-slate-500">
          Sorted by{" "}
          <span className="font-medium text-slate-700">{activeModuleLabel ?? "Total"}</span>{" "}
          (highest first). {!moduleFilter && "Click a module header to show only that module."}
        </div>
        {filtered.length === 0 ? (
          <p className="text-slate-500 p-5">No collectors for this filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left font-medium text-slate-500 px-4 py-3">#</th>
                  <th className="text-left font-medium text-slate-500 px-4 py-3 whitespace-nowrap">Collector</th>
                  {moduleFilter ? (
                    <th className="text-right font-semibold text-slate-900 px-4 py-3 whitespace-nowrap">
                      {activeModuleLabel}
                    </th>
                  ) : (
                    <>
                      {MODULES.map((m) => (
                        <th
                          key={m.value}
                          onClick={() => setModuleFilter(m.value)}
                          className="text-right font-medium text-slate-500 px-3 py-3 whitespace-nowrap cursor-pointer hover:text-slate-900"
                          title={`Show only ${m.label}`}
                        >
                          {m.label}
                        </th>
                      ))}
                      <th className="text-right font-semibold text-slate-600 px-4 py-3">Total ↓</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => (
                  <tr key={c.hr_code} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-400 tabular-nums">{i + 1}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className="font-medium text-slate-800">{c.hr_code ?? "—"}</span>
                      {c.name && c.name !== c.hr_code && <span className="text-slate-500"> - {first3(c.name)}</span>}
                      {c.team && <span className="text-slate-500"> - {c.team}</span>}
                    </td>
                    {moduleFilter ? (
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                        {c.counts[moduleFilter]}
                      </td>
                    ) : (
                      <>
                        {MODULES.map((m) => (
                          <td key={m.value} className="px-3 py-2.5 text-right tabular-nums text-slate-600">
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
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-3xl font-bold mt-1 tabular-nums">{value}</p>
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}
