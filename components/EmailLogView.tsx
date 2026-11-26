"use client";

import { useMemo, useState } from "react";

export type EmailLogRow = {
  id: number;
  created_at: string;
  to_email: string | null;
  cc: string | null;
  subject: string | null;
  status: "sent" | "failed" | "skipped";
  error: string | null;
  hr_code: string | null;
};

const fmt = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function EmailLogView({ rows, error }: { rows: EmailLogRow[]; error: string | null }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | EmailLogRow["status"]>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status && r.status !== status) return false;
      const day = fmt(r.created_at).slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (!s) return true;
      return [r.to_email, r.cc, r.subject, r.hr_code, r.error].some((v) => (v ?? "").toLowerCase().includes(s));
    });
  }, [rows, q, status, from, to]);

  const counts = useMemo(() => {
    const c = { sent: 0, failed: 0, skipped: 0 };
    for (const r of visible) c[r.status]++;
    return c;
  }, [visible]);

  function exportCsv() {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [["Time", "Status", "To", "CC", "HR Code", "Subject", "Error"].map(esc).join(",")];
    for (const r of visible) {
      lines.push([fmt(r.created_at), r.status, r.to_email, r.cc, r.hr_code, r.subject, r.error].map(esc).join(","));
    }
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `email-log${from || to ? `_${from || "start"}_to_${to || "today"}` : ""}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const inputCls = "rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900 text-sm";
  const badge: Record<string, string> = {
    sent: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    failed: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    skipped: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  };
  const label: Record<string, string> = { sent: "Sent", failed: "Failed", skipped: "Not sent" };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Email Log</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Every email the dashboard sent in the last month (older entries are deleted automatically).
          &quot;Not sent&quot; = the collector isn&apos;t in Users or has no email, so nothing was sent.
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          Could not load the log: {error}. Did you run the email_log SQL in Supabase?
        </p>
      )}

      <div className="grid grid-cols-3 gap-3 max-w-xl">
        {(["sent", "failed", "skipped"] as const).map((k) => (
          <button key={k} type="button" onClick={() => setStatus((s) => (s === k ? "" : k))}
            className={`text-left bg-white dark:bg-slate-900 rounded-2xl border p-3 ${
              status === k ? "border-slate-900 dark:border-slate-100" : "border-slate-200 dark:border-slate-800"
            }`}>
            <p className="text-xs text-slate-500 dark:text-slate-400">{label[k]}</p>
            <p className={`text-2xl font-bold mt-1 ${k === "sent" ? "text-emerald-600" : k === "failed" ? "text-red-600" : "text-amber-600"}`}>
              {counts[k].toLocaleString()}
            </p>
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Search</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Email, HR code, subject…" className={`${inputCls} w-full`} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as any)} className={inputCls}>
            <option value="">All</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
            <option value="skipped">Not sent</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
        </div>
        <button type="button" onClick={exportCsv} disabled={visible.length === 0}
          className="rounded-lg bg-emerald-600 text-white px-3 py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
          Export CSV
        </button>
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400">{visible.length.toLocaleString()} email(s)</p>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr className="text-left text-slate-500 dark:text-slate-400">
              <th className="font-medium px-4 py-2.5 whitespace-nowrap">Time</th>
              <th className="font-medium px-4 py-2.5">Status</th>
              <th className="font-medium px-4 py-2.5">To</th>
              <th className="font-medium px-4 py-2.5">CC</th>
              <th className="font-medium px-4 py-2.5">Subject</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">No emails logged yet.</td></tr>
            ) : (
              visible.slice(0, 2000).map((r) => (
                <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800 align-top">
                  <td className="px-4 py-2 whitespace-nowrap tabular-nums text-slate-500">{fmt(r.created_at)}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge[r.status]}`}>{label[r.status]}</span>
                    {r.error && <p className="text-xs text-slate-400 mt-1 max-w-[240px]">{r.error}</p>}
                  </td>
                  <td className="px-4 py-2">{r.to_email ?? <span className="text-slate-400">{r.hr_code}</span>}</td>
                  <td className="px-4 py-2 text-slate-500 max-w-[260px] break-words">{r.cc}</td>
                  <td className="px-4 py-2">{r.subject}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {visible.length > 2000 && (
          <p className="px-4 py-2 text-xs text-slate-400">Showing the latest 2,000 - use Export CSV for everything.</p>
        )}
      </div>
    </div>
  );
}
