"use client";

import { useState } from "react";

type ImportResult = {
  ok?: boolean;
  total_rows?: number;
  created?: number;
  updated?: number;
  recovery_emails_sent?: number;
  failed?: { row: number; reason: string }[];
  failed_count?: number;
  error?: string;
};

export default function AdminUsersImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [sendRecovery, setSendRecovery] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("send_recovery", sendRecovery ? "true" : "false");
      const res = await fetch("/api/admin/users-import", { method: "POST", body: fd });
      const json = await res.json();
      setResult(json);
    } catch (err: any) {
      setResult({ error: err?.message ?? "upload failed" });
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900";

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Bulk User Import</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Admin only. Uploads a CSV of employees, provisions <code>auth.users</code>{" "}
          accounts, upserts into <code>public.users</code>, and (optionally) sends
          each person a "set your password" recovery email.
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
          Expected columns: <code>email, hr_code, first_name, last_name,
          mobile_number, legacy_id, squad, job_title</code>. Header case is
          normalized.
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
          {file && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{file.name}</p>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={sendRecovery}
            onChange={(e) => setSendRecovery(e.target.checked)}
            className="h-4 w-4"
          />
          Send password-recovery email to each new user
        </label>

        <button
          type="submit"
          disabled={!file || busy}
          className="rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-6 py-2.5 text-sm font-medium disabled:opacity-50"
        >
          {busy ? "Importing (may take a minute)..." : "Import"}
        </button>

        {result && (
          <div
            className={`rounded-lg p-4 text-sm ${
              result.ok
                ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800"
                : "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800"
            }`}
          >
            {result.error ? (
              <p className="font-medium">{result.error}</p>
            ) : (
              <>
                <p className="font-semibold">
                  Imported {result.total_rows} rows. Created {result.created},
                  updated {result.updated}, sent {result.recovery_emails_sent}{" "}
                  recovery emails.
                </p>
                {result.failed_count! > 0 && (
                  <>
                    <p className="mt-2 font-medium">
                      {result.failed_count} rows failed. First {result.failed?.length}:
                    </p>
                    <ul className="mt-1 text-xs list-disc pl-5">
                      {result.failed?.map((f, i) => (
                        <li key={i}>
                          Row {f.row}: {f.reason}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
