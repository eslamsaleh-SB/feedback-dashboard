"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

type Period = "month" | "quarter" | "year";

function formatTrend(curr: number | null, prev: number | null, opts: { lowerIsBetter?: boolean; suffix?: string } = {}) {
  if (curr == null || prev == null) {
    return { text: null as string | null, color: "text-slate-400", arrow: "" };
  }
  const lowerIsBetter = opts.lowerIsBetter ?? false;
  const suffix = opts.suffix ?? "";
  if (prev === 0 && curr === 0) {
    return { text: "no change", color: "text-slate-400", arrow: "→" };
  }
  const diff = curr - prev;
  const pct = prev === 0 ? 100 : (diff / Math.abs(prev)) * 100;
  const isUp = diff > 0;
  const isFlat = Math.abs(pct) < 0.5;
  const good = isFlat ? null : lowerIsBetter ? !isUp : isUp;
  const color = good === null ? "text-slate-400" : good ? "text-emerald-600" : "text-red-500";
  const arrow = isFlat ? "→" : isUp ? "↑" : "↓";
  const sign = diff > 0 ? "+" : "";
  const text = `${arrow} ${sign}${Math.abs(pct).toFixed(1)}%${suffix ? ` ${suffix}` : ""}`;
  return { text, color, arrow };
}

export default function DashboardView({
  period,
  curLabel,
  prevLabel,
  submittedReports,
  collectorCount,
  openNotes,
  feedback,
  moduleErrorsCur,
  moduleErrorsPrev,
  qualityCur,
  qualityPrev,
}: {
  period: Period;
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
  qualityCur: number | null;
  qualityPrev: number | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dateStr = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  function setPeriod(p: Period) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (p === "month") params.delete("period");
    else params.set("period", p);
    const qs = params.toString();
    router.push(`/dashboard${qs ? `?${qs}` : ""}`);
  }

  const periodBtn = (p: Period, label: string) =>
    `px-3 py-1.5 rounded-lg text-sm font-medium transition ${
      period === p
        ? "bg-slate-900 text-white"
        : "border border-slate-300 text-slate-600 hover:bg-slate-50"
    }`;

  // Top stat cards (5 + extras).
  const moduleTrend = formatTrend(moduleErrorsCur, moduleErrorsPrev, {
    lowerIsBetter: true,
  });
  const qualityTrend = formatTrend(qualityCur, qualityPrev);

  const topCards: {
    label: string;
    value: number | string;
    href: string;
    color: string;
    sub?: string;
  }[] = [
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

  const feedbackCards: {
    label: string;
    value: number;
    color: string;
  }[] = [
    { label: "Total sessions", value: feedback.total, color: "text-slate-800" },
    { label: "Completed", value: feedback.completed, color: "text-emerald-600" },
    {
      label: "Incomplete",
      value: feedback.incomplete,
      color: feedback.incomplete ? "text-amber-600" : "text-slate-800",
    },
    {
      label: "Cancelled",
      value: feedback.cancelled,
      color: "text-slate-500",
    },
    {
      label: "Absent",
      value: feedback.absent,
      color: feedback.absent ? "text-red-600" : "text-slate-800",
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
          <span className="text-xs text-slate-500 mr-1 self-center">
            {curLabel}{" "}
            <span className="text-slate-300">vs</span>{" "}
            {prevLabel}
          </span>
          <button onClick={() => setPeriod("month")} className={periodBtn("month", "Month")}>
            Month
          </button>
          <button onClick={() => setPeriod("quarter")} className={periodBtn("quarter", "Quarter")}>
            Quarter
          </button>
          <button onClick={() => setPeriod("year")} className={periodBtn("year", "Year")}>
            Year
          </button>
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

      {/* Trend cards: Module Errors & Quality Score */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/match-totals"
          className="bg-white rounded-2xl border border-slate-200 p-5 hover:bg-slate-50 transition"
        >
          <p className="text-sm text-slate-500">Total module errors</p>
          <div className="flex items-baseline gap-3 mt-1">
            <p className="text-3xl font-bold text-slate-800">{moduleErrorsCur.toLocaleString()}</p>
            {moduleTrend.text && (
              <span className={`text-sm font-semibold ${moduleTrend.color}`}>
                {moduleTrend.text}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {prevLabel}: {moduleErrorsPrev.toLocaleString()} errors
          </p>
        </Link>

        <Link
          href="/quality-score"
          className="bg-white rounded-2xl border border-slate-200 p-5 hover:bg-slate-50 transition"
        >
          <p className="text-sm text-slate-500">Average quality score</p>
          <div className="flex items-baseline gap-3 mt-1">
            <p className="text-3xl font-bold text-slate-800">
              {qualityCur == null ? "-" : `${qualityCur.toFixed(1)}%`}
            </p>
            {qualityTrend.text && (
              <span className={`text-sm font-semibold ${qualityTrend.color}`}>
                {qualityTrend.text}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {prevLabel}:{" "}
            {qualityPrev == null ? "no data" : `${qualityPrev.toFixed(1)}%`}
          </p>
        </Link>
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
