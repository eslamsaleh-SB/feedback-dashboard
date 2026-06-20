"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MODULES, type ModuleValue, type CollectorRow } from "@/lib/modules";
import Combobox, { type ComboOption } from "@/components/Combobox";

const NO_TITLE = "__none__";
const NO_TEAM = "__noteam__";

// "Code - Name - Team" without repeating the code when the name is just the code.
function clabel(hr: string | null, name: string | null, team: string | null) {
  const code = hr || "—";
  const parts = [code];
  if (name && name !== hr) parts.push(name);
  if (team) parts.push(team);
  return parts.join(" - ");
}

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
  isAdmin?: boolean; // accepted for compatibility; this view is read-only
}) {
  const router = useRouter();

  const [collectorFilter, setCollectorFilter] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [titleFilter, setTitleFilter] = useState("");
  const [moduleFilter, setModuleFilter] = useState<"" | ModuleValue>("");
  const [topN, setTopN] = useState("");

  function applyDates(next: { from?: string; to?: string }) {
    const params = new URLSearchParams();
    const f = next.from ?? from;
    const t = next.to ?? to;
    if (f) params.set("from", f);
    if (t) params.set("to", t);
    const qs = params.toString();
    router.push(`/analytics${qs ? `?${qs}` : ""}`);
  }

  const metric = (r: CollectorRow) =>
    moduleFilter ? r.counts[moduleFilter] : r.total;

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

  const inputCls = "rounded-lg border border-slate-300 px-3 py-2 bg-white";
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

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Field label="Collector">
          <Combobox
            options={collectorOptions}
            value={collectorFilter}
            onChange={setCollectorFilter}
            placeholder="All collectors"
          />
        </Field>
        <Field label="Team">
          <Combobox
            options={teamOptions}
            value={teamFilter}
            onChange={setTeamFilter}
            placeholder="All teams"
          />
        </Field>
        <Field label="Title">
          <Combobox
            options={titleOptions}
            value={titleFilter}
            onChange={setTitleFilter}
            placeholder="All titles"
          />
        </Field>
        <Field label="Module">
          <Combobox
            options={moduleOptions}
            value={moduleFilter}
            onChange={(v) => setModuleFilter(v as "" | ModuleValue)}
            placeholder="All modules"
          />
        </Field>
        <Field label="Top N">
          <input
            type="number"
            min={1}
            value={topN}
            onChange={(e) => setTopN(e.target.value)}
            placeholder="All"
            className={`${inputCls} w-full`}
          />
        </Field>
        <Field label="Review date">
          <div className="flex gap-2">
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => applyDates({ from: e.target.value })}
              className={`${inputCls} w-full`}
            />
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => applyDates({ to: e.target.value })}
              className={`${inputCls} w-full`}
            />
          </div>
        </Field>
      </div>
      {anyFilter && (
        <button
          type="button"
          onClick={clearAll}
          className="text-sm text-slate-600 hover:text-slate-900 underline"
        >
          Clear all filters
        </button>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Match Count" value={matchCount} hint="distinct matches in range" />
        <StatCard label="Filtered Collectors" value={filtered.length} />
        <StatCard
          label={activeModuleLabel ? `Total ${activeModuleLabel}` : "Total mistakes"}
          value={totalMistakes}
        />
      </div>

      {/* Table (read-only) */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 text-sm text-slate-500">
          Sorted by{" "}
          <span className="font-medium text-slate-700">{activeModuleLabel ?? "Total"}</span>{" "}
          (highest first).{" "}
          {!moduleFilter && "Click a module header to show only that module."}
        </div>
        {filtered.length === 0 ? (
          <p className="text-slate-500 p-5">No collectors for this filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left font-medium text-slate-500 px-4 py-3">#</th>
                  <th className="text-left font-medium text-slate-500 px-4 py-3 whitespace-nowrap">
                    Collector <span className="text-slate-400">(Code - Name - Team)</span>
                  </th>
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
                      <th className="text-right font-semibold text-slate-600 px-4 py-3">
                        Total ↓
                      </th>
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
                      {c.name && c.name !== c.hr_code && (
                        <span className="text-slate-500"> - {c.name}</span>
                      )}
                      {c.team && <span className="text-slate-500"> - {c.team}</span>}
                    </td>
                    {moduleFilter ? (
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                        {c.counts[moduleFilter]}
                      </td>
                    ) : (
                      <>
                        {MODULES.map((m) => (
                          <td
                            key={m.value}
                            className="px-3 py-2.5 text-right tabular-nums text-slate-600"
                          >
                            {c.counts[m.value]}
                          </td>
                        ))}
                        <td className="px-4 py-2.5 text-right font-bold tabular-nums">
                          {c.total}
                        </td>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-3xl font-bold mt-1 tabular-nums">{value}</p>
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}
