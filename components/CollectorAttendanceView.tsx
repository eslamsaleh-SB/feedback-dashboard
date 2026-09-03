"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import MultiSelectCombobox, { type MSOption } from "@/components/MultiSelectCombobox";

type Row = {
  hr_code: string;
  attendance: string | null;
  session_date: string | null;
  name: string;
  team: string | null;
};

type Bucket = { key: string; label: string; cls: string };
const BUCKETS: Bucket[] = [
  { key: "",                              label: "Total",         cls: "text-slate-700 dark:text-slate-200" },
  { key: "Attended,Attended Late",        label: "Complete",      cls: "text-emerald-700 dark:text-emerald-300" },
  { key: "Attended",                      label: "Attended",      cls: "text-emerald-700 dark:text-emerald-300" },
  { key: "Attended Late",                 label: "Late",          cls: "text-amber-700 dark:text-amber-300" },
  { key: "Absent",                        label: "Absent",        cls: "text-red-700 dark:text-red-300" },
  { key: "Cancelled",                     label: "Cancelled",     cls: "text-slate-500 dark:text-slate-400" },
  { key: "__none__",                      label: "Not Marked",    cls: "text-slate-500 dark:text-slate-400" },
];

// v59: per-collector attendance rollup. Filters: team, collector, date range.
// Each numeric cell → Feedback Progress with hr_code + status preloaded.
export default function CollectorAttendanceView({ rows }: { rows: Row[] }) {
  const [teamFilter, setTeamFilter] = useState<string[]>([]);
  const [collectorFilter, setCollectorFilter] = useState<string[]>([]);
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [sortKey, setSortKey] = useState<string>("Total");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("desc");

  const teams = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.team) s.add(r.team);
    return Array.from(s).sort();
  }, [rows]);

  const collectors = useMemo(() => {
    const map = new Map<string, Row>();
    for (const r of rows) if (!map.has(r.hr_code)) map.set(r.hr_code, r);
    return Array.from(map.values())
      .filter((c) => teamFilter.length === 0 || (c.team && teamFilter.includes(c.team)))
      .sort((a, b) => a.hr_code.localeCompare(b.hr_code));
  }, [rows, teamFilter]);

  const filtered = useMemo(() => {
    const teamSet = new Set(teamFilter);
    const colSet = new Set(collectorFilter);
    return rows.filter((r) => {
      if (teamSet.size > 0 && (!r.team || !teamSet.has(r.team))) return false;
      if (colSet.size > 0 && !colSet.has(r.hr_code)) return false;
      if (fromDate && (!r.session_date || r.session_date < fromDate)) return false;
      if (toDate && (!r.session_date || r.session_date > toDate)) return false;
      return true;
    });
  }, [rows, teamFilter, collectorFilter, fromDate, toDate]);

  type Agg = { hr_code: string; name: string; team: string | null;
    total: number; attended: number; late: number; absent: number; cancelled: number; notMarked: number };

  const agg = useMemo(() => {
    const map = new Map<string, Agg>();
    for (const r of filtered) {
      let g = map.get(r.hr_code);
      if (!g) {
        g = { hr_code: r.hr_code, name: r.name, team: r.team,
          total: 0, attended: 0, late: 0, absent: 0, cancelled: 0, notMarked: 0 };
        map.set(r.hr_code, g);
      }
      g.total++;
      switch (r.attendance) {
        case "Attended":      g.attended++; break;
        case "Attended Late": g.late++; break;
        case "Absent":        g.absent++; break;
        case "Cancelled":     g.cancelled++; break;
        default:              g.notMarked++;
      }
    }
    return Array.from(map.values());
  }, [filtered]);

  function count(g: Agg, label: string) {
    switch (label) {
      case "Total":      return g.total;
      case "Complete":   return g.attended + g.late;
      case "Attended":   return g.attended;
      case "Late":       return g.late;
      case "Absent":     return g.absent;
      case "Cancelled":  return g.cancelled;
      case "Not Marked": return g.notMarked;
    }
    return 0;
  }
  function pct(g: Agg) {
    if (g.total === 0) return 0;
    return Math.round(((g.attended + g.late) * 100) / g.total);
  }

  const sorted = useMemo(() => {
    const arr = [...agg];
    arr.sort((a, b) => {
      let av: number | string, bv: number | string;
      if (sortKey === "hr_code")      { av = a.hr_code; bv = b.hr_code; }
      else if (sortKey === "name")    { av = a.name;    bv = b.name; }
      else if (sortKey === "team")    { av = a.team ?? ""; bv = b.team ?? ""; }
      else if (sortKey === "%")       { av = pct(a);   bv = pct(b); }
      else                            { av = count(a, sortKey); bv = count(b, sortKey); }
      const c = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? c : -c;
    });
    return arr;
  }, [agg, sortKey, sortDir]);

  function toggleSort(k: string) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  }

  function href(hr: string, statusKey: string) {
    const p = new URLSearchParams();
    p.set("collector", hr);
    if (fromDate) p.set("from", fromDate);
    if (toDate) p.set("to", toDate);
    if (statusKey) p.set("status", statusKey);
    return `/feedback-progress?${p.toString()}`;
  }

  const collectorOptions: MSOption[] = collectors.map((c) => ({
    value: c.hr_code, label: `${c.hr_code} - ${c.name}`,
  }));
  const sortIcon = (k: string) => (sortKey === k ? (sortDir === "asc" ? " ▲" : " ▼") : "");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Collector Attendance</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Per-collector session totals. Click any number to open Feedback
          Progress filtered on that collector + status.
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
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">To</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900 text-sm" />
        </div>
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400">
        {sorted.length} collector(s) · {filtered.length.toLocaleString()} attendee rows
      </p>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              <th onClick={() => toggleSort("hr_code")} className="cursor-pointer text-left font-medium text-slate-500 dark:text-slate-400 px-3 py-2.5 whitespace-nowrap">HR Code{sortIcon("hr_code")}</th>
              <th onClick={() => toggleSort("name")} className="cursor-pointer text-left font-medium text-slate-500 dark:text-slate-400 px-3 py-2.5 whitespace-nowrap">Name{sortIcon("name")}</th>
              <th onClick={() => toggleSort("team")} className="cursor-pointer text-left font-medium text-slate-500 dark:text-slate-400 px-3 py-2.5 whitespace-nowrap">Team{sortIcon("team")}</th>
              {BUCKETS.map((b) => (
                <th key={b.label} onClick={() => toggleSort(b.label)} className="cursor-pointer text-right font-medium text-slate-500 dark:text-slate-400 px-3 py-2.5 whitespace-nowrap">
                  {b.label}{sortIcon(b.label)}
                </th>
              ))}
              <th onClick={() => toggleSort("%")} className="cursor-pointer text-right font-medium text-slate-500 dark:text-slate-400 px-3 py-2.5 whitespace-nowrap">Attendance %{sortIcon("%")}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={4 + BUCKETS.length} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500">
                  No attendee rows match these filters.
                </td>
              </tr>
            ) : (
              sorted.map((g) => (
                <tr key={g.hr_code} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-2 font-medium">{g.hr_code}</td>
                  <td className="px-3 py-2">{g.name}</td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{g.team ?? "—"}</td>
                  {BUCKETS.map((b) => {
                    const c = count(g, b.label);
                    return (
                      <td key={b.label} className="px-3 py-2 text-right tabular-nums">
                        {c === 0 ? (
                          <span className="text-slate-300 dark:text-slate-600">0</span>
                        ) : (
                          <Link href={href(g.hr_code, b.key)} className={`font-semibold hover:underline ${b.cls}`}>
                            {c}
                          </Link>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">
                    {pct(g)}%
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
