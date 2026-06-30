"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

const MODULE_KEYS = [
  "players",
  "event",
  "formation_tactical",
  "location",
  "impact",
  "extras",
  "freeze_frame",
] as const;
type ModuleKey = (typeof MODULE_KEYS)[number];

const MODULE_LABEL: Record<ModuleKey, string> = {
  players: "Players",
  event: "Event",
  formation_tactical: "Formation / Tactical",
  location: "Location",
  impact: "Impact",
  extras: "Extras",
  freeze_frame: "Freeze Frame",
};

function trendInfo(curr: number | null, prev: number | null, opts: { lowerIsBetter?: boolean } = {}) {
  if (curr == null || prev == null) {
    return { text: null as string | null, color: "text-slate-400" };
  }
  const lowerIsBetter = opts.lowerIsBetter ?? false;
  if (prev === 0 && curr === 0) {
    return { text: "no change", color: "text-slate-400" };
  }
  const diff = curr - prev;
  const pct = prev === 0 ? 100 : (diff / Math.abs(prev)) * 100;
  const isUp = diff > 0;
  const isFlat = Math.abs(pct) < 0.5;
  const good = isFlat ? null : lowerIsBetter ? !isUp : isUp;
  const color = good === null ? "text-slate-400" : good ? "text-emerald-600" : "text-red-500";
  const arrow = isFlat ? "↑" : isUp ? "↑" : "↓";
  const text = `${arrow} ${Math.abs(pct).toFixed(1)}%`;
  return { text, color };
}

