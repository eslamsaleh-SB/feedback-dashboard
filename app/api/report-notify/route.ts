import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Email notification when a report is sent to a collector.
//
// Environment variables needed (add to .env.local + Vercel):
//   RESEND_API_KEY           — free key at https://resend.com
//   EMAIL_FROM               — e.g. "Feedback Dashboard <no-reply@yourdomain.com>"
//   SUPABASE_SERVICE_ROLE_KEY — to look up collector emails from auth.users
// ---------------------------------------------------------------------------

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Feedback Dashboard <no-reply@feedbackdashboard.com>";
  if (!apiKey) {
    console.warn("[report-notify] RESEND_API_KEY not set — email skipped");
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
      console.error(`[report-notify] Resend ${res.status} sending to ${to}: ${detail}`);
      return false;
    }
    return true;
  } catch (e: any) {
    console.error(`[report-notify] Resend request failed for ${to}: ${e?.message ?? e}`);
    return false;
  }
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { hr_code, title, body: reportBody, drive_url, report_date } = body as {
    hr_code: string | null;   // null = all collectors
    title: string;
    body: string | null;
    drive_url: string | null;
    report_date: string | null;
  };

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    console.warn("[report-notify] SUPABASE_SERVICE_ROLE_KEY not set — email skipped");
    return NextResponse.json({ ok: true, sent: 0, warning: "Service key not configured" });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { persistSession: false } }
  );

  // Find target profiles
  let profileQuery = admin.from("profiles").select("id, hr_code").eq("role", "Viewer");
  if (hr_code) {
    profileQuery = profileQuery.eq("hr_code", hr_code);
  }
  const { data: profileRows } = await profileQuery;

  const emailPromises = (profileRows ?? []).map(async (p: any) => {
    const { data: { user: u } } = await admin.auth.admin.getUserById(p.id);
    const email = u?.email;
    if (!email) return;

    const dateStr = report_date ? ` for ${report_date}` : "";
    const driveLink = drive_url
      ? `<p><a href="${drive_url}" style="color:#1d4ed8;">Open Report in Google Drive →</a></p>`
      : "";
    const bodySection = reportBody
      ? `<p>${reportBody.replace(/\n/g, "<br>")}</p>`
      : "";

    const html = `
      <p>Hello,</p>
      <p>A new report has been sent to you${dateStr}:</p>
      <h3 style="margin:12px 0 4px;">${title}</h3>
      ${bodySection}
      ${driveLink}
      <p>Please log in to the Collector Performance Dashboard to view and acknowledge this report.</p>
    `;

    await sendEmail(email, `New Report: ${title}`, html);
  });

  await Promise.allSettled(emailPromises);

  return NextResponse.json({ ok: true, sent: (profileRows ?? []).length });
}
