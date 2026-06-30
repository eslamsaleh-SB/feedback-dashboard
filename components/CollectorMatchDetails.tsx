"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MODULES, type ModuleValue } from "@/lib/modules";
import type { EnrichedPart } from "@/components/MatchTotals";

type ErrOp = "gte" | "eq" | "lte";
const MAX_MATCHES = 250;
const first3 = (s: string | null) => (s ? s.trim().split(/\s+/).slice(0, 3).join(" ") : "");

export default function CollectorMatchDetails({
  rows,
  from,
  to,
  matchId,
  module: moduleProp,
}: {
  rows: EnrichedPart[];
  from: string;
  to: string;
  matchId: string;
  module?: string;
}) {
  const router = useRouter();
  const [matchInput, setMatchInput] = useState(matchId);
  const [moduleFilter, setModuleFilter] = useState<"" | ModuleValue>(
    (moduleProp as ModuleValue | undefined) ?? ""
  );
  const [errOp, setErrOp] = useState<ErrOp>("gte");
  const [errVal, setErrVal] = useState("");

  function applyFilters(next: {
    from?: string;
    to?: string;
    match?: string;
    module?: string;
  }) {
    const f = next.from ?? from;
    const t = next.to ?? to;
    const m = (next.match ?? matchId).trim();
    const mod = "module" in next ? next.module : moduleFilter;
    const params = new URLSearchParams();
    if (f) params.set("from", f);
    if (t) params.set("to", t);
    if (m) params.set("match", m);
    if (mod) params.set("module", mod as string);
    const qs = params.toString();
    router.push(`/my-matches${qs ? `?${qs}` : ""}`);
  }

  const metric = (p: EnrichedPart) =>
    moduleFilter ? p.counts[moduleFilter] : p.total;

  const errN = parseInt(errVal, 10);
  const errActive = Number.isFinite(errN);
  const passErr = (v: number) => {
    if (!errActive) return true;
    if (errOp === "gte") return v >= errN;
    if (errOp === "lte") return v <= errN;
    return v === errN;
  };

  const matches = useMemo(() => {
    const map = new Map<string, { matchid: string; date: string | null; parts: EnrichedPart[] }>();
    for (const r of rows) {
      let m = map.get(r.matchid);
      if (!m) {
        m = { matchid: r.matchid, date: r.date, parts: [] };
        map.set(r.matchid, m);
      }
      m.parts.push(r);
      if (r.date && (!m.date || r.date > m.date)) m.date = r.date;
    }

    let arr = Array.from(map.values()).map((m) => {
      const parts = [...m.parts].sort((a, b) => a.partid - b.partid || metric(b) - metric(a));
      const total = parts.reduce((s, p) => s + metric(p), 0);
      return { ...m, parts, total };
    });

    arr = arr.filter((m) => passErr(m.total));
    arr.sort((a, b) => b.total - a.total);
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, moduleFilter, errOp, errVal]);

  const shown = matches.slice(0, MAX_MATCHES);
  const inputCls = "rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900";
  const moduleLabel = moduleFilter
    ? MODULES.find((m) => m.value === moduleFilter)?.label
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Match Details</h1>
        <p className="text-slate-500 dark:text-slate-400">Module totals by Match → Part. Sorted by highest errors.</p>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-wrap gap-3">
        <div className="w-44">
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Module</label>
          <select
            value={moduleFilter}
            onChange={(e) => {
              const v = e.target.value as "" | ModuleValue;
              setModuleFilter(v);
              applyFilters({ module: v });
            }}
            className={`${inputCls} w-full`}
          >
            <option value="">All modules</option>
            {MODULES.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        <div className="w-56">
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
            Errors {moduleLabel ? `(${moduleLabel})` : "(total)"} — match total
          </label>
          <div className="flex gap-2">
            <select value={errOp} onChange={(e) => setErrOp(e.target.value as ErrOp)} className={`${inputCls} w-20`}>
              <option value="gte">≥</option>
              <option value="eq">=</option>
              <option value="lte">≤</option>
            </select>
            <input type="number" min={0} value={errVal} onChange={(e) => setErrVal(e.target.value)} placeholder="any" className={`${inputCls} w-full`} />
          </div>
        </div>
        <div className="w-56">
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Search Match ID</label>
          <div className="flex gap-2">
            <input
              value={matchInput}
              onChange={(e) => setMatchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") applyFilters({ match: matchInput }); }}
              placeholder="e.g. 1457319"
              className={`${inputCls} w-full`}
            />
            <button type="button" onClick={() => applyFilters({ match: matchInput })} className="rounded-lg bg-slate-900 text-white px-3 text-sm font-medium">Find</button>
          </div>
        </div>
        <div className="w-40">
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Review date — from</label>
          <input type="date" value={from} max={to || undefined} onChange={(e) => applyFilters({ from: e.target.value })} className={`${inputCls} w-full`} />
        </div>
        <div className="w-40">
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">to</label>
          <input type="date" value={to} min={from || undefined} onChange={(e) => applyFilters({ to: e.target.value })} className={`${inputCls} w-full`} />
        </div>
      </div>

      <div className="text-sm text-slate-500 dark:text-slate-400">
        {matches.length} match(es) sorted by highest {moduleLabel ? moduleLabel : "total"} errors
        {matches.length > MAX_MATCHES && (
          <span className="text-amber-600"> — showing top {MAX_MATCHES}. Narrow by date or Match ID.</span>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="text-slate-500 dark:text-slate-400">No matches for this filter.</p>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-3 whitespace-nowrap">Match</th>
                <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-3 whitespace-nowrap">Review date</th>
                <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-3 py-3">Part</th>
                {moduleFilter ? (
                  <th className="text-right font-semibold text-slate-900 dark:text-slate-100 px-4 py-3 whitespace-nowrap">{moduleLabel}</th>
                ) : (
                  <>
                    {MODULES.map((m) => (
                      <th key={m.value} className="text-right font-medium text-slate-500 dark:text-slate-400 px-3 py-3 whitespace-nowrap">{m.label}</th>
                    ))}
                    <th className="text-right font-semibold text-slate-600 dark:text-slate-300 px-4 py-3">Total</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {shown.map((m) =>
                m.parts.map((p, idx) => {
                  const first = idx === 0;
                  return (
                    <tr
                      key={`${m.matchid}-${p.partid}-${p.hr_code ?? "x"}`}
                      className={`${first ? "border-t-2 border-slate-200 dark:border-slate-800" : "border-t border-slate-100 dark:border-slate-800"} hover:bg-slate-50 dark:hover:bg-slate-800`}
                    >
                      <td className="px-4 py-2.5 whitespace-nowrap align-top">
                        {first && (
                          <span className="font-semibold text-slate-800 dark:text-slate-100">
                            {m.matchid} <span className="text-slate-400 dark:text-slate-500 font-normal">({m.parts.length})</span>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-slate-500 dark:text-slate-400 align-top">
                        {first && (m.date ? m.date.slice(0, 10) : "—")}
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 align-top">{p.partid}</td>
                      {moduleFilter ? (
                        <td className="px-4 py-2.5 text-right font-semibold align-top">{p.counts[moduleFilter] ?? 0}</td>
                      ) : (
                        <>
                          {MODULES.map((mod) => (
                            <td key={mod.value} className="px-3 py-2.5 text-right text-slate-600 dark:text-slate-300 align-top">{p.counts[mod.value] ?? 0}</td>
                          ))}
                          <td className="px-4 py-2.5 text-right font-semibold align-top">{p.total}</td>
                        </>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
