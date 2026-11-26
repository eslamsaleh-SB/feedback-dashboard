"use client";

import { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { createClient } from "@/lib/supabase/client";

type CollectorOpt = { hr_code: string; name: string | null; team: string | null };
type Shift = "Morning" | "Night" | "Overnight";
type Mode = "Online" | "Offline";

const LOCATIONS = ["Mahmoud El-Badry", "Hassan Ma'moun", "Maadi"];
const SHIFTS: Shift[] = ["Morning", "Night", "Overnight"];

type Draft = {
  key: string;
  session_date: string;
  session_time: string; // HH:MM
  shift: Shift | "";
  mode: Mode;
  location: string;
  meet_link: string;
  duration: string;
  topic: string;
  comment: string;
  reviewer: string;
  codes: string[];
  status: "ready" | "booking" | "done" | "error";
  err?: string;
};

// "MORNING2" -> Morning, "OVERNIGHT" -> Overnight, "NIGHT2" -> Night
function mapShift(v: string): Shift | "" {
  const s = (v || "").toLowerCase();
  if (s.includes("over")) return "Overnight";
  if (s.includes("night")) return "Night";
  if (s.includes("morn")) return "Morning";
  return "";
}

// "Hassan Ma'moon 7th Floor" -> "Hassan Ma'moun"
function mapLocation(v: string): string {
  const s = (v || "").toLowerCase();
  if (!s) return "";
  if (s.includes("hassan")) return "Hassan Ma'moun";
  if (s.includes("badry") || s.includes("badri")) return "Mahmoud El-Badry";
  if (s.includes("maadi")) return "Maadi";
  return v.trim();
}

// "1:00:00 AM" / "15:00" -> "01:00" / "15:00"
function mapTime(v: string): string {
  const m = (v || "").trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?$/);
  if (!m) return "";
  let h = Number(m[1]);
  const ap = m[3]?.toUpperCase();
  if (ap === "PM" && h < 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

// "2026-11-24" / "24/11/2026" -> "2026-11-24"
function mapDate(v: string): string {
  const s = (v || "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
}

const norm = (h: string) => h.trim().toLowerCase().replace(/\s+/g, "_");

// Upload a schedule sheet (one row per collector) -> grouped sessions you can
// review/edit -> "Book all" creates them and sends the usual emails.
export default function SheetBookingImport({ collectors }: { collectors: CollectorOpt[] }) {
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [addCode, setAddCode] = useState<Record<string, string>>({});

  const byCode = useMemo(() => {
    const m = new Map<string, CollectorOpt>();
    for (const c of collectors) m.set(c.hr_code.toUpperCase(), c);
    return m;
  }, [collectors]);

  function parse(file: File) {
    setMsg(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: norm,
      complete: (res) => {
        const rows = res.data;
        const get = (r: Record<string, string>, ...keys: string[]) => {
          for (const k of keys) if (r[k] != null && String(r[k]).trim() !== "") return String(r[k]).trim();
          return "";
        };
        const groups = new Map<string, Draft>();
        const shiftVotes = new Map<string, Map<string, number>>();
        let skipped = 0;
        for (const r of rows) {
          const code = get(r, "code", "hr_code", "collector", "collector_hr_code").toUpperCase();
          const date = mapDate(get(r, "date", "session_date"));
          if (!code || !date) {
            if (code || date) skipped++;
            continue;
          }
          const time = mapTime(get(r, "time", "session_time"));
          const rawLoc = get(r, "location", "office");
          const location = mapLocation(rawLoc);
          const meet = get(r, "meet_link", "link");
          const mode: Mode = location ? "Offline" : "Online";
          const reviewer = get(r, "reviewer");
          const key = [date, time, location || meet, reviewer].join("|");
          let g = groups.get(key);
          if (!g) {
            g = {
              key, session_date: date, session_time: time, shift: "", mode, location,
              meet_link: mode === "Online" ? meet : "", duration: get(r, "duration", "duration_(min)"),
              topic: get(r, "topic"), comment: get(r, "comment"), reviewer, codes: [], status: "ready",
            };
            groups.set(key, g);
            shiftVotes.set(key, new Map());
          }
          if (!g.codes.includes(code)) g.codes.push(code);
          if (!g.comment) g.comment = get(r, "comment");
          const sh = mapShift(get(r, "shift"));
          if (sh) {
            const v = shiftVotes.get(key)!;
            v.set(sh, (v.get(sh) ?? 0) + 1);
          }
        }
        // Session shift = the most common shift among its collectors.
        for (const [k, g] of Array.from(groups.entries())) {
          const v = Array.from(shiftVotes.get(k)!.entries()).sort((a, b) => b[1] - a[1]);
          g.shift = (v[0]?.[0] as Shift) ?? "";
        }
        const list = Array.from(groups.values()).sort((a, b) =>
          (a.session_date + a.session_time).localeCompare(b.session_date + b.session_time)
        );
        setDrafts(list);
        if (list.length === 0) setMsg({ type: "err", text: "No rows with a Code and a Date were found in this sheet." });
        else if (skipped) setMsg({ type: "err", text: `${skipped} row(s) skipped (missing Code or Date).` });
      },
      error: (e) => setMsg({ type: "err", text: `Could not read the file: ${e.message}` }),
    });
  }

  const upd = (key: string, patch: Partial<Draft>) =>
    setDrafts((p) => p.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  const pending = drafts.filter((d) => d.status !== "done");
  const unknownCount = drafts.reduce((n, d) => n + d.codes.filter((c) => !byCode.has(c)).length, 0);

  function problem(d: Draft): string | null {
    if (!d.session_date) return "Pick a date";
    if (!d.shift) return "Pick a shift";
    if (d.codes.length === 0) return "No collectors";
    if (d.mode === "Offline" && !d.location) return "Pick a location";
    return null;
  }

  async function bookAll() {
    const bad = pending.find((d) => problem(d));
    if (bad) {
      setMsg({ type: "err", text: `Fix session ${bad.session_date} ${bad.session_time}: ${problem(bad)}` });
      return;
    }
    setRunning(true);
    setMsg(null);
    let ok = 0;
    for (const d of pending) {
      upd(d.key, { status: "booking", err: undefined });
      try {
        const { data: res, error: e1 } = await supabase
          .from("feedback_reservations")
          .insert({
            session_date: d.session_date,
            session_time: d.session_time || null,
            shift: d.shift,
            mode: d.mode,
            is_group: d.codes.length > 1,
            location: d.mode === "Offline" ? d.location : null,
            meet_link: d.mode === "Online" ? d.meet_link.trim() || null : null,
            duration_minutes: d.duration ? Math.max(0, parseInt(d.duration, 10)) || null : null,
            topic: d.topic.trim() || null,
            comment: d.comment.trim() || null,
          })
          .select("id")
          .single();
        if (e1 || !res) throw new Error(e1?.message ?? "Could not create the session");
        const { error: e2 } = await supabase
          .from("feedback_attendees")
          .insert(d.codes.map((hr) => ({ reservation_id: res.id, hr_code: hr })));
        if (e2) throw new Error(e2.message);
        await fetch("/api/feedback-notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            hr_codes: d.codes,
            session_date: d.session_date,
            session_time: d.session_time || null,
            mode: d.mode,
            meet_link: d.mode === "Online" ? d.meet_link.trim() || null : null,
            location: d.mode === "Offline" ? d.location : null,
            shift: d.shift,
            topic: d.topic.trim() || null,
            comment: d.comment.trim() || null,
          }),
        }).catch(() => {});
        upd(d.key, { status: "done" });
        ok++;
      } catch (e: any) {
        upd(d.key, { status: "error", err: e?.message ?? "Failed" });
      }
    }
    setRunning(false);
    setMsg({
      type: ok === pending.length ? "ok" : "err",
      text: `${ok} of ${pending.length} session(s) booked and emailed.${ok < pending.length ? " Fix the red ones and press Book again." : ""}`,
    });
  }

  const inputCls =
    "rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1.5 bg-white dark:bg-slate-900 text-sm";
  const card = "bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5";

  return (
    <div className={`${card} space-y-4`}>
      <div>
        <h2 className="font-semibold">Book from a sheet</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Upload a CSV with one row per collector (columns: Code, Date, Time, Shift, Location, Comment…). Rows with the
          same date, time, location and reviewer become one session. Review and edit below, then book them all.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={running}
          className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
        >
          Choose sheet (CSV)
        </button>
        {drafts.length > 0 && (
          <button
            type="button"
            onClick={() => { setDrafts([]); setMsg(null); }}
            disabled={running}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm text-slate-600 dark:text-slate-300 disabled:opacity-50"
          >
            Clear
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.tsv,.txt,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) parse(f);
            e.target.value = "";
          }}
        />
        {drafts.length > 0 && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {drafts.length} session(s) · {drafts.reduce((n, d) => n + d.codes.length, 0)} collector(s)
            {unknownCount > 0 && <span className="text-amber-600"> · {unknownCount} code(s) not found in Users</span>}
          </span>
        )}
      </div>

      {drafts.map((d) => {
        const p = problem(d);
        const done = d.status === "done";
        return (
          <div
            key={d.key}
            className={`rounded-xl border p-4 space-y-3 ${
              done
                ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10"
                : d.status === "error"
                ? "border-red-300 dark:border-red-800"
                : "border-slate-200 dark:border-slate-800"
            }`}
          >
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="block text-[11px] text-slate-500 mb-0.5">Date</label>
                <input type="date" value={d.session_date} disabled={done || running}
                  onChange={(e) => upd(d.key, { session_date: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-0.5">Time</label>
                <input type="time" value={d.session_time} disabled={done || running}
                  onChange={(e) => upd(d.key, { session_time: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-0.5">Shift</label>
                <select value={d.shift} disabled={done || running}
                  onChange={(e) => upd(d.key, { shift: e.target.value as Shift })} className={inputCls}>
                  <option value="">-</option>
                  {SHIFTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-0.5">Mode</label>
                <select value={d.mode} disabled={done || running}
                  onChange={(e) => upd(d.key, { mode: e.target.value as Mode })} className={inputCls}>
                  <option value="Offline">Offline</option>
                  <option value="Online">Online</option>
                </select>
              </div>
              {d.mode === "Offline" ? (
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">Location</label>
                  <select value={d.location} disabled={done || running}
                    onChange={(e) => upd(d.key, { location: e.target.value })} className={inputCls}>
                    <option value="">Select office...</option>
                    {Array.from(new Set([...LOCATIONS, ...(d.location ? [d.location] : [])])).map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="min-w-[220px]">
                  <label className="block text-[11px] text-slate-500 mb-0.5">Meet link</label>
                  <input value={d.meet_link} disabled={done || running} placeholder="https://meet.google.com/..."
                    onChange={(e) => upd(d.key, { meet_link: e.target.value })} className={`${inputCls} w-full`} />
                </div>
              )}
              <div className="w-24">
                <label className="block text-[11px] text-slate-500 mb-0.5">Duration</label>
                <input type="number" min={0} value={d.duration} disabled={done || running} placeholder="min"
                  onChange={(e) => upd(d.key, { duration: e.target.value })} className={`${inputCls} w-full`} />
              </div>
              <div className="ml-auto flex items-center gap-2">
                {done && <span className="text-xs font-medium text-emerald-600">Booked ✓</span>}
                {d.status === "booking" && <span className="text-xs text-sky-600">Booking…</span>}
                {!done && (
                  <button type="button" disabled={running} title="Remove this session"
                    onClick={() => setDrafts((prev) => prev.filter((x) => x.key !== d.key))}
                    className="rounded-lg border border-red-200 dark:border-red-800 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50">
                    Remove
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <input value={d.topic} disabled={done || running} placeholder="Topic"
                onChange={(e) => upd(d.key, { topic: e.target.value })} className={`${inputCls} flex-1 min-w-[200px]`} />
              <input value={d.comment} disabled={done || running} placeholder="Comment (shown in the email)"
                onChange={(e) => upd(d.key, { comment: e.target.value })} className={`${inputCls} flex-1 min-w-[200px]`} />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {d.reviewer && <span className="text-[11px] text-slate-400 mr-1">Reviewer: {d.reviewer} ·</span>}
              {d.codes.map((c) => {
                const info = byCode.get(c);
                return (
                  <span key={c}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                      info ? "bg-slate-100 dark:bg-slate-800" : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                    }`}
                    title={info ? `${info.name ?? ""} ${info.team ? "- " + info.team : ""}` : "Not found in Users - no email will be sent"}>
                    {c}{info?.name ? ` · ${info.name.split(/\s+/).slice(0, 2).join(" ")}` : " · ?"}
                    {!done && !running && (
                      <button type="button" className="text-slate-400 hover:text-red-600"
                        onClick={() => upd(d.key, { codes: d.codes.filter((x) => x !== c) })}>×</button>
                    )}
                  </span>
                );
              })}
              {!done && !running && (
                <span className="inline-flex items-center gap-1">
                  <input value={addCode[d.key] ?? ""} placeholder="+ code"
                    onChange={(e) => setAddCode((m) => ({ ...m, [d.key]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      const v = (addCode[d.key] ?? "").trim().toUpperCase();
                      if (v && !d.codes.includes(v)) upd(d.key, { codes: [...d.codes, v] });
                      setAddCode((m) => ({ ...m, [d.key]: "" }));
                    }}
                    className="w-24 rounded-full border border-dashed border-slate-300 dark:border-slate-700 bg-transparent px-2 py-0.5 text-xs" />
                </span>
              )}
            </div>
            {(p && !done) && <p className="text-xs text-amber-600">{p}</p>}
            {!p && !done && d.session_date < new Date().toISOString().slice(0, 10) && (
              <p className="text-xs text-amber-600">This date is in the past - collectors will still get an email.</p>
            )}
            {d.err && <p className="text-xs text-red-600">{d.err}</p>}
          </div>
        );
      })}

      {pending.length > 0 && (
        <button
          type="button"
          onClick={bookAll}
          disabled={running}
          className="w-full rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 py-2.5 text-sm font-medium disabled:opacity-50"
        >
          {running ? "Booking…" : `Book ${pending.length} session(s) & send emails`}
        </button>
      )}

      {msg && (
        <p className={`text-sm ${msg.type === "ok" ? "text-emerald-600" : "text-red-600"}`}>{msg.text}</p>
      )}
    </div>
  );
}
