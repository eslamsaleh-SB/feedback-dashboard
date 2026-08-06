"use client";

import { useEffect, useMemo, useState } from "react";
import MultiSelectCombobox, { type MSOption } from "@/components/MultiSelectCombobox";
import { createClient } from "@/lib/supabase/client";

type Collector = { hr_code: string; name: string; team: string | null };

type BaseRow = {
  review_date: string | null;
  match_id: string | null;
  hr_code: string | null;
  collector_event: string | null;
  reviewer_event: string | null;
  total_count: number;
};
type ExtrasRow = {
  review_date: string | null;
  match_id: string | null;
  hr_code: string | null;
  extra_field: string | null;
  changed_from: string | null;
  changed_to: string | null;
  total_count: number;
};

// v59: Event Matches — same layout as Top Corrected Events but rows are
// grouped by Match ID (one row per match), sorted by total corrections desc.
export default function EventMatchesView({
  collectors,
}: {
  collectors: Collector[];
}) {
  const supabase = createClient();

  const [collectorFilter, setCollectorFilter] = useState<string[]>([]);
  const [teamFilter, setTeamFilter] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
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
        .select("review_date, match_id, hr_code, collector_event, reviewer_event, total_count")
        .limit(50000);
      let eq = supabase
        .from("extras_events")
        .select("review_date, match_id, hr_code, extra_field, changed_from, changed_to, total_count")
        .limit(50000);
      if (effectiveHrs.length > 0) {
        bq = bq.in("hr_code", effectiveHrs);
        eq = eq.in("hr_code", effectiveHrs);
      }
      if (dateFrom) { bq = bq.gte("review_date", dateFrom); eq = eq.gte("review_date", dateFrom); }
      if (dateTo)   { bq = bq.lte("review_date", dateTo);   eq = eq.lte("review_date", dateTo);   }
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
  }, [effectiveHrs, dateFrom, dateTo]);

  // Base: one row per (match_id, collector_event → reviewer_event). Sorted
  // by match count desc, then by pair count desc within a match.
  const baseAgg = useMemo(() => {
    type Pair = { from: string; to: string; count: number };
    type MatchGroup = { key: string; review_date: string; match_id: string; total: number; pairs: Pair[] };
    const groups = new Map<string, MatchGroup>();
    for (const r of baseRows) {
      const date = (r.review_date ?? "").trim() || "—";
      const mid = (r.match_id ?? "").trim() || "(no match id)";
      const key = `${date}||${mid}`;
      const from = (r.collector_event ?? "").trim() || "(blank)";
      const to = (r.reviewer_event ?? "").trim() || "(blank)";
      const add = Number(r.total_count ?? 0);
      let g = groups.get(key);
      if (!g) { g = { key, review_date: date, match_id: mid, total: 0, pairs: [] }; groups.set(key, g); }
      g.total += add;
      const p = g.pairs.find((x) => x.from === from && x.to === to);
      if (p) p.count += add;
      else g.pairs.push({ from, to, count: add });
    }
    const arr = Array.from(groups.values());
    for (const g of arr) g.pairs.sort((a, b) => b.count - a.count);
    arr.sort((a, b) => b.total - a.total);
    const flat: { review_date: string; match_id: string; total: number; from: string; to: string; count: number; first: boolean; span: number }[] = [];
    for (const g of arr) {
      g.pairs.forEach((p, i) => flat.push({
        review_date: g.review_date, match_id: g.match_id, total: g.total,
        from: p.from, to: p.to, count: p.count,
        first: i === 0, span: g.pairs.length,
      }));
    }
    return { flat, groupCount: arr.length, total: arr.reduce((s, g) => s + g.total, 0) };
  }, [baseRows]);

  // Extras: same, but pair = (extra_field, changed_from → changed_to).
  const extrasAgg = useMemo(() => {
    type Pair = { field: string; from: string; to: string; count: number };
    type MatchGroup = { key: string; review_date: string; match_id: string; total: number; pairs: Pair[] };
    const groups = new Map<string, MatchGroup>();
    for (const r of extrasRows) {
      const date = (r.review_date ?? "").trim() || "—";
      const mid = (r.match_id ?? "").trim() || "(no match id)";
      const key = `${date}||${mid}`;
      const field = (r.extra_field ?? "").trim() || "—";
      const from = (r.changed_from ?? "").trim() || "(blank)";
      const to = (r.changed_to ?? "").trim() || "(blank)";
      const add = Number(r.total_count ?? 0);
      let g = groups.get(key);
      if (!g) { g = { key, review_date: date, match_id: mid, total: 0, pairs: [] }; groups.set(key, g); }
      g.total += add;
      const p = g.pairs.find((x) => x.field === field && x.from === from && x.to === to);
      if (p) p.count += add;
      else g.pairs.push({ field, from, to, count: add });
    }
    const arr = Array.from(groups.values());
    for (const g of arr) g.pairs.sort((a, b) => b.count - a.count);
    arr.sort((a, b) => b.total - a.total);
    const flat: { review_date: string; match_id: string; total: number; field: string; from: string; to: string; count: number; first: boolean; span: number }[] = [];
    for (const g of arr) {
      g.pairs.forEach((p, i) => flat.push({
        review_date: g.review_date, match_id: g.match_id, total: g.total,
        field: p.field, from: p.from, to: p.to, count: p.count,
        first: i === 0, span: g.pairs.length,
      }));
    }
    return { flat, groupCount: arr.length, total: arr.reduce((s, g) => s + g.total, 0) };
  }, [extrasRows]);

  const baseTotal = baseAgg.total;
  const extrasTotal = extrasAgg.total;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Event Matches</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Corrections grouped by Match ID. Base events on the left, Extras on
          the right. Filters apply to both.
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
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">From</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">To</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900 text-sm" />
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
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-baseline justify-between">
            <h2 className="font-semibold">Events (Base)</h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {loading ? "…" : `${baseAgg.groupCount} match(es) · ${baseTotal.toLocaleString()} corrections`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-3 py-2">Date</th>
                  <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-3 py-2">Match ID</th>
                  <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-3 py-2">Collector Event</th>
                  <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-3 py-2">Reviewer Event</th>
                  <th className="text-right font-medium text-slate-500 dark:text-slate-400 px-3 py-2">Count</th>
                </tr>
              </thead>
              <tbody>
                {baseAgg.flat.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500">
                      {loading ? "" : "No rows."}
                    </td>
                  </tr>
                ) : (
                  baseAgg.flat.map((r, i) => (
                    <tr key={i} className={r.first ? "border-t-2 border-slate-200 dark:border-slate-700" : "border-t border-slate-100 dark:border-slate-800"}>
                      {r.first ? (
                        <td rowSpan={r.span} className="px-3 py-2 tabular-nums align-top bg-slate-50/50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-300">
                          {r.review_date}
                        </td>
                      ) : null}
                      {r.first ? (
                        <td rowSpan={r.span} className="px-3 py-2 font-medium align-top bg-slate-50/50 dark:bg-slate-800/40">
                          <div>{r.match_id}</div>
                          <div className="text-xs text-slate-400 tabular-nums">{r.total.toLocaleString()}</div>
                        </td>
                      ) : null}
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
              {loading ? "…" : `${extrasAgg.groupCount} match(es) · ${extrasTotal.toLocaleString()} corrections`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-3 py-2">Date</th>
                  <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-3 py-2">Match ID</th>
                  <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-3 py-2">Extra Field</th>
                  <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-3 py-2">Changed From</th>
                  <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-3 py-2">Changed To</th>
                  <th className="text-right font-medium text-slate-500 dark:text-slate-400 px-3 py-2">Count</th>
                </tr>
              </thead>
              <tbody>
                {extrasAgg.flat.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500">
                      {loading ? "" : "No rows."}
                    </td>
                  </tr>
                ) : (
                  extrasAgg.flat.map((r, i) => (
                    <tr key={i} className={r.first ? "border-t-2 border-slate-200 dark:border-slate-700" : "border-t border-slate-100 dark:border-slate-800"}>
                      {r.first ? (
                        <td rowSpan={r.span} className="px-3 py-2 tabular-nums align-top bg-slate-50/50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-300">
                          {r.review_date}
                        </td>
                      ) : null}
                      {r.first ? (
                        <td rowSpan={r.span} className="px-3 py-2 font-medium align-top bg-slate-50/50 dark:bg-slate-800/40">
                          <div>{r.match_id}</div>
                          <div className="text-xs text-slate-400 tabular-nums">{r.total.toLocaleString()}</div>
                        </td>
                      ) : null}
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
