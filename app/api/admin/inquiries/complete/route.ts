import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isViewingAs } from "@/lib/effective";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { sendEmail, renderEmail } from "@/lib/email";

export const runtime = "nodejs";

const DASHBOARD_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://feedback-dashboard-7i8h.vercel.app";

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  const supabase = createClient();

  if (isViewingAs()) {
    return NextResponse.json(
      { error: "Read-only: exit the 'View as' preview before making changes." },
      { status: 403 }
    );
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: me } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!me || !["Admin", "Reviewer", "Supervisor"].includes(me.role)) {
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

  let emailSent = false;
  const { data: profile } = await a
    .from("users")
    .select("id")
    .eq("hr_code", inquiry.hr_code)
    .single();
  if (profile?.id) {
    const { data: { user: targetUser } } = await a.auth.admin.getUserById(profile.id);
    const email = targetUser?.email;
    if (email) {
      const { html, text } = renderEmail({
        heading: `All inquiries answered - Match ${inquiry.match_id}`,
        intro: `Your reviewer has answered every video question you submitted for Match ${inquiry.match_id}.`,
        cta: { label: "Open my inquiries", url: `${DASHBOARD_URL}/my-inquiries` },
        closing: "Sign in to the dashboard to read each reply.",
      });
      emailSent = await sendEmail({
        to: email,
        subject: `All inquiries answered - Match ${inquiry.match_id}`,
        html,
        text,
      });
    }
  }

  return NextResponse.json({ ok: true, email_sent: emailSent });
}
