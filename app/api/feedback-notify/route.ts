import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { sendEmail, renderEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const DASHBOARD_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://feedback-dashboard-7i8h.vercel.app";

function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function POST(req: NextRequest) {
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

  if (!hr_codes?.length) return NextResponse.json({ ok: true, sent: 0 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    console.warn("[feedback-notify] SUPABASE_SERVICE_ROLE_KEY not set - email skipped");
    return NextResponse.json({ ok: true, sent: 0, warning: "Service key not configured" });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { persistSession: false } }
  );

  const { data: profileRows } = await admin
    .from("profiles")
    .select("hr_code, id")
    .in("hr_code", hr_codes);

  const userIds = (profileRows ?? []).map((p: any) => p.id as string);

  const emailPromises = userIds.map(async (uid) => {
    const { data: { user: u } } = await admin.auth.admin.getUserById(uid);
    const email = u?.email;
    if (!email) return;

    const timeStr = session_time ? ` at ${session_time}` : "";
    const shiftStr = shift ? ` (${shift} shift)` : "";
    const bodyHtml = `
      <ul style="margin:0 0 12px 18px;padding:0;color:#374151;">
        <li><strong>Date:</strong> ${escapeText(session_date)}${timeStr}${shiftStr}</li>
        <li><strong>Mode:</strong> ${escapeText(mode)}</li>
        ${
          mode === "Offline" && location
            ? `<li><strong>Location:</strong> ${escapeText(location)}</li>`
            : ""
        }
      </ul>
    `;
    const bodyText =
      `Date: ${session_date}${timeStr}${shiftStr}\n` +
      `Mode: ${mode}` +
      (mode === "Offline" && location ? `\nLocation: ${location}` : "");

    const cta =
      mode === "Online" && meet_link
        ? { label: "Join the meeting", url: meet_link }
        : { label: "Open My Sessions", url: `${DASHBOARD_URL}/my-sessions` };

    const { html, text } = renderEmail({
      heading: "Feedback session scheduled",
      intro: "A feedback session has been scheduled for you.",
      bodyHtml,
      bodyText,
      cta,
      closing: "Please log in to the dashboard for full details.",
    });

    await sendEmail({
      to: email,
      subject: `Feedback session scheduled - ${session_date}`,
      html,
      text,
    });
  });

  await Promise.allSettled(emailPromises);
  return NextResponse.json({ ok: true, sent: userIds.length });
}
