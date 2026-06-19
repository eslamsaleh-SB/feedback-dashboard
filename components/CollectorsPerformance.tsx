"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MODULES, type ModuleValue, type CollectorRow } from "@/lib/modules";
import Combobox, { type ComboOption } from "@/components/Combobox";

type SortKey = ModuleValue | "total";

export default function CollectorsPerformance({
  from,
  to,
  rows,
}: {
  from: string;
  to: string;
  rows: CollectorRow[];
}) {
  const router = useRouter();

  // Module filter: "" = all modules (rank by total). Otherwise rank by that module.
  const [moduleFilter, setModuleFilter] = useState<"" | ModuleValue>("");
  // Top N filter: "" = show all.
  const [topN, setTopN] = useState<string>("");

  const sortKey: SortKey = moduleFilter || "total";

  function applyDates(next: { from?: string; to?: string }) {
    const f = next.from ?? from;
    const t = next.to ?? to;
    const params = new URLSearchParams();
    if (f) params.set("from", f);
    if (t) params.set("to", t);
    const qs = params.toString();
    router.push(`/analytics${qs ? `?${qs}` : ""}`);
  }

  // Always sorted by highest errors in the active dimension.
  const sorted = useMemo(() => {
    const arr = [...rows].sort((a, b) => {
      const av = sortKey === "total" ? a.total : a.counts[sortKey];
      const bv = sortKey === "total" ? b.total : b.counts[sortKey];
      return bv - av;
    });
    const n = parseInt(topN, 10);
    return Number.isFinite(n) && n > 0 ? arr.slice(0, n) : arr;
  }, [rows, sortKey, topN]);

  const moduleOptions: ComboOption[] = [
    { value: "", label: "All modules (rank by total)" },
    ...MODULES.map((m) => ({ value: m.value, label: m.label })),
  ];

  const inputCls = "rounded-lg border border-slate-300 px-3 py-2 bg-white";
  const grandTotal = rows.reduce((s, r) => s + r.total, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Collectors Performance</h1>
          <p className="text-slate-500">
            Ranked by highest errors{" "}
            {moduleFilter
              ? `in ${MODULES.find((m) => m.value === moduleFilter)?.label}`
              : "across all modules"}
          </p>
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          <div className="w-56">
            <label className="block text-xs text-slate-500 mb-1">Module</label>
            <Combobox
              options={moduleOptions}
              value={moduleFilter}
              onChange={(v) => setModuleFilter(v as "" | ModuleValue)}
              placeholder="All modules (rank by total)"
            />
          </div>
          <div className="w-28">
            <label className="block text-xs text-slate-500 mb-1">Top N</label>
            <input
              type="number"
              min={1}
              value={topN}
              onChange={(e) => setTopN(e.target.value)}
              placeholder="All"
              className={`${inputCls} w-full`}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">From</label>
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => applyDates({ from: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">To</label>
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => applyDates({ to: e.target.value })}
              className={inputCls}
            />
          </div>
          {(from || to || moduleFilter || topN) && (
            <button
              type="button"
              onClick={() => {
                setModuleFilter("");
                setTopN("");
                router.push("/analytics");
              }}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Collectors" value={rows.length} />
        <StatCard label="Showing" value={sorted.length} />
        <StatCard label="Total mistakes" value={grandTotal} />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 text-sm text-slate-500">
          Sorted by{" "}
          <span className="font-medium text-slate-700">
            {sortKey === "total" ? "Total" : MODULES.find((m) => m.value === sortKey)?.label}
          </span>{" "}
          (highest first). Click a module header to rank by it.
        </div>
        {sorted.length === 0 ? (
          <p className="text-slate-500 p-5">No collectors for this filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left font-medium text-slate-500 px-4 py-3 whitespace-nowrap">
                    #
                  </th>
                  <th className="text-left font-medium text-slate-500 px-4 py-3 whitespace-nowrap">
                    Collector
                  </th>
                  {MODULES.map((m) => (
                    <th
                      key={m.value}
                      onClick={() => setModuleFilter(m.value)}
                      className={`text-right font-medium px-3 py-3 whitespace-nowrap cursor-pointer hover:text-slate-900 ${
                        sortKey === m.value ? "text-slate-900" : "text-slate-500"
                      }`}
                      title={`Rank by ${m.label}`}
                    >
                      {m.label}
                      {sortKey === m.value ? " ↓" : ""}
                    </th>
                  ))}
                  <th
                    onClick={() => setModuleFilter("")}
                    className={`text-right font-semibold px-4 py-3 cursor-pointer hover:text-slate-900 ${
                      sortKey === "total" ? "text-slate-900" : "text-slate-600"
                    }`}
                    title="Rank by total"
                  >
                    Total{sortKey === "total" ? " ↓" : ""}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c, i) => (
                  <tr key={c.hr_code} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-400 tabular-nums">{i + 1}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className="font-medium text-slate-800">{c.name}</span>
                      {c.name !== c.hr_code && (
                        <span className="text-slate-400"> · {c.hr_code}</span>
                      )}
                    </td>
                    {MODULES.map((m) => (
                      <td
                        key={m.value}
                        className={`px-3 py-2.5 text-right tabular-nums ${
                          sortKey === m.value ? "text-slate-900 font-semibold" : "text-slate-600"
                        }`}
                      >
                        {c.counts[m.value]}
                      </td>
                    ))}
                    <td className="px-4 py-2.5 text-right font-bold tabular-nums">{c.total}</td>
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

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-3xl font-bold mt-1 tabular-nums">{value}</p>
    </div>
  );
}
