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

export type AssignmentRow = {
  matchid: string;
  partid: number;
  hr_code: string | null;
  collector_name: string;
  date: string | null;
};

export type Mistake = {
  id: string;
  module: ModuleValue;
  matchid: string;
  partid: number;
  key: string;
  hr_code: string | null;
  error_type: string | null;
  defect_type: string | null;
  collector_event: string | null;
  video_timestamp: string | null;
};
