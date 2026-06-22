import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Email notification for feedback sessions.
//
// Environment variables needed (add to .env.local + Vercel settings):
//   RESEND_API_KEY   — get a free key at https://resend.com
//   EMAIL_FROM       — e.g. "Feedback Dashboard <no-reply@yourdomain.com>"
//   SUPABASE_SERVICE_ROLE_KEY — to look up collector emails from auth.users
// ---------------------------------------------------------------------------

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Feedback Dashboard <no-reply@feedbackdashboard.com>";
  if (!apiKey) {
    console.warn("[feedback-notify] RESEND_API_KEY not set — email skipped");
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[feedback-notify] Resend ${res.status} sending to ${to}: ${detail}`);
      return false;
    }
    return true;
  } catch (e: any) {
    console.error(`[feedback-notify] Resend request failed for ${to}: ${e?.message ?? e}`);
    return false;
  }
}

export async function POST(req: NextRequest) {
  // Internal route — called client-side from FeedbackReservationForm; no auth check needed

  const body = await req.json();
  const {
    hr_codes,
    session_date,
    session_time,
    mode,
    meet_link,
    location,
    shift,
  } = body as {
    hr_codes: string[];
    session_date: string;
    session_time: string | null;
    mode: string;
    meet_link: string | null;
    location: string | null;
    shift: string;
  };

  if (!hr_codes?.length) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  // Use service role to read auth.users emails
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    console.warn("[feedback-notify] SUPABASE_SERVICE_ROLE_KEY not set — email skipped");
    return NextResponse.json({ ok: true, sent: 0, warning: "Service key not configured" });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { persistSession: false } }
  );

  // Look up email addresses for each HR code via profiles → auth.users
  const { data: profileRows } = await admin
    .from("profiles")
    .select("hr_code, id")
    .in("hr_code", hr_codes);

  const userIds = (profileRows ?? []).map((p: any) => p.id as string);
  const hrByUid = Object.fromEntries(
    (profileRows ?? []).map((p: any) => [p.id as string, p.hr_code as string])
  );

  const emailPromises = userIds.map(async (uid) => {
    const { data: { user: u } } = await admin.auth.admin.getUserById(uid);
    const email = u?.email;
    if (!email) return;

    const timeStr = session_time ? ` at ${session_time}` : "";
    const shiftStr = shift ? ` (${shift} shift)` : "";
    const locationStr =
      mode === "Online" && meet_link
        ? `<br>Meeting link: <a href="${meet_link}">${meet_link}</a>`
        : mode === "Offline" && location
        ? `<br>Location: ${location}`
        : "";

    const subject = `Feedback session scheduled — ${session_date}`;
    const html = `
      <p>Hello,</p>
      <p>A feedback session has been scheduled for you:</p>
      <ul>
        <li><strong>Date:</strong> ${session_date}${timeStr}${shiftStr}</li>
        <li><strong>Mode:</strong> ${mode}</li>
        ${locationStr}
      </ul>
      <p>Please log in to the Collector Performance Dashboard to view details.</p>
    `;

    await sendEmail(email, subject, html);
  });

  await Promise.allSettled(emailPromises);

  return NextResponse.json({ ok: true, sent: userIds.length });
}
