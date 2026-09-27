"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Row = { session_date: string; attendance: string | null };

// v59: Feedback Analysis — weekly rollup of session outcomes with a Daily tab.
//
// Buckets (attendance value on each attendee row):
//   Scheduled       = every row (total in this bucket)
//   Complete        = Attended + Attended Late
//   Not completed   = Absent
//   Attended        = "Attended"
//   Late attendance = "Attended Late"
//   Absent          = "Absent"
//   Canceled        = "Cancelled"
//   Not Marked      = attendance IS NULL
//
// Clicking a cell opens /feedback-progress preloaded with:
//   ?from=<start>&to=<end>&status=<csv|"" for Scheduled>
// FeedbackProgress uses "__none__" as the sentinel for un-marked rows.

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function iso(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function mondayOf(d: Date) {
  const dt = new Date(d);
  const day = dt.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + offset);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

type Bucket = { key: string; label: string; cls: string };

const BUCKETS: Bucket[] = [
  { key: "",                              label: "Scheduled",       cls: "text-slate-700 dark:text-slate-200" },
  { key: "Attended,Attended Late",        label: "Complete",        cls: "text-emerald-700 dark:text-emerald-300" },
  { key: "Absent",                        label: "Not completed",   cls: "text-red-700 dark:text-red-300" },
  { key: "Attended",                      label: "Attended",        cls: "text-emerald-700 dark:text-emerald-300" },
  { key: "Attended Late",                 label: "Late attendance", cls: "text-amber-700 dark:text-amber-300" },
  { key: "Absent",                        label: "Absent",          cls: "text-red-700 dark:text-red-300" },
  { key: "Cancelled",                     label: "Canceled",        cls: "text-slate-500 dark:text-slate-400" },
  { key: "__none__",                      label: "Not Marked",      cls: "text-slate-500 dark:text-slate-400" },
];

type Agg = {
  start: string;
  end: string;
  label: string;
  total: number;
  attended: number;
  late: number;
  absent: number;
  cancelled: number;
  notMarked: number;
};

function count(w: Agg, label: string) {
  switch (label) {
    case "Scheduled":       return w.total;
    case "Complete":        return w.attended + w.late;
    case "Not completed":   return w.absent;
    case "Attended":        return w.attended;
    case "Late attendance": return w.late;
    case "Absent":          return w.absent;
    case "Canceled":        return w.cancelled;
    case "Not Marked":      return w.notMarked;
  }
  return 0;
}

function href(start: string, end: string, statusKey: string) {
  const p = new URLSearchParams();
  p.set("from", start);
  p.set("to", end);
  if (statusKey) p.set("status", statusKey);
  return `/feedback-progress?${p.toString()}`;
}

type Tab = "weekly" | "daily";

export default function FeedbackAnalysisView({ rows }: { rows: Row[] }) {
  const [tab, setTab] = useState<Tab>("weekly");

  const weeks: Agg[] = useMemo(() => {
    const map = new Map<string, Agg>();
    for (const r of rows) {
      if (!r.session_date) continue;
      const d = new Date(r.session_date + "T00:00:00");
      if (isNaN(d.getTime())) continue;
      const mon = mondayOf(d);
      const sun = new Date(mon);
      sun.setDate(sun.getDate() + 6);
      const key = iso(mon);
      let g = map.get(key);
      if (!g) {
        g = { start: iso(mon), end: iso(sun), label: `${iso(mon)} → ${iso(sun)}`,
          total: 0, attended: 0, late: 0, absent: 0, cancelled: 0, notMarked: 0 };
        map.set(key, g);
      }
      g.total++;
      switch (r.attendance) {
        case "Attended":       g.attended++; break;
        case "Attended Late":  g.late++; break;
        case "Absent":         g.absent++; break;
        case "Cancelled":      g.cancelled++; break;
        default:               g.notMarked++;
      }
    }
    return Array.from(map.values()).sort((a, b) => b.start.localeCompare(a.start));
  }, [rows]);

  const days: Agg[] = useMemo(() => {
    const map = new Map<string, Agg>();
    for (const r of rows) {
      if (!r.session_date) continue;
      const key = r.session_date;
      let g = map.get(key);
      if (!g) {
        g = { start: key, end: key, label: key,
          total: 0, attended: 0, late: 0, absent: 0, cancelled: 0, notMarked: 0 };
        map.set(key, g);
      }
      g.total++;
      switch (r.attendance) {
        case "Attended":       g.attended++; break;
        case "Attended Late":  g.late++; break;
        case "Absent":         g.absent++; break;
        case "Cancelled":      g.cancelled++; break;
        default:               g.notMarked++;
      }
    }
    return Array.from(map.values()).sort((a, b) => b.start.localeCompare(a.start));
  }, [rows]);

  const active = tab === "weekly" ? weeks : days;
  const totalRows = active.reduce((s, w) => s + w.total, 0);
  const headerCol = tab === "weekly" ? "Week" : "Day";
  const unitLabel = tab === "weekly" ? "week(s)" : "day(s)";

  const tabBtn = (t: Tab, label: string) =>
    <button type="button" onClick={() => setTab(t)}
      className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 ${
        tab === t
          ? "border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100"
          : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700"
      }`}>{label}</button>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Feedback Analysis</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Session outcomes rolled up by {tab === "weekly" ? "week" : "day"}.
          Click any number to open Feedback Progress filtered on that {tab === "weekly" ? "week" : "day"} + status.
        </p>
      </div>

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {tabBtn("weekly", "Weekly")}
        {tabBtn("daily", "Daily")}
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400">
        {active.length} {unitLabel} · {totalRows.toLocaleString()} attendee rows
      </p>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-2.5 whitespace-nowrap">{headerCol}</th>
              {BUCKETS.map((b) => (
                <th key={b.label} className="text-right font-medium text-slate-500 dark:text-slate-400 px-3 py-2.5 whitespace-nowrap">
                  {b.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {active.length === 0 ? (
              <tr>
                <td colSpan={BUCKETS.length + 1} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500">
                  No feedback sessions yet.
                </td>
              </tr>
            ) : (
              active.map((w) => (
                <tr key={w.start} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-2 tabular-nums whitespace-nowrap font-medium">
                    {tab === "weekly"
                      ? <>{w.start} <span className="text-slate-400">→</span> {w.end}</>
                      : w.label}
                  </td>
                  {BUCKETS.map((b) => {
                    const c = count(w, b.label);
                    return (
                      <td key={b.label} className="px-3 py-2 text-right tabular-nums">
                        {c === 0 ? (
                          <span className="text-slate-300 dark:text-slate-600">0</span>
                        ) : (
                          <Link
                            href={href(w.start, w.end, b.key)}
                            className={`font-semibold hover:underline ${b.cls}`}
                          >
                            {c.toLocaleString()}
                          </Link>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
