"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Row = { session_date: string; attendance: string | null };

// v59: Feedback Analysis — weekly rollup of session outcomes with a Daily tab.

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
type SortDir = "asc" | "desc";

export default function FeedbackAnalysisView({ rows }: { rows: Row[] }) {
  const [tab, setTab] = useState<Tab>("weekly");

  // Date filter (default: Jan 1 current year → today)
  const now = new Date();
  const [fromDate, setFromDate] = useState<string>(`${now.getFullYear()}-01-01`);
  const [toDate, setToDate] = useState<string>(iso(now));

  // Sort state: "date" (start) or a bucket label
  const [sortKey, setSortKey] = useState<string>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (!r.session_date) return false;
      if (fromDate && r.session_date < fromDate) return false;
      if (toDate && r.session_date > toDate) return false;
      return true;
    });
  }, [rows, fromDate, toDate]);

  // Overall stats for the filter range (summary cards)
  const stats = useMemo(() => {
    let total = 0, attended = 0, late = 0, absent = 0, cancelled = 0, notMarked = 0;
    for (const r of filteredRows) {
      total++;
      switch (r.attendance) {
        case "Attended":      attended++; break;
        case "Attended Late": late++; break;
        case "Absent":        absent++; break;
        case "Cancelled":     cancelled++; break;
        default:              notMarked++;
      }
    }
    const completed = attended + late;
    const notCompleted = absent;
    return { total, completed, notCompleted, attended, late, absent, cancelled, notMarked };
  }, [filteredRows]);

  const cards = [
    { label: "Total sessions", value: stats.total, color: "text-slate-800 dark:text-slate-100" },
    { label: "Completed", value: stats.completed, color: "text-emerald-600" },
    { label: "Not completed", value: stats.notCompleted, color: stats.notCompleted ? "text-amber-600" : "text-slate-800 dark:text-slate-100" },
    { label: "Attended", value: stats.attended, color: "text-emerald-600" },
    { label: "Late attendance", value: stats.late, color: stats.late ? "text-amber-600" : "text-slate-800 dark:text-slate-100" },
    { label: "Absent", value: stats.absent, color: stats.absent ? "text-red-600" : "text-slate-800 dark:text-slate-100" },
    { label: "Cancelled", value: stats.cancelled, color: "text-slate-500 dark:text-slate-400" },
    { label: "Not marked", value: stats.notMarked, color: stats.notMarked ? "text-amber-600" : "text-slate-800 dark:text-slate-100" },
  ];

  const weeks: Agg[] = useMemo(() => {
    const map = new Map<string, Agg>();
    for (const r of filteredRows) {
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
    return Array.from(map.values());
  }, [filteredRows]);

  const days: Agg[] = useMemo(() => {
    const map = new Map<string, Agg>();
    for (const r of filteredRows) {
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
    return Array.from(map.values());
  }, [filteredRows]);

  const activeRaw = tab === "weekly" ? weeks : days;

  const active = useMemo(() => {
    const copy = [...activeRaw];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "date") {
        cmp = a.start.localeCompare(b.start);
      } else {
        cmp = count(a, sortKey) - count(b, sortKey);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [activeRaw, sortKey, sortDir]);

  const totalRows = active.reduce((s, w) => s + w.total, 0);
  const headerCol = tab === "weekly" ? "Week" : "Day";
  const unitLabel = tab === "weekly" ? "week(s)" : "day(s)";

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function arrow(key: string) {
    if (sortKey !== key) return <span className="text-slate-300 dark:text-slate-600 ml-1">⇅</span>;
    return <span className="ml-1">{sortDir === "asc" ? "▲" : "▼"}</span>;
  }

  const tabBtn = (t: Tab, label: string) =>
    <button type="button" onClick={() => setTab(t)}
      className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 ${
        tab === t
          ? "border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100"
          : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700"
      }`}>{label}</button>;

  const inputCls = "rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900 text-sm";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Feedback Analysis</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Session outcomes rolled up by {tab === "weekly" ? "week" : "day"}.
          Click any number to open Feedback Progress filtered on that {tab === "weekly" ? "week" : "day"} + status.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3">
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{c.label}</p>
            <p className={`text-2xl font-bold mt-1 ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Date range filter */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">From</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">To</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputCls} />
        </div>
        <button
          type="button"
          onClick={() => {
            setFromDate(`${now.getFullYear()}-01-01`);
            setToDate(iso(now));
          }}
          className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          Reset
        </button>
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
              <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-2.5 whitespace-nowrap">
                <button type="button" onClick={() => toggleSort("date")} className="hover:text-slate-700 dark:hover:text-slate-200">
                  {headerCol}{arrow("date")}
                </button>
              </th>
              {BUCKETS.map((b) => (
                <th key={b.label} className="text-right font-medium text-slate-500 dark:text-slate-400 px-3 py-2.5 whitespace-nowrap">
                  <button type="button" onClick={() => toggleSort(b.label)} className="hover:text-slate-700 dark:hover:text-slate-200">
                    {b.label}{arrow(b.label)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {active.length === 0 ? (
              <tr>
                <td colSpan={BUCKETS.length + 1} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500">
                  No feedback sessions in this range.
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
