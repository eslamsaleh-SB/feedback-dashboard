"use client";

import { useEffect, useMemo, useState } from "react";
import MultiSelectCombobox, { type MSOption } from "@/components/MultiSelectCombobox";
import { createClient } from "@/lib/supabase/client";

type Collector = { hr_code: string; name: string; team: string | null };

type BaseRow = {
  hr_code: string | null;
  collector_event: string | null;
  reviewer_event: string | null;
  total_count: number;
};
type ExtrasRow = {
  hr_code: string | null;
  extra_field: string | null;
  changed_from: string | null;
  changed_to: string | null;
  total_count: number;
};

// v59: Top Corrected Events — side-by-side Base + Extras. Aggregates by
// (original → corrected) pair. Shared filters: Team, Collectors, Assigned,
// Top-N. Sorted by count desc.
export default function TopEventsView({
  collectors,
}: {
  collectors: Collector[];
}) {
  const supabase = createClient();

  const [collectorFilter, setCollectorFilter] = useState<string[]>([]);
  const [teamFilter, setTeamFilter] = useState<string[]>([]);
  const [topN, setTopN] = useState<string>("10");
  const [baseRows, setBaseRows] = useState<BaseRow[]>([]);
  const [extrasRows, setExtrasRows] = useState<ExtrasRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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

  const teams = useMemo(() => {
    const s = new Set<string>();
    for (const c of collectors) if (c.team) s.add(c.team);
    return Array.from(s).sort();
  }, [collectors]);

  const collectorOptions: MSOption[] = useMemo(() => {
    const teamSet = new Set(teamFilter);
    return collectors
      .filter((c) => teamSet.size === 0 || (c.team && teamSet.has(c.team)))
      .map((c) => ({ value: c.hr_code, label: `${c.hr_code} - ${c.name}` }));
  }, [collectors, teamFilter]);

  const effectiveHrs = useMemo(() => {
    let set: string[] = collectorFilter;
    if (teamFilter.length > 0) {
      const teamSet = new Set(teamFilter);
      const teamHrs = collectors.filter((c) => c.team && teamSet.has(c.team)).map((c) => c.hr_code);
      set = set.length === 0 ? teamHrs : set.filter((h) => teamHrs.includes(h));
    }
    if (onlyMine && myAssigned.length > 0) {
      set = set.length === 0 ? myAssigned : set.filter((h) => myAssigned.includes(h));
    }
    return set;
  }, [collectorFilter, teamFilter, onlyMine, myAssigned, collectors]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      let bq = supabase
        .from("base_events")
        .select("hr_code, collector_event, reviewer_event, total_count")
        .limit(50000);
      let eq = supabase
        .from("extras_events")
        .select("hr_code, extra_field, changed_from, changed_to, total_count")
        .limit(50000);
      if (effectiveHrs.length > 0) {
        bq = bq.in("hr_code", effectiveHrs);
        eq = eq.in("hr_code", effectiveHrs);
      }
      const [{ data: bd, error: be }, { data: ed, error: ee }] = await Promise.all([bq, eq]);
      if (be) throw new Error(be.message);
      if (ee) throw new Error(ee.message);
      setBaseRows((bd ?? []) as any);
      setExtrasRows((ed ?? []) as any);
    } catch (e: any) {
      setErr(e.message);
      setBaseRows([]);
      setExtrasRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveHrs]);

  const nTop = (() => {
    const n = parseInt(topN, 10);
    return Number.isFinite(n) && n > 0 ? n : Infinity;
  })();

  const baseAgg = useMemo(() => {
    const map = new Map<string, { from: string; to: string; count: number }>();
    for (const r of baseRows) {
      const from = (r.collector_event ?? "").trim() || "(blank)";
      const to = (r.reviewer_event ?? "").trim() || "(blank)";
      const key = `${from}||${to}`;
      const cur = map.get(key);
      const add = Number(r.total_count ?? 0);
      if (cur) cur.count += add;
      else map.set(key, { from, to, count: add });
    }
    const arr = Array.from(map.values()).sort((a, b) => b.count - a.count);
    return arr.slice(0, nTop);
  }, [baseRows, nTop]);

  const extrasAgg = useMemo(() => {
    const map = new Map<string, { field: string; from: string; to: string; count: number }>();
    for (const r of extrasRows) {
      const field = (r.extra_field ?? "").trim() || "—";
      const from = (r.changed_from ?? "").trim() || "(blank)";
      const to = (r.changed_to ?? "").trim() || "(blank)";
      const key = `${field}||${from}||${to}`;
      const cur = map.get(key);
      const add = Number(r.total_count ?? 0);
      if (cur) cur.count += add;
      else map.set(key, { field, from, to, count: add });
    }
    const arr = Array.from(map.values()).sort((a, b) => b.count - a.count);
    return arr.slice(0, nTop);
  }, [extrasRows, nTop]);

  const baseTotal = baseAgg.reduce((s, r) => s + r.count, 0);
  const extrasTotal = extrasAgg.reduce((s, r) => s + r.count, 0);

  const inputCls =
    "rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900 text-sm";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Top Corrected Events</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Original → corrected pairs ranked by frequency. Base events on the
          left, Extras on the right. Filters apply to both.
        </p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-wrap gap-3 items-end">
        <div className="w-52">
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Teams</label>
          <MultiSelectCombobox
            options={teams.map((t) => ({ value: t, label: t }))}
            values={teamFilter}
            onApply={(next) => {
              setTeamFilter(next);
              if (next.length > 0 && collectorFilter.length > 0) {
                const allowed = new Set(
                  collectors.filter((c) => c.team && next.includes(c.team)).map((c) => c.hr_code)
                );
                setCollectorFilter((prev) => prev.filter((v) => allowed.has(v)));
              }
            }}
            placeholder="All teams"
          />
        </div>
        <div className="w-72">
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Collectors</label>
          <MultiSelectCombobox
            options={collectorOptions}
            values={collectorFilter}
            onApply={setCollectorFilter}
            placeholder="All collectors"
          />
        </div>
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
              <span>Only my assigned active collectors ({myAssigned.length})</span>
            </label>
          </div>
        )}
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Top N</label>
          <input
            type="number"
            min={1}
            value={topN}
            onChange={(e) => setTopN(e.target.value)}
            placeholder="All"
            className={`${inputCls} w-24`}
          />
        </div>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-baseline justify-between">
            <h2 className="font-semibold">Events (Base)</h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {loading ? "…" : `${baseAgg.length} pair(s) · ${baseTotal.toLocaleString()} total`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-3 py-2">Collector Event</th>
                  <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-3 py-2">Reviewer Event</th>
                  <th className="text-right font-medium text-slate-500 dark:text-slate-400 px-3 py-2">Count</th>
                </tr>
              </thead>
              <tbody>
                {baseAgg.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500">
                      {loading ? "" : "No rows."}
                    </td>
                  </tr>
                ) : (
                  baseAgg.map((r, i) => (
                    <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-3 py-2 text-rose-700 dark:text-rose-300 font-medium">{r.from}</td>
                      <td className="px-3 py-2 text-emerald-700 dark:text-emerald-300 font-medium">{r.to}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{r.count.toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-baseline justify-between">
            <h2 className="font-semibold">Extras</h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {loading ? "…" : `${extrasAgg.length} pair(s) · ${extrasTotal.toLocaleString()} total`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-3 py-2">Extra Field</th>
                  <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-3 py-2">Changed From</th>
                  <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-3 py-2">Changed To</th>
                  <th className="text-right font-medium text-slate-500 dark:text-slate-400 px-3 py-2">Count</th>
                </tr>
              </thead>
              <tbody>
                {extrasAgg.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500">
                      {loading ? "" : "No rows."}
                    </td>
                  </tr>
                ) : (
                  extrasAgg.map((r, i) => (
                    <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{r.field}</td>
                      <td className="px-3 py-2 text-rose-700 dark:text-rose-300 font-medium">{r.from}</td>
                      <td className="px-3 py-2 text-emerald-700 dark:text-emerald-300 font-medium">{r.to}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{r.count.toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
