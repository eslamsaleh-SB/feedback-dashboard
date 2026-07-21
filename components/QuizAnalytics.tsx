"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type CollectorOpt = { hr_code: string; name: string; team: string | null };
type Assignment = { hr_code: string; assigned_at: string; last_notified_at: string | null };
type Submission = {
  id: string;
  hr_code: string;
  submitted_at: string;
  auto_score: number;
  manual_score: number;
  total_score: number;
  max_score: number;
};

export default function QuizAnalytics({
  quizId,
  title,
  maxScore,
  collectors,
  assignments,
  submissions,
}: {
  quizId: string;
  title: string;
  maxScore: number;
  collectors: CollectorOpt[];
  assignments: Assignment[];
  submissions: Submission[];
}) {
  const collectorByHr = useMemo(() => {
    const m = new Map<string, CollectorOpt>();
    for (const c of collectors) m.set(c.hr_code, c);
    return m;
  }, [collectors]);

  const teams = useMemo(() => {
    const s = new Set<string>();
    for (const c of collectors) if (c.team) s.add(c.team);
    return Array.from(s).sort();
  }, [collectors]);

  const [teamFilter, setTeamFilter] = useState("all");
  const [collectorFilter, setCollectorFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "pending">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minScore, setMinScore] = useState("");
  const [maxScoreFilter, setMaxScoreFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submittedByHr = useMemo(() => {
    const m = new Map<string, Submission>();
    for (const s of submissions) m.set(s.hr_code, s);
    return m;
  }, [submissions]);

  // Rows = every assignment, joined with its submission (if any) + collector.
  const rows = useMemo(() => {
    return assignments
      .map((a) => {
        const c = collectorByHr.get(a.hr_code);
        const s = submittedByHr.get(a.hr_code) ?? null;
        return { a, c, s };
      })
      .filter(({ a, c, s }) => {
        if (teamFilter !== "all" && (c?.team ?? "") !== teamFilter) return false;
        if (collectorFilter !== "all" && a.hr_code !== collectorFilter) return false;
        if (statusFilter === "completed" && !s) return false;
        if (statusFilter === "pending" && s) return false;
        if (s) {
          if (dateFrom && s.submitted_at.slice(0, 10) < dateFrom) return false;
          if (dateTo && s.submitted_at.slice(0, 10) > dateTo) return false;
          if (minScore && Number(s.total_score) < Number(minScore)) return false;
          if (maxScoreFilter && Number(s.total_score) > Number(maxScoreFilter)) return false;
        } else if (minScore || maxScoreFilter || dateFrom || dateTo) {
          // Pending rows drop out when score/date filters are set.
          return false;
        }
        return true;
      });
  }, [
    assignments, collectorByHr, submittedByHr, teamFilter, collectorFilter,
    statusFilter, dateFrom, dateTo, minScore, maxScoreFilter,
  ]);

  // Metrics from the FILTERED set (so the numbers move with the filters).
  const stats = useMemo(() => {
    const scored = rows.filter((r) => r.s).map((r) => r.s!) as Submission[];
    const total = rows.length;
    const done = scored.length;
    const pending = total - done;
    const rate = total > 0 ? Math.round((done / total) * 100) : 0;
    const avg =
      scored.length > 0
        ? scored.reduce((acc, s) => acc + Number(s.total_score), 0) / scored.length
        : 0;
    const highest = scored.length > 0 ? Math.max(...scored.map((s) => Number(s.total_score))) : 0;
    const lowest = scored.length > 0 ? Math.min(...scored.map((s) => Number(s.total_score))) : 0;
    return { total, done, pending, rate, avg, highest, lowest };
  }, [rows]);

  async function resendAll() {
    setBusy(true);
    setMsg(null);
    try {
      const pendingCodes = rows.filter((r) => !r.s).map((r) => r.a.hr_code);
      const res = await fetch(`/api/admin/quizzes/${quizId}/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hr_codes: pendingCodes }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "resend failed");
      setMsg(`Sent ${json.sent} reminders (${json.failed?.length ?? 0} failed).`);
    } catch (e: any) {
      setMsg(e?.message ?? "resend failed");
    } finally {
      setBusy(false);
    }
  }

  async function resendOne(hr: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/quizzes/${quizId}/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hr_codes: [hr] }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "resend failed");
      setMsg(`Reminder sent to ${hr}.`);
    } catch (e: any) {
      setMsg(e?.message ?? "resend failed");
    } finally {
      setBusy(false);
    }
  }

  function csvCell(v: any): string {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }
  function exportCsv() {
    const header = ["HR Code", "Name", "Team", "Status", "Submitted At", "Auto Score", "Manual Score", "Total Score", "Max Score"];
    const lines = rows.map(({ a, c, s }) => [
      a.hr_code,
      c?.name ?? "",
      c?.team ?? "",
      s ? "Completed" : "Pending",
      s?.submitted_at ?? "",
      s ? String(s.auto_score) : "",
      s ? String(s.manual_score) : "",
      s ? String(s.total_score) : "",
      s ? String(s.max_score) : String(maxScore),
    ]);
    const csv = [header, ...lines].map((r) => r.map(csvCell).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9_-]+/gi, "_")}_submissions.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const inputCls =
    "rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900 text-sm";
  const cardCls =
    "bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold">Analytics & Submissions</h2>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={resendAll}
            disabled={busy}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            Resend to all pending
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Export CSV
          </button>
        </div>
      </div>

      {msg && <p className="text-sm text-emerald-700">{msg}</p>}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <div className={cardCls}>
          <p className="text-xs text-slate-500 dark:text-slate-400">Assigned</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{stats.total}</p>
        </div>
        <div className={cardCls}>
          <p className="text-xs text-slate-500 dark:text-slate-400">Completed</p>
          <p className="text-2xl font-bold text-emerald-600">{stats.done}</p>
        </div>
        <div className={cardCls}>
          <p className="text-xs text-slate-500 dark:text-slate-400">Pending</p>
          <p className={`text-2xl font-bold ${stats.pending ? "text-amber-600" : "text-slate-800 dark:text-slate-100"}`}>{stats.pending}</p>
        </div>
        <div className={cardCls}>
          <p className="text-xs text-slate-500 dark:text-slate-400">Completion</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{stats.rate}%</p>
        </div>
        <div className={cardCls}>
          <p className="text-xs text-slate-500 dark:text-slate-400">Average score</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            {stats.done ? stats.avg.toFixed(1) : "-"}
            <span className="text-xs text-slate-400 dark:text-slate-500 font-normal"> / {maxScore}</span>
          </p>
        </div>
        <div className={cardCls}>
          <p className="text-xs text-slate-500 dark:text-slate-400">Highest / Lowest</p>
          <p className="text-lg font-bold text-slate-800 dark:text-slate-100">
            {stats.done ? `${stats.highest} / ${stats.lowest}` : "-"}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className={`${cardCls} flex flex-wrap items-end gap-3`}>
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Team</label>
          <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} className={inputCls}>
            <option value="all">All teams</option>
            {teams.map((t) => (<option key={t} value={t}>{t}</option>))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Collector</label>
          <select value={collectorFilter} onChange={(e) => setCollectorFilter(e.target.value)} className={inputCls}>
            <option value="all">All collectors</option>
            {collectors
              .filter((c) => teamFilter === "all" || (c.team ?? "") === teamFilter)
              .map((c) => (<option key={c.hr_code} value={c.hr_code}>{c.hr_code} - {c.name}</option>))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className={inputCls}>
            <option value="all">All</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">From</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">To</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Min score</label>
          <input
            type="number" value={minScore} onChange={(e) => setMinScore(e.target.value)}
            className={`${inputCls} w-24`} placeholder="e.g. 5"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Max score</label>
          <input
            type="number" value={maxScoreFilter} onChange={(e) => setMaxScoreFilter(e.target.value)}
            className={`${inputCls} w-24`} placeholder="e.g. 10"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-slate-500 dark:text-slate-400">
            <tr>
              <th className="text-left px-4 py-3">HR Code</th>
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Team</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Submitted</th>
              <th className="text-right px-4 py-3">Score</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500">
                  No rows match the filters.
                </td>
              </tr>
            ) : (
              rows.map(({ a, c, s }) => (
                <tr key={a.hr_code} className="text-slate-700 dark:text-slate-200">
                  <td className="px-4 py-2 font-medium">{a.hr_code}</td>
                  <td className="px-4 py-2">{c?.name ?? "-"}</td>
                  <td className="px-4 py-2">{c?.team ?? "-"}</td>
                  <td className="px-4 py-2">
                    {s ? (
                      <span className="text-xs bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5">Completed</span>
                    ) : (
                      <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">Pending</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-500 dark:text-slate-400">
                    {s?.submitted_at ? new Date(s.submitted_at).toLocaleString() : "-"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {s ? `${s.total_score} / ${s.max_score || maxScore}` : "-"}
                  </td>
                  <td className="px-4 py-2 text-right space-x-2">
                    {s ? (
                      <Link
                        href={`/admin-quizzes/${quizId}/submissions/${s.id}`}
                        className="text-xs underline text-blue-600 dark:text-blue-400"
                      >
                        View
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => resendOne(a.hr_code)}
                        disabled={busy}
                        className="text-xs underline text-blue-600 dark:text-blue-400"
                      >
                        Resend email
                      </button>
                    )}
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
