import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { sendEmail, renderEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

// Sends a "new report" email to one or more collectors.
//
// Email is delivered through the shared lib/email.ts helper, which posts via
// Gmail SMTP. Previously this route called the Resend HTTP API directly; we
// consolidated to Gmail-only so every transactional message is sent from the
// same authenticated address (better SPF/DKIM alignment, fewer spam hits).

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
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { hr_code, title, body: reportBody, drive_url, report_date } = body as {
    hr_code: string | null;
    title: string;
    body: string | null;
    drive_url: string | null;
    report_date: string | null;
  };

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    console.warn("[report-notify] SUPABASE_SERVICE_ROLE_KEY not set - email skipped");
    return NextResponse.json({ ok: true, sent: 0, warning: "Service key not configured" });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { persistSession: false } }
  );

  let profileQuery = admin.from("users").select("id, hr_code").eq("role", "Viewer");
  if (hr_code) profileQuery = profileQuery.eq("hr_code", hr_code);
  const { data: profileRows } = await profileQuery;

  const emailPromises = (profileRows ?? []).map(async (p: any) => {
    const { data: { user: u } } = await admin.auth.admin.getUserById(p.id);
    const email = u?.email;
    if (!email) return;

    const dateStr = report_date ? ` for ${report_date}` : "";
    const bodyHtml = reportBody
      ? `<p style="margin:0 0 12px;color:#374151;white-space:pre-wrap;">${escapeText(reportBody)}</p>`
      : "";
    const cta = drive_url
      ? { label: "Open Report in Google Drive", url: drive_url }
      : { label: "View Reports", url: `${DASHBOARD_URL}/my-reports` };

    const { html, text } = renderEmail({
      heading: title,
      intro: `A new report has been sent to you${dateStr}.`,
      bodyHtml,
      bodyText: reportBody ?? "",
      cta,
      closing:
        "Please log in to the Collector Performance Dashboard to view and acknowledge this report.",
    });

    await sendEmail({
      to: email,
      subject: `New Report: ${title}`,
      html,
      text,
    });
  });

  await Promise.allSettled(emailPromises);
  return NextResponse.json({ ok: true, sent: (profileRows ?? []).length });
}
