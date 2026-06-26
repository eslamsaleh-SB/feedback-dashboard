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
    console.warn("[note-reply] GMAIL_USER or GMAIL_APP_PASSWORD not set - email skipped");
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
    console.error(`[note-reply] Gmail send failed: ${e?.message ?? e}`);
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
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!me || !["Admin", "Uploader"].includes(me.role)) {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const noteId = String(body.note_id || "");
  const reply = String(body.reply_text || "").trim();
  if (!noteId || !reply) {
    return NextResponse.json(
      { error: "note_id and reply_text are required" },
      { status: 400 }
    );
  }

  const a = adminClient();

  // Load the note + the parent match session so we can build the email.
  const { data: note, error: noteErr } = await a
    .from("session_notes")
    .select(
      "id, session_id, hr_code, note_text, match_sessions(match_name, review_date)"
    )
    .eq("id", noteId)
    .single();
  if (noteErr || !note) {
    return NextResponse.json(
      { error: noteErr?.message || "Note not found" },
      { status: 404 }
    );
  }

  // Save the reply and mark the note Complete.
  const { error: updateErr } = await a
    .from("session_notes")
    .update({
      reply_text: reply,
      replied_at: new Date().toISOString(),
      replied_by: user.id,
      status: "Complete",
      updated_at: new Date().toISOString(),
    })
    .eq("id", noteId);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 400 });
  }

  // Resolve the collector's email and send the notification.
  const { data: profile } = await a
    .from("profiles")
    .select("id")
    .eq("hr_code", note.hr_code)
    .single();

  let emailSent = false;
  if (profile?.id) {
    const {
      data: { user: targetUser },
    } = await a.auth.admin.getUserById(profile.id);
    const email = targetUser?.email;
    if (email) {
      const ms = Array.isArray((note as any).match_sessions)
        ? (note as any).match_sessions[0]
        : (note as any).match_sessions;
      const matchLabel = ms?.match_name
        ? `${ms.match_name}${ms?.review_date ? ` (${ms.review_date})` : ""}`
        : "your report";
      const html = `
        <p>Hello,</p>
        <p>Your reviewer has replied to your note on <strong>${matchLabel}</strong>.</p>
        <p style="margin:12px 0 4px;color:#475569;"><em>Your note:</em></p>
        <blockquote style="margin:0 0 12px 0;padding:8px 12px;border-left:3px solid #cbd5e1;color:#334155;background:#f8fafc;">
          ${note.note_text.replace(/\n/g, "<br>")}
        </blockquote>
        <p style="margin:12px 0 4px;color:#475569;"><em>Reviewer reply:</em></p>
        <blockquote style="margin:0 0 12px 0;padding:8px 12px;border-left:3px solid #0ea5e9;color:#0c4a6e;background:#f0f9ff;">
          ${reply.replace(/\n/g, "<br>")}
        </blockquote>
        <p>The note has been marked Complete. You can read it any time in the Collector Performance Dashboard.</p>
      `;
      emailSent = await sendEmail(
        email,
        `Reply on your report - ${matchLabel}`,
        html
      );
    }
  }

  return NextResponse.json({
    ok: true,
    email_sent: emailSent,
  });
}
