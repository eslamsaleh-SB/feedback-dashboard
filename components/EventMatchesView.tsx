"use client";

import { useEffect, useMemo, useState } from "react";
import MultiSelectCombobox, { type MSOption } from "@/components/MultiSelectCombobox";
import { createClient } from "@/lib/supabase/client";

type BaseRow = {
  id: string;
  review_date: string | null;
  match_id: string | null;
  part_id: number | null;
  hr_code: string | null;
  error_type: string | null;
  event_name: string | null;
  collector_event: string | null;
  reviewer_event: string | null;
  total_count: number;
};

// v59: Matches page — filter Base events by Collector Event and/or
// Reviewer Event. Selecting both = AND. Only Base has these two columns.
export default function EventMatchesView() {
  const supabase = createClient();

  const [collectorEvents, setCollectorEvents] = useState<string[]>([]);
  const [reviewerEvents, setReviewerEvents] = useState<string[]>([]);
  const [colFilter, setColFilter] = useState<string[]>([]);
  const [revFilter, setRevFilter] = useState<string[]>([]);
  const [rows, setRows] = useState<BaseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Load distinct event lists once.
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("base_events")
        .select("collector_event, reviewer_event")
        .limit(50000);
      const c = new Set<string>();
      const r = new Set<string>();
      for (const row of data ?? []) {
        const ce = (row as any).collector_event?.toString().trim();
        const re = (row as any).reviewer_event?.toString().trim();
        if (ce) c.add(ce);
        if (re) r.add(re);
      }
      setCollectorEvents(Array.from(c).sort());
      setReviewerEvents(Array.from(r).sort());
    })();
  }, [supabase]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      let q = supabase
        .from("base_events")
        .select("id, review_date, match_id, part_id, hr_code, error_type, event_name, collector_event, reviewer_event, total_count")
        .order("review_date", { ascending: false })
        .limit(20000);
      if (colFilter.length > 0) q = q.in("collector_event", colFilter);
      if (revFilter.length > 0) q = q.in("reviewer_event", revFilter);
      const { data, error } = await q;
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
  }, [colFilter, revFilter]);

  const colOptions: MSOption[] = useMemo(
    () => collectorEvents.map((v) => ({ value: v, label: v })),
    [collectorEvents]
  );
  const revOptions: MSOption[] = useMemo(
    () => reviewerEvents.map((v) => ({ value: v, label: v })),
    [reviewerEvents]
  );

  const total = rows.reduce((s, r) => s + Number(r.total_count ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Event Matches</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Base events filtered by Collector Event and/or Reviewer Event. Both
          selected = AND.
        </p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-wrap gap-3 items-end">
        <div className="w-72">
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Collector Event</label>
          <MultiSelectCombobox
            options={colOptions}
            values={colFilter}
            onApply={setColFilter}
            placeholder="All collector events"
          />
        </div>
        <div className="w-72">
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Reviewer Event</label>
          <MultiSelectCombobox
            options={revOptions}
            values={revFilter}
            onApply={setRevFilter}
            placeholder="All reviewer events"
          />
        </div>
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400">
        {loading ? "Loading…" : `${rows.length.toLocaleString()} row(s) — ${total.toLocaleString()} corrections`}
      </p>
      {err && <p className="text-sm text-red-600">{err}</p>}

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              {["Date", "Match ID", "Part", "Collector", "Error Type", "Event Name", "Collector Event", "Reviewer Event", "Count"].map((h) => (
                <th key={h} className="text-left font-medium text-slate-500 dark:text-slate-400 px-3 py-2.5 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500">
                  {loading ? "" : "No rows match."}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-2 tabular-nums">{r.review_date ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{r.match_id ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{r.part_id ?? "—"}</td>
                  <td className="px-3 py-2">{r.hr_code ?? "—"}</td>
                  <td className="px-3 py-2">{r.error_type ?? "—"}</td>
                  <td className="px-3 py-2">{r.event_name ?? "—"}</td>
                  <td className="px-3 py-2">{r.collector_event ?? "—"}</td>
                  <td className="px-3 py-2">{r.reviewer_event ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{r.total_count.toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
