"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

export type CompareTo = "last_month" | "last_quarter" | "last_year";

const MODULE_KEYS = [
  "players","event","formation_tactical","location","impact","extras","freeze_frame",
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

// Trend helper: returns null text when there's no prior baseline so we can
// render a clear "no baseline" instead of misleading 100%.
function trendInfo(
  curr: number | null,
  prev: number | null,
  opts: { lowerIsBetter?: boolean } = {}
) {
  if (curr == null || prev == null) {
    return { text: null as string | null, color: "text-slate-400" };
  }
  if (prev === 0) {
    if (curr === 0) return { text: "no change", color: "text-slate-400" };
    return { text: null, color: "text-slate-400" };
  }
  const lowerIsBetter = opts.lowerIsBetter ?? false;
  const diff = curr - prev;
  const pct = (diff / Math.abs(prev)) * 100;
  const isUp = diff > 0;
  const isFlat = Math.abs(pct) < 0.5;
  const good = isFlat ? null : lowerIsBetter ? !isUp : isUp;
  const color =
    good === null ? "text-slate-400" : good ? "text-emerald-600" : "text-red-500";
  const arrow = isFlat ? "=" : isUp ? "▲" : "▼";
  const text = `${arrow} ${Math.abs(pct).toFixed(1)}%`;
  return { text, color };
}

function ChevronToggle({ open }: { open: boolean }) {
  return (
    <span className={`inline-block transition-transform ${open ? "rotate-180" : ""} text-slate-500`}>
      ▼
    </span>
  );
}

export default function DashboardView({
  from,
  to,
  compareTo,
  curLabel,
  prevLabel,
  compareLabel,
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
  compareTo: CompareTo;
  curLabel: string;
  prevLabel: string;
  compareLabel: string;
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
  qualityCurByModule: Record<string, number | null>;
  qualityPrevByModule: Record<string, number | null>;
  freezeFrameQualityCur: number | null;
  freezeFrameQualityPrev: number | null;
}) {
  const router = useRouter();
  const [fromInput, setFromInput] = useState(from);
  const [toInput, setToInput] = useState(to);
  const [compareInput, setCompareInput] = useState<CompareTo>(compareTo);

  const [modulesOpen, setModulesOpen] = useState(true);
  const [scoresOpen, setScoresOpen] = useState(true);

  const dateStr = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  function apply() {
    const params = new URLSearchParams();
    params.set("from", fromInput);
    params.set("to", toInput);
    if (compareInput !== "last_month") params.set("compare", compareInput);
    router.push(`/dashboard?${params.toString()}`);
  }

  const inputCls =
    "rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100";
  const cardCls =
    "bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition";
  const cardSmallCls =
    "bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition";

  const topCards = [
    {
      label: "Submitted Reports",
      value: submittedReports,
      href: "/admin-reports",
      color: "text-blue-600 dark:text-blue-400",
      sub: curLabel,
    },
    {
      label: "Collectors",
      value: collectorCount,
      href: "/collectors",
      color: "text-slate-800 dark:text-slate-100",
    },
    {
      label: "Open Notes",
      value: openNotes,
      href: "/admin-reports",
      color: openNotes ? "text-amber-600 dark:text-amber-400" : "text-slate-800 dark:text-slate-100",
    },
  ];

  const feedbackCards = [
    { label: "Total sessions", value: feedback.total, color: "text-slate-800 dark:text-slate-100" },
    { label: "Completed", value: feedback.completed, color: "text-emerald-600 dark:text-emerald-400" },
    { label: "Incomplete", value: feedback.incomplete, color: feedback.incomplete ? "text-amber-600 dark:text-amber-400" : "text-slate-800 dark:text-slate-100" },
    { label: "Cancelled", value: feedback.cancelled, color: "text-slate-500 dark:text-slate-400" },
    { label: "Absent", value: feedback.absent, color: feedback.absent ? "text-red-600 dark:text-red-400" : "text-slate-800 dark:text-slate-100" },
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
  const qualityCards: { key: string; label: string; curr: number | null; prev: number | null }[] = [
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
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{dateStr}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">From</label>
            <input
              type="date"
              value={fromInput}
              onChange={(e) => setFromInput(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">To</label>
            <input
              type="date"
              value={toInput}
              onChange={(e) => setToInput(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Compare to</label>
            <select
              value={compareInput}
              onChange={(e) => setCompareInput(e.target.value as CompareTo)}
              className={inputCls}
            >
              <option value="last_month">Last month</option>
              <option value="last_quarter">Last quarter</option>
              <option value="last_year">Last year</option>
            </select>
          </div>
          <button
            type="button"
            onClick={apply}
            className="rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-4 py-2 text-sm font-medium hover:bg-slate-800 dark:hover:bg-white transition"
          >
            Apply
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500 -mt-4">
        Comparing against {compareLabel}: <span className="font-medium">{prevLabel}</span>
      </p>

      {/* Top stats: Submitted Reports / Collectors / Open Notes */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {topCards.map((card) => (
          <Link key={card.label} href={card.href} className={cardCls}>
            <p className="text-sm text-slate-500 dark:text-slate-400">{card.label}</p>
            <p className={`text-3xl font-bold mt-1 ${card.color}`}>{card.value}</p>
            {card.sub && (
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{card.sub}</p>
            )}
          </Link>
        ))}
      </div>

      {/* Feedback Sessions — directly below the top stats */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
          Feedback Sessions ({curLabel})
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {feedbackCards.map((c) => (
            <Link key={c.label} href="/feedback-progress" className={cardSmallCls}>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{c.label}</p>
              <p className={`text-2xl font-bold mt-1 ${c.color}`}>{c.value}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* Module Errors (collapsible) */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setModulesOpen((p) => !p)}
          className="w-full flex items-center justify-between px-5 py-3 text-left"
        >
          <span className="text-sm font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200">
            Module Errors ({curLabel})
          </span>
          <ChevronToggle open={modulesOpen} />
        </button>
        {modulesOpen && (
          <div className="px-5 pb-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {moduleErrorCards.map((c) => {
                const t = trendInfo(c.curr, c.prev, { lowerIsBetter: true });
                const href = c.key === "total" ? "/match-totals" : `/match-totals?module=${c.key}`;
                return (
                  <Link key={c.key} href={href} className={cardSmallCls}>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{c.label}</p>
                    <div className="flex items-baseline gap-2 mt-1">
                      <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                        {Number(c.curr).toLocaleString()}
                      </p>
                      {t.text ? (
                        <span className={`text-xs font-semibold ${t.color}`}>{t.text}</span>
                      ) : (
                        <span className="text-xs text-slate-400 dark:text-slate-500">no baseline</span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                      Previous: {Number(c.prev).toLocaleString()}
                    </p>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Quality Scores (collapsible) */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setScoresOpen((p) => !p)}
          className="w-full flex items-center justify-between px-5 py-3 text-left"
        >
          <span className="text-sm font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200">
            Quality Scores ({curLabel})
          </span>
          <ChevronToggle open={scoresOpen} />
        </button>
        {scoresOpen && (
          <div className="px-5 pb-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {qualityCards.map((c) => {
                const t = trendInfo(c.curr, c.prev, { lowerIsBetter: false });
                return (
                  <Link key={c.key} href="/quality-score" className={cardSmallCls}>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{c.label}</p>
                    <div className="flex items-baseline gap-2 mt-1">
                      <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                        {c.curr == null ? "-" : `${c.curr.toFixed(1)}%`}
                      </p>
                      {t.text ? (
                        <span className={`text-xs font-semibold ${t.color}`}>{t.text}</span>
                      ) : c.curr != null && c.prev == null ? (
                        <span className="text-xs text-slate-400 dark:text-slate-500">no baseline</span>
                      ) : null}
                    </div>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                      Previous: {c.prev == null ? "no data" : `${c.prev.toFixed(1)}%`}
                    </p>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
