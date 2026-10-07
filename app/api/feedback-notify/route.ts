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
    .from("users")
    .select("hr_code, id, squad")
    .in("hr_code", hr_codes);

  // Resolve TeamLeader emails per squad (one query, dedup squads)
  const squads = Array.from(
    new Set(
      (profileRows ?? [])
        .map((p: any) => (p.squad ?? "").trim())
        .filter(Boolean)
    )
  );
  const tlEmailBySquad = new Map<string, string[]>();
  if (squads.length > 0) {
    const { data: tlRows } = await admin
      .from("users")
      .select("id, squad")
      .in("squad", squads)
      .eq("role", "TeamLeader");
    for (const tl of (tlRows ?? []) as any[]) {
      const { data: { user: tlUser } } = await admin.auth.admin.getUserById(tl.id);
      if (!tlUser?.email) continue;
      const s = (tl.squad ?? "").trim();
      if (!s) continue;
      const list = tlEmailBySquad.get(s) ?? [];
      list.push(tlUser.email);
      tlEmailBySquad.set(s, list);
    }
  }

  const profilesWithIds = (profileRows ?? []) as Array<{
    id: string;
    hr_code: string;
    squad: string | null;
  }>;

  const emailPromises = profilesWithIds.map(async (p) => {
    const { data: { user: u } } = await admin.auth.admin.getUserById(p.id);
    const email = u?.email;
    if (!email) return;
    const tlCcs = p.squad ? tlEmailBySquad.get(p.squad.trim()) ?? [] : [];

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
      cc: tlCcs,
    });
  });

  await Promise.allSettled(emailPromises);
  return NextResponse.json({ ok: true, sent: profilesWithIds.length });
}
