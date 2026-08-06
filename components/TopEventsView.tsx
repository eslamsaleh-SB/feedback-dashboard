"use client";

import { useEffect, useMemo, useState } from "react";
import MultiSelectCombobox, { type MSOption } from "@/components/MultiSelectCombobox";
import { createClient } from "@/lib/supabase/client";

type Collector = { hr_code: string; name: string; team: string | null };
type Source = "base" | "extras";

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

// v59: "Top corrected events" view.
//
// - Pick source (Base or Extras).
// - Pick one or more collectors (respects "Only my assigned" toggle).
// - Aggregated across the selected collectors.
// - Top-N by total_count, descending.
export default function TopEventsView({
  collectors,
}: {
  collectors: Collector[];
}) {
  const supabase = createClient();

  const [source, setSource] = useState<Source>("base");
  const [collectorFilter, setCollectorFilter] = useState<string[]>([]);
  const [teamFilter, setTeamFilter] = useState<string[]>([]);
  const [topN, setTopN] = useState<string>("10");
  const [rows, setRows] = useState<(BaseRow | ExtrasRow)[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Assigned toggle.
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

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const table = source === "base" ? "base_events" : "extras_events";
      // Effective collector set: intersect explicit picks with the "mine"
      // toggle if that's on. Empty set = query all.
      let effective: string[] = collectorFilter;
      if (onlyMine && myAssigned.length > 0) {
        if (effective.length === 0) effective = myAssigned;
        else effective = effective.filter((c) => myAssigned.includes(c));
      }

      const cols =
        source === "base"
          ? "hr_code, collector_event, reviewer_event, total_count"
          : "hr_code, extra_field, changed_from, changed_to, total_count";
      let q = supabase.from(table).select(cols);
      if (effective.length > 0) q = q.in("hr_code", effective);
      const { data, error } = await q.limit(50000);
      if (error) throw new Error(error.message);
      setRows((data ?? []) as any);
    } catch (e: any) {
      setErr(e.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, collectorFilter, teamFilter, onlyMine, myAssigned]);

  const aggregated = useMemo(() => {
    // Bucket by (original → corrected). Base = collector→reviewer event.
    // Extras = changed_from→changed_to on a given extra_field.
    const map = new Map<string, { from: string; to: string; field: string; count: number }>();
    for (const r of rows as any[]) {
      let from = "";
      let to = "";
      let field = "";
      if (source === "base") {
        from = (r.collector_event ?? "").toString().trim() || "(blank)";
        to = (r.reviewer_event ?? "").toString().trim() || "(blank)";
      } else {
        from = (r.changed_from ?? "").toString().trim() || "(blank)";
        to = (r.changed_to ?? "").toString().trim() || "(blank)";
        field = (r.extra_field ?? "").toString().trim();
      }
      const key = `${field}||${from}||${to}`;
      const cur = map.get(key);
      const add = Number(r.total_count ?? 0);
      if (cur) cur.count += add;
      else map.set(key, { from, to, field, count: add });
    }
    const arr = Array.from(map.values()).sort((a, b) => b.count - a.count);
    const n = parseInt(topN, 10);
    return Number.isFinite(n) && n > 0 ? arr.slice(0, n) : arr;
  }, [rows, topN, source]);

  const total = aggregated.reduce((s, r) => s + r.count, 0);
  const inputCls =
    "rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900 text-sm";

  const activeCollectorLabel = collectorFilter.length === 1
    ? collectors.find((c) => c.hr_code === collectorFilter[0])?.name ?? collectorFilter[0]
    : collectorFilter.length > 1
    ? `${collectorFilter.length} collectors`
    : "all collectors";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Top Corrected Events</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Ranks the events that were corrected most for the selected
          collectors. Choose Base or Extras.
        </p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Source</label>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as Source)}
            className={inputCls}
          >
            <option value="base">Base</option>
            <option value="extras">Extras</option>
          </select>
        </div>
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
              <span>Only my assigned ({myAssigned.length})</span>
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

      <p className="text-sm text-slate-500 dark:text-slate-400">
        {loading ? "Loading…" : `${aggregated.length} event(s) — ${total.toLocaleString()} total corrections — ${activeCollectorLabel}`}
      </p>
      {err && <p className="text-sm text-red-600">{err}</p>}

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-2.5">#</th>
              {source === "extras" && (
                <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-2.5">Extra Field</th>
              )}
              <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-2.5">
                {source === "base" ? "Collector Event (original)" : "Changed From (original)"}
              </th>
              <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-2.5">
                {source === "base" ? "Reviewer Event (corrected)" : "Changed To (corrected)"}
              </th>
              <th className="text-right font-medium text-slate-500 dark:text-slate-400 px-4 py-2.5">Corrections</th>
            </tr>
          </thead>
          <tbody>
            {aggregated.length === 0 ? (
              <tr>
                <td colSpan={source === "extras" ? 5 : 4} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500">
                  {loading ? "" : "No events match — try uploading Base/Extras data first."}
                </td>
              </tr>
            ) : (
              aggregated.map((r, i) => (
                <tr key={`${r.field}|${r.from}|${r.to}|${i}`} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-2 text-slate-400 dark:text-slate-500 tabular-nums">{i + 1}</td>
                  {source === "extras" && (
                    <td className="px-4 py-2 text-slate-500 dark:text-slate-400">{r.field || "—"}</td>
                  )}
                  <td className="px-4 py-2 font-medium text-rose-700 dark:text-rose-300">{r.from}</td>
                  <td className="px-4 py-2 font-medium text-emerald-700 dark:text-emerald-300">{r.to}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold">{r.count.toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