export default function DashboardView({
  from,
  to,
  curLabel,
  prevLabel,
  submittedReports,
  collectorCount,
  openNotes,
  feedback,
  moduleErrorsCur,
  moduleErrorsPrev,
  modulesCur,
  modulesPrev,
  qualityCurByModule,
  qualityPrevByModule,
  freezeFrameQualityCur,
  freezeFrameQualityPrev,
}: {
  from: string;
  to: string;
  curLabel: string;
  prevLabel: string;
  submittedReports: number;
  collectorCount: number;
  openNotes: number;
  feedback: {
    total: number;
    completed: number;
    cancelled: number;
    absent: number;
    incomplete: number;
  };
  moduleErrorsCur: number;
  moduleErrorsPrev: number;
  modulesCur: Record<string, number>;
  modulesPrev: Record<string, number>;
  qualityCurByModule: Record<string, number>;
  qualityPrevByModule: Record<string, number>;
  freezeFrameQualityCur: number | null;
  freezeFrameQualityPrev: number | null;
}) {
  const router = useRouter();
  const [fromInput, setFromInput] = useState(from);
  const [toInput, setToInput] = useState(to);

  const dateStr = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  function applyRange() {
    const params = new URLSearchParams();
    params.set("from", fromInput);
    params.set("to", toInput);
    router.push(`/dashboard?${params.toString()}`);
  }

  const inputCls = "rounded-lg border border-slate-300 px-3 py-2 bg-white text-sm";

  const topCards = [
    {
      label: "Submitted Reports",
      value: submittedReports,
      href: "/admin-reports",
      color: "text-blue-600",
      sub: curLabel,
    },
    {
      label: "Collectors",
      value: collectorCount,
      href: "/collectors",
      color: "text-slate-800",
    },
    {
      label: "Open Notes",
      value: openNotes,
      href: "/admin-reports",
      color: openNotes ? "text-amber-600" : "text-slate-800",
    },
  ];

  const feedbackCards: { label: string; value: number; color: string }[] = [
    { label: "Total sessions", value: feedback.total, color: "text-slate-800" },
    { label: "Completed", value: feedback.completed, color: "text-emerald-600" },
    {
      label: "Incomplete",
      value: feedback.incomplete,
      color: feedback.incomplete ? "text-amber-600" : "text-slate-800",
    },
    { label: "Cancelled", value: feedback.cancelled, color: "text-slate-500" },
    {
      label: "Absent",
      value: feedback.absent,
      color: feedback.absent ? "text-red-600" : "text-slate-800",
    },
  ];

  const moduleErrorCards = [
    { key: "total", label: "Total errors", curr: moduleErrorsCur, prev: moduleErrorsPrev },
    ...MODULE_KEYS.map((m) => ({
      key: m,
      label: MODULE_LABEL[m],
      curr: modulesCur[m] ?? 0,
      prev: modulesPrev[m] ?? 0,
    })),
  ];

  const qualityModuleKeys = Array.from(
    new Set([
      ...Object.keys(qualityCurByModule),
      ...Object.keys(qualityPrevByModule),
    ])
  ).sort();
  const qualityCards = [
    ...qualityModuleKeys.map((m) => ({
      key: `q-${m}`,
      label: MODULE_LABEL[m as ModuleKey] ?? m.replace(/_/g, " "),
      curr: qualityCurByModule[m] ?? null,
      prev: qualityPrevByModule[m] ?? null,
    })),
    {
      key: "q-freeze_frame",
      label: "Freeze Frame",
      curr: freezeFrameQualityCur,
      prev: freezeFrameQualityPrev,
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">{dateStr}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs text-slate-500 mb-1">From</label>
            <input
              type="date"
              value={fromInput}
              onChange={(e) => setFromInput(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">To</label>
            <input
              type="date"
              value={toInput}
              onChange={(e) => setToInput(e.target.value)}
              className={inputCls}
            />
          </div>
          <button
            type="button"
            onClick={applyRange}
            className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800"
          >
            Apply
          </button>
          <span className="text-xs text-slate-500 self-center">
            vs {prevLabel}
          </span>
        </div>
      </div>

      {/* Headline cards (clickable) */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {topCards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="bg-white rounded-2xl border border-slate-200 p-5 hover:bg-slate-50 transition"
          >
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className={`text-3xl font-bold mt-1 ${card.color}`}>{card.value}</p>
            {card.sub && (
              <p className="text-xs text-slate-400 mt-1">{card.sub}</p>
            )}
          </Link>
        ))}
      </div>

      {/* Module errors per module */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Module errors ({curLabel})
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {moduleErrorCards.map((c) => {
            const t = trendInfo(c.curr, c.prev, { lowerIsBetter: true });
            const href = c.key === "total" ? "/match-totals" : `/match-totals?module=${c.key}`;
            return (
              <Link
                key={c.key}
                href={href}
                className="bg-white rounded-2xl border border-slate-200 p-4 hover:bg-slate-50 transition"
              >
                <p className="text-xs text-slate-500 truncate">{c.label}</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <p className="text-2xl font-bold text-slate-800">{Number(c.curr).toLocaleString()}</p>
                  {t.text && (
                    <span className={`text-xs font-semibold ${t.color}`}>{t.text}</span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Previous: {Number(c.prev).toLocaleString()}
                </p>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Quality scores per module + freeze frame */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Quality scores ({curLabel})
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {qualityCards.map((c) => {
            const t = trendInfo(c.curr, c.prev, { lowerIsBetter: false });
            return (
              <Link
                key={c.key}
                href="/quality-score"
                className="bg-white rounded-2xl border border-slate-200 p-4 hover:bg-slate-50 transition"
              >
                <p className="text-xs text-slate-500 truncate">{c.label}</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <p className="text-2xl font-bold text-slate-800">
                    {c.curr == null ? "-" : `${c.curr.toFixed(1)}%`}
                  </p>
                  {t.text && (
                    <span className={`text-xs font-semibold ${t.color}`}>{t.text}</span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Previous: {c.prev == null ? "no data" : `${c.prev.toFixed(1)}%`}
                </p>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Feedback session cards */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Feedback sessions ({curLabel})
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {feedbackCards.map((c) => (
            <Link
              key={c.label}
              href="/admin-sessions"
              className="bg-white rounded-2xl border border-slate-200 p-4 hover:bg-slate-50 transition"
            >
              <p className="text-xs text-slate-500 truncate">{c.label}</p>
              <p className={`text-2xl font-bold mt-1 ${c.color}`}>{c.value}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
