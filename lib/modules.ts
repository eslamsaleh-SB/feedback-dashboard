// Shared module metadata + types used by BOTH the server pages and the
// client dashboards. NOT a "use client" module (server components import it).

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

// Kept for backward compatibility with any older component still importing it.
export type Period = "this_week" | "last_week" | "this_month" | "all";

// Order used for the collector dashboard's bottom metric cards.
export const CARD_ORDER: ModuleValue[] = [
  "players",
  "event",
  "extras",
  "location",
  "formation_tactical",
  "freeze_frame",
  "impact",
];

// Format a collector as "Code - Name - Team".
export function collectorLabel(
  hr_code: string | null,
  name: string | null,
  team: string | null
): string {
  return [hr_code || "—", name || hr_code || "—", team || "—"].join(" - ");
}

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

// One row of the collector ranking (now carries team + title).
export type CollectorRow = {
  hr_code: string;
  name: string;
  team: string | null;
  title: string | null;
  counts: Record<ModuleValue, number>;
  total: number;
};

// A report sent to a collector.
export type Report = {
  id: string;
  title: string;
  body: string | null;
  url: string | null;
  report_date: string | null;
};

// A feedback session (online / offline meeting).
export type FeedbackSession = {
  id: string;
  session_date: string | null;
  mode: "Online" | "Offline" | string;
  notes: string | null;
};

// One match-part row for the "Match Total per Module" page.
export type MatchPartRow = {
  matchid: string;
  partid: number;
  hr_code: string | null;
  date: string | null;
  counts: Record<ModuleValue, number>;
  total: number;
};
