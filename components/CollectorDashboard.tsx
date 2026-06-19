"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MODULES,
  CARD_ORDER,
  type ModuleValue,
  type PartSummary,
  type Report,
  type FeedbackSession,
} from "@/lib/modules";

type Section = "matches" | "reports" | "sessions";

// One aggregated match (sum of its parts).
type MatchRow = {
  matchid: string;
  date: string | null;
  counts: Record<ModuleValue, number>;
  total: number;
  parts: number;
};

const labelFor = (v: ModuleValue) =>
  MODULES.find((m) => m.value === v)?.label ?? v;

export default function CollectorDashboard({
  myName,
  isLinked,
  from,
  to,
  parts,
  moduleTotals,
  reports,
  feedbackSessions,
}: {
  myName: string | null;
  isLinked: boolean;
  from: string;
  to: string;
  parts: PartSummary[];
  moduleTotals: Record<ModuleValue, number>;
  reports: Report[];
  feedbackSessions: FeedbackSession[];
}) {
  const router = useRouter();
  const [section, setSection] = useState<Section>("matches");
  const [expanded, setExpanded] = useState<string | null>(null);

  function applyFilters(next: { from?: string; to?: string }) {
    const f = next.from ?? from;
    const t = next.to ?? to;
    const params = new URLSearchParams();
    if (f) params.set("from", f);
    if (t) params.set("to", t);
    const qs = params.toString();
    router.push(`/analytics${qs ? `?${qs}` : ""}`);
  }

  // Group match parts into one row per match.
  const matches: MatchRow[] = useMemo(() => {
    const map = new Map<string, MatchRow>();
    for (const p of parts) {
      let row = map.get(p.matchid);
      if (!row) {
        row = {
          matchid: p.matchid,
          date: p.date,
          counts: {
            players: 0,
            event: 0,
            formation_tactical: 0,
            location: 0,
            impact: 0,
            extras: 0,
            freeze_frame: 0,
          },
          total: 0,
          parts: 0,
        };
        map.set(p.matchid, row);
      }
      for (const m of MODULES) row.counts[m.value] += p.counts[m.value] ?? 0;
      row.total += p.total;
      row.parts += 1;
      if (p.date && (!row.date || p.date > row.date)) row.date = p.date;
    }
    return Array.from(map.values()).sort((a, b) =>
      (b.date ?? "").localeCompare(a.date ?? "")
    );
  }, [parts]);

  const totalMistakes = Object.values(moduleTotals).reduce((a, b) => a + b, 0);
  const inputCls = "rounded-lg border border-slate-300 px-3 py-2 bg-white";

  if (!isLinked) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
        <h1 className="text-xl font-bold mb-2">My Dashboard</h1>
        <p className="text-slate-600">
          Your account isn’t linked to a collector profile yet. Please ask an
          Admin to set your HR code on the Accounts page.
        </p>
      </div>
    );
  }

  const cards: { id: Section; label: string; value: number; hint: string }[] = [
    { id: "reports", label: "Reports", value: reports.length, hint: "sent to you" },
    {
      id: "sessions",
      label: "Feedback Sessions",
      value: feedbackSessions.length,
      hint: "online / offline",
    },
    {
      id: "matches",
      label: "Match Details",
      value: matches.length,
      hint: "matches in range",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header + Review Date filter */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">My Dashboard</h1>
          {myName && <p className="text-slate-500">{myName}</p>}
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Review date — from</label>
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => applyFilters({ from: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">to</label>
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => applyFilters({ to: e.target.value })}
              className={inputCls}
            />
          </div>
          {(from || to) && (
            <button
              type="button"
              onClick={() => router.push("/analytics")}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Three interactive cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setSection(c.id)}
            className={`text-left bg-white rounded-2xl border p-5 transition hover:shadow-sm ${
              section === c.id ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-200"
            }`}
          >
            <p className="text-sm text-slate-500">{c.label}</p>
            <p className="text-3xl font-bold mt-1">{c.value}</p>
            <p className="text-xs text-slate-400 mt-1">{c.hint}</p>
          </button>
        ))}
      </div>

      {/* Selected section panel */}
      {section === "reports" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h2 className="font-semibold mb-4">Reports</h2>
          {reports.length === 0 ? (
            <p className="text-slate-500">No reports have been sent to you yet.</p>
          ) : (
            <div className="space-y-3">
              {reports.map((r) => (
                <div key={r.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{r.title}</p>
                    <span className="text-sm text-slate-400 shrink-0">
                      {r.report_date ?? "—"}
                    </span>
                  </div>
                  {r.body && <p className="text-sm text-slate-600 mt-1">{r.body}</p>}
                  {r.url && (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline mt-1 inline-block"
                    >
                      Open report ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {section === "sessions" && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 font-semibold">
            Feedback Sessions
          </div>
          {feedbackSessions.length === 0 ? (
            <p className="text-slate-500 p-5">No feedback sessions recorded yet.</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left font-medium text-slate-500 px-5 py-3">Date</th>
                  <th className="text-left font-medium text-slate-500 px-5 py-3">Type</th>
                  <th className="text-left font-medium text-slate-500 px-5 py-3">Notes</th>
                </tr>
              </thead>
              <tbody>
                {feedbackSessions.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="px-5 py-2.5 whitespace-nowrap">{s.session_date ?? "—"}</td>
                    <td className="px-5 py-2.5">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          s.mode === "Online"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {s.mode}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-slate-600">{s.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {section === "matches" && (
        <div className="space-y-3">
          {matches.length === 0 ? (
            <p className="text-slate-500">No matches for this date range.</p>
          ) : (
            matches.map((mt) => {
              const open = expanded === mt.matchid;
              const present = CARD_ORDER.filter((v) => mt.counts[v] > 0);
              return (
                <div
                  key={mt.matchid}
                  className="bg-white rounded-2xl border border-slate-200 overflow-hidden"
                >
                  <button
                    onClick={() => setExpanded(open ? null : mt.matchid)}
                    className="w-full text-left p-5 flex items-center justify-between gap-4 hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold truncate">Match {mt.matchid}</p>
                      <p className="text-sm text-slate-500">
                        {mt.date ?? "—"} · {mt.total} mistake(s)
                        {mt.parts > 1 ? ` · ${mt.parts} parts` : ""}
                      </p>
                    </div>
                    <span className="text-slate-400 text-sm shrink-0">{open ? "▲" : "▼"}</span>
                  </button>
                  {open && (
                    <div className="border-t border-slate-100 p-5">
                      {present.length === 0 ? (
                        <p className="text-sm text-slate-400">No mistakes recorded for this match.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {present.map((v) => (
                            <span
                              key={v}
                              className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-1.5 text-sm text-slate-700"
                            >
                              {labelFor(v)}: <span className="font-semibold">{mt.counts[v]}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Bottom: per-module total cards (always visible, respects date filter) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Total mistakes by module</h2>
          <span className="text-sm text-slate-500">
            {totalMistakes} total mistake(s)
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {CARD_ORDER.map((v) => (
            <div key={v} className="bg-white rounded-2xl border border-slate-200 p-5">
              <p className="text-sm text-slate-500">{labelFor(v)}</p>
              <p className="text-3xl font-bold mt-1 tabular-nums">{moduleTotals[v] ?? 0}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
