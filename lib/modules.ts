// Shared module metadata + types used by BOTH the server analytics page and
// the client AnalyticsDashboard.
//
// IMPORTANT: this file is intentionally NOT a "use client" module. A Server
// Component (app/(app)/analytics/page.tsx) imports MODULES from here. If these
// values lived in a "use client" file, the server would receive a client-
// reference stub instead of the real array and `MODULES.map(...)` would throw
// at request time (HTTP 500). Keeping them here avoids that.

export const MODULES = [
  { value: "players", label: "Players" },
  { value: "event", label: "Event" },
  { value: "formation_tactical", label: "Formation / Tactical" },
  { value: "location", label: "Location" },
  { value: "impact", label: "Impact" },
  { value: "extras", label: "Extras" },
  { value: "freeze_frame", label: "Freeze Frame" },
] as const;

export type ModuleValue = (typeof MODULES)[number]["value"];

export type Period = "this_week" | "last_week" | "this_month" | "all";

export const PERIODS: { value: Period; label: string }[] = [
  { value: "this_week", label: "This Week" },
  { value: "last_week", label: "Last Week" },
  { value: "this_month", label: "This Month" },
  { value: "all", label: "All Time" },
];

// One row of the match_part_summary view: a match part + its per-module counts.
export type PartSummary = {
  matchid: string;
  partid: number;
  hr_code: string | null;
  collector_name: string;
  date: string | null;
  counts: Record<ModuleValue, number>;
  total: number;
};
