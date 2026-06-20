"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MODULES, type ModuleValue } from "@/lib/modules";
import Combobox, { type ComboOption } from "@/components/Combobox";

export type EnrichedPart = {
  matchid: string;
  partid: number;
  hr_code: string | null;
  name: string;
  team: string | null;
  date: string | null;
  counts: Record<ModuleValue, number>;
  total: number;
};

type CollectorOpt = { hr_code: string; name: string; team: string | null };
type ErrOp = "gte" | "eq" | "lte";

const MAX_MATCHES = 250;

function clabel(hr: string | null, name: string | null, team: string | null) {
  const parts = [hr || "—"];
  if (name && name !== hr) parts.push(name);
  if (team) parts.push(team);
  return parts.join(" - ");
}

export default function MatchTotals({
  from,
  to,
  collector,
  matchId,
  rows,
  collectors,
  limited,
}: {
  from: string;
  to: string;
  collector: string;
  matchId: string;
  rows: EnrichedPart[];
  collectors: CollectorOpt[];
  limited: boolean;
}) {
  const router = useRouter();
  const [matchInput, setMatchInput] = useState(matchId);
  const [moduleFilter, setModuleFilter] = useState<"" | ModuleValue>("");
  const [errOp, setErrOp] = useState<ErrOp>("gte");
  const [errVal, setErrVal] = useState("");

  function applyFilters(next: {
    from?: string;
    to?: string;
    collector?: string;
    match?: string;
  }) {
    const f = next.from ?? from;
    const t = next.to ?? to;
    const c = next.collector ?? collector;
    const m = (next.match ?? matchId).trim();
    const params = new URLSearchParams();
    if (f) params.set("from", f);
    if (t) params.set("to", t);
    if (c && c !== "all") params.set("collector", c);
    if (m) params.set("match", m);
    const qs = params.toString();
    router.push(`/match-totals${qs ? `?${qs}` : ""}`);
  }

  const metric = (p: EnrichedPart) => (moduleFilter ? p.counts[moduleFilter] : p.total);

  const errN = parseInt(errVal, 10);
  const errActive = Number.isFinite(errN);
  const passErr = (v: number) => {
    if (!errActive) return true;
    if (errOp === "gte") return v >= errN;
    if (errOp === "lte") return v <= errN;
    return v === errN;
  };

  const matches = useMemo(() => {
    const map = new Map<
      string,
      { matchid: string; date: string | null; parts: EnrichedPart[] }
    >();
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
      const parts = m.parts
        .filter((p) => passErr(metric(p)))
        .sort((a, b) => a.partid - b.partid || metric(b) - metric(a));
      const total = parts.reduce((s, p) => s + metric(p), 0);
      return { ...m, parts, total };
    });
    arr = arr.filter((m) => m.parts.length > 0);
    arr.sort((a, b) => b.total - a.total);
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, moduleFilter, errOp, errVal]);

  const shown = matches.slice(0, MAX_MATCHES);

  const collectorOptions: ComboOption[] = [
    { value: "all", label: "All collectors" },
    ...collectors.map((c) => ({ value: c.hr_code, label: clabel(c.hr_code, c.name, c.team) })),
  ];
  const inputCls = "rounded-lg border border-slate-300 px-3 py-2 bg-white";
  const moduleLabel = moduleFilter
    ? MODULES.find((m) => m.value === moduleFilter)?.label
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Match Total per Module</h1>
        <p className="text-slate-500">
          Module totals by Match → Collector → Part. Every collector who worked on a
          match is listed. Showing most recent matches — search a Match ID to find any match.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap gap-3">
        <div className="w-64">
          <label className="block text-xs text-slate-500 mb-1">Collector</label>
          <Combobox
            options={collectorOptions}
            value={collector}
            onChange={(v) => applyFilters({ collector: v })}
            placeholder="All collectors"
          />
        </div>
        <div className="w-44">
          <label className="block text-xs text-slate-500 mb-1">Module</label>
          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value as "" | ModuleValue)}
            className={`${inputCls} w-full`}
          >
            <option value="">All modules</option>
            {MODULES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="w-56">
          <label className="block text-xs text-slate-500 mb-1">
            Errors {moduleLabel ? `(${moduleLabel})` : "(total)"}
          </label>
          <div className="flex gap-2">
            <select
              value={errOp}
              onChange={(e) => setErrOp(e.target.value as ErrOp)}
              className={`${inputCls} w-20`}
            >
              <option value="gte">≥</option>
              <option value="eq">=</option>
              <option value="lte">≤</option>
            </select>
            <input
              type="number"
              min={0}
              value={errVal}
              onChange={(e) => setErrVal(e.target.value)}
              placeholder="any"
              className={`${inputCls} w-full`}
            />
          </div>
        </div>
        <div className="w-56">
          <label className="block text-xs text-slate-500 mb-1">Search Match ID</label>
          <div className="flex gap-2">
            <input
              value={matchInput}
              onChange={(e) => setMatchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyFilters({ match: matchInput });
              }}
              placeholder="e.g. 1457319"
              className={`${inputCls} w-full`}
            />
            <button
              type="button"
              onClick={() => applyFilters({ match: matchInput })}
              className="rounded-lg bg-slate-900 text-white px-3 text-sm font-medium"
            >
              Find
            </button>
          </div>
        </div>
        <div className="w-40">
          <label className="block text-xs text-slate-500 mb-1">Review date — from</label>
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => applyFilters({ from: e.target.value })}
            className={`${inputCls} w-full`}
          />
        </div>
        <div className="w-40">
          <label className="block text-xs text-slate-500 mb-1">to</label>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => applyFilters({ to: e.target.value })}
            className={`${inputCls} w-full`}
          />
        </div>
      </div>

      <div className="text-sm text-slate-500">
        {matches.length} match(es){" "}
        {matches.length > MAX_MATCHES && (
          <span className="text-amber-600">
            — showing the top {MAX_MATCHES} by errors. Narrow by collector, date, or Match ID.
          </span>
        )}
        {limited && (
          <span className="text-amber-600">
            {" "}(showing the most recent 8,000 rows — search a Match ID or narrow dates for older matches.)
          </span>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="text-slate-500">No matches for this filter.</p>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left font-medium text-slate-500 px-4 py-3 whitespace-nowrap">Match</th>
                <th className="text-left font-medium text-slate-500 px-4 py-3 whitespace-nowrap">Review date</th>
                <th className="text-left font-medium text-slate-500 px-4 py-3 whitespace-nowrap">Collector</th>
                <th className="text-left font-medium text-slate-500 px-3 py-3">Part</th>
                {moduleFilter ? (
                  <th className="text-right font-semibold text-slate-900 px-4 py-3 whitespace-nowrap">
                    {moduleLabel}
                  </th>
                ) : (
                  <>
                    {MODULES.map((m) => (
                      <th key={m.value} className="text-right font-medium text-slate-500 px-3 py-3 whitespace-nowrap">
                        {m.label}
                      </th>
                    ))}
                    <th className="text-right font-semibold text-slate-600 px-4 py-3">Total</th>
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
                      className={`${first ? "border-t-2 border-slate-200" : "border-t border-slate-100"} hover:bg-slate-50`}
                    >
                      <td className="px-4 py-2.5 whitespace-nowrap align-top">
                        {first && (
                          <span className="font-semibold text-slate-800">
                            {m.matchid}{" "}
                            <span className="text-slate-400 font-normal">({m.parts.length})</span>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap align-top text-slate-600">
                        {first ? m.date ?? "—" : ""}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-slate-700">
                        {clabel(p.hr_code, p.name, p.team)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">Part {p.partid}</td>
                      {moduleFilter ? (
                        <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                          {p.counts[moduleFilter]}
                        </td>
                      ) : (
                        <>
                          {MODULES.map((mod) => (
                            <td key={mod.value} className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                              {p.counts[mod.value]}
                            </td>
                          ))}
                          <td className="px-4 py-2.5 text-right font-bold tabular-nums">{p.total}</td>
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
