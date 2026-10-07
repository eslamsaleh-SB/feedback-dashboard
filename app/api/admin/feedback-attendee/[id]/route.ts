import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { getEffective } from "@/lib/effective";
import { sendEmail, renderEmail } from "@/lib/email";

export const runtime = "nodejs";

const DASHBOARD_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://feedback-dashboard-7i8h.vercel.app";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Resolve collector email + their TeamLeader emails (CC) for an hr_code. */
async function resolveRecipients(hrCode: string): Promise<{
  email: string | null;
  tlCcs: string[];
}> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || !hrCode) return { email: null, tlCcs: [] };
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { persistSession: false } }
  );
  const { data: row } = await admin
    .from("users")
    .select("id, squad")
    .eq("hr_code", hrCode)
    .single();
  if (!row) return { email: null, tlCcs: [] };
  const {
    data: { user },
  } = await admin.auth.admin.getUserById((row as any).id);
  const email = user?.email ?? null;

  // Find TLs in the same squad
  const squad = ((row as any).squad ?? "").trim();
  const tlCcs: string[] = [];
  if (squad) {
    const { data: tlRows } = await admin
      .from("users")
      .select("id")
      .eq("squad", squad)
      .eq("role", "TeamLeader");
    for (const tl of (tlRows ?? []) as any[]) {
      const { data: { user: tlUser } } = await admin.auth.admin.getUserById(tl.id);
      if (tlUser?.email && tlUser.email !== email) tlCcs.push(tlUser.email);
    }
  }
  return { email, tlCcs };
}

// ---------------------------------------------------------------------------
// PATCH — move an attendee to a new reservation (new date/time)
// Body: { session_date?: string, session_time?: string }
// ---------------------------------------------------------------------------
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const eff = await getEffective(supabase);
  if (!eff?.profile || eff.profile.role !== "Admin") {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const newDate =
    typeof body.session_date === "string" ? body.session_date.trim() : "";
  const newTime =
    typeof body.session_time === "string" ? body.session_time.trim() : "";
  if (!newDate) {
    return NextResponse.json({ error: "session_date is required" }, { status: 400 });
  }

  // Fetch the current attendee + its reservation
  const { data: attendee } = await supabase
    .from("feedback_attendees")
    .select(
      "id, hr_code, reservation_id, feedback_reservations(session_date, session_time, shift, mode, is_group, location, meet_link, duration_minutes, topic, comment)"
    )
    .eq("id", params.id)
    .single();

  if (!attendee)
    return NextResponse.json({ error: "Attendee not found" }, { status: 404 });

  const oldRes = (attendee as any).feedback_reservations as {
    session_date: string;
    session_time: string | null;
    shift: string | null;
    mode: string;
    is_group: boolean;
    location: string | null;
    meet_link: string | null;
    duration_minutes: number | null;
    topic: string | null;
    comment: string | null;
  };

  // If nothing changed, bail.
  const sameDate = newDate === oldRes.session_date;
  const sameTime = (newTime || null) === (oldRes.session_time ?? null);
  if (sameDate && sameTime) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  // Create a new reservation copying every other field; mark as single (is_group=false)
  // since this attendee is now alone in it.
  const { data: newRes, error: insErr } = await supabase
    .from("feedback_reservations")
    .insert({
      session_date: newDate,
      session_time: newTime || null,
      shift: oldRes.shift,
      mode: oldRes.mode,
      is_group: false,
      location: oldRes.location,
      meet_link: oldRes.meet_link,
      duration_minutes: oldRes.duration_minutes,
      topic: oldRes.topic,
      comment: oldRes.comment,
    })
    .select("id")
    .single();

  if (insErr || !newRes)
    return NextResponse.json(
      { error: insErr?.message ?? "Could not create reservation" },
      { status: 400 }
    );

  // Point the attendee row at the new reservation.
  const { error: updErr } = await supabase
    .from("feedback_attendees")
    .update({ reservation_id: (newRes as any).id })
    .eq("id", params.id);

  if (updErr)
    return NextResponse.json({ error: updErr.message }, { status: 400 });

  // Clean up the old reservation if no attendees are left on it.
  const { count: remaining } = await supabase
    .from("feedback_attendees")
    .select("id", { count: "exact", head: true })
    .eq("reservation_id", (attendee as any).reservation_id);
  if ((remaining ?? 0) === 0) {
    await supabase
      .from("feedback_reservations")
      .delete()
      .eq("id", (attendee as any).reservation_id);
  }

  // Notification email
  const { email, tlCcs } = await resolveRecipients((attendee as any).hr_code);
  if (email) {
    const timeStr = newTime ? ` at ${newTime}` : "";
    const subject = `Feedback session updated - ${newDate}`;
    const bodyHtml = `
      <ul style="margin:0 0 12px 18px;padding:0;color:#374151;">
        <li><strong>Previous:</strong> ${esc(oldRes.session_date)}${
      oldRes.session_time ? ` at ${esc(oldRes.session_time)}` : ""
    }</li>
        <li><strong>New:</strong> ${esc(newDate)}${esc(timeStr)}</li>
      </ul>`;
    const bodyText = `Previous: ${oldRes.session_date}${
      oldRes.session_time ? ` at ${oldRes.session_time}` : ""
    }\nNew: ${newDate}${timeStr}`;
    const { html, text } = renderEmail({
      heading: "Feedback session updated",
      intro: "Your feedback session has been rescheduled.",
      bodyHtml,
      bodyText,
      cta: {
        label: "Open My Sessions",
        url: `${DASHBOARD_URL}/my-sessions`,
      },
      closing: "Please log in to the dashboard for full details.",
    });
    sendEmail({ to: email, subject, html, text, cc: tlCcs }).catch(() => {});
  }

  return NextResponse.json({ ok: true, new_reservation_id: (newRes as any).id });
}

