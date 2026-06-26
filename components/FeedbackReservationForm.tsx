"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Combobox, { type ComboOption } from "@/components/Combobox";

type CollectorOpt = { hr_code: string; name: string | null; team: string | null };
type Mode = "Online" | "Offline";
type Shift = "Morning" | "Night" | "Overnight";

const LOCATIONS = ["Mahmoud El-Badry", "Hassan Ma'moun", "Maadi"] as const;
const SHIFTS: Shift[] = ["Morning", "Night", "Overnight"];

const first3 = (s: string | null) => (s ? s.trim().split(/\s+/).slice(0, 3).join(" ") : "");

function clabel(hr: string, name: string | null, team: string | null) {
  const parts = [hr];
  if (name && name !== hr) parts.push(first3(name));
  if (team) parts.push(team);
  return parts.join(" - ");
}

export default function FeedbackReservationForm({
  collectors,
}: {
  collectors: CollectorOpt[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [isGroup, setIsGroup] = useState(false);
  const [codes, setCodes] = useState<string[]>([""]);
  const [mode, setMode] = useState<Mode>("Online");
  const [meetLink, setMeetLink] = useState("");
  const [location, setLocation] = useState<string>("");
  const [sessionDate, setSessionDate] = useState("");
  const [sessionTime, setSessionTime] = useState("");
  const [shift, setShift] = useState<"" | Shift>("");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // (createdBy was previously written into feedback_meetings; that table is
  // retired in v41, so the state was removed.)
  useEffect(() => {
    // Touch the auth user once to keep RLS context populated.
    supabase.auth.getUser().catch(() => {});
  }, []);

  const collectorOptions: ComboOption[] = useMemo(
    () =>
      [...collectors]
        .sort((a, b) => (a.name ?? a.hr_code).localeCompare(b.name ?? b.hr_code))
        .map((c) => ({ value: c.hr_code, label: clabel(c.hr_code, c.name, c.team) })),
    [collectors]
  );

  function setCode(i: number, v: string) {
    setCodes((p) => p.map((c, idx) => (idx === i ? v : c)));
  }
  function addRow() {
    setCodes((p) => [...p, ""]);
  }
  function removeRow(i: number) {
    setCodes((p) => (p.length <= 1 ? p : p.filter((_, idx) => idx !== i)));
  }

  function switchGroup(group: boolean) {
    setIsGroup(group);
    setCodes((p) => (group ? p : [p[0] ?? ""]));
  }

  function generateMeet() {
    window.open("https://meet.google.com/new", "_blank", "noopener,noreferrer");
    setOk("A new Google Meet tab was opened - copy its link and paste it below.");
  }

  async function pasteLink() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) setMeetLink(t.trim());
    } catch {
      setErr("Couldn't read the clipboard - paste the link manually.");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(null);

    const chosen = Array.from(new Set(codes.map((c) => c.trim()).filter(Boolean)));
    if (chosen.length === 0) return setErr("Select at least one collector.");
    if (!sessionDate) return setErr("Pick a session date.");
    if (!shift) return setErr("Pick a shift.");
    if (mode === "Offline" && !location) return setErr("Pick an office location.");

    setBusy(true);
    const { data: res, error: e1 } = await supabase
      .from("feedback_reservations")
      .insert({
        session_date: sessionDate,
        session_time: sessionTime || null,
        shift,
        mode,
        is_group: isGroup,
        location: mode === "Offline" ? location : null,
        meet_link: mode === "Online" ? meetLink.trim() || null : null,
      })
      .select("id")
      .single();

    if (e1 || !res) {
      setBusy(false);
      return setErr(e1?.message ?? "Could not create the session.");
    }

    const { error: e2 } = await supabase
      .from("feedback_attendees")
      .insert(chosen.map((hr) => ({ reservation_id: res.id, hr_code: hr })));

    if (e2) {
      setBusy(false);
      return setErr(e2.message);
    }

    // (feedback_meetings was retired in v41 - collectors now read their
    // sessions directly from feedback_attendees joined to feedback_reservations.)
    const meetLink_ = mode === "Online" ? meetLink.trim() || null : null;
    const location_ = mode === "Offline" ? location : null;

    // Send email notifications (fire-and-forget; non-blocking)
    fetch("/api/feedback-notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hr_codes: chosen,
        session_date: sessionDate,
        session_time: sessionTime || null,
        mode,
        meet_link: meetLink_,
        location: location_,
        shift,
      }),
    }).catch(() => {}); // ignore errors - email is best-effort

    setBusy(false);
    setOk(
      `Session booked for ${chosen.length} collector${chosen.length > 1 ? "s" : ""}. Email notifications sent.`
    );
    // Reset collectors + link; keep date/shift for quick repeat booking.
    setCodes([""]);
    setIsGroup(false);
    setMeetLink("");
  }

  const card = "bg-white rounded-2xl border border-slate-200 p-5";
  const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 bg-white";
  const labelCls = "block text-xs font-medium text-slate-500 mb-1";

  return (
    <form onSubmit={submit} className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Feedback Reservation</h1>
        <p className="text-slate-500">Book a feedback session for one collector or a group.</p>
      </div>

      {/* Session type */}
      <div className={card}>
        <p className={labelCls}>Session type</p>
        <div className="flex gap-2">
          {[
            { v: false, label: "Single collector" },
            { v: true, label: "Group session" },
          ].map((o) => (
            <button
              key={String(o.v)}
              type="button"
              onClick={() => switchGroup(o.v)}
              className={`rounded-lg border px-4 py-2 text-sm font-medium ${
                isGroup === o.v
                  ? "bg-slate-900 text-white border-slate-900"
                  : "border-slate-300 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          {codes.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex-1">
                <Combobox
                  options={collectorOptions}
                  value={c}
                  onChange={(v) => setCode(i, v)}
                  placeholder="Select collector (code / name)"
                />
              </div>
              {isGroup && codes.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-slate-500 hover:bg-slate-50"
                  title="Remove"
                >
                  x
                </button>
              )}
            </div>
          ))}
          {isGroup && (
            <button
              type="button"
              onClick={addRow}
              className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              + Add collector
            </button>
          )}
        </div>
      </div>

      {/* Mode */}
      <div className={card}>
        <p className={labelCls}>Session mode</p>
        <div className="flex gap-2">
          {(["Online", "Offline"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-lg border px-4 py-2 text-sm font-medium ${
                mode === m
                  ? "bg-slate-900 text-white border-slate-900"
                  : "border-slate-300 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        {mode === "Online" ? (
          <div className="mt-4">
            <label className={labelCls}>Google Meet link {isGroup && "(shared by all collectors)"}</label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={generateMeet}
                className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700"
              >
                Generate Meet link
              </button>
              <input
                value={meetLink}
                onChange={(e) => setMeetLink(e.target.value)}
                placeholder="https://meet.google.com/..."
                className={`${inputCls} flex-1 min-w-[220px]`}
              />
              <button
                type="button"
                onClick={pasteLink}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                Paste
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              The button opens Google Meet and creates a new meeting - copy that link and paste it here.
            </p>
          </div>
        ) : (
          <div className="mt-4 max-w-xs">
            <label className={labelCls}>Office location</label>
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className={inputCls}
            >
              <option value="">Select office...</option>
              {LOCATIONS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* When */}
      <div className={card}>
        <div className="flex flex-wrap gap-4">
          <div className="w-44">
            <label className={labelCls}>Session date</label>
            <input
              type="date"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="w-36">
            <label className={labelCls}>Session time</label>
            <input
              type="time"
              value={sessionTime}
              onChange={(e) => setSessionTime(e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="w-44">
            <label className={labelCls}>Shift</label>
            <select
              value={shift}
              onChange={(e) => setShift(e.target.value as Shift)}
              className={inputCls}
            >
              <option value="">Select shift...</option>
              {SHIFTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {err && (
        <p className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {err}
        </p>
      )}
      {ok && (
        <p className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
          {ok}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-slate-900 text-white px-6 py-2.5 text-sm font-medium disabled:opacity-50 hover:bg-slate-800"
      >
        {busy ? "Booking..." : "Book session"}
      </button>
    </form>
  );
}
