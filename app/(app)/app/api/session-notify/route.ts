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
  const { collector_id, match_name, review_date, overall_notes } = (await req.json()) as {
    collector_id: string;
    match_name: string;
    review_date: string | null;
    overall_notes: string | null;
  };

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    console.warn("[session-notify] SUPABASE_SERVICE_ROLE_KEY not set");
    return NextResponse.json({ ok: true, sent: 0, warning: "Service key not configured" });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { persistSession: false } }
  );

  const { data: collector } = await admin
    .from("collectors")
    .select("hr_code")
    .eq("id", collector_id)
    .single();
  if (!collector?.hr_code) return NextResponse.json({ ok: true, sent: 0 });

  const { data: profile } = await admin
    .from("users")
    .select("id")
    .eq("hr_code", collector.hr_code)
    .single();
  if (!profile?.id) return NextResponse.json({ ok: true, sent: 0 });

  const { data: { user: targetUser } } = await admin.auth.admin.getUserById(profile.id);
  const email = targetUser?.email;
  if (!email) return NextResponse.json({ ok: true, sent: 0 });

  const dateStr = review_date ? ` for ${review_date}` : "";
  const bodyHtml = overall_notes
    ? `<p style="margin:0 0 12px;color:#374151;white-space:pre-wrap;">${escapeText(overall_notes)}</p>`
    : "";
  const { html, text } = renderEmail({
    heading: `New report: ${match_name}`,
    intro: `A new match session report has been uploaded for you${dateStr}.`,
    bodyHtml,
    bodyText: overall_notes ?? "",
    cta: { label: "View Report", url: `${DASHBOARD_URL}/my-reports` },
    closing:
      "Please open the dashboard to acknowledge the report and add any notes for your reviewer.",
  });

  await sendEmail({
    to: email,
    subject: `New Report: ${match_name}`,
    html,
    text,
  });
  return NextResponse.json({ ok: true, sent: 1 });
}
