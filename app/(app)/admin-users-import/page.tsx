"use client";

import { useState } from "react";

type Row = {
  email: string;
  hr_code: string;
  first_name?: string | null;
  last_name?: string | null;
  mobile_number?: string | null;
  legacy_id?: string | null;
  squad?: string | null;
  job_title?: string | null;
};

type ChunkResult = {
  ok?: boolean;
  total_rows?: number;
  created?: number;
  updated?: number;
  recovery_emails_sent?: number;
  failed?: { row: number; email: string; reason: string }[];
  failed_count?: number;
  error?: string;
};

function parseCsvClient(text: string): string[][] {
  const clean = text.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const first = clean.split("\n")[0] ?? "";
  const sep = first.includes("\t") ? "\t" : ",";
  return clean.split("\n").map((l) => {
    if (sep === "\t") return l.split("\t").map((c) => c.trim());
    const out: string[] = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (quoted) {
        if (ch === '"') {
          if (l[i + 1] === '"') { cur += '"'; i++; } else { quoted = false; }
        } else cur += ch;
      } else {
        if (ch === '"') quoted = true;
        else if (ch === ",") { out.push(cur.trim()); cur = ""; }
        else cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  }).filter((r) => r.some((c) => c));
}

const CHUNK = 50; // rows per request. Keeps each call well under Vercel 60s.

export default function AdminUsersImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [sendRecovery, setSendRecovery] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [totals, setTotals] = useState<{ created: number; updated: number; recovery: number; failed: number } | null>(null);
  const [errors, setErrors] = useState<{ row: number; email: string; reason: string }[]>([]);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setProgress(null);
    setTotals(null);
    setErrors([]);
    setMsg(null);

    try {
      // Read file client-side, parse to rows.
      const text = await file.text();
      const parsed = parseCsvClient(text);
      if (parsed.length < 2) throw new Error("Empty file");
      const headers = parsed[0].map((h) => h.toLowerCase().replace(/\s+/g, "_"));
      const idx = (...names: string[]) => {
        for (const n of names) {
          const i = headers.findIndex((h) => h === n);
          if (i >= 0) return i;
        }
        return -1;
      };
      const iEmail  = idx("email");
      const iHr     = idx("hr_code", "hr");
      const iFirst  = idx("first_name", "firstname");
      const iLast   = idx("last_name", "lastname");
      const iMobile = idx("mobile_number", "mobile", "phone");
      const iLegacy = idx("legacy_id", "legacyid", "legacy");
      const iSquad  = idx("squad", "team");
      const iTitle  = idx("job_title", "jobtitle", "title");
      if (iEmail < 0 || iHr < 0) throw new Error("Missing required columns: email + hr_code");

      const rows: Row[] = [];
      for (let i = 1; i < parsed.length; i++) {
        const r = parsed[i];
        rows.push({
          email: (r[iEmail] ?? "").trim().toLowerCase(),
          hr_code: (r[iHr] ?? "").trim(),
          first_name: iFirst >= 0 ? (r[iFirst] ?? "").trim() || null : null,
          last_name: iLast >= 0 ? (r[iLast] ?? "").trim() || null : null,
          mobile_number: iMobile >= 0 ? (r[iMobile] ?? "").trim() || null : null,
          legacy_id: iLegacy >= 0 ? (r[iLegacy] ?? "").trim() || null : null,
          squad: iSquad >= 0 ? (r[iSquad] ?? "").trim() || null : null,
          job_title: iTitle >= 0 ? (r[iTitle] ?? "").trim() || null : null,
        });
      }

      const total = rows.length;
      let done = 0;
      let created = 0;
      let updated = 0;
      let recovery = 0;
      let failedTotal = 0;
      const errs: { row: number; email: string; reason: string }[] = [];

      setProgress({ done: 0, total });

      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK);
        const res = await fetch("/api/admin/users-import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ rows: slice, send_recovery: sendRecovery }),
        });
        const raw = await res.text();
        let json: ChunkResult = {};
        try {
          json = raw ? JSON.parse(raw) : {};
        } catch {
          json = { error: raw?.slice(0, 300) || `Server returned ${res.status} with no body.` };
        }
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        created  += json.created  ?? 0;
        updated  += json.updated  ?? 0;
        recovery += json.recovery_emails_sent ?? 0;
        failedTotal += json.failed_count ?? 0;
        for (const f of json.failed ?? []) {
          // Renumber row against the whole file (chunk index + offset).
          errs.push({ ...f, row: f.row + i });
        }
        done += slice.length;
        setProgress({ done, total });
        setTotals({ created, updated, recovery, failed: failedTotal });
      }

      setErrors(errs.slice(0, 50));
      setMsg({
        type: failedTotal === 0 ? "ok" : "err",
        text: failedTotal === 0
          ? `Imported ${total} rows. Created ${created}, updated ${updated}, sent ${recovery} recovery emails.`
          : `Imported with ${failedTotal} failures. Check details below.`,
      });
    } catch (err: any) {
      setMsg({ type: "err", text: err?.message ?? "Import failed" });
    } finally {
      setBusy(false);
    }
  }

  const inputCls = "w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900";

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Bulk User Import</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Admin only. Client uploads in {CHUNK}-row chunks so we stay under the
          serverless time limit. Each chunk creates auth accounts + upserts
          into <code>users</code>, and optionally sends a "set your password" email.
        </p>
      </div>

      <form
        onSubmit={submit}
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-5"
      >
        <div>
          <label className="block text-sm font-medium mb-1">CSV file</label>
          <input
            type="file"
            accept=".csv,.tsv,.txt"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-slate-600 dark:text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:text-white file:px-4 file:py-2 file:text-sm cursor-pointer"
          />
          {file && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{file.name}</p>}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={sendRecovery}
            onChange={(e) => setSendRecovery(e.target.checked)}
            className="h-4 w-4"
          />
          Send password-recovery email to each newly-created user
        </label>

        <button
          type="submit"
          disabled={!file || busy}
          className="rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-6 py-2.5 text-sm font-medium disabled:opacity-50"
        >
          {busy && progress
            ? `Importing... ${progress.done} / ${progress.total}`
            : busy
            ? "Preparing..."
            : "Import"}
        </button>

        {progress && (
          <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded overflow-hidden">
            <div
              className="h-2 bg-emerald-500"
              style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }}
            />
          </div>
        )}

        {totals && (
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Running totals: created {totals.created} · updated {totals.updated} ·
            recovery emails sent {totals.recovery} · failed {totals.failed}
          </div>
        )}

        {msg && (
          <div
            className={`rounded-lg p-4 text-sm border ${
              msg.type === "ok"
                ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800"
                : "bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200 border-red-200 dark:border-red-800"
            }`}
          >
            <p className="font-medium">{msg.text}</p>
            {errors.length > 0 && (
              <ul className="mt-2 text-xs list-disc pl-5 space-y-0.5">
                {errors.map((e, i) => (
                  <li key={i}>Row {e.row} ({e.email || "-"}): {e.reason}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
