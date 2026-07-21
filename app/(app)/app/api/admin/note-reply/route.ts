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

function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
  if (!me || !["Admin", "Reviewer"].includes(me.role)) {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const noteId = String(body.note_id || "");
  const reply = String(body.reply_text || "").trim();
  if (!noteId || !reply) {
    return NextResponse.json(
      { error: "note_id and reply_text are required" },
      { status: 400 }
    );
  }

  const a = adminClient();

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

  let emailSent = false;
  const { data: profile } = await a
    .from("users")
    .select("id")
    .eq("hr_code", note.hr_code)
    .single();
  if (profile?.id) {
    const { data: { user: targetUser } } = await a.auth.admin.getUserById(profile.id);
    const email = targetUser?.email;
    if (email) {
      const ms = Array.isArray((note as any).match_sessions)
        ? (note as any).match_sessions[0]
        : (note as any).match_sessions;
      const matchLabel = ms?.match_name
        ? `${ms.match_name}${ms?.review_date ? ` (${ms.review_date})` : ""}`
        : "your report";

      const bodyHtml = `
        <p style="margin:12px 0 4px;color:#475569;"><em>Your note:</em></p>
        <blockquote style="margin:0 0 12px 0;padding:8px 12px;border-left:3px solid #cbd5e1;color:#334155;background:#f8fafc;white-space:pre-wrap;">
          ${escapeText(note.note_text)}
        </blockquote>
        <p style="margin:12px 0 4px;color:#475569;"><em>Reviewer reply:</em></p>
        <blockquote style="margin:0 0 12px 0;padding:8px 12px;border-left:3px solid #0ea5e9;color:#0c4a6e;background:#f0f9ff;white-space:pre-wrap;">
          ${escapeText(reply)}
        </blockquote>
      `;
      const bodyText =
        `Your note:\n${note.note_text}\n\n` +
        `Reviewer reply:\n${reply}`;

      const { html, text } = renderEmail({
        heading: `Reply on your report - ${matchLabel}`,
        intro: `Your reviewer has replied to your note on ${matchLabel}.`,
        bodyHtml,
        bodyText,
        cta: { label: "View Report", url: `${DASHBOARD_URL}/my-reports` },
        closing: "The note has been marked Complete. Open the dashboard any time to re-read the reply.",
      });

      emailSent = await sendEmail({
        to: email,
        subject: `Reply on your report - ${matchLabel}`,
        html,
        text,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    email_sent: emailSent,
  });
}
