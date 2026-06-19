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

// One row of the Match View (per match part + its per-module counts).
export type PartSummary = {
  matchid: string;
  partid: number;
  hr_code: string | null;
  collector_name: string;
  date: string | null;
  counts: Record<ModuleValue, number>;
  total: number;
};

// One row of the collector ranking.
export type CollectorRow = {
  hr_code: string;
  name: string;
  counts: Record<ModuleValue, number>;
  total: number;
};
