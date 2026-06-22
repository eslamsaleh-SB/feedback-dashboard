import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

export const dynamic = "force-dynamic";

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  const from = process.env.EMAIL_FROM ?? `Hudl Feedback <${user}>`;

  if (!user || !pass) {
    console.warn("[session-notify] GMAIL_USER or GMAIL_APP_PASSWORD not set — email skipped");
    return false;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });
    await transporter.sendMail({ from, to, subject, html });
    console.log(`[session-notify] Email sent to ${to}`);
    return true;
  } catch (e: any) {
    console.error(`[session-notify] Gmail send failed for ${to}: ${e?.message ?? e}`);
    return false;
  }
}

export async function POST(req: NextRequest) {
  // Internal route — called server-side from upload/route.ts, no user session available

  const { collector_id, match_name, review_date, overall_notes } = await req.json() as {
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
    .from("profiles")
    .select("id")
    .eq("hr_code", collector.hr_code)
    .single();

  if (!profile?.id) return NextResponse.json({ ok: true, sent: 0 });

  const { data: { user: targetUser } } = await admin.auth.admin.getUserById(profile.id);
  const email = targetUser?.email;
  if (!email) return NextResponse.json({ ok: true, sent: 0 });

  const dateStr = review_date ? ` for ${review_date}` : "";
  const bodySection = overall_notes
    ? `<p style="color:#374151;">${overall_notes.replace(/\n/g, "<br>")}</p>`
    : "";

  const html = `
    <p>Hello,</p>
    <p>A new match session report has been uploaded for you${dateStr}:</p>
    <h3 style="margin:12px 0 4px;">${match_name}</h3>
    ${bodySection}
    <p>Please log in to the Collector Performance Dashboard to view your report, acknowledge it, and add any notes.</p>
  `;

  await sendEmail(email, `New Report: ${match_name}`, html);
  return NextResponse.json({ ok: true, sent: 1 });
}
