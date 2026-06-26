"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Attendance = "Attended" | "Attended Late" | "Absent" | "Cancelled";
const STATUSES: Attendance[] = ["Attended", "Attended Late", "Absent", "Cancelled"];

export type Attendee = {
  id: string;
  hr_code: string;
  attendance: Attendance | null;
  comment: string | null;
  name: string | null;
  team: string | null;
};
export type Session = {
  id: string;
  session_date: string;
  session_time: string | null;
  shift: string | null;
  mode: "Online" | "Offline";
  is_group: boolean;
  location: string | null;
  meet_link: string | null;
  attendees: Attendee[];
};

const statusStyle: Record<string, string> = {
  Attended: "bg-emerald-100 text-emerald-800",
  "Attended Late": "bg-amber-100 text-amber-800",
  Absent: "bg-red-100 text-red-800",
  Cancelled: "bg-slate-200 text-slate-600",
  "": "bg-slate-100 text-slate-500",
};

const first3 = (s: string | null) => (s ? s.trim().split(/\s+/).slice(0, 3).join(" ") : "");

function clabel(hr: string, name: string | null, team: string | null) {
  const parts = [hr];
  if (name && name !== hr) parts.push(first3(name));
  if (team) parts.push(team);
  return parts.join(" - ");
}

export default function FeedbackProgress({ initial }: { initial: Session[] }) {
  const supabase = createClient();
  const [sessions, setSessions] = useState<Session[]>(initial);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function editAttendee(sid: string, aid: string, patch: Partial<Attendee>) {
    setSessions((p) =>
      p.map((s) =>
        s.id !== sid
          ? s
          : { ...s, attendees: s.attendees.map((a) => (a.id === aid ? { ...a, ...patch } : a)) }
      )
    );
  }

  async function save(_sess: Session, a: Attendee) {
    setSavingId(a.id);
    setSavedId(null);
    setMsg(null);
    const { error } = await supabase
      .from("feedback_attendees")
      .update({ attendance: a.attendance, comment: a.comment })
      .eq("id", a.id);
    if (error) {
      setSavingId(null);
      return setMsg(error.message);
    }
    // (feedback_meetings was retired; collectors read feedback_attendees directly.)
    setSavingId(null);
    setSavedId(a.id);
    setTimeout(() => setSavedId((s) => (s === a.id ? null : s)), 1500);
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sessions
      .map((s) => {
        const attendees = s.attendees.filter((a) => {
          if (statusFilter === "__none__") {
            if (a.attendance) return false;
          } else if (statusFilter && a.attendance !== statusFilter) return false;
          if (q) {
            const hay = `${a.hr_code} ${a.name ?? ""} ${a.team ?? ""}`.toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        });
        return { ...s, attendees };
      })
      .filter((s) => {
        if (dateFilter && s.session_date !== dateFilter) return false;
        return s.attendees.length > 0;
      });
  }, [sessions, statusFilter, search, dateFilter]);

  const inputCls = "rounded-lg border border-slate-300 px-3 py-2 bg-white text-sm";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Feedback Progress</h1>
        <p className="text-slate-500">Track attendance for every scheduled feedback session.</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputCls}>
            <option value="">All statuses</option>
            <option value="__none__">Not marked</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Date</label>
          <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className={inputCls} />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-slate-500 mb-1">Search collector</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Code / name / team..."
            className={`${inputCls} w-full`}
          />
        </div>
        {(statusFilter || dateFilter || search) && (
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => {
                setStatusFilter("");
                setDateFilter("");
                setSearch("");
              }}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {msg && <p className="text-sm text-red-600">{msg}</p>}

      <div className="text-sm text-slate-500">{visible.length} session(s)</div>

      {visible.length === 0 ? (
        <p className="text-slate-500">No sessions match these filters.</p>
      ) : (
        <div className="space-y-4">
          {visible.map((s) => (
            <div key={s.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="font-semibold text-slate-800">{s.session_date}</span>
                {s.session_time && <span className="text-slate-500">{s.session_time}</span>}
                {s.shift && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{s.shift}</span>
                )}
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    s.mode === "Online" ? "bg-sky-100 text-sky-800" : "bg-violet-100 text-violet-800"
                  }`}
                >
                  {s.mode}
                </span>
                {s.is_group && (
                  <span className="rounded-full bg-indigo-100 text-indigo-800 px-2 py-0.5 text-xs">
                    Group - {s.attendees.length}
                  </span>
                )}
                {s.mode === "Offline" && s.location && (
                  <span className="text-slate-500">{s.location}</span>
                )}
                {s.mode === "Online" && s.meet_link && (
                  <a
                    href={s.meet_link}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-700 hover:underline truncate max-w-[260px]"
                  >
                    {s.meet_link}
                  </a>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left font-medium text-slate-500 px-4 py-2.5 whitespace-nowrap">Collector</th>
                      <th className="text-left font-medium text-slate-500 px-4 py-2.5">Attendance</th>
                      <th className="text-left font-medium text-slate-500 px-4 py-2.5">Comment</th>
                      <th className="text-right font-medium text-slate-500 px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.attendees.map((a) => (
                      <tr key={a.id} className="border-t border-slate-100 align-top">
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className="font-medium text-slate-800">{a.hr_code}</span>
                          {a.name && a.name !== a.hr_code && (
                            <span className="text-slate-500"> - {first3(a.name)}</span>
                          )}
                          {a.team && <span className="text-slate-400"> - {a.team}</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          <select
                            value={a.attendance ?? ""}
                            onChange={(e) =>
                              editAttendee(s.id, a.id, {
                                attendance: (e.target.value || null) as Attendance | null,
                              })
                            }
                            className={`rounded-lg border border-slate-300 px-2 py-1.5 text-sm ${
                              statusStyle[a.attendance ?? ""]
                            }`}
                          >
                            <option value="">-- not marked --</option>
                            {STATUSES.map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2.5 w-[40%]">
                          <input
                            value={a.comment ?? ""}
                            onChange={(e) => editAttendee(s.id, a.id, { comment: e.target.value })}
                            placeholder="Reason / notes (late by..., absence reason, etc.)"
                            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                          />
                        </td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          <button
                            onClick={() => save(s, a)}
                            disabled={savingId === a.id}
                            className="rounded-lg bg-slate-900 text-white px-4 py-1.5 text-sm font-medium disabled:opacity-50"
                          >
                            {savingId === a.id ? "Saving..." : savedId === a.id ? "Saved" : "Save"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