// ---------------------------------------------------------------------------
// DELETE — remove a single attendee from a session (Admin only)
// ---------------------------------------------------------------------------
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const eff = await getEffective(supabase);
  if (!eff?.profile || eff.profile.role !== "Admin") {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  // Fetch before deleting so we can notify + clean up
  const { data: attendee } = await supabase
    .from("feedback_attendees")
    .select(
      "id, hr_code, reservation_id, feedback_reservations(session_date, session_time, shift, mode)"
    )
    .eq("id", params.id)
    .single();

  if (!attendee)
    return NextResponse.json({ error: "Attendee not found" }, { status: 404 });

  const { error } = await supabase
    .from("feedback_attendees")
    .delete()
    .eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Clean up the reservation if no attendees left.
  const resId = (attendee as any).reservation_id as string;
  const { count: remaining } = await supabase
    .from("feedback_attendees")
    .select("id", { count: "exact", head: true })
    .eq("reservation_id", resId);
  if ((remaining ?? 0) === 0) {
    await supabase.from("feedback_reservations").delete().eq("id", resId);
  }

  // Notification email
  const { email, tlCcs } = await resolveRecipients((attendee as any).hr_code);
  if (email) {
    const res = (attendee as any).feedback_reservations as {
      session_date: string;
      session_time: string | null;
      shift: string | null;
      mode: string;
    };
    const timeStr = res.session_time ? ` at ${res.session_time}` : "";
    const shiftStr = res.shift ? ` (${res.shift} shift)` : "";
    const subject = `Feedback session cancelled - ${res.session_date}`;
    const bodyHtml = `
      <ul style="margin:0 0 12px 18px;padding:0;color:#374151;">
        <li><strong>Date:</strong> ${esc(res.session_date)}${esc(timeStr)}${esc(shiftStr)}</li>
        <li><strong>Mode:</strong> ${esc(res.mode)}</li>
      </ul>`;
    const bodyText = `Date: ${res.session_date}${timeStr}${shiftStr}\nMode: ${res.mode}`;
    const { html, text } = renderEmail({
      heading: "Feedback session cancelled",
      intro: "Your upcoming feedback session has been cancelled.",
      bodyHtml,
      bodyText,
      cta: {
        label: "Open My Sessions",
        url: `${DASHBOARD_URL}/my-sessions`,
      },
      closing: "Please contact your reviewer if you have any questions.",
    });
    sendEmail({ to: email, subject, html, text, cc: tlCcs }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
