import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isViewingAs } from "@/lib/effective";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

export const runtime = "nodejs";

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function sendEmail(to: string, subject: string, html: string) {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  const from = process.env.EMAIL_FROM ?? `Hudl Feedback <${user}>`;
  if (!user || !pass) {
    console.warn("[inquiry-complete] GMAIL creds not set - email skipped");
    return false;
  }
  try {
    const t = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });
    await t.sendMail({ from, to, subject, html });
    return true;
  } catch (e: any) {
    console.error(`[inquiry-complete] Gmail send failed: ${e?.message ?? e}`);
    return false;
  }
}

export async function POST(req: NextRequest) {
  const supabase = createClient();

  if (isViewingAs()) {
    return NextResponse.json(
      { error: "Read-only: exit the 'View as' preview before making changes." },
      { status: 403 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!me || !["Admin", "Uploader", "Supervisor"].includes(me.role)) {
    return NextResponse.json({ error: "Reviewers only" }, { status: 403 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const inquiryId = String(body.inquiry_id || "");
  if (!inquiryId) {
    return NextResponse.json({ error: "inquiry_id is required" }, { status: 400 });
  }

  const a = adminClient();

  // Pull the inquiry + every video so we can verify all are replied.
  const { data: inquiry, error: qErr } = await a
    .from("match_inquiries")
    .select(
      "id, hr_code, match_id, completed_at, match_inquiry_videos(id, reply_text)"
    )
    .eq("id", inquiryId)
    .single();
  if (qErr || !inquiry) {
    return NextResponse.json(
      { error: qErr?.message || "Inquiry not found" },
      { status: 404 }
    );
  }

  const videos = (inquiry as any).match_inquiry_videos as
    | { id: string; reply_text: string | null }[]
    | null;
  if (!videos || videos.length === 0) {
    return NextResponse.json(
      { error: "This inquiry has no videos to answer." },
      { status: 400 }
    );
  }
  const allReplied = videos.every((v) => (v.reply_text ?? "").trim().length > 0);
  if (!allReplied) {
    return NextResponse.json(
      { error: "Reply to every video before marking the inquiry complete." },
      { status: 400 }
    );
  }

  // Mark the inquiry complete.
  const { error: updateErr } = await a
    .from("match_inquiries")
    .update({
      completed_at: new Date().toISOString(),
      completed_by: user.id,
    })
    .eq("id", inquiryId);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 400 });
  }

  // Look up the collector's email and notify them.
  let emailSent = false;
  const { data: profile } = await a
    .from("profiles")
    .select("id")
    .eq("hr_code", inquiry.hr_code)
    .single();
  if (profile?.id) {
    const {
      data: { user: targetUser },
    } = await a.auth.admin.getUserById(profile.id);
    const email = targetUser?.email;
    if (email) {
      const html = `
        <p>Hello,</p>
        <p>Your reviewer has answered every video question you submitted for
        <strong>Match ${inquiry.match_id}</strong>.</p>
        <p>Please log in to the Collector Performance Dashboard and open
        <em>Ask a Question</em> &rarr; <strong>Match ${inquiry.match_id}</strong>
        to read each reply.</p>
      `;
      emailSent = await sendEmail(
        email,
        `All inquiries answered - Match ${inquiry.match_id}`,
        html
      );
    }
  }

  return NextResponse.json({ ok: true, email_sent: emailSent });
}
