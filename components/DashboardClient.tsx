"use client";

import { useMemo, useState } from "react";

export type SessionVideo = {
  id: string;
  drive_file_id: string | null;
  file_name: string | null;
  mistake_description: string | null;
};

export type MatchSession = {
  id: string;
  match_name: string;
  review_date: string | null;
  quality_score: number | null;
  overall_notes: string | null;
  collector_id: string;
  collector_name: string;
  videos: SessionVideo[];
};

type Collector = { id: string; name: string };
type Role = "Admin" | "Reviewer" | "Viewer";

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  );
}

export default function DashboardClient({
  role,
  myName,
  isLinked,
  sessions,
  collectors,
}: {
  role: Role;
  myName: string | null;
  isLinked: boolean;
  sessions: MatchSession[];
  collectors: Collector[];
}) {
  const isPersonal = role === "Viewer";
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  // Admin/Reviewer can filter by collector; Viewers are already scoped by RLS.
  const filtered = useMemo(
    () =>
      isPersonal || filter === "all"
        ? sessions
        : sessions.filter((s) => s.collector_id === filter),
    [isPersonal, filter, sessions]
  );

  const stats = useMemo(() => {
    const total = filtered.length;
    const scored = filtered.filter((s) => s.quality_score != null);
    const avg = scored.length
      ? (
          scored.reduce((a, s) => a + (s.quality_score as number), 0) /
          scored.length
        ).toFixed(1)
      : "—";
    // Each imported clip represents a flagged mistake.
    const mistakes = filtered.reduce((a, s) => a + s.videos.length, 0);
    return { total, avg, mistakes };
  }, [filtered]);

  // Viewer with no linked collector yet.
  if (isPersonal && !isLinked) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 text-center">
        <h1 className="text-xl font-bold mb-2">My Profile</h1>
        <p className="text-slate-600 dark:text-slate-300">
          Your account isn’t linked to a collector profile yet. Please ask an
          Admin to assign you on the Accounts page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {isPersonal ? "My Profile" : "Dashboard"}
          </h1>
          {isPersonal && myName && (
            <p className="text-slate-500 dark:text-slate-400">{myName}</p>
          )}
        </div>

        {!isPersonal && (
          <div>
            <label className="text-sm text-slate-500 dark:text-slate-400 mr-2">Collector:</label>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900"
            >
              <option value="all">All collectors</option>
              {collectors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Reviewed sessions" value={stats.total} />
        <StatCard label="Average quality score" value={stats.avg} />
        <StatCard label="Flagged mistakes" value={stats.mistakes} />
      </div>

      {filtered.length === 0 ? (
        <p className="text-slate-500 dark:text-slate-400">No match sessions yet.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => {
            const open = expanded === s.id;
            return (
              <div
                key={s.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
              >
                {/* Header row (click to expand) */}
                <button
                  onClick={() => setExpanded(open ? null : s.id)}
                  className="w-full text-left p-5 flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{s.match_name}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {!isPersonal && <>{s.collector_name} · </>}
                      {s.review_date ?? "—"} · {s.videos.length} video(s)
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {s.quality_score != null && (
                      <span className="rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium px-2 py-0.5">
                        {s.quality_score}/10
                      </span>
                    )}
                    <span className="text-slate-400 dark:text-slate-500 text-sm">
                      {open ? "▲" : "▼"}
                    </span>
                  </div>
                </button>

                {/* Expanded body */}
                {open && (
                  <div className="border-t border-slate-100 dark:border-slate-800 p-5 space-y-5">
                    {s.overall_notes && (
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        <span className="font-medium">Overall notes: </span>
                        {s.overall_notes}
                      </p>
                    )}

                    {s.videos.length === 0 ? (
                      <p className="text-sm text-slate-400 dark:text-slate-500">
                        No videos attached to this match.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {s.videos.map((v, i) => (
                          <div key={v.id} className="space-y-2">
                            {v.drive_file_id ? (
                              <iframe
                                src={`https://drive.google.com/file/d/${v.drive_file_id}/preview`}
                                allow="autoplay"
                                allowFullScreen
                                className="w-full aspect-video bg-black rounded-lg border-0"
                              />
                            ) : (
                              <div className="w-full aspect-video bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center text-sm text-slate-400 dark:text-slate-500">
                                Video unavailable
                              </div>
                            )}
                            <p className="text-sm">
                              <span className="font-medium text-slate-500 dark:text-slate-400">
                                #{i + 1} ·{" "}
                              </span>
                              {v.mistake_description?.trim()
                                ? v.mistake_description
                                : v.file_name || "Untitled clip"}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
